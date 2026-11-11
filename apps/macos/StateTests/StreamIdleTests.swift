import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

private let idleTask = #"{"id":"00000000-0000-4000-8000-000000000017","profile_id":"work","entity_version":1,"row_version":1,"title":"Needle task","description":"Kept draft description","priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"source":"manual","occurrence":null,"created_at":"2026-10-27T12:00:00Z","updated_at":"2026-10-27T12:00:00Z","completed_at":null,"deleted_at":null}"#

private actor IdleTransport: ClientTransport {
    private var continuation: AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation?
    private var rejectNext = false
    private var readFailure: String?
    private(set) var streamCalls = 0
    private(set) var readCalls = 0
    private(set) var cursors: [String?] = []
    func end(rejectReconnect: Bool = false) { rejectNext = rejectReconnect; continuation?.finish() }
    func failRead(_ code: String) { readFailure = code }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if operationID == "changes.stream" {
            streamCalls += 1; cursors.append(request.headerFields[HTTPField.Name("Last-Event-ID")!])
            if rejectNext { rejectNext = false; throw URLError(.notConnectedToInternet) }
            let pair = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            continuation = pair.continuation
            pair.continuation.yield(Array("event: ready\ndata: {}\n\n".utf8)[...])
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "text/event-stream", .cacheControl: "no-store"]), HTTPBody(pair.stream, length: .unknown))
        }
        if operationID == "system.health" { return json(#"{"service":"todo-server","build":"idle-proof","contract":"\#(TodoContract.id)"}"#) }
        readCalls += 1
        if operationID == "tasks.list", let failure = readFailure {
            readFailure = nil
            if failure == "transport" { throw URLError(.timedOut) }
            return json(#"{"message":"Narrow the search","code":"search_too_broad","exit_code":2,"exit_meaning":"validation or usage"}"#, status: 400)
        }
        if operationID == "tasks.list" { return json("[" + idleTask + "]") }
        if operationID == "reads.lookup" { return json(#"[{"profile":{"id":"work","name":"Work"},"task_id":"00000000-0000-4000-8000-000000000017","title":"Needle task","project":null}]"#) }
        if operationID == "reads.profiles" { return json(#"[{"id":"work","name":"Work","created_at":"2026-10-27T00:00:00Z","updated_at":"2026-10-27T00:00:00Z","open_task_count":1,"inbox_task_count":1,"visible_task_count":1,"projects":[]}]"#) }
        if operationID == "reads.view" { return json(#"{"name":"today","now":"2026-11-11T12:00:00Z","groups":[]}"#) }
        if operationID == "reads.projects" || operationID == "reads.tags" { return json("[]") }
        throw URLError(.unsupportedURL)
    }
    private func json(_ value: String, status: Int = 200) -> (HTTPResponse, HTTPBody?) { (HTTPResponse(status: .init(code: status), headerFields: [.contentType: "application/json"]), HTTPBody(value)) }
}

@MainActor @Suite(.serialized) struct StreamIdleTests {
    private func wait(line: Int = #line, _ predicate: () async -> Bool) async throws {
        for _ in 0..<600 { if await predicate() { return }; try await Task.sleep(for: .milliseconds(10)) }
        throw WaitFailure.timeout(line)
    }
    private enum WaitFailure: Error { case timeout(Int) }
    private func model(_ transport: IdleTransport, recorder: ClientDiagnosticsRecorder = .disabled) -> TodoModel {
        let url = URL(string: "http://127.0.0.1:1/idle-proof-\(UUID())")!
        let model = TodoModel(configuration: .init(server: url, initialProfile: "work", vaultService: "never-used-idle-\(UUID())"), clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) }, clientDiagnostics: recorder)
        model.replaceCredential("ses_synthetic-idle"); model.selectedView = "all"; model.signedIn = true
        return model
    }
    @Test func controlRepliesDecodeThroughTheGeneratedClient() async throws {
        let transport = IdleTransport()
        let client = Client(serverURL: URL(string: "http://127.0.0.1:1")!, transport: transport, middlewares: [BearerMiddleware(credential: "")])
        #expect(try await client.system_period_health().ok.body.json.contract == TodoContract.id)
        let rows = try await client.tasks_period_list(path: .init(profile: "work")).ok.body.json.map(TaskSnapshot.decode)
        #expect(rows.map(\.title) == ["Needle task"])
        #expect(try await client.reads_period_profiles().ok.body.json.count == 1)
        #expect(try await client.reads_period_view(path: .init(profile: "work", view: .today)).ok.body.json.groups.count == 0)
        let body = try await client.changes_period_stream(path: .init(profile: "work")).ok.body.text_event_hyphen_stream
        for try await chunk in body { var parser = EventStreamDecoder(); #expect(try parser.append(chunk).first?.name == "ready"); break }
    }
    @Test func cleanEndKeepsWritesDraftDialogsAndSnapshotWithoutReads() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-idle-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root), transport = IdleTransport()
        let model = model(transport, recorder: recorder)
        defer { model.signedIn = false; model.connect() }
        let cursorKey = "cursor.\(model.configuration.vaultService).\(model.configuration.server.absoluteString).work"
        UserDefaults.standard.set("17", forKey: cursorKey)
        defer { UserDefaults.standard.removeObject(forKey: cursorKey) }
        model.connect()
        try await wait { model.canWrite && model.appliedSearchSnapshot != nil }
        await model.openDiscovery(.directory)
        let task = try #require(model.tasks.first)
        model.beginEditing(task); model.editor?.title = "Keep the unsaved title"
        model.dependencies.picker = .init(profile: "work", root: task, direction: .dependsOn, text: "keep picker", requiresReload: true)
        model.dependencies.deletion = .init(profile: "work", task: task, acceptedFromVersion: 1, loading: false)
        model.dependencies.graph = .init(profile: "work", root: task.id, search: "keep graph")
        model.quickAdd = true; model.showingImport = true; model.message = "Keep this notice"
        let picker = model.dependencies.picker?.id, deletion = model.dependencies.deletion?.id, directory = model.discovery.appliedSnapshot?.appliedIdentity
        let before = await transport.readCalls, invalidations = model.dependencies.searchRequest
        let start = ProcessInfo.processInfo.systemUptime * 1000
        await transport.end()
        try await wait { await transport.streamCalls == 2 && model.canWrite }
        let events = (await recorder.snapshot()).recent.filter { $0.monotonicMS >= start }
        #expect(!events.contains { $0.availability?.canWrite == false })
        #expect(await transport.readCalls == before)
        #expect(await transport.cursors == ["17", "17"])
        #expect(model.discovery.phase == .showing)
        #expect(model.discovery.appliedSnapshot?.appliedIdentity == directory)
        #expect(model.dependencies.searchRequest == invalidations)
        #expect(model.dependencies.picker?.id == picker)
        #expect(model.dependencies.picker?.text == "keep picker")
        #expect(model.dependencies.deletion?.id == deletion)
        #expect(model.editor?.title == "Keep the unsaved title")
        #expect(model.quickAdd)
        #expect(model.showingImport)
        #expect(model.dependencies.graph?.root == task.id)
        #expect(model.dependencies.graph?.search == "keep graph")
        #expect(model.message == "Keep this notice")
        #expect(model.tasks.map(\.title) == ["Needle task"])
        model.signedIn = false; model.connect(); await recorder.flush()
    }
    @Test func aFailedReconnectDisablesWritesAndDiscoveryRecoversItself() async throws {
        for dialog in [DiscoveryDialog.directory, .lookup] {
            let transport = IdleTransport(), model = model(transport)
            model.connect(); try await wait { model.canWrite }
            await model.openDiscovery(dialog)
            if dialog == .lookup { model.editDiscoveryPrefix("00000000"); await model.requestDiscovery() }
            #expect(model.discovery.phase == .showing)
            await transport.end(rejectReconnect: true)
            try await wait { await transport.streamCalls >= 2 && model.connection == .offline }
            #expect(!model.canWrite)
            #expect(model.discovery.phase == .offline)
            try await wait { await transport.streamCalls >= 3 && model.canWrite }
            try await wait { model.discovery.phase == .showing }
            if dialog == .directory { #expect(model.discovery.appliedSnapshot?.profiles.map(\.name) == ["Work"]) }
            else { #expect(model.discovery.appliedSnapshot?.matches.map(\.title) == ["Needle task"]) }
            model.signedIn = false; model.connect()
        }
    }
    @Test func cursorOrGenerationDriftRequiresANewSnapshot() async throws {
        for cursor in [true, false] {
            let transport = IdleTransport(), model = model(transport)
            model.connect(); try await wait { model.canWrite && model.appliedSearchSnapshot != nil }
            let before = await transport.readCalls
            if cursor { model.lastSequence = "18" } else { model.restoreGeneration = "changed-generation" }
            await transport.end()
            try await wait {
                let calls = await transport.streamCalls, reads = await transport.readCalls
                return calls == 2 && reads == before + 8 && model.searchPhase == .showing
            }
            #expect(model.tasks.map(\.title) == ["Needle task"])
            model.signedIn = false; model.connect()
        }
    }
    @Test func repeatedCleanEndsBackOffWithoutDisablingWrites() async throws {
        let transport = IdleTransport(), model = model(transport)
        defer { model.signedIn = false; model.connect() }
        model.connect(); try await wait { model.canWrite && model.appliedSearchSnapshot != nil }
        let before = await transport.readCalls
        await transport.end(); try await wait { await transport.streamCalls == 2 }
        await transport.end()
        try await Task.sleep(for: .milliseconds(100))
        #expect(await transport.streamCalls == 2)
        #expect(model.canWrite)
        #expect(await transport.readCalls == before)
        try await wait { await transport.streamCalls == 3 }
        #expect(model.canWrite)
    }
    @Test func quietReadyRetriesTransientAndTooBroadSearchStates() async throws {
        for failure in ["transport", "tooBroad"] {
            let transport = IdleTransport(), model = model(transport)
            model.searchText = "Needle"
            model.connect()
            try await wait { model.canWrite && model.searchPhase == .showing }
            await transport.failRead(failure)
            #expect(await model.retrySearch() == .failed)
            #expect(model.searchError != nil)
            let before = await transport.readCalls
            await transport.end()
            try await wait { await transport.streamCalls == 2 && model.searchPhase == .showing }
            #expect(model.searchError == nil)
            #expect(await transport.readCalls > before)
            #expect(model.searchText == "Needle")
            #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Needle task"])
            model.signedIn = false; model.connect()
        }
    }
}
