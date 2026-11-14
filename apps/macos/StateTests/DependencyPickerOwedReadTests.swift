import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

/// The scripted server for the owed-read schedules (MAC-C11-S1-1, from the correctness seat's
/// probes): Dependencies in both directions with a Version per Task, OCC on a stale Version, and
/// requests that can be held. `hold` holds a request before it is answered, so it answers with the
/// server's state when it is released; `holdAnswered` answers with the state when the request
/// arrived (a read that reached the server before a change and replies after it).
actor OwedReadServer: ClientTransport {
    private(set) var deps: [String: [String]] = [:] // dependent -> blockers
    private(set) var versions: [String: Int] = ["root": 1, "a": 1, "b": 1, "c": 1]
    private var failNextList = false
    private var cycleNext = false
    private(set) var ops: [String] = []
    private var holdNext: [(key: String, answered: Bool)] = []
    private var held: [String: CheckedContinuation<Void, Never>] = [:]
    func hold(_ key: String) { holdNext.append((key, false)) }
    func holdAnswered(_ key: String) { holdNext.append((key, true)) }
    func isHeld(_ key: String) -> Bool { held[key] != nil }
    func release(_ key: String) { held.removeValue(forKey: key)?.resume() }
    func failTheNextList() { failNextList = true }
    func refuseTheNextAsALoop() { cycleNext = true }
    /// Another client changes `dependent`'s Dependencies.
    func link(_ dependent: String, to blockers: [String]) { deps[dependent] = blockers; versions[dependent, default: 1] += 1 }
    func version(_ id: String) -> Int { versions[id] ?? 0 }
    func dependsOn(_ id: String) -> [String] { deps[id] ?? [] }
    func dependents(of id: String) -> [String] { deps.filter { $0.value.contains(id) }.map(\.key).sorted() }
    func count(_ key: String) -> Int { ops.filter { $0 == key }.count }
    private func task(_ id: String) -> String {
        let list = { (ids: [String]) in "[" + ids.map { "\"\($0)\"" }.joined(separator: ",") + "]" }
        return #"{"id":"\#(id)","profile_id":"work","entity_version":1,"row_version":\#(versions[id] ?? 1),"depends_on":\#(list(deps[id] ?? [])),"blocks":\#(list(dependents(of: id))),"title":"Task \#(id)","description":null,"priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"source":"manual","occurrence":null,"created_at":"2026-11-14T00:00:00Z","updated_at":"2026-11-14T00:00:00Z","completed_at":null,"deleted_at":null}"#
    }
    private func json(_ status: HTTPResponse.Status, _ body: String) -> (HTTPResponse, HTTPBody?) { (HTTPResponse(status: status, headerFields: [.contentType: "application/json"]), HTTPBody(body)) }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let segments = (request.path ?? "").split(separator: "?").first?.split(separator: "/").map(String.init) ?? []
        let key = operationID == "tasks.show" ? "tasks.show:" + (segments.last ?? "") : operationID
        ops.append(key)
        let hold = holdNext.firstIndex { $0.key == key || $0.key == operationID }.map { holdNext.remove(at: $0) }
        if let hold, !hold.answered { await withCheckedContinuation { held[key] = $0 } }
        let reply = try await answer(operationID, segments: segments, body: body)
        if let hold, hold.answered { await withCheckedContinuation { held[key] = $0 } }
        return reply
    }
    private func answer(_ operationID: String, segments: [String], body: HTTPBody?) async throws -> (HTTPResponse, HTTPBody?) {
        switch operationID {
        case "tasks.show": return json(.ok, task(segments.last ?? ""))
        case "tasks.list":
            if failNextList { failNextList = false; throw URLError(.networkConnectionLost) }
            return json(.ok, "[" + ["root", "a", "b", "c"].map(task).joined(separator: ",") + "]")
        case "tasks.depend", "tasks.undepend":
            guard let body else { throw URLError(.badServerResponse) }
            let payload = try JSONSerialization.jsonObject(with: try await Data(collecting: body, upTo: 65_536)) as! [String: Any]
            let blocker = payload["blocker_id"] as! String, from = payload["from_version"] as! Int
            let dependent = segments.firstIndex(of: "tasks").map { segments[$0 + 1] } ?? "?"
            if cycleNext {
                cycleNext = false
                let error: [String: Any] = ["generated_at": "2026-11-14T00:00:00Z", "message": "agent copy", "code": "dependency_cycle", "exit_code": 2, "exit_meaning": "validation or usage",
                                            "details": ["dependent_id": dependent, "blocker_id": blocker, "path": [blocker, dependent, blocker]]]
                return (HTTPResponse(status: .unprocessableContent, headerFields: [.contentType: "application/json"]), HTTPBody(try JSONSerialization.data(withJSONObject: error)))
            }
            guard from == versions[dependent] else { return json(.conflict, #"{"_tag":"Conflict","exit_code":4,"exit_meaning":"Conflict","latest":null}"#) }
            var current = deps[dependent] ?? []
            if operationID == "tasks.depend" { if !current.contains(blocker) { current.append(blocker) } } else { current.removeAll { $0 == blocker } }
            deps[dependent] = current
            versions[dependent, default: 1] += 1
            // "unchanged" keeps the catalog read-back (refreshAfterWrite) out of these schedules, as
            // PickerServer does; the picker's own read-back, which they test, still runs.
            return json(.ok, #"{"generated_at":"2026-11-14T00:00:00Z","outcome":"unchanged","dependent_id":"\#(dependent)","blocker_id":"\#(blocker)","from_version":\#(from),"to_version":\#(versions[dependent] ?? 1),"seq":1,"warnings":[]}"#)
        default:
            if operationID.hasPrefix("reads.") { return json(.ok, "[]") }
            throw URLError(.unsupportedURL)
        }
    }
}

/// MAC-C11-S1-1 (P2, the correctness seat's schedules P1, P2, P2b and P3, red on 7dde1e96) and
/// MAC-C11-S1-2 (P10). The invariant every schedule ends on: when nothing is in flight and nothing
/// is owed, the picker shows what the server has (`expectShowsTheServer`).
@MainActor @Suite struct DependencyPickerOwedReadTests {
    private func model(_ server: OwedReadServer) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-owed-read"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: server, middlewares: [BearerMiddleware(credential: credential)]) },
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("synthetic-owed-read"); model.signedIn = true; model.connection = .live
        return model
    }
    private func task(_ id: String, version: Int = 1) -> TaskSnapshot {
        TaskSnapshot(id: id, profile_id: "work", row_version: version, title: "Task \(id)", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }
    private func until(_ what: String, _ condition: () async -> Bool) async throws {
        for _ in 0..<2000 { if await condition() { return }; try await Task.sleep(for: .milliseconds(2)) }
        Issue.record("timed out: \(what)"); throw CancellationError()
    }
    /// The invariant: when nothing is in flight and nothing is owed, the picker shows what the
    /// server has (its linked Tasks for the direction shown, the root's Version, every row's Version).
    private func expectShowsTheServer(_ model: TodoModel, _ server: OwedReadServer, _ schedule: String, sourceLocation: SourceLocation = #_sourceLocation) async throws {
        let picker = try #require(model.dependencies.picker, sourceLocation: sourceLocation)
        #expect(picker.pending.isEmpty && !picker.loading && !picker.owedRead && model.dependencies.pendingDependents.isEmpty, "\(schedule): something is still in flight or owed", sourceLocation: sourceLocation)
        let linked = picker.direction == .dependsOn ? await server.dependsOn("root") : await server.dependents(of: "root")
        #expect(Set(picker.linked.map(\.id)) == Set(linked), "\(schedule): linked \(picker.linked.map(\.id)) against the server's \(linked)", sourceLocation: sourceLocation)
        #expect(picker.root.row_version == (await server.version("root")), "\(schedule): the root's Version", sourceLocation: sourceLocation)
        for id in picker.rowIDs {
            #expect(picker.tasksByID[id]?.row_version == (await server.version(id)), "\(schedule): row \(id)'s Version", sourceLocation: sourceLocation)
        }
    }

    /// P1: a toggle is out, the person types a search, the toggle replies (its read-back stands
    /// aside), the search replies. The owed read shows the committed link.
    @Test func p1AToggleRepliesDuringThePersonsSearch() async throws {
        let server = OwedReadServer()
        let model = model(server)
        await model.openDependencyPicker(task("root"))
        try #require(model.dependencies.picker?.rowIDs == ["a", "b", "c"])
        await server.hold("tasks.depend")
        let toggle = Task { await model.toggleDependency(try! #require(model.dependencies.picker?.tasksByID["a"])) }
        try await until("the toggle is held") { await server.isHeld("tasks.depend") }
        model.dependencies.picker?.text = "Task"
        await server.hold("tasks.list")
        let search = Task { await model.searchDependencyCandidates() }
        try await until("the search is held") { await server.isHeld("tasks.list") }
        await server.release("tasks.depend"); await toggle.value
        #expect(model.dependencies.picker?.owedRead == true, "the read-back stood aside and is owed")
        await server.release("tasks.list"); await search.value
        #expect(await server.dependsOn("root") == ["a"])
        #expect(model.dependencies.picker?.checked("a") == true)
        try await expectShowsTheServer(model, server, "P1")
    }

    /// P2: another client's link reaches the stream while the person's search is out.
    @Test func p2AnotherClientsLinkDuringThePersonsSearch() async throws {
        let server = OwedReadServer()
        let model = model(server)
        await model.openDependencyPicker(task("root"))
        model.dependencies.picker?.text = "Task"
        await server.hold("tasks.list")
        let search = Task { await model.searchDependencyCandidates() }
        try await until("the search is held") { await server.isHeld("tasks.list") }
        await server.link("root", to: ["b"])
        await model.refreshDependencyReads() // what followChanges calls for that operation
        await server.release("tasks.list"); await search.value
        #expect(model.dependencies.picker?.checked("b") == true)
        try await expectShowsTheServer(model, server, "P2")
    }

    /// P2b: the same during the open, after the root was read and while the candidates are out.
    @Test func p2bAnotherClientsLinkDuringTheOpen() async throws {
        let server = OwedReadServer()
        let model = model(server)
        await server.hold("tasks.list")
        let open = Task { await model.openDependencyPicker(task("root")) }
        try await until("the open's candidates are held") { await server.isHeld("tasks.list") }
        try await until("the root was read") { await server.ops.contains("tasks.show:root") }
        await server.link("root", to: ["c"])
        await model.refreshDependencyReads()
        await server.release("tasks.list"); await open.value
        #expect(model.dependencies.picker?.checked("c") == true)
        try await expectShowsTheServer(model, server, "P2b")
    }

    /// P3: a "Depends on" removal is out, the person changes the direction to Blocks, the removal
    /// replies, then the Blocks read replies. Blocks never shows a "Depends on" row as linked.
    @Test func p3ADirectionChangeDuringAToggle() async throws {
        let server = OwedReadServer()
        await server.link("root", to: ["a"])
        let model = model(server)
        await model.openDependencyPicker(task("root", version: 2))
        try #require(model.dependencies.picker?.checked("a") == true)
        await server.hold("tasks.undepend")
        let toggle = Task { await model.toggleDependency(try! #require(model.dependencies.picker?.tasksByID["a"])) }
        try await until("the removal is held") { await server.isHeld("tasks.undepend") }
        await server.hold("tasks.show:root")
        let direction = Task { await model.setDependencyDirection(.blocks) }
        try await until("the Blocks read is held") { await server.isHeld("tasks.show:root") }
        await server.release("tasks.undepend"); await toggle.value
        await server.release("tasks.show:root"); await direction.value
        #expect(model.dependencies.picker?.direction == .blocks)
        #expect(model.dependencies.picker?.checked("a") == false, "a Depends-on row shows as linked under Blocks")
        #expect(model.dependencies.picker?.linked.isEmpty == true)
        try await expectShowsTheServer(model, server, "P3")
    }

    /// The stream asks while a toggle is pending, and the toggle's read-back read the server before
    /// the change: the stream's read is owed and runs when the toggle ends. (Candidate 10 skipped
    /// the picker here too.)
    @Test func aStreamChangeWhileAToggleIsPendingIsNotDropped() async throws {
        let server = OwedReadServer()
        let model = model(server)
        await model.openDependencyPicker(task("root"))
        await server.holdAnswered("tasks.show:root") // the read-back's root read, answered with the state on arrival
        let toggle = Task { await model.toggleDependency(try! #require(model.dependencies.picker?.tasksByID["a"])) }
        try await until("the read-back's root read is held") { await server.isHeld("tasks.show:root") }
        await server.link("root", to: ["a", "b"])
        await model.refreshDependencyReads() // the row is pending: the read is owed
        #expect(model.dependencies.picker?.owedRead == true)
        await server.release("tasks.show:root"); await toggle.value
        #expect(model.dependencies.picker?.checked("b") == true)
        try await expectShowsTheServer(model, server, "pending stream change")
    }

    /// However many background reads stand aside, one read is owed, and it runs after the person's.
    @Test func manyReadsThatStoodAsideOweOneRead() async throws {
        let server = OwedReadServer()
        let model = model(server)
        await model.openDependencyPicker(task("root"))
        model.dependencies.picker?.text = "Task"
        await server.hold("tasks.list")
        let search = Task { await model.searchDependencyCandidates() }
        try await until("the search is held") { await server.isHeld("tasks.list") }
        let before = await server.count("tasks.show:root")
        for blocker in ["a", "b", "c"] {
            await server.link("root", to: [blocker])
            await model.refreshDependencyReads()
        }
        #expect(await server.count("tasks.show:root") == before, "nothing read while the person's search is out")
        await server.release("tasks.list"); await search.value
        #expect(await server.count("tasks.show:root") == before + 1, "one owed read")
        #expect(model.dependencies.picker?.checked("c") == true)
        try await expectShowsTheServer(model, server, "three stood aside")
    }

    /// P10 (MAC-C11-S1-2): a failed search clears its re-sort, so the next tick's own read-back
    /// does not move the ticked row.
    @Test func p10AFailedSearchThenATickDoesNotMoveTheRow() async throws {
        let server = OwedReadServer()
        let model = model(server)
        await model.openDependencyPicker(task("root"))
        try #require(model.dependencies.picker?.rowIDs == ["a", "b", "c"])
        model.dependencies.picker?.text = "Task"
        await server.failTheNextList()
        await model.searchDependencyCandidates()
        #expect(model.dependencies.picker?.searchFailure != nil)
        #expect(model.dependencies.picker?.resortPending == false)
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["c"]))
        #expect(model.dependencies.picker?.checked("c") == true)
        #expect(model.dependencies.picker?.rowIDs == ["a", "b", "c"], "the ticked row moved")
    }

    /// The picker's refusal form (UI seat, candidate 11): the Task quoted, why, what to do next,
    /// and no exit-code line in the picker.
    @Test func refusalsInThePickerSayWhatFailedWhyAndWhatToDo() async throws {
        let server = OwedReadServer()
        let model = model(server)
        await model.openDependencyPicker(task("root"))
        await server.link("root", to: ["c"]) // the drawn Version 1 is now stale
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["a"]), drawn: .init(checked: false, dependentVersion: 1))
        let conflict = try #require(model.dependencies.picker?.failure)
        #expect(DependencyNoticeContent.headline(conflict) == "Couldn't add \u{201C}Task a\u{201D}. The Tasks changed since this list loaded. Reload and try again.")
        #expect(model.dependencies.picker?.requiresReload == true)
        await model.reloadDependencyPicker()
        await server.refuseTheNextAsALoop()
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["b"]))
        let loop = try #require(model.dependencies.picker?.failure)
        #expect(DependencyNoticeContent.headline(loop) == "Couldn't add \u{201C}Task b\u{201D}. This Dependency would create a loop. Choose another Task.")
    }

    /// When the picker's own Task is gone: which Task, and what to do (UI seat, candidate 11).
    @Test func theGoneTaskIsNamed() async throws {
        let server = PickerServer()
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-owed-read"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: server, middlewares: [BearerMiddleware(credential: credential)]) },
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("synthetic-owed-read"); model.signedIn = true; model.connection = .live
        await model.openDependencyPicker(task("root"))
        await server.missing()
        await model.refreshDependencyPicker()
        #expect(model.dependencies.picker?.rootGone == true)
        #expect(model.dependencies.picker?.failure?.message == "\u{201C}Task root\u{201D} was deleted or moved. Close this window to continue.")
        #expect(model.dependencies.picker?.failure?.detail == nil)
    }

    /// The count beside the search (UI seat, candidate 11).
    @Test func theCountSaysHowManyOfAll() {
        let rows = (0..<100).map { task(String(format: "t%03d", $0)) }
        var picker = DependencyPicker(profile: "work", root: task("root"), direction: .dependsOn, candidates: rows)
        picker.unfilteredCount = 100
        #expect(DependencyPickerView.countText(picker) == "100 Tasks")
        picker.text = "t00"
        picker.candidates = Array(rows.prefix(10))
        #expect(DependencyPickerView.countText(picker) == "10 of 100 Tasks")
        picker.candidates = [rows[0]]
        #expect(DependencyPickerView.countText(picker) == "1 of 100 Tasks")
        let loading = DependencyPicker(profile: "work", root: task("root"), direction: .dependsOn, loading: true)
        #expect(DependencyPickerView.countText(loading) == " ", "blank, not 0, while the first rows load")
    }
}
