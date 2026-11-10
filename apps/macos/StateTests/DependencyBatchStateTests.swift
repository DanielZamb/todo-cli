import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
@testable import TodoState

private actor DependencyBatchReceiptTransport: ClientTransport {
    private let live = URLSessionTransport()
    private(set) var replies: [Data] = []
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        guard operationID == "tasks.batchDepend", let responseBody else { return (response, responseBody) }
        let data = try await Data(collecting: responseBody, upTo: 65_536)
        replies.append(data)
        return (response, HTTPBody(data))
    }
}

@MainActor struct DependencyBatchStateTests {
    @Test func bothConflictCodesRequireReload() {
        for code in ["conflict", "occ_conflict"] {
            let report = DependencyBatchReport(dry_run: true, results: [.init(index: 0, result: nil, error: .init(message: "Different agent copy", code: code, exitCode: 4, exitMeaning: "Conflict"), exit_code: 4)])
            #expect(report.requiresReload)
        }
        #expect(!DependencyBatchReport(dry_run: true, results: []).requiresReload)
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func liveBatchConflictUsesHumanCopyAndRequiresReloadBeforeApply() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        let root = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "DAG batch reviewed root"))).ok.body.json)
        let candidate = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "DAG batch candidate"))).ok.body.json)
        let transport = DependencyBatchReceiptTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-batch-conflict"), clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) })
        model.replaceCredential(session.credential); model.signedIn = true; model.connection = .live
        defer { model.signedIn = false; model.connect() }
        await model.openDependencyPicker(root)
        await model.beginDependencyBatch()
        model.dependencies.batch?.selected = [candidate.id]
        let edit = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"changes":{"title":"DAG batch competing title"}}"#.utf8))
        _ = try await api.tasks_period_edit(path: .init(profile: "work", task: root.id), body: .json(edit)).ok.body.json
        await model.previewDependencyBatch()
        let failure = try #require(model.dependencies.batch?.report?.results.first?.error)
        #expect(failure.code == "conflict")
        #expect(failure.message == "Task changed. Reload and retry with its current --expected-version.")
        #expect(failure.exitDetail == "error 4 - Conflict")
        for code in ["conflict", "occ_conflict"] {
            let projected = DependencyNotice.project(.init(message: "Different agent recovery must never appear", code: code, exitCode: 4, exitMeaning: "Conflict"), context: .linkDone)
            #expect(projected.message == "This Task changed. Reload its Dependencies before trying again.")
            #expect(projected.detail == "error 4 - Conflict")
        }
        #expect(DependencyNotice.project(failure, context: .linkDone).message == "This Task changed. Reload its Dependencies before trying again.")
        let before = await transport.replies.count
        await model.applyDependencyBatch()
        #expect(await transport.replies.count == before)
        #expect(model.dependencies.batch?.selected == [candidate.id])
        #expect(try await api.tasks_period_show(path: .init(profile: "work", task: root.id)).ok.body.json.row_version == 2)
        await model.reloadDependencyBatch()
        #expect(model.dependencies.batch?.report == nil)
        #expect(model.dependencies.batch?.root.row_version == 2)
        #expect(model.dependencies.batch?.selected == [candidate.id])
        await model.previewDependencyBatch()
        #expect(model.dependencies.batch?.report?.results.first?.result?.outcome == "added")
        await model.applyDependencyBatch()
        let reloaded = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: root.id)).ok.body.json)
        #expect(reloaded.row_version == 3)
        #expect(reloaded.depends_on == [candidate.id])
        let replies = await transport.replies
        let receipt = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent().appendingPathComponent("dependency-batch-conflict.json")
        try JSONSerialization.data(withJSONObject: ["actual_code": failure.code ?? "", "exit_pair": failure.exitDetail ?? "", "requests_before_refused_apply": before, "total_requests": replies.count, "replies": try replies.map { try JSONSerialization.jsonObject(with: $0) }, "reloaded_version": reloaded.row_version], options: [.prettyPrinted, .sortedKeys]).write(to: receipt)
    }
}
