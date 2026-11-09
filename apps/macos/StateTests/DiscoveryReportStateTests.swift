import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

private actor DiscoveryWithoutSSE: ClientTransport {
    private let live = URLSessionTransport()
    private(set) var lookupRequests = 0
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if operationID == "reads.lookup" { lookupRequests += 1 }
        if operationID == "changes.stream" {
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "text/event-stream"]), HTTPBody(AsyncThrowingStream<HTTPBody.ByteChunk, any Error> { _ in }, length: .unknown))
        }
        return try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
    }
}

@MainActor struct DiscoveryReportStateTests {
    private func cli(_ arguments: [String], input: String? = nil) throws -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_F10_CLI"]))
        process.arguments = arguments
        process.environment = ProcessInfo.processInfo.environment
        process.standardOutput = Pipe(); process.standardError = Pipe()
        let pipe = Pipe(); process.standardInput = pipe
        try process.run()
        if let input { try pipe.fileHandleForWriting.write(contentsOf: Data(input.utf8)) }
        try pipe.fileHandleForWriting.close()
        process.waitUntilExit()
        return process.terminationStatus
    }
    private func wait(_ predicate: () -> Bool) async throws {
        for _ in 0..<6000 {
            if predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw URLError(.timedOut)
    }
    private func environment(_ profile: String) async throws -> (TodoModel, Client, DiscoveryWithoutSSE) {
        #expect(try cli(["init", "--profile", profile, "--format", "json"]) == 0)
        #expect(try cli(["login", "--profile", profile, "--format", "json", "--password-stdin"], input: "scratch verification passphrase\n") == 0)
        let url = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: url, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let transport = DiscoveryWithoutSSE()
        let model = TodoModel(configuration: .init(server: url, initialProfile: profile, vaultService: "unused-reports-\(UUID())"), clientFactory: { url, _ in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) })
        model.signedIn = true; model.connection = .live
        model.selectedView = "all"
        return (model, todoClient(server: url, credential: credential), transport)
    }
    private func record(_ name: String, _ object: [String: Any]) throws {
        let base = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent()
        try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]).write(to: base.appendingPathComponent(name))
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func sameProfileShowRefreshesAllTasksWithoutNavigationChangeOrSSE() async throws {
        let (model, client, _) = try await environment("d-current-show")
        #expect(await model.retrySearch() == .applied)
        #expect(model.selectedView == "all")
        #expect(model.selectedProject == nil && model.selectedTag == nil)
        #expect(model.viewCounts["all"] == 0)
        let task = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: model.profile), body: .json(.init(title: "D current Profile explicit reveal"))).ok.body.json)
        await model.openDiscovery(.lookup)
        model.editDiscoveryPrefix(task.id)
        await model.requestDiscovery()
        let match = try #require(model.discovery.appliedSnapshot?.matches.first)
        #expect(await model.showDiscoveryMatch(match))
        try await wait { model.searchPhase == .showing && !model.loading && model.appliedSearchSnapshot?.appliedIdentity.filters.prefix == task.id }
        #expect(model.profile == "d-current-show")
        #expect(model.selectedView == "all")
        #expect(model.viewCounts["all"] == 1)
        #expect(model.tasks.map(\.id) == [task.id])
        #expect(model.appliedSearchSnapshot?.rows.map(\.id) == [task.id])
        #expect(TaskListView(model: model, compactMode: true).visibleTasks.map(\.id) == [task.id])
        #expect(model.searchStale == false)
        #expect(model.searchPending == false)
        #expect(model.editor?.id == task.id)
        model.signedIn = false; model.connect()
        try record("discovery-current-profile-http.json", ["beforeCount": 0, "afterCount": 1, "fullIdApplied": true, "rowVisible": true, "applyingCleared": true, "sseSuppressed": true])
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func removedSelectedTasksProduceStructuredBatchRowsAndImportConflict() async throws {
        let (model, client, transport) = try await environment("d-report-rows")
        let profile = model.profile
        let batch = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: "D removed batch target"))).ok.body.json)
        await model.beginBatchEdit()
        model.batchEdit?.selected = [batch.id]
        #expect(try cli(["rm", batch.id, "--profile", profile, "--expected-version", "1", "--format", "json"]) == 0)
        await model.applyBatchEdit(dryRun: true)
        let batchFailure = try #require(model.batchEdit?.report?.items.first?.error)
        #expect(batchFailure.primaryMessage == "Task not found in d-report-rows.")
        #expect(batchFailure.exitDetail == "error 3 - not found or auth missing")
        #expect(batchFailure.details?.task_id == batch.id)
        #expect(batchFailure.details?.profile?.id == profile)
        let beforeFind = await transport.lookupRequests
        await model.findTaskAfterLookupError(batchFailure)
        #expect(model.batchEdit == nil)
        #expect(model.discovery.prefix == batch.id)
        #expect(model.discovery.phase == .editing)
        #expect(await transport.lookupRequests == beforeFind)
        model.closeDiscovery()

        let attachment = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: "D removed Attachment target"))).ok.body.json)
        let reference = AttachmentSnapshot(id: "reference", location: .link(URL(string: "https://example.com/report")!), added_at: "2026-11-09T00:00:00Z")
        await model.beginAttachmentBatch(reference)
        model.attachmentBatch?.selected = [attachment.id]
        #expect(try cli(["rm", attachment.id, "--profile", profile, "--expected-version", "1", "--format", "json"]) == 0)
        await model.applyAttachmentBatch(dryRun: true)
        let attachmentFailure = try #require(model.attachmentBatch?.report?.items.first?.error)
        #expect(attachmentFailure.primaryMessage == "Task not found in d-report-rows.")
        #expect(attachmentFailure.exitDetail == "error 3 - not found or auth missing")
        #expect(attachmentFailure.details?.task_id == attachment.id)
        let beforeAttachmentFind = await transport.lookupRequests
        await model.findTaskAfterLookupError(attachmentFailure)
        #expect(model.attachmentBatch == nil)
        #expect(model.discovery.prefix == attachment.id)
        #expect(await transport.lookupRequests == beforeAttachmentFind)
        model.closeDiscovery()

        var importPayload = Operations.tasks_period_create.Input.Body.jsonPayload(title: "D removed import target")
        importPayload.external_id = "d:import-removed"
        let imported = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: profile), body: .json(importPayload)).ok.body.json)
        let input = try JSONSerialization.data(withJSONObject: [["external_id": "d:import-removed", "task_id": imported.id, "from_version": 1, "title": "Keep imported draft"]])
        model.loadImport(data: input, name: "removed.json")
        #expect(try cli(["rm", imported.id, "--profile", profile, "--expected-version", "1", "--format", "json"]) == 0)
        await model.previewImport()
        #expect(model.importReport?.items.first?.error?.code == "occ_conflict")
        #expect(model.importDocument?.title(at: 0) == "Keep imported draft")
        let literal = #"{"code":"not_found","message":"Run todo lookup --prefix aa. HTTP: GET /tasks/lookup?prefix=aa.","exit_code":3,"exit_meaning":"not found or auth missing","details":{"profile":{"id":"d-report-rows","name":"d-report-rows"},"task_id":"aa","recovery":"agent-only recovery","extra":"preserved"}}"#
        let fixture = try JSONDecoder().decode(ServerFailure.self, from: Data(literal.utf8))
        #expect(fixture.humanMessage == "Task not found in d-report-rows.\nerror 3 - not found or auth missing")
        let details = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(fixture.details)) as? [String: Any])
        #expect(details["recovery"] as? String == "agent-only recovery")
        #expect(details["extra"] as? String == "preserved")
        model.showingImport = true
        let beforeImportFind = await transport.lookupRequests
        await model.findTaskAfterLookupError(fixture)
        #expect(model.showingImport == false)
        #expect(model.discovery.prefix == "aa")
        #expect(await transport.lookupRequests == beforeImportFind)
        #expect(model.importDocument?.title(at: 0) == "Keep imported draft")
        model.closeDiscovery()
        try record("discovery-report-rows-http.json", ["batch": "not_found", "attachment": "not_found", "import": "occ_conflict", "importNotFoundNotice": "typed UI fixture", "findRequests": 0, "detailsPreserved": true])
    }
}
