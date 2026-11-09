import AppKit
import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
@testable import TodoState

private actor SearchTransport: ClientTransport {
    private let live = URLSessionTransport()
    private var failNext = false
    private var failNextRead = false
    private var holdNext = false
    private var held: [Int: CheckedContinuation<Void, Never>] = [:]
    private var streamContinuation: AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation?
    private var shouldFailHeld = false
    private(set) var heldCount = 0
    private(set) var filteredRequests: [String] = []

    func fail() { failNext = true }
    func failRead() { failNextRead = true }
    func hold(failing: Bool) { holdNext = true; shouldFailHeld = failing }
    func release(_ index: Int? = nil) {
        guard let key = index ?? held.keys.min() else { return }
        held.removeValue(forKey: key)?.resume()
    }
    func disconnectStream() { streamContinuation?.finish(throwing: URLError(.networkConnectionLost)) }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if operationID == "tasks.list", failNextRead {
            failNextRead = false
            throw URLError(.notConnectedToInternet)
        }
        if operationID == "tasks.list", request.path?.contains("text=") == true {
            filteredRequests.append(request.path ?? "")
            let failing = failNext
            failNext = false
            if holdNext {
                holdNext = false
                let failure = shouldFailHeld
                let response = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
                heldCount += 1
                let index = heldCount
                await withCheckedContinuation { held[index] = $0 }
                if failure { throw URLError(.notConnectedToInternet) }
                return response
            }
            if failing { throw URLError(.notConnectedToInternet) }
        }
        let response = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        if operationID == "changes.stream", let body = response.1 {
            let pair = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            streamContinuation = pair.continuation
            let reader = Task {
                do {
                    for try await chunk in body { pair.continuation.yield(chunk) }
                    pair.continuation.finish()
                } catch { pair.continuation.finish(throwing: error) }
            }
            pair.continuation.onTermination = { _ in reader.cancel() }
            return (response.0, HTTPBody(pair.stream, length: .unknown))
        }
        return response
    }
}

