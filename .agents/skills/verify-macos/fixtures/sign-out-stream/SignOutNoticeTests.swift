import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

// Message ownership around a failed sign-out, against the compiled scratch server
// (SEAT_SERVER). The gate forwards every request to the server except queued
// failures and the event stream, whose ready frames and ends it controls.

private actor NoticeGate: ClientTransport {
    let session: URLSession
    let base: URLSessionTransport
    var operations: [String] = []
    var failures: [String: [RequestFailure]] = [:]
    var streams: [AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation] = []
    var failingStreams = 0
    init() { let s = URLSession(configuration: .ephemeral); session = s; base = URLSessionTransport(configuration: .init(session: s)) }
    func fail(_ operation: String, status: Int, message: String) { failures[operation, default: []].append(RequestFailure(status: status, message: message, code: "unavailable")) }
    func failNextStream() { failingStreams += 1 }
    func ready() { streams.last?.yield(Array("event: ready\ndata: {}\n\n".utf8)[...]) }
    func endStream() { streams.last?.finish() }
    var streamCount: Int { streams.count }
    func stop() { streams.forEach { $0.finish() }; session.invalidateAndCancel() }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        operations.append(operationID)
        if var queue = failures[operationID], !queue.isEmpty {
            let failure = queue.removeFirst(); failures[operationID] = queue
            throw failure
        }
        if operationID == "changes.stream" {
            if failingStreams > 0 { failingStreams -= 1; throw URLError(.networkConnectionLost) }
            let pair = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            streams.append(pair.continuation)
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "text/event-stream", .cacheControl: "no-store"]), HTTPBody(pair.stream, length: .unknown))
        }
        return try await base.send(request, body: body, baseURL: baseURL, operationID: operationID)
    }
}

@MainActor @Suite(.serialized) struct SignOutNoticeOwnershipTests {
    private let passphrase = "scratch verification passphrase"

    private func wait(_ stage: String, _ predicate: () async -> Bool) async throws {
        for _ in 0..<2000 { if await predicate() { return }; try await Task.sleep(for: .milliseconds(5)) }
        Issue.record("timed out at \(stage)")
        throw URLError(.timedOut)
    }

