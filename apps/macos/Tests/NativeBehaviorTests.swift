import XCTest
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
@testable import Todo

final class NativeBehaviorTests: XCTestCase {
    @MainActor
    func testRestoreSerializesManualSignIn() async throws {
        let (model, vault, transport) = try stateFixture(operation: "reads.profiles")
        defer { try? vault.delete() }
        try vault.save("old-session")
        let restoring = Task { await model.restore() }
        await transport.waitForRequest()
        XCTAssertTrue(model.busy)
        let signedIn = await model.signIn("new passphrase")
        XCTAssertFalse(signedIn)
        XCTAssertEqual(try vault.load(), "old-session")
        await transport.release(status: .unauthorized, json: #"{"message":"revoked"}"#)
        await restoring.value
        XCTAssertFalse(model.busy)
        XCTAssertFalse(model.signedIn)
        XCTAssertNil(try vault.load())
        let calls = await transport.calls
        XCTAssertEqual(calls, ["reads.profiles"])
    }

    @MainActor
    func testRestoreRetriesExistingSessionAfterServerOutage() async throws {
        let (model, vault, transport) = try stateFixture(operation: "reads.profiles")
        defer { try? vault.delete() }
        try vault.save("valid-session")
        let first = Task { await model.restore() }
        await transport.waitForRequest()
        await transport.fail()
        await first.value
        XCTAssertTrue(model.canRestore)
        XCTAssertFalse(model.busy)
        XCTAssertEqual(try vault.load(), "valid-session")
        let retry = Task { await model.restore() }
        await transport.waitForRequest()
        await transport.release()
        await retry.value
        XCTAssertTrue(model.signedIn)
        XCTAssertFalse(model.canRestore)
        XCTAssertEqual(try vault.load(), "valid-session")
        await model.signOut()
    }

    @MainActor
    func testQuickAddSnapshotsMetadataBeforeAwaitingParser() async throws {
        let (model, vault, transport) = try stateFixture(operation: "reads.quickAdd")
        defer { try? vault.delete() }
        model.signedIn = true
        model.connection = .live
        model.newTitle = "Prepare tomorrow p1"
        model.removedQuickAddFields = ["due"]
        let submitting = Task { await model.create(openEditor: false) }
        await transport.waitForRequest()
        XCTAssertTrue(model.busy)
        let duplicate = await model.create(openEditor: false)
        XCTAssertFalse(duplicate)
        model.removedQuickAddFields = []
        await transport.release(json: #"{"title":"Prepare","due_at":{"kind":"date","date":"2026-10-28"},"scheduled_at":null,"priority":"P1","tags":[],"project":null}"#)
        let accepted = await submitting.value
        XCTAssertFalse(accepted)
        let createdBody = await transport.createdBody
        let data = try XCTUnwrap(createdBody)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(payload["title"] as? String, "Prepare")
        XCTAssertEqual(payload["priority"] as? String, "P1")
        XCTAssertNil(payload["due_at"])
        XCTAssertEqual(model.newTitle, "Prepare tomorrow p1")
        XCTAssertFalse(model.busy)
    }

    @MainActor
    func testOldHistoryCannotReplaceCurrentEditorHistory() async throws {
        try await checkOldHistory(failing: false)
    }

    @MainActor
    func testOldHistoryFailureCannotReplaceCurrentEditorError() async throws {
        try await checkOldHistory(failing: true)
    }

    @MainActor
    private func checkOldHistory(failing: Bool) async throws {
        let (model, vault, transport) = try stateFixture(operation: "reads.history")
        defer { try? vault.delete() }
        model.beginEditing(try task(title: "Task A", description: "A", version: 1, id: "task-a"))
        let loading = Task { await model.loadHistory() }
        await transport.waitForRequest()
        model.editor = nil
        model.beginEditing(try task(title: "Task B", description: "B", version: 1, id: "task-b"))
        model.history = [.init(seq: 22, outcome: "committed", reason: nil, event: .init(kind: "TaskEdited", occurred_at: "2026-10-27T12:00:00Z"))]
        if failing { await transport.fail() } else { await transport.release() }
        await loading.value
        XCTAssertEqual(model.history.map(\.seq), [22])
        XCTAssertNil(model.historyError)
        XCTAssertEqual(model.editor?.title, "Task B")
    }

    @MainActor
    private func stateFixture(operation: String) throws -> (TodoModel, SessionVault, HeldTransport) {
        let server = try XCTUnwrap(URL(string: "http://127.0.0.1:1"))
        let service = "local.todo.verify.state." + UUID().uuidString
        let transport = HeldTransport(operation: operation)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: service), clientFactory: { url, credential in
            Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
        })
        return (model, SessionVault(service: service, account: server.absoluteString), transport)
    }
    @MainActor
    func testRevokedKeychainSessionReturnsToSignIn() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let values = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: root.appendingPathComponent("DerivedData/verification.json")))
        let server = try XCTUnwrap(values["server"].flatMap(URL.init(string:)))
        let service = try XCTUnwrap(values["keychainService"]) + ".revoked-" + UUID().uuidString
        let vault = SessionVault(service: service, account: server.absoluteString)
        defer { try? vault.delete() }
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        try vault.save(session.credential)
        _ = try await todoClient(server: server, credential: session.credential).credentials_period_signOut().noContent
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: service))
        await model.restore()
        XCTAssertFalse(model.signedIn)
        XCTAssertEqual(model.message, "Your Session ended. Sign in again.")
        XCTAssertNil(try vault.load())
    }
    func testHostedAppUsesScratchConfiguration() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let values = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: root.appendingPathComponent("DerivedData/verification.json")))
        let configuration = ClientConfiguration.load()
        XCTAssertEqual(configuration.server.absoluteString, values["server"])
        XCTAssertEqual(configuration.vaultService, values["keychainService"])
    }
    func testInstantsAcceptServerFractionalSeconds() {
        XCTAssertEqual(TaskTime(kind: "instant", utc: "2026-10-27T15:00:00.125Z", time_zone: "America/Bogota").instant?.timeIntervalSince1970, 1793113200.125)
        XCTAssertEqual(TaskTime(kind: "instant", utc: "2026-10-27T15:00:00Z", time_zone: "America/Bogota").instant?.timeIntervalSince1970, 1793113200)
    }
    func testQuickAddClearsChosenMetadataWithoutReparsingTitle() throws {
        let parsed = ParsedTask(title: "Prepare launch", due_at: TaskTime(kind: "date", date: "2026-10-28"), scheduled_at: nil, priority: "P1", tags: ["writing", "work"], project: "Website")
        let result = parsed.removing(["due", "priority", "tag:writing", "project"])
        XCTAssertEqual(result.title, "Prepare launch")
        XCTAssertNil(result.due_at)
        XCTAssertNil(result.priority)
        XCTAssertEqual(result.tags, ["work"])
        XCTAssertNil(result.project)
    }
    func testStreamFramesAcrossUTF8AndLineEndings() throws {
        var parser = EventStreamDecoder()
        let bytes = Array("\u{feff}: heartbeat\r\nevent: operation\r\nid: 42\r\ndata: café\r\ndata: second\r\n\r\nevent: ready\ndata: null\n\n".utf8)
        var frames: [ServerEvent] = []
        for byte in bytes { frames += try parser.append([byte][...]) }
        XCTAssertEqual(frames, [ServerEvent(id: "42", name: "operation", data: "café\nsecond"), ServerEvent(id: nil, name: "ready", data: "null")])
    }

    func testIncompleteStreamFrameDoesNotDispatch() throws {
        var parser = EventStreamDecoder()
        XCTAssertEqual(try parser.append(Array("event: operation\ndata: {}\n".utf8)[...]), [])
    }

    func testConflictRequiresOnlyOverlappingFieldsAndKeepsCurrentUneditedFields() throws {
        let base = try task(title: "Base", description: "Original", version: 1)
        var draft = TaskDraft(base)
        draft.title = "Your title"
        let latest = try task(title: "Current title", description: "Current description", version: 2)
        XCTAssertEqual(draft.overlaps(with: latest), ["title"])
        let merged = draft.merging(latest, choices: ["title": true])
        XCTAssertEqual(merged.title, "Your title")
        XCTAssertEqual(merged.description, "Current description")
        XCTAssertEqual(merged.base.row_version, 2)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: merged.changesData()) as? NSDictionary,
                       ["from_version": 2, "changes": ["title": "Your title"]] as NSDictionary)
        XCTAssertEqual(draft.merging(latest, choices: ["title": false]).changedFields, [])
    }

    func testNonoverlappingConflictMergesBothChanges() throws {
        let base = try task(title: "Base", description: "Original", version: 1)
        var draft = TaskDraft(base)
        draft.description = "Local notes"
        let latest = try task(title: "Remote title", description: "Original", version: 2)
        XCTAssertEqual(draft.overlaps(with: latest), [])
        let merged = draft.merging(latest, choices: [:])
        XCTAssertEqual(merged.title, "Remote title")
        XCTAssertEqual(merged.description, "Local notes")
    }

    private func task(title: String, description: String, version: Int, id: String = "task-1") throws -> TaskSnapshot {
        let value: [String: Any] = ["id": id, "profile_id": "work", "row_version": version, "title": title,
                                    "description": description, "priority": "P2", "status": "open", "tags": []]
        return try JSONDecoder().decode(TaskSnapshot.self, from: JSONSerialization.data(withJSONObject: value))
    }
}

