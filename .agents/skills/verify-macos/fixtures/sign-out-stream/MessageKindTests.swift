import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

// The message rule, kind by kind, against the compiled scratch server (SEAT_SERVER).
// For each kind: an interleaving, where a newer message of another kind is published
// while an action that clears this kind is still finishing (the newer one survives),
// and a recovery, where the same kind's success clears its earlier message.

private enum Step: Sendable { case pass, hold, fail(Int, String) }

private actor ScriptGate: ClientTransport {
    let session: URLSession
    let base: URLSessionTransport
    var script: [String: [Step]] = [:]
    var held: [String: CheckedContinuation<Void, Never>] = [:]
    var streams: [AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation] = []
    var failingStreams = 0
    init() { let s = URLSession(configuration: .ephemeral); session = s; base = URLSessionTransport(configuration: .init(session: s)) }
    func next(_ operation: String, _ steps: Step...) { script[operation, default: []] += steps }
    func isHeld(_ operation: String) -> Bool { held[operation] != nil }
    func release(_ operation: String) { held.removeValue(forKey: operation)?.resume() }
    func ready() { streams.last?.yield(Array("event: ready\ndata: {}\n\n".utf8)[...]) }
    func endStream() { streams.last?.finish() }
    func failNextStream() { failingStreams += 1 }
    var streamCount: Int { streams.count }
    var stopped = false
    func stop() { stopped = true; for key in held.keys { release(key) }; streams.forEach { $0.finish() }; session.invalidateAndCancel() }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var step = Step.pass
        if var queue = script[operationID], !queue.isEmpty { step = queue.removeFirst(); script[operationID] = queue }
        switch step {
        case .pass: break
        case .hold: await withCheckedContinuation { held[operationID] = $0 }
        case .fail(let status, let message): throw RequestFailure(status: status, message: message, code: status == 401 ? "unauthorized" : "unavailable")
        }
        if operationID == "changes.stream" {
            if failingStreams > 0 { failingStreams -= 1; throw URLError(.networkConnectionLost) }
            let pair = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            streams.append(pair.continuation)
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "text/event-stream", .cacheControl: "no-store"]), HTTPBody(pair.stream, length: .unknown))
        }
        // A model torn down by its test may still have a queued request; never hand it to an invalidated session.
        if stopped { throw CancellationError() }
        return try await base.send(request, body: body, baseURL: baseURL, operationID: operationID)
    }
}

@MainActor @Suite(.serialized) struct MessageKindTests {
    private let passphrase = "scratch verification passphrase"
    private var url: URL { URL(string: ProcessInfo.processInfo.environment["SEAT_SERVER"]!)! }