    /// A signed-in model whose stream is live after its first ready frame.
    private func live() async throws -> (TodoModel, NoticeGate, SessionVault) {
        let url = URL(string: ProcessInfo.processInfo.environment["SEAT_SERVER"]!)!
        let owner = try await todoClient(server: url, credential: "").signIn_period_signIn(body: .json(.init(passphrase: passphrase))).ok.body.json.credential
        _ = try await todoClient(server: url, credential: owner).tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "Notice ownership " + UUID().uuidString)))
        let gate = NoticeGate()
        let model = TodoModel(configuration: .init(server: url, initialProfile: "work", vaultService: "memory-notice-" + UUID().uuidString), clientFactory: { url, token in Client(serverURL: url, transport: gate, middlewares: [BearerMiddleware(credential: token)]) }, clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        let vault = SessionVault(service: model.configuration.vaultService, account: url.absoluteString)
        try vault.save(owner)
        model.replaceCredential(owner); model.signedIn = true; model.selectedView = "all"; model.clientDiagnosticsUI.stop()
        model.connect()
        try await reconnected(model, gate, streams: 1)
        try await wait("catalog") { !model.tasks.isEmpty }
        return (model, gate, vault)
    }

    /// Waits for stream number `streams`, sends ready and waits for a writable catalog.
    private func reconnected(_ model: TodoModel, _ gate: NoticeGate, streams: Int) async throws {
        try await wait("stream \(streams)") { await gate.streamCount >= streams }
        await gate.ready()
        try await wait("ready \(streams)") { model.connection == .live && !model.loading && model.canWrite }
        try await Task.sleep(for: .milliseconds(50))
    }

    private func failedSignOut(_ model: TodoModel, _ gate: NoticeGate, _ text: String) async throws {
        let streams = await gate.streamCount
        await gate.fail("credentials.signOut", status: 503, message: text)
        await model.signOut()
        try #require(model.message?.contains(text) == true)
        try await reconnected(model, gate, streams: streams + 1)
    }

    private func finish(_ model: TodoModel, _ gate: NoticeGate) async { model.signedIn = false; model.connect(); await gate.stop() }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func failedSignOutNoticeSurvivesReady() async throws {
        let (model, gate, _) = try await live()
        try await failedSignOut(model, gate, "FIRST sign-out failed")
        #expect(model.message?.contains("FIRST sign-out failed") == true)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func newerWriteErrorAfterTheNoticeIsNeverReplacedByIt() async throws {
        let (model, gate, _) = try await live()
        try await failedSignOut(model, gate, "OLDER sign-out failed")
        let task = try #require(model.tasks.first)
        await gate.fail("tasks.transition", status: 503, message: "NEWER write failed")
        await model.transition(task, action: task.status == "open" ? "complete" : "reopen")
        try #require(model.message?.contains("NEWER write failed") == true)
        // The banner's Retry button: connect() makes the next ready a recovery, which reaches the clear.
        let before = await gate.streamCount
        model.connect()
        try await reconnected(model, gate, streams: before + 1)
        #expect(model.message?.contains("NEWER write failed") == true)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func refreshFailureReplacesTheNoticeAndRecoveryClearsWithoutRestoringIt() async throws {
        let (model, gate, _) = try await live()
        try await failedSignOut(model, gate, "OLDER sign-out failed")
        let streams = await gate.streamCount
        await gate.fail("tasks.list", status: 503, message: "catalog read failed")
        await model.refreshAfterWrite("Task saved")
        #expect(model.message == "Task saved. The live view is reconnecting.")
        try await reconnected(model, gate, streams: streams + 1)
        #expect(model.message == nil)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func dependencyFollowUpErrorAfterReadyIsKept() async throws {
        let (model, gate, _) = try await live()
        try await failedSignOut(model, gate, "OLDER sign-out failed")
        await gate.fail("tasks.show", status: 404, message: "NEWER dependency follow-up failed")
        await model.createDependencyFollowUp(UUID().uuidString)
        try #require(model.message?.contains("NEWER dependency follow-up failed") == true)
        // The banner's Retry button: connect() makes the next ready a recovery, which reaches the clear.
        let before = await gate.streamCount
        model.connect()
        try await reconnected(model, gate, streams: before + 1)
        #expect(model.message?.contains("NEWER dependency follow-up failed") == true)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func siblingErrorsLeaveTheNoticeAndSurviveReady() async throws {
        let (model, gate, _) = try await live()
        try await failedSignOut(model, gate, "OLDER sign-out failed")
        await gate.fail("diagnostics.snapshot", status: 503, message: "diagnostics failed")
        await model.loadDiagnostics()
        let diagnostics = try #require(model.diagnosticsError)
        // The banner's Retry button: connect() makes the next ready a recovery, which reaches the clear.
        let before = await gate.streamCount
        model.connect()
        try await reconnected(model, gate, streams: before + 1)
        #expect(model.message?.contains("OLDER sign-out failed") == true)
        #expect(model.diagnosticsError == diagnostics)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func unrelatedMessageSurvivesAnOrdinaryReconnect() async throws {
        let (model, gate, _) = try await live()
        let task = try #require(model.tasks.first)
        await gate.fail("tasks.transition", status: 503, message: "UNRELATED write failed")
        await model.transition(task, action: task.status == "open" ? "complete" : "reopen")
        try #require(model.message?.contains("UNRELATED write failed") == true)
        // The banner's Retry button: connect() makes the next ready a recovery, which reaches the clear.
        let before = await gate.streamCount
        model.connect()
        try await reconnected(model, gate, streams: before + 1)
        #expect(model.message?.contains("UNRELATED write failed") == true)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func offlineMessageIsTheConnectionsOwnAndRecoveryClearsIt() async throws {
        let (model, gate, _) = try await live()
        let streams = await gate.streamCount
        await gate.failNextStream()
        await gate.endStream()
        try await wait("offline") { model.connection == .offline && model.message != nil }
        try await reconnected(model, gate, streams: streams + 1)
        #expect(model.message == nil)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func secondFailedSignOutReplacesTheFirst() async throws {
        let (model, gate, _) = try await live()
        try await failedSignOut(model, gate, "FIRST sign-out failed")
        try await failedSignOut(model, gate, "SECOND sign-out failed")
        #expect(model.message?.contains("SECOND sign-out failed") == true)
        #expect(model.message?.contains("FIRST") == false)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func successfulSignOutAfterAFailedOneEndsTheNotice() async throws {
        let (model, gate, vault) = try await live()
        try await failedSignOut(model, gate, "OLDER sign-out failed")
        await model.signOut()
        #expect(!model.signedIn && model.message == nil)
        #expect((try vault.load()) == nil)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func profileChangeEndsTheNoticeAndReadyDoesNotBringItBack() async throws {
        let (model, gate, _) = try await live()
        try await failedSignOut(model, gate, "OLDER sign-out failed")
        let streams = await gate.streamCount
        model.changeProfile("personal")
        #expect(model.message == nil)
        try await reconnected(model, gate, streams: streams + 1)
        #expect(model.message == nil)
        await finish(model, gate)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func credentialReplacementEndsTheNotice() async throws {
        let (model, gate, _) = try await live()
        try await failedSignOut(model, gate, "OLDER sign-out failed")
        let url = URL(string: ProcessInfo.processInfo.environment["SEAT_SERVER"]!)!
        let next = try await todoClient(server: url, credential: "").signIn_period_signIn(body: .json(.init(passphrase: passphrase))).ok.body.json.credential
        model.replaceCredential(next)
        #expect(model.message == nil)
        await finish(model, gate)
    }
}