@MainActor
struct TaskSearchStateTests {
    private func wait(line: Int = #line, _ predicate: () async -> Bool) async throws {
        for _ in 0..<1000 {
            if await predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw SearchProofError.timeout(line)
    }
    enum SearchProofError: Error { case timeout(Int) }

    @Test func activeSearchHidesEmptyPriorityGroups() throws {
        let task = try JSONDecoder().decode(TaskSnapshot.self, from: Data(#"{"id":"group-proof","profile_id":"work","row_version":1,"title":"Pay rent","description":null,"priority":"P1","status":"open","project_id":null,"tags":[],"source":"manual","due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"occurrence":null,"legacy_series_detached":true,"deleted_at":null}"#.utf8))
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-groups"))
        model.selectedView = "all"
        model.tasks = [task]
        model.searchText = "rent"
        for compact in [true, false] {
            #expect(TaskListView(model: model, compactMode: compact).taskGroups.map(\.name) == ["P1"])
        }
        model.searchText = ""
        #expect(TaskListView(model: model).taskGroups.map(\.name) == ["P1", "P2", "P3", "P4"])
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func viewResetPreservesDraftAndReschedulesProjectAndTag() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: credential)
        let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: Data(#"{"title":"Reset navigation proof"}"#.utf8))
        let task = try await TaskSnapshot.decode(direct.tasks_period_create(path: .init(profile: "personal"), body: .json(payload)).ok.body.json)
        let transport = SearchTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "personal", vaultService: "unused-reset-\(UUID())"), clientFactory: { url, _ in
            Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
        })
        model.selectedView = "all"
        model.signedIn = true
        model.connection = .live
        await model.retrySearch()
        model.beginEditing(task)
        model.editor?.title = "Keep this unsaved draft"
        model.conflict = TaskConflict(latest: task)
        model.setSearchText("a")
        try await wait { model.searchPhase == .showing }
        await transport.hold(failing: false)
        model.selectView("inbox")
        #expect(model.editor?.title == "Keep this unsaved draft")
        #expect(model.conflict?.latest?.id == task.id)
        try await wait { await transport.heldCount == 1 }
        model.selectedProject = "pending-project"
        model.selectedTag = "pending-tag"
        await transport.release()
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.project == "pending-project")
        #expect(model.appliedSearchSnapshot?.appliedIdentity.tag == "pending-tag")
        #expect(model.appliedSearchSnapshot?.rows.isEmpty == true)
        #expect(!model.loading)
        #expect(!model.searchStale)
        #expect(model.editor?.title == "Keep this unsaved draft")
        #expect(model.conflict?.latest?.id == task.id)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func initialFailureRetainsExplicitErrorAndCanRetry() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let transport = SearchTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "personal", vaultService: "unused-initial-error-\(UUID())"), clientFactory: { url, _ in
            Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
        })
        model.signedIn = true
        model.connection = .live
        await transport.failRead()
        let failed = await model.retrySearch()
        #expect(failed == .failed)
        #expect(model.searchPhase == .error)
        #expect(model.taskLoadError != nil)
        #expect(model.appliedSearchSnapshot == nil)
        #expect(!model.loading)
        let applied = await model.retrySearch()
        #expect(applied == .applied)
        #expect(model.searchPhase == .showing)
        #expect(model.taskLoadError == nil)
        #expect(model.appliedSearchSnapshot != nil)
        await transport.fail()
        model.setSearchText("rent")
        try await wait { model.searchPhase == .error }
        #expect(model.searchError == .transient("Couldn't search. Showing tasks without search."))
        model.setSearchText("")
        try await wait { model.searchPhase == .showing }
        await transport.failRead()
        await model.refreshAfterWrite("Task updated")
        #expect(model.message == "Task updated. The live view is reconnecting.")
        try await wait { model.connection == .live && model.searchPhase == .showing }
        #expect(model.taskLoadError == nil)
        model.signedIn = false
        model.connect()
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func deterministicRefusalRetainsSnapshotAndRecoversFromSse() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: credential)
        let profile = "zzz-search-budget-\(UUID().uuidString.lowercased())"
        let initialize = Process()
        initialize.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_F10_CLI"]))
        initialize.arguments = ["init", "--profile", profile]
        initialize.environment = ProcessInfo.processInfo.environment
        initialize.standardOutput = Pipe()
        initialize.standardError = Pipe()
        try initialize.run()
        initialize.waitUntilExit()
        #expect(initialize.terminationStatus == 0)
        var created: [TaskSnapshot] = []
        for index in 0..<3 {
            let data = try JSONSerialization.data(withJSONObject: ["title": "probe \(index)", "description": String(repeating: "\u{FDFA}", count: 100000)])
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: data)
            created.append(try await TaskSnapshot.decode(direct.tasks_period_create(path: .init(profile: profile), body: .json(payload)).ok.body.json))
        }
        let model = TodoModel(configuration: .init(server: server, initialProfile: profile, vaultService: "unused-budget-\(UUID())"), clientFactory: { url, _ in
            Client(serverURL: url, transport: URLSessionTransport(), middlewares: [BearerMiddleware(credential: credential)])
        })
        model.selectedView = "all"
        model.signedIn = true
        model.connect()
        defer { model.signedIn = false; model.connect() }
        try await wait { model.connection == .live && model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.rows.map(\.title).sorted() == ["probe 0", "probe 1", "probe 2"])
        model.setSearchText("probe")
        try await wait { model.searchPhase == .error }
        let recovery = "Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase."
        #expect(model.searchError == .tooBroad(recovery))
        #expect(model.searchError?.canRetry == false)
        #expect(model.searchText == "probe")
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "")
        #expect(model.appliedSearchSnapshot?.rows.map(\.title).sorted() == ["probe 0", "probe 1", "probe 2"])
        #expect(model.appliedSearchSnapshot?.rows.allSatisfy { $0.search_matches == nil } == true)
        let shrinking = try #require(created.first)
        let payload = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"changes":{"description":"Small description"}}"#.utf8))
        _ = try await direct.tasks_period_edit(path: .init(profile: profile, task: shrinking.id), body: .json(payload)).ok
        try await wait { model.searchPhase == .showing && model.appliedSearchSnapshot?.appliedIdentity.text == "probe" }
        #expect(model.searchError == nil)
        #expect(model.searchText == "probe")
        #expect(model.appliedSearchSnapshot?.rows.map(\.title).sorted() == ["probe 0", "probe 1", "probe 2"])
        #expect(model.appliedSearchSnapshot?.rows.allSatisfy { $0.search_matches == [.init(field: .title, start: 0, end: 5)] } == true)
        if let receipt = ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"] {
            try JSONSerialization.data(withJSONObject: ["code": "search_too_broad", "retry": false, "text": "probe", "rowsAfterSse": 3, "retainedSnapshot": true]).write(to: URL(fileURLWithPath: receipt).deletingLastPathComponent().appendingPathComponent("search-budget-http.json"))
        }
    }

    @Test func prefixConstraintsAndUTF16Presentation() throws {
        #expect(TaskListFilters(prefix: "6AA2-").isValid)
        for value in ["zz", " 6a", "6a\n", String(repeating: "a", count: 37)] { #expect(!TaskListFilters(prefix: value).isValid) }
        let text = "🎵 Cancio\u{301}n de cuna"
        let spans = [TaskSearchMatch(field: .title, start: 3, end: 11)]
        let rendered = TaskSearchPresentation.highlighted(text, spans: spans, field: .title)
        #expect(String(rendered.characters) == "🎵 Cancio\u{301}n de cuna")
        #expect(rendered.runs.filter { $0.backgroundColor != nil }.map { String(rendered[$0.range].characters) } == ["Cancio\u{301}n"])
        let invalid = TaskSearchPresentation.highlighted(text, spans: [.init(field: .title, start: 1, end: 2), .init(field: .title, start: -1, end: 900)], field: .title)
        #expect(invalid.runs.allSatisfy { $0.backgroundColor == nil })
        let multiline = try JSONDecoder().decode(TaskSnapshot.self, from: Data(#"{"id":"excerpt","profile_id":"work","row_version":1,"title":"Receipt","description":"First line\nPay rent today","priority":"P3","source":"manual","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"occurrence":null,"legacy_series_detached":true,"deleted_at":null,"search_matches":[{"field":"description","start":15,"end":19}]}"#.utf8))
        let excerpt = try #require(TaskSearchPresentation.descriptionExcerpt(multiline))
        #expect(String(excerpt.characters) == "First line Pay rent today")
        #expect(excerpt.runs.filter { $0.backgroundColor != nil }.map { String(excerpt[$0.range].characters) } == ["rent"])
        let longDescription = try JSONDecoder().decode(TaskSnapshot.self, from: Data(#"{"id":"long-excerpt","profile_id":"work","row_version":1,"title":"Receipt","description":"This is a deliberately long introductory phrase. Find the blue Canción receipt in the cabinet.","priority":"P3","source":"manual","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"occurrence":null,"legacy_series_detached":true,"deleted_at":null,"search_matches":[{"field":"description","start":63,"end":70}]}"#.utf8))
        let trimmed = try #require(TaskSearchPresentation.descriptionExcerpt(longDescription))
        #expect(String(trimmed.characters) == "…phrase. Find the blue Canción receipt in the cabinet.")
        #expect(trimmed.runs.filter { $0.backgroundColor != nil }.map { String(trimmed[$0.range].characters) } == ["Canción"])
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func productionSearchOrderingRecoveryAndReload() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: credential)
        let profile = "search-\(UUID().uuidString.lowercased())"
        let initialize = Process()
        initialize.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_F10_CLI"]))
        initialize.arguments = ["init", "--profile", profile]
        initialize.environment = ProcessInfo.processInfo.environment
        initialize.standardOutput = Pipe()
        initialize.standardError = Pipe()
        try initialize.run()
        initialize.waitUntilExit()
        #expect(initialize.terminationStatus == 0)
        var created: [TaskSnapshot] = []
        for (title, description) in [("Renovar el pasaporte", "Ready for travel"), ("Canción de cuna", "Soft evening song"), ("Receipt", "Pay rent today before Friday") ] {
            let data = try JSONSerialization.data(withJSONObject: ["title": title, "description": description, "priority": "P1", "energy": 3, "estimate_min": 45, "project_name": "Search Project", "tag_names": ["search-tag"]])
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: data)
            created.append(try await TaskSnapshot.decode(direct.tasks_period_create(path: .init(profile: profile), body: .json(payload)).ok.body.json))
        }
        let transport = SearchTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: profile, vaultService: "unused-search-\(UUID())"), clientFactory: { url, _ in
            Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
        })
        model.selectedView = "all"
        model.signedIn = true
        model.connection = .live
        await model.retrySearch()
        #expect(model.appliedSearchSnapshot?.rows.count == 3)
        model.setSearchText("reno")
        #expect(model.searchPhase == .debouncing)
        #expect(model.searchStale)
        #expect(model.appliedSearchSnapshot?.rows.count == 3)
        try await wait { model.searchPhase == .showing }
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Renovar el pasaporte"])
        #expect(TaskListView(model: model, compactMode: true).visibleTasks.map(\.title) == ["Renovar el pasaporte"])
        #expect(model.appliedSearchSnapshot?.rows.first?.search_matches == [.init(field: .title, start: 0, end: 7)])
        #expect(!model.searchStale)

        await transport.hold(failing: true)
        model.applyTaskFilters(.init(priority: "P2"))
        try await wait { await transport.heldCount == 1 }
        model.setSearchText("cancion")
        await transport.hold(failing: false)
        model.applyTaskFilters(.init(priority: "P1", energy: "3", estimate: "45"))
        try await wait { await transport.heldCount == 2 }
        await transport.release(1)
        try await Task.sleep(for: .milliseconds(40))
        #expect(model.searchError == nil)
        #expect(model.taskLoadError == nil)
        #expect(model.requestedTaskFilters == .init(priority: "P1", energy: "3", estimate: "45"))
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "reno")
        await transport.release(2)
        try await wait { model.searchPhase == .showing }
        #expect(model.searchError == nil)
        #expect(model.taskLoadError == nil)
        #expect(model.requestedTaskFilters == .init(priority: "P1", energy: "3", estimate: "45"))
        #expect(model.taskFilters == .init(priority: "P1", energy: "3", estimate: "45"))
        #expect(model.searchText == "cancion")
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Canción de cuna"])
        await model.retrySearch()
        #expect(model.requestedTaskFilters.priority == "P1")
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Canción de cuna"])

        await transport.hold(failing: false)
        model.setSearchText("reno")
        try await wait { await transport.heldCount == 3 }
        model.setSearchText("rent")
        model.setSearchText("reno")
        #expect(model.searchPhase == .debouncing)
        await transport.release()
        try await Task.sleep(for: .milliseconds(40))
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "cancion")
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "reno")

        await transport.fail()
        model.setSearchText("rent")
        try await wait { model.searchPhase == .error }
        #expect(model.searchText == "rent")
        #expect(model.searchError == .transient("Couldn't search. Showing results for \"reno\"."))
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Renovar el pasaporte"])
        await model.retrySearch()
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Receipt"])
        #expect(model.appliedSearchSnapshot?.rows.first?.search_matches == [.init(field: .description, start: 4, end: 8)])
        let excerpt = try #require(model.appliedSearchSnapshot?.rows.first.flatMap(TaskSearchPresentation.descriptionExcerpt))
        #expect(String(excerpt.characters) == "Pay rent today before Friday")
        #expect(!model.searchStale)

        let receipt = try #require(created.last)
        model.applyTaskFilters(.init(priority: "P1", energy: "3", estimate: "45", prefix: String(receipt.id.prefix(8)).uppercased()))
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.rows.map(\.id) == [receipt.id])
        model.selectedProject = receipt.project_id
        model.selectedTag = receipt.tags.first
        await model.retrySearch()
        #expect(model.appliedSearchSnapshot?.rows.map(\.id) == [receipt.id])
        #expect(model.appliedSearchSnapshot?.appliedIdentity.project == receipt.project_id)
        #expect(model.appliedSearchSnapshot?.appliedIdentity.tag == receipt.tags.first)
        let board = NSPasteboard(name: .init("todo-search-proof-\(UUID())"))
        defer { board.releaseGlobally() }
        model.copyTaskID(receipt.id, pasteboard: board)
        #expect(board.string(forType: .string) == receipt.id)
        #expect(model.taskIDCopyFeedback == "Copied")
        #expect(model.appliedSearchSnapshot?.rows.first?.row_version == 1)
        try await wait { model.taskIDCopyFeedback == nil }
        await model.retrySearch()
        #expect(model.appliedSearchSnapshot?.rows.first?.row_version == 1)
        let afterCopy = try await direct.tasks_period_show(path: .init(profile: profile, task: receipt.id)).ok.body.json
        #expect(afterCopy.row_version == 1)

        model.applyTaskFilters(.init())
        try await wait { model.searchPhase == .showing }
        let latestHistory = try await direct.reads_period_history(path: .init(profile: profile, task: receipt.id)).ok.body.json
        let entries = try JSONDecoder().decode([HistoryEntry].self, from: JSONEncoder().encode(latestHistory))
        let latestSequence = try #require(entries.last?.seq)
        model.connect()
        try await wait { model.connection == .live && model.searchPhase == .showing && model.lastSequence == String(latestSequence) }
        await transport.fail()
        model.setSearchText("reno")
        try await wait { model.searchPhase == .error }
        await transport.disconnectStream()
        try await wait { model.reconnectCount > 0 && model.connection == .live && model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "reno")
        #expect(model.searchError == nil)
        await transport.fail()
        model.setSearchText("cancion")
        try await wait { model.searchPhase == .error }
        let edit = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"changes":{"description":"SSE recovery"}}"#.utf8))
        _ = try await direct.tasks_period_edit(path: .init(profile: profile, task: created[0].id), body: .json(edit)).ok
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "cancion")
        #expect(model.searchError == nil)
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Canción de cuna"])

        await transport.hold(failing: false)
        let clearCount = await transport.heldCount + 1
        model.setSearchText("reno")
        try await wait { await transport.heldCount == clearCount }
        model.setSearchText("")
        await transport.release()
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "")
        #expect(model.appliedSearchSnapshot?.rows.count == 3)
        model.setSearchText("cancion")
        try await wait { model.searchPhase == .showing }
        await transport.hold(failing: true)
        let viewCount = await transport.heldCount + 1
        let oldViewRequest = Task { await model.retrySearch() }
        try await wait { await transport.heldCount == viewCount }
        model.selectView("inbox")
        #expect(model.searchText == "cancion")
        #expect(model.appliedSearchSnapshot == nil)
        await transport.release()
        #expect(await oldViewRequest.value == .superseded)
        try await wait { model.searchPhase == .showing }
        #expect(model.taskLoadError == nil)
        #expect(model.searchError == nil)
        #expect(model.appliedSearchSnapshot?.appliedIdentity.view == "inbox")
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Canción de cuna"])
        await transport.hold(failing: false)
        let profileCount = await transport.heldCount + 1
        let oldProfileRequest = Task { await model.retrySearch() }
        try await wait { await transport.heldCount == profileCount }
        _ = await model.navigate(.profile("personal"))
        #expect(model.searchText == "cancion")
        #expect(model.appliedSearchSnapshot == nil)
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.profile == "personal")
        #expect(model.appliedSearchSnapshot?.rows.isEmpty == true)
        await transport.release()
        #expect(await oldProfileRequest.value == .superseded)
        #expect(model.appliedSearchSnapshot?.appliedIdentity.profile == "personal")
        #expect(model.appliedSearchSnapshot?.rows.isEmpty == true)
        #expect(model.searchError == nil)
        model.setSearchText("")
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "")
        model.signedIn = false
        model.connect()
        let output = try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"]).replacingOccurrences(of: "http-receipt.json", with: "task-search-http.json")
        try JSONSerialization.data(withJSONObject: ["status": "PASS", "lateError": true, "aba": true, "retry": true, "sseReadyRecovery": true, "sseOperationRecovery": true, "copy": receipt.id]).write(to: URL(fileURLWithPath: output))
    }
}
