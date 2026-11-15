import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

/// Candidate 11: the picker's row index. A tick never moves a row; the person's read sets the order
/// (linked first); the arrow keys walk the rows through the index and return to the search field.
/// A scripted server for the picker tests (candidate 11): Tasks root, a, b, c; root's Dependencies
/// change with depend and undepend; the next request of a kind can be held.
actor PickerServer: ClientTransport {
    var rootVersion = 1
    var rootDependsOn: [String] = []
    var rootMissing = false
    private(set) var writes: [(op: String, blocker: String, fromVersion: Int)] = []
    private(set) var reads: [String] = []
    private var holdNext: Set<String> = []
    private var held: [String: CheckedContinuation<Void, Never>] = [:]
    func hold(_ op: String) { holdNext.insert(op) }
    func isHeld(_ op: String) -> Bool { held[op] != nil }
    func release(_ op: String) { held.removeValue(forKey: op)?.resume() }
    func missing() { rootMissing = true }
    func setRoot(version: Int) { rootVersion = version }
    private func task(_ id: String) -> String {
        let version = id == "root" ? rootVersion : 1
        let depends = id == "root" ? "[" + rootDependsOn.map { "\"\($0)\"" }.joined(separator: ",") + "]" : "[]"
        return #"{"id":"\#(id)","profile_id":"work","entity_version":1,"row_version":\#(version),"depends_on":\#(depends),"title":"Task \#(id)","description":null,"priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"source":"manual","occurrence":null,"created_at":"2026-11-14T00:00:00Z","updated_at":"2026-11-14T00:00:00Z","completed_at":null,"deleted_at":null}"#
    }
    private func ok(_ json: String) -> (HTTPResponse, HTTPBody?) { (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(json)) }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        reads.append(operationID)
        if holdNext.remove(operationID) != nil { await withCheckedContinuation { held[operationID] = $0 } }
        switch operationID {
        case "tasks.show":
            let id = String(request.path?.split(separator: "/").last ?? "")
            if id == "root" && rootMissing {
                return (HTTPResponse(status: .notFound, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"message":"Task not found","code":"not_found","exit_code":3,"exit_meaning":"not found or auth missing"}"#))
            }
            return ok(task(id))
        case "tasks.list":
            return ok("[" + ["root", "a", "b", "c"].map(task).joined(separator: ",") + "]")
        case "tasks.depend", "tasks.undepend":
            guard let body else { throw URLError(.badServerResponse) }
            let data = try await Data(collecting: body, upTo: 65_536)
            let payload = try JSONSerialization.jsonObject(with: data) as! [String: Any]
            let blocker = payload["blocker_id"] as! String, from = payload["from_version"] as! Int
            writes.append((operationID, blocker, from))
            if operationID == "tasks.depend" { rootDependsOn.append(blocker) } else { rootDependsOn.removeAll { $0 == blocker } }
            rootVersion += 1
            // "unchanged" skips the catalog read-back (refreshAfterWrite), which these tests do not
            // serve; the picker's own read-back, which they test, still runs.
            let outcome = "unchanged"
            return ok(#"{"generated_at":"2026-11-14T00:00:00Z","outcome":"\#(outcome)","dependent_id":"root","blocker_id":"\#(blocker)","from_version":\#(from),"to_version":\#(rootVersion),"seq":\#(rootVersion),"warnings":[]}"#)
        default:
            // The catalog read-back after a write: an empty, valid answer is enough here.
            if operationID == "tasks.list" || operationID.hasPrefix("reads.") { return ok("[]") }
            throw URLError(.unsupportedURL)
        }
    }
}

@MainActor @Suite struct DependencyPickerRowsTests {
    private func model(_ server: PickerServer) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-picker-refresh"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: server, middlewares: [BearerMiddleware(credential: credential)]) },
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("synthetic-picker"); model.signedIn = true; model.connection = .live
        return model
    }
    private func root() -> TaskSnapshot {
        TaskSnapshot(id: "root", profile_id: "work", row_version: 1, title: "Task root", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }
    private func until(_ what: String, _ condition: () async -> Bool) async throws {
        for _ in 0..<2000 { if await condition() { return }; try await Task.sleep(for: .milliseconds(2)) }
        Issue.record("timed out: \(what)"); throw CancellationError()
    }
    private func opened(_ server: PickerServer) async throws -> TodoModel {
        let model = model(server)
        await model.openDependencyPicker(root())
        try #require(model.dependencies.picker?.rowIDs == ["a", "b", "c"])
        return model
    }

    @Test func aTickNeverMovesARowAndTheOrderIsSetWhenThePersonReads() async throws {
        let server = PickerServer()
        let model = try await opened(server)
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["c"]))
        #expect(model.dependencies.picker?.checked("c") == true)
        #expect(model.dependencies.picker?.rowIDs == ["a", "b", "c"], "c stays where it was")
        // The person's reload sorts linked first again.
        await model.reloadDependencyPicker()
        #expect(model.dependencies.picker?.rowIDs == ["c", "a", "b"])
        #expect(model.dependencies.picker?.rowIndex == ["c": 0, "a": 1, "b": 2])
    }

    @Test func theArrowKeysWalkTheRowsAndReturnToTheSearchField() {
        let ids = ["a", "b", "c"], index = ["a": 0, "b": 1, "c": 2]
        #expect(DependencyPickerView.next(from: nil, step: 1, rowIDs: ids, rowIndex: index) == .row("a"), "Down from the search field")
        #expect(DependencyPickerView.next(from: "a", step: 1, rowIDs: ids, rowIndex: index) == .row("b"))
        #expect(DependencyPickerView.next(from: "c", step: 1, rowIDs: ids, rowIndex: index) == .stay)
        #expect(DependencyPickerView.next(from: "a", step: -1, rowIDs: ids, rowIndex: index) == .search, "Up from the first row")
        #expect(DependencyPickerView.next(from: nil, step: -1, rowIDs: ids, rowIndex: index) == .row("c"))
        #expect(DependencyPickerView.next(from: nil, step: 1, rowIDs: [], rowIndex: [:]) == .ignored)
    }
}