    private func wait(_ stage: String, _ predicate: () async -> Bool) async throws {
        for _ in 0..<2000 { if await predicate() { return }; try await Task.sleep(for: .milliseconds(5)) }
        Issue.record("timed out at \(stage)")
        throw URLError(.timedOut)
    }
    private func owner() async throws -> String {
        try await todoClient(server: url, credential: "").signIn_period_signIn(body: .json(.init(passphrase: passphrase))).ok.body.json.credential
    }
    private func model(_ gate: ScriptGate) -> (TodoModel, SessionVault) {
        let model = TodoModel(configuration: .init(server: url, initialProfile: "work", vaultService: "memory-kind-" + UUID().uuidString), clientFactory: { url, token in Client(serverURL: url, transport: gate, middlewares: [BearerMiddleware(credential: token)]) }, clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.clientDiagnosticsUI.stop()
        return (model, SessionVault(service: model.configuration.vaultService, account: url.absoluteString))
    }
    /// Signed in, stream live after its first ready, one fresh open Task in the catalog.
    private func live(_ gate: ScriptGate) async throws -> (TodoModel, SessionVault, TaskSnapshot) {
        let credential = try await owner()
        let title = "Message kind " + UUID().uuidString
        _ = try await todoClient(server: url, credential: credential).tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: title)))
        let (model, vault) = model(gate)
        try vault.save(credential)
        model.replaceCredential(credential); model.signedIn = true; model.selectedView = "all"
        model.connect()
        try await ready(model, gate, streams: 1)
        try await wait("catalog") { model.tasks.contains { $0.title == title } }
        return (model, vault, model.tasks.first { $0.title == title }!)
    }
    private func ready(_ model: TodoModel, _ gate: ScriptGate, streams: Int) async throws {
        try await wait("stream \(streams)") { await gate.streamCount >= streams }
        await gate.ready()
        try await wait("ready \(streams)") { model.connection == .live && !model.loading && model.canWrite }
        try await Task.sleep(for: .milliseconds(30))
    }
    private func finish(_ model: TodoModel, _ gate: ScriptGate, _ vault: SessionVault) async { model.signedIn = false; model.connect(); try? vault.delete(); await gate.stop() }
    /// A newer message of another kind (a Dependency follow-up error), published now.
    private func newerFollowUpError(_ model: TodoModel, _ gate: ScriptGate) async -> String {
        await gate.next("tasks.show", .fail(404, "NEWER follow-up failed"))
        await model.createDependencyFollowUp(UUID().uuidString)
        return model.message ?? "missing"
    }
    private func lookup(_ model: TodoModel, _ task: TaskSnapshot) async throws -> TaskLookupMatch {
        await model.openDiscovery(.lookup)
        model.editDiscoveryPrefix(String(task.id.prefix(8)))
        await model.requestDiscovery()
        return try #require(model.discovery.appliedSnapshot?.matches.first { $0.task_id == task.id })
    }
    private func edit(_ task: TaskSnapshot, credential: String) async throws {
        var request = URLRequest(url: url.appending(path: "profiles/work/tasks/\(task.id)"))
        request.httpMethod = "PATCH"
        request.setValue("Bearer " + credential, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["from_version": task.row_version, "changes": ["title": task.title + " edited"]])
        let (_, response) = try await URLSession.shared.data(for: request)
        try #require((response as? HTTPURLResponse)?.statusCode == 200)
    }

    // MARK: connection

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func connectionRecoveryClearsTheOfflineMessage() async throws {
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        let streams = await gate.streamCount
        await gate.failNextStream(); await gate.endStream()
        try await wait("offline") { model.connection == .offline && model.message != nil }
        try await ready(model, gate, streams: streams + 1)
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func connectionReadyKeepsANewerFollowUpError() async throws {
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        let streams = await gate.streamCount
        await gate.failNextStream(); await gate.endStream()
        try await wait("offline") { model.connection == .offline }
        try await wait("retry stream") { await gate.streamCount > streams }
        let newer = await newerFollowUpError(model, gate)
        try await ready(model, gate, streams: streams + 1)
        #expect(model.message == newer)
        await finish(model, gate, vault)
    }

    // MARK: restore and sign-in (also cover sessionEnded)

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func restoreSuccessClearsItsEarlierRestoreError() async throws {
        let gate = ScriptGate(); let (model, vault) = model(gate)
        try vault.save(try await owner())
        await gate.next("system.health", .fail(503, "OLD restore failed"))
        await model.restore()
        try #require(model.message?.contains("OLD restore failed") == true && model.canRestore)
        await model.restore()
        try await wait("restored") { model.signedIn }
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func restoreSuccessKeepsAConnectionMessagePublishedWhileItFinished() async throws {
        let gate = ScriptGate(); let (model, vault) = model(gate)
        try vault.save(try await owner())
        await gate.next("reads.profiles", .hold)
        let restore = Task { await model.restore() }
        try await wait("profiles held") { await gate.isHeld("reads.profiles") }
        // A connection-kind message the restore's success would clear, but newer than its start.
        await gate.next("system.health", .fail(503, "NEWER update check failed"))
        await model.reconnectAfterUpdate()
        let newer = try #require(model.message)
        await gate.release("reads.profiles"); await restore.value
        #expect(model.signedIn && model.message == newer)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func signInSuccessClearsSignInAndSessionEndedMessages() async throws {
        let gate = ScriptGate(); let (model, vault) = model(gate)
        _ = try await todoClient(server: url, credential: try await owner()).tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "Message kind sign-in " + UUID().uuidString)))
        model.selectedView = "all"
        await gate.next("signIn.signIn", .fail(503, "OLD sign-in failed"))
        #expect(await model.signIn(passphrase) == false)
        try #require(model.message?.contains("OLD sign-in failed") == true)
        #expect(await model.signIn(passphrase))
        #expect(model.message == nil)
        try await ready(model, gate, streams: 1)
        try await wait("catalog") { !model.tasks.isEmpty }
        // Session ended by a 401, then a successful sign-in.
        let task = try #require(model.tasks.first)
        await gate.next("tasks.transition", .fail(401, "expired"))
        await model.transition(task, action: task.status == "open" ? "complete" : "reopen")
        try #require(!model.signedIn && model.message?.contains("Session ended") == true)
        #expect(await model.signIn(passphrase))
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func signInSuccessKeepsAConnectionMessagePublishedWhileItFinished() async throws {
        let gate = ScriptGate(); let (model, vault) = model(gate)
        await gate.next("signIn.signIn", .fail(503, "OLD sign-in failed"))
        _ = await model.signIn(passphrase)
        await gate.next("reads.profiles", .hold)
        let signIn = Task { await model.signIn(passphrase) }
        try await wait("profiles held") { await gate.isHeld("reads.profiles") }
        await gate.next("system.health", .fail(503, "NEWER update check failed"))
        await model.reconnectAfterUpdate()
        let newer = try #require(model.message)
        try #require(newer.contains("NEWER"))
        await gate.release("reads.profiles")
        #expect(await signIn.value)
        #expect(model.message == newer)
        await finish(model, gate, vault)
    }

    // MARK: sign-out

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func laterSignOutSuccessEndsTheNotice() async throws {
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        let streams = await gate.streamCount
        await gate.next("credentials.signOut", .fail(503, "OLD sign-out failed"))
        await model.signOut()
        try #require(model.message?.contains("OLD sign-out failed") == true)
        try await ready(model, gate, streams: streams + 1)
        await model.signOut()
        #expect(!model.signedIn && model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func signOutReconnectKeepsANewerFollowUpError() async throws {
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        let streams = await gate.streamCount
        await gate.next("credentials.signOut", .fail(503, "OLD sign-out failed"))
        await model.signOut()
        try await wait("reconnect stream") { await gate.streamCount > streams }
        let newer = await newerFollowUpError(model, gate)
        try await ready(model, gate, streams: streams + 1)
        #expect(model.message == newer)
        await finish(model, gate, vault)
    }

    // MARK: transition

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func transitionSuccessClearsItsEarlierError() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await gate.next("tasks.transition", .fail(503, "OLD complete failed"))
        await model.transition(task, action: "complete")
        try #require(model.message?.contains("OLD complete failed") == true)
        await model.transition(task, action: "complete")
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func transitionReadBackKeepsANewerFollowUpError() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await gate.next("tasks.transition", .fail(503, "OLD complete failed"))
        await model.transition(task, action: "complete")
        await gate.next("tasks.list", .hold)
        let complete = Task { await model.transition(task, action: "complete") }
        try await wait("read-back held") { await gate.isHeld("tasks.list") }
        let newer = await newerFollowUpError(model, gate)
        await gate.release("tasks.list"); await complete.value
        #expect(model.message == newer)
        await finish(model, gate, vault)
    }

    // MARK: delete

    private func deleteConflict(_ model: TodoModel, _ gate: ScriptGate, _ task: TaskSnapshot, _ vault: SessionVault) async throws {
        await model.openDependencyDelete(task)
        try await wait("delete preview") { model.dependencies.deletion?.acceptedFromVersion != nil }
        try await edit(task, credential: try #require(try vault.load()))
        await model.deleteTask(task)
        try #require(model.message == "The task changed before it could be deleted.", "delete conflict published")
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func deleteSuccessClearsItsEarlierConflict() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        try await deleteConflict(model, gate, task, vault)
        let credential = try #require(try vault.load())
        let current = try TaskSnapshot.decode(try await todoClient(server: url, credential: credential).tasks_period_show(path: .init(profile: "work", task: task.id)).ok.body.json)
        await model.openDependencyDelete(current)
        try await wait("fresh preview") { model.dependencies.deletion?.acceptedFromVersion == current.row_version }
        await model.deleteTask(current)
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func deleteReadBackKeepsANewerFollowUpError() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await model.openDependencyDelete(task)
        try await wait("delete preview") { model.dependencies.deletion?.acceptedFromVersion != nil }
        await gate.next("tasks.list", .hold)
        let delete = Task { await model.deleteTask(task) }
        try await wait("read-back held") { await gate.isHeld("tasks.list") }
        let newer = await newerFollowUpError(model, gate)
        await gate.release("tasks.list"); await delete.value
        #expect(model.message == newer)
        await finish(model, gate, vault)
    }

    // MARK: Dependency follow-up

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func followUpSuccessClearsItsEarlierError() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        _ = await newerFollowUpError(model, gate)
        try #require(model.message?.contains("NEWER follow-up failed") == true)
        await model.createDependencyFollowUp(task.id)
        #expect(model.quickAdd && model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func followUpSuccessKeepsANewerTransitionError() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        _ = await newerFollowUpError(model, gate)
        await gate.next("tasks.show", .hold)
        let followUp = Task { await model.createDependencyFollowUp(task.id) }
        try await wait("show held") { await gate.isHeld("tasks.show") }
        await gate.next("tasks.transition", .fail(503, "NEWER complete failed"))
        await model.transition(task, action: "complete")
        let newer = try #require(model.message)
        await gate.release("tasks.show"); await followUp.value
        #expect(model.message == newer)
        await finish(model, gate, vault)
    }

    // MARK: Discovery Show

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func showSuccessClearsItsEarlierError() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        var match = try await lookup(model, task)
        await gate.next("tasks.show", .fail(404, "OLD show failed"))
        _ = await model.showDiscoveryMatch(match)
        try #require(model.message?.contains("OLD show failed") == true)
        match = try await lookup(model, task)
        #expect(await model.showDiscoveryMatch(match))
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func showSuccessKeepsANewerFollowUpError() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let match = try await lookup(model, task)
        await gate.next("tasks.show", .hold)
        let show = Task { await model.showDiscoveryMatch(match) }
        try await wait("show held") { await gate.isHeld("tasks.show") }
        let newer = await newerFollowUpError(model, gate)
        await gate.release("tasks.show")
        #expect(await show.value)
        #expect(model.message == newer)
        await finish(model, gate, vault)
    }
}