private actor HeldTransport: ClientTransport {
    let operation: String
    var calls: [String] = []
    var createdBody: Data?
    private var pending: CheckedContinuation<(HTTPResponse, HTTPBody?), Error>?
    private var waiting: CheckedContinuation<Void, Never>?

    init(operation: String) { self.operation = operation }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        calls.append(operationID)
        if operationID == operation {
            return try await withCheckedThrowingContinuation { continuation in
                pending = continuation
                waiting?.resume()
                waiting = nil
            }
        }
        if operationID == "credentials.signOut" { return (HTTPResponse(status: .noContent), nil) }
        if operationID == "tasks.create" {
            if let body { createdBody = try await Data(collecting: body, upTo: 65_536) }
            return (HTTPResponse(status: .internalServerError, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"message":"creation fixture rejected"}"#))
        }
        throw URLError(.cancelled)
    }

    func waitForRequest() async {
        if pending != nil { return }
        await withCheckedContinuation { waiting = $0 }
    }

    func release(status: HTTPResponse.Status = .ok, json: String = "[]") {
        let continuation = pending
        pending = nil
        continuation?.resume(returning: (HTTPResponse(status: status, headerFields: [.contentType: "application/json"]), HTTPBody(json)))
    }

    func fail() {
        let continuation = pending
        pending = nil
        continuation?.resume(throwing: URLError(.cannotConnectToHost))
    }
}
