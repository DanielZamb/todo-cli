import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
@testable import TodoState

private actor DeleteReceiptTransport: ClientTransport {
    struct Fact: Codable, Sendable {
        let requestVersion: String?
        let requestDryRun: String?
        let responseVersion: Int?
        let responseDryRun: Bool?
        let responseDeleted: Bool
        let status: Int
    }
    private let live = URLSessionTransport()
    private(set) var facts: [Fact] = []
    private let holdFirstShow: Bool
    private var heldShow: CheckedContinuation<Void, Never>?
    private var showWasHeld = false
    var holding: Bool { heldShow != nil }
    init(holdFirstShow: Bool = false) { self.holdFirstShow = holdFirstShow }
    func release() { heldShow?.resume(); heldShow = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        if operationID == "tasks.show", holdFirstShow, !showWasHeld, let responseBody {
            showWasHeld = true
            let data = try await Data(collecting: responseBody, upTo: 65_536)
            await withCheckedContinuation { heldShow = $0 }
            return (response, HTTPBody(data))
        }
        guard operationID == "tasks.delete", let responseBody else { return (response, responseBody) }
        let data = try await Data(collecting: responseBody, upTo: 65_536)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let query = URLComponents(string: "http://localhost" + (request.path ?? ""))?.queryItems ?? []
        facts.append(.init(requestVersion: query.first { $0.name == "from_version" }?.value, requestDryRun: query.first { $0.name == "dry_run" }?.value, responseVersion: json?["row_version"] as? Int, responseDryRun: json?["dry_run"] as? Bool, responseDeleted: json?["deleted_at"] is String, status: response.status.code))
        return (response, HTTPBody(data))
    }
}

extension DependencyDeleteStateTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func liveOldDeleteReadCannotReplaceANewerReviewedPreview() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        let root = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "DAG native reversed Delete reads"))).ok.body.json)
        let transport = DeleteReceiptTransport(holdFirstShow: true)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-delete-order"), clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) })
        model.replaceCredential(session.credential); model.signedIn = true; model.connection = .live
        defer { model.signedIn = false; model.connect() }
        let old = Task { await model.openDependencyDelete(root) }
        for _ in 0..<6000 { if await transport.holding { break }; try await Task.sleep(for: .milliseconds(10)) }
        #expect(await transport.holding)
        let edit = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"changes":{"title":"DAG native fresh Delete review"}}"#.utf8))
        _ = try await api.tasks_period_edit(path: .init(profile: "work", task: root.id), body: .json(edit)).ok.body.json
        await model.reloadDependencyDelete()
        #expect(model.dependencies.deletion?.acceptedFromVersion == 2)
        #expect(model.dependencies.deletion?.task.title == "DAG native fresh Delete review")
        await transport.release(); await old.value
        #expect(model.dependencies.deletion?.acceptedFromVersion == 2)
        #expect(model.dependencies.deletion?.failure == nil)
        #expect(await transport.facts.map(\.requestVersion) == ["2"])
        await model.confirmDependencyDelete()
        #expect(model.dependencies.deletion == nil)
        #expect(await transport.facts.map(\.requestVersion) == ["2", "2"])
    }
}

@MainActor struct DependencyDeleteStateTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func livePreviewRequestVersionIsRetainedWhenResponseContainsTheSimulatedAfterTask() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        let task = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "DAG native Delete preview request Version regression"))).ok.body.json)
        let transport = DeleteReceiptTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-delete-version"), clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) })
        model.replaceCredential(session.credential)
        model.signedIn = true
        model.connection = .live
        defer { model.signedIn = false; model.connect() }
        model.beginEditing(task)
        await model.openDependencyDelete(task)
        #expect(model.dependencies.deletion?.task.row_version == 1)
        #expect(model.dependencies.deletion?.acceptedFromVersion == 1)
        #expect(model.dependencies.deletion?.fingerprint?.isEmpty == false)
        let before = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: task.id)).ok.body.json)
        #expect(before.row_version == 1)
        #expect(before.deleted_at == nil)
        await model.confirmDependencyDelete()
        #expect(model.dependencies.deletion == nil)
        #expect(model.editor == nil)
        #expect(model.deletionNotice == "Task deleted")
        let facts = await transport.facts
        #expect(facts.count == 2)
        #expect(facts.map(\.requestVersion) == ["1", "1"])
        #expect(facts.map(\.requestDryRun) == ["true", nil])
        #expect(facts.map(\.responseVersion) == [2, 2])
        #expect(facts.map(\.responseDryRun) == [true, false])
        #expect(facts.allSatisfy { $0.status == 200 && $0.responseDeleted })
        let listed = try await api.tasks_period_list(path: .init(profile: "work")).ok.body.json.map(TaskSnapshot.decode)
        #expect(!listed.contains { $0.id == task.id })
        let receipt = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent().appendingPathComponent("dependency-delete-version.json")
        try JSONEncoder().encode(facts).write(to: receipt)
    }
}
