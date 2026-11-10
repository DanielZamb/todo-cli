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
    private(set) var requests: [Data] = []
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var forwarded = body
        if operationID == "tasks.batchDepend", let body {
            let data = try await Data(collecting: body, upTo: 65_536)
            requests.append(data)
            forwarded = HTTPBody(data)
        }
        let (response, responseBody) = try await live.send(request, body: forwarded, baseURL: baseURL, operationID: operationID)
        guard operationID == "tasks.batchDepend", let responseBody else { return (response, responseBody) }
        let data = try await Data(collecting: responseBody, upTo: 65_536)
        replies.append(data)
        return (response, HTTPBody(data))
    }
}

@MainActor struct DependencyBatchStateTests {
    @Test func occConflictRequiresReload() {
        for code in ["occ_conflict"] {
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
        #expect(failure.code == "occ_conflict")
        #expect(failure.message == "Task changed. Reload and retry with its current --expected-version.")
        #expect(failure.exitDetail == "error 4 - Conflict")
        for code in ["occ_conflict"] {
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
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func liveBatchReloadUsesRefusedPreviewFactsWithoutAdvancingTheDependentVersion() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        func create(_ title: String) async throws -> TaskSnapshot {
            try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: title))).ok.body.json)
        }
        func show(_ task: TaskSnapshot) async throws -> TaskSnapshot {
            try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: task.id)).ok.body.json)
        }
        let root = try await create("DAG batch Version done root")
        let open = try await create("DAG batch Version open blocker A")
        let cancelled = try await create("DAG batch Version cancelled blocker B")
        let transport = DependencyBatchReceiptTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-batch-version"), clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) })
        model.replaceCredential(session.credential); model.signedIn = true; model.connection = .live
        defer { model.signedIn = false; model.connect() }
        await model.transition(root, action: "complete")
        await model.transition(cancelled, action: "cancel")
        let done = try await show(root)
        let resolved = try await show(cancelled)
        #expect(done.row_version == 2)
        #expect(done.status == "done")
        #expect(resolved.status == "cancelled")
        await model.openDependencyPicker(done)
        await model.beginDependencyBatch()
        model.dependencies.batch?.targets = [open, resolved]
        model.dependencies.batch?.selected = [open.id, resolved.id]
        await model.previewDependencyBatch()
        #expect(model.dependencies.batch?.report?.results.first?.error?.code == "blocked")
        let refusal = try #require(model.dependencies.batch?.report?.results.first?.error)
        let human = DependencyNotice.project(refusal, context: .linkDone)
        #expect(human.message == "A done Task can only depend on done or cancelled Tasks.")
        #expect(human.detail == "error 2 - validation or usage")
        #expect(try await show(root).row_version == 2)
        #expect(try await show(root).depends_on == [])
        #expect(model.dependencies.batch?.report?.results.last?.error?.code == "occ_conflict")
        #expect(model.dependencies.batch?.report?.requiresReload == true)
        let firstCount = await transport.requests.count
        await model.applyDependencyBatch()
        #expect(await transport.requests.count == firstCount)
        await model.reloadDependencyBatch()
        #expect(await transport.requests.count == firstCount)
        #expect(model.dependencies.batch?.selected == [open.id, resolved.id])
        #expect(model.dependencies.batch?.report == nil)
        let reloadedTargets = try #require(model.dependencies.batch?.targets)
        model.dependencies.batch?.targets = [open.id, resolved.id].compactMap { id in reloadedTargets.first { $0.id == id } }
        await model.previewDependencyBatch()
        #expect(model.dependencies.batch?.items.map(\.from_version) == [2, 2])
        #expect(model.dependencies.batch?.report?.results.first?.error?.code == "blocked")
        #expect(model.dependencies.batch?.report?.results.last?.result?.to_version == 3)
        #expect(model.dependencies.batch?.report?.requiresReload == false)
        await model.applyDependencyBatch()
        let after = try await show(root)
        #expect(after.status == "done")
        #expect(after.row_version == 3)
        #expect(after.depends_on == [resolved.id])
        let replies = await transport.replies
        let requests = await transport.requests
        let receipt = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent().appendingPathComponent("dependency-batch-refused-version.json")
        try JSONSerialization.data(withJSONObject: ["root_before": ["version": done.row_version, "status": done.status], "first_preview_requests": firstCount, "requests": try requests.map { try JSONSerialization.jsonObject(with: $0) }, "replies": try replies.map { try JSONSerialization.jsonObject(with: $0) }, "root_after": ["version": after.row_version, "status": after.status, "depends_on": after.depends_on ?? []]], options: [.prettyPrinted, .sortedKeys]).write(to: receipt)
        #expect(requests.count == 3)
        let secondReply = try #require(JSONSerialization.jsonObject(with: replies[1]) as? [String: Any])
        let rows = try #require(secondReply["results"] as? [[String: Any]])
        let accepted = try #require(rows[1]["result"] as? [String: Any])
        #expect(accepted["from_version"] as? Int == 2)
        #expect(accepted["to_version"] as? Int == 3)
    }

}
