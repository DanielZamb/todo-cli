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

private enum Step: Sendable { case pass, hold, fail(Int, String), holdThenFail(Int, String) }

private actor ScriptGate: ClientTransport {
    let session: URLSession
    let base: URLSessionTransport
    var script: [String: [Step]] = [:]
    var held: [String: CheckedContinuation<Void, Never>] = [:]
    var streams: [AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation] = []
    var failingStreams = 0
    var counts: [String: Int] = [:]
    func count(_ operation: String) -> Int { counts[operation, default: 0] }
    init() { let s = URLSession(configuration: .ephemeral); session = s; base = URLSessionTransport(configuration: .init(session: s)) }
    func next(_ operation: String, _ steps: Step...) { script[operation, default: []] += steps }
    func isHeld(_ operation: String) -> Bool { held[operation] != nil }
    func release(_ operation: String) { held.removeValue(forKey: operation)?.resume() }
    func ready() { streams.last?.yield(Array("event: ready\ndata: {}\n\n".utf8)[...]) }
    func reload(seq: Int) { streams.last?.yield(Array("event: reload\ndata: {\"generation\":\"scratch-reload-\(seq)\",\"seq\":\(seq)}\n\n".utf8)[...]) }
    func endStream() { streams.last?.finish() }
    func failNextStream() { failingStreams += 1 }
    var streamCount: Int { streams.count }
    var stopped = false
    // The session is not invalidated: a request already past the stopped check could otherwise create a task on it.
    func stop() { stopped = true; for key in held.keys { release(key) }; streams.forEach { $0.finish() } }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        counts[operationID, default: 0] += 1
        var step = Step.pass
        if var queue = script[operationID], !queue.isEmpty { step = queue.removeFirst(); script[operationID] = queue }
        switch step {
        case .pass: break
        case .hold: await withCheckedContinuation { held[operationID] = $0 }
        case .fail(let status, let message): throw RequestFailure(status: status, message: message, code: status == 401 ? "unauthorized" : "unavailable")
        case .holdThenFail(let status, let message):
            await withCheckedContinuation { held[operationID] = $0 }
            throw RequestFailure(status: status, message: message, code: "unavailable")
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
    // MARK: surfaces (rule 7) and scope changes (rule 4)

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func closingThePickerEndsItsFollowUpError() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        model.dependencies.picker = .init(profile: "work", root: task, direction: .dependsOn)
        _ = await newerFollowUpError(model, gate)
        try #require(model.message?.contains("NEWER follow-up failed") == true)
        model.closeDependencyPicker()
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func closingImportEndsItsFollowUpError() async throws {
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        model.showingImport = true
        _ = await newerFollowUpError(model, gate)
        try #require(model.message?.contains("NEWER follow-up failed") == true)
        model.showingImport = false
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func closingTheDeleteDialogEndsItsConflict() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        try await deleteConflict(model, gate, task, vault)
        model.closeDependencyDelete()
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func showErrorIsHandedToTheMainWindow() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let match = try await lookup(model, task)
        await gate.next("tasks.show", .fail(404, "OLD show failed"))
        _ = await model.showDiscoveryMatch(match)
        #expect(model.discovery.dialog == nil)
        #expect(model.message?.contains("OLD show failed") == true)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func profileChangeEndsAMainWindowMessage() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await gate.next("tasks.transition", .fail(503, "OLD complete failed"))
        await model.transition(task, action: "complete")
        try #require(model.message != nil)
        model.changeProfile("personal")
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func credentialReplacementEndsAMainWindowMessage() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await gate.next("tasks.transition", .fail(503, "OLD complete failed"))
        await model.transition(task, action: "complete")
        try #require(model.message != nil)
        model.replaceCredential(try await owner())
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func snapshotReloadEndsAMainWindowMessage() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await gate.next("tasks.transition", .fail(503, "OLD complete failed"))
        await model.transition(task, action: "complete")
        try #require(model.message != nil)
        let reloads = model.restoreReloadCount
        await gate.reload(seq: Int(model.lastSequence ?? "0") ?? 0)
        try await wait("reload") { model.restoreReloadCount > reloads }
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func profileDeletedElsewhereEndsAMainWindowMessage() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let before = await gate.streamCount
        model.changeProfile("doomed")
        try await ready(model, gate, streams: before + 1)
        try #require(model.profile == "doomed")
        await gate.next("tasks.transition", .fail(503, "OLD complete failed"))
        await model.transition(task, action: "complete")
        try #require(model.message != nil)
        let credential = try #require(try vault.load())
        _ = try await todoClient(server: url, credential: credential).reads_period_deleteProfile(path: .init(profile: "doomed"), body: .json(.init(with_tasks: true, dry_run: false)))
        await gate.next("changes.stream", .fail(404, "Profile not found"))
        await gate.endStream()
        try await wait("left deleted Profile") { model.profile != "doomed" }
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }
    // MARK: surface instances (rule 7, MAC-C1-S1-11)

    /// Mode 3: a current-credential 401 after close ends the Session. Mode 4: a failed read-back
    /// after close raises no message and hands over to connection recovery (a new stream request).
    private func closedOutcome(_ mode: Int, _ model: TodoModel, _ gate: ScriptGate, _ vault: SessionVault, streams: Int, _ label: String) async throws -> Bool {
        if mode == 3 {
            try await wait("expired") { !model.signedIn }
            let stored = try vault.load()
            #expect(!model.signedIn && stored == nil, "\(label): a closed surface's 401 still ends the Session")
            return true
        }
        if mode == 4 {
            #expect(model.message == nil, "\(label): no message from a closed surface's read-back: \(model.message ?? "")")
            try await wait("recovery stream") { await gate.streamCount > streams }
            return true
        }
        return false
    }
    private func closedStep(_ mode: Int, fail label: String) -> Step { mode == 1 ? .holdThenFail(503, label) : mode == 3 ? .holdThenFail(401, "expired") : .hold }

    private func pickerFor(_ model: TodoModel, _ task: TaskSnapshot) { model.dependencies.picker = .init(profile: "work", root: task, direction: .dependsOn) }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [false, true])
    func pickerFollowUpAfterCloseDoesNothing(fails: Bool) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        pickerFor(model, task)
        await gate.next("tasks.show", fails ? .holdThenFail(503, "OLD closed-picker follow-up failed") : .hold)
        let followUp = Task { await model.createDependencyFollowUp(task.id) }
        try await wait("show held") { await gate.isHeld("tasks.show") }
        model.closeDependencyPicker()
        await gate.release("tasks.show"); await followUp.value
        #expect(model.dependencies.picker == nil && !model.quickAdd && model.message == nil, "fails=\(fails)")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func olderPickerSuccessLeavesTheNewerPickerAndItsError() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        pickerFor(model, task)
        await gate.next("tasks.show", .hold)
        let older = Task { await model.createDependencyFollowUp(task.id) }
        try await wait("show held") { await gate.isHeld("tasks.show") }
        model.closeDependencyPicker()
        pickerFor(model, task)
        let newer = model.dependencies.picker?.id
        await gate.next("tasks.show", .fail(404, "NEWER picker B follow-up failed"))
        await model.createDependencyFollowUp(UUID().uuidString)
        let error = try #require(model.message)
        await gate.release("tasks.show"); await older.value
        #expect(model.dependencies.picker?.id == newer && !model.quickAdd && model.message == error)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func olderPickerFailureLeavesTheNewerPicker() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        pickerFor(model, task)
        await gate.next("tasks.show", .hold)
        let older = Task { await model.createDependencyFollowUp(UUID().uuidString) }
        try await wait("show held") { await gate.isHeld("tasks.show") }
        model.closeDependencyPicker()
        pickerFor(model, task)
        let newer = model.dependencies.picker?.id
        await gate.release("tasks.show"); await older.value
        #expect(model.dependencies.picker?.id == newer && model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [false, true])
    func importFollowUpAfterCloseOrReopenDoesNothing(reopen: Bool) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        model.showingImport = true
        await gate.next("tasks.show", .hold)
        let success = Task { await model.createDependencyFollowUp(task.id) }
        try await wait("show held") { await gate.isHeld("tasks.show") }
        model.showingImport = false
        if reopen { model.resetImport(); model.showingImport = true }
        await gate.release("tasks.show"); await success.value
        #expect(!model.quickAdd && model.message == nil && model.showingImport == reopen, "success reopen=\(reopen)")
        if !model.showingImport { model.resetImport(); model.showingImport = true }
        await gate.next("tasks.show", .hold)
        let failure = Task { await model.createDependencyFollowUp(UUID().uuidString) }
        try await wait("show held again") { await gate.isHeld("tasks.show") }
        model.showingImport = false
        if reopen { model.resetImport(); model.showingImport = true }
        await gate.release("tasks.show"); await failure.value
        #expect(model.message == nil && model.showingImport == reopen, "failure reopen=\(reopen)")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [false, true])
    func deleteAfterCloseStillReachesTheListAndShowsNothing(reopen: Bool) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await model.openDependencyDelete(task)
        try await wait("delete preview") { model.dependencies.deletion?.acceptedFromVersion != nil }
        await gate.next("tasks.delete", .hold)
        let delete = Task { await model.deleteTask(task) }
        try await wait("delete held") { await gate.isHeld("tasks.delete") }
        model.closeDependencyDelete()
        var other: UUID?
        if reopen, let second = model.tasks.first(where: { $0.id != task.id }) {
            await model.openDependencyDelete(second); other = model.dependencies.deletion?.id
        }
        let reads = await gate.count("tasks.list")
        await gate.release("tasks.delete"); await delete.value
        #expect(await gate.count("tasks.list") > reads, "the committed delete's read-back ran")
        #expect(!model.tasks.contains { $0.id == task.id })
        #expect(model.message == nil)
        #expect(model.dependencies.deletion?.id == other, "a newer confirmation stays open")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func deleteConflictAfterCloseShowsNothing() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await model.openDependencyDelete(task)
        try await wait("delete preview") { model.dependencies.deletion?.acceptedFromVersion != nil }
        try await edit(task, credential: try #require(try vault.load()))
        await gate.next("tasks.delete", .hold)
        let delete = Task { await model.deleteTask(task) }
        try await wait("delete held") { await gate.isHeld("tasks.delete") }
        model.closeDependencyDelete()
        await gate.release("tasks.delete"); await delete.value
        #expect(model.message == nil && model.dependencies.deletion == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [0, 1, 2, 3, 4])
    func batchEditAfterCloseStillReachesTheListAndShowsNothing(mode: Int) async throws {
        // mode 0: late success after close; 1: late failure after close; 2: late success after reopen.
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        model.batchEdit = .init(profile: "work")
        await model.reloadBatchEditTargets()
        model.batchEdit?.selected = [task.id]; model.batchEdit?.field = .priority; model.batchEdit?.value = task.priority == "P1" ? "P2" : "P1"
        let wanted = model.batchEdit!.value
        await model.applyBatchEdit(dryRun: true)
        try #require(model.batchEdit?.report?.dry_run == true)
        await gate.next("tasks.batchEdit", closedStep(mode, fail: "OLD closed-sheet batch failed"))
        let apply = Task { await model.applyBatchEdit(dryRun: false) }
        try await wait("batch held") { await gate.isHeld("tasks.batchEdit") }
        model.batchEdit = nil
        if mode == 2 { model.batchEdit = .init(profile: "work") }
        let newer = model.batchEdit?.id
        let reads = await gate.count("tasks.list"), streams = await gate.streamCount
        if mode == 4 { await gate.next("tasks.list", .fail(503, "catalog read failed")) }
        await gate.release("tasks.batchEdit"); await apply.value
        if try await closedOutcome(mode, model, gate, vault, streams: streams, "batch edit") { await finish(model, gate, vault); return }
        #expect(model.batchEdit?.id == newer && model.batchEdit?.report == nil && model.batchEdit?.error == nil, "mode \(mode)")
        #expect(model.message == nil, "mode \(mode)")
        if mode != 1 {
            #expect(await gate.count("tasks.list") > reads, "mode \(mode): the committed apply's read-back ran")
            #expect(model.tasks.first { $0.id == task.id }?.priority == wanted, "mode \(mode): the list shows it")
        }
        await finish(model, gate, vault)
    }
    // MARK: committed writes from a closed surface (Attachment batch, Dependency batch, editor Attachment)

    /// A second open Task in the catalog, created on the server.
    private func secondTask(_ model: TodoModel, _ gate: ScriptGate, _ vault: SessionVault) async throws -> TaskSnapshot {
        let title = "Message kind second " + UUID().uuidString
        _ = try await todoClient(server: url, credential: try #require(try vault.load())).tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: title)))
        await model.refreshAfterWrite("Second Task")
        try await wait("second task") { model.tasks.contains { $0.title == title } }
        return model.tasks.first { $0.title == title }!
    }
    private func hasLink(_ task: TaskSnapshot?, _ link: String) -> Bool {
        (task?.attachments ?? []).contains { if case .link(let url) = $0.location { return url.absoluteString == link }; return false }
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [0, 1, 2, 3, 4])
    func attachmentBatchAfterCloseReachesListAndEditorAndShowsNothing(mode: Int) async throws {
        // mode 0: late success after close; 1: late failure after close; 2: late success after reopen.
        let gate = ScriptGate(); let (model, vault, source) = try await live(gate)
        let target = try await secondTask(model, gate, vault)
        let link = "https://example.test/batch-" + UUID().uuidString
        model.beginEditing(source)
        await model.attachLink(link)
        try await wait("source link") { hasLink(model.tasks.first { $0.id == source.id }, link) }
        let reference = try #require(model.tasks.first { $0.id == source.id }?.attachments?.first { if case .link(let url) = $0.location { return url.absoluteString == link }; return false })
        model.editor = nil
        model.attachmentBatch = .init(profile: "work", reference: reference)
        await model.reloadAttachmentTargets()
        model.attachmentBatch?.selected = [target.id]
        await model.applyAttachmentBatch(dryRun: true)
        try #require(model.attachmentBatch?.report != nil)
        model.beginEditing(model.tasks.first { $0.id == target.id }!)
        await gate.next("tasks.attachMany", closedStep(mode, fail: "OLD closed-sheet attach failed"))
        let apply = Task { await model.applyAttachmentBatch(dryRun: false) }
        try await wait("attach held") { await gate.isHeld("tasks.attachMany") }
        model.attachmentBatch = nil
        if mode == 2 { model.attachmentBatch = .init(profile: "work", reference: reference) }
        let newer = model.attachmentBatch?.id
        let reads = await gate.count("tasks.list"), streams = await gate.streamCount
        if mode == 4 { await gate.next("tasks.list", .fail(503, "catalog read failed")) }
        await gate.release("tasks.attachMany"); await apply.value
        if try await closedOutcome(mode, model, gate, vault, streams: streams, "attachment batch") { await finish(model, gate, vault); return }
        #expect(model.attachmentBatch?.id == newer && model.attachmentBatch?.report == nil && model.attachmentBatch?.error == nil, "mode \(mode)")
        #expect(model.message == nil && model.editorError == nil, "mode \(mode)")
        if mode != 1 {
            #expect(await gate.count("tasks.list") > reads, "mode \(mode): the committed apply's read-back ran")
            #expect(hasLink(model.tasks.first { $0.id == target.id }, link), "mode \(mode): the list shows it")
            #expect(hasLink(model.editor?.base, link), "mode \(mode): the open editor shows it")
        }
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [0, 1, 2, 3, 4])
    func dependencyBatchAfterCloseReachesListAndShowsNothing(mode: Int) async throws {
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let target = try await secondTask(model, gate, vault)
        let rootNow = model.tasks.first { $0.id == root.id }!
        model.dependencies.batch = .init(profile: "work", root: rootNow, direction: .dependsOn)
        await model.reloadDependencyBatch()
        model.dependencies.batch?.selected = [target.id]
        await model.previewDependencyBatch()
        try #require(model.dependencies.batch?.report?.dry_run == true)
        await gate.next("tasks.batchDepend", closedStep(mode, fail: "OLD closed-dialog batch failed"))
        let apply = Task { await model.applyDependencyBatch() }
        try await wait("batch held") { await gate.isHeld("tasks.batchDepend") }
        model.dependencies.batch = nil
        if mode == 2 { model.dependencies.batch = .init(profile: "work", root: rootNow, direction: .dependsOn) }
        let newer = model.dependencies.batch?.id
        let reads = await gate.count("tasks.list"), streams = await gate.streamCount
        if mode == 4 { await gate.next("tasks.list", .fail(503, "catalog read failed")) }
        await gate.release("tasks.batchDepend"); await apply.value
        if try await closedOutcome(mode, model, gate, vault, streams: streams, "dependency batch") { await finish(model, gate, vault); return }
        #expect(model.dependencies.batch?.id == newer && model.dependencies.batch?.report == nil && model.dependencies.batch?.failure == nil, "mode \(mode)")
        #expect(model.message == nil, "mode \(mode)")
        if mode != 1 {
            #expect(await gate.count("tasks.list") > reads, "mode \(mode): the committed apply's read-back ran")
            #expect(model.tasks.first { $0.id == root.id }?.depends_on?.contains(target.id) == true, "mode \(mode): the list shows it")
        }
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [0, 1, 2, 3, 4, 5])
    func editorAttachmentAfterCloseReachesListAndShowsNothing(mode: Int) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let other = try await secondTask(model, gate, vault)
        let link = "https://example.test/editor-" + UUID().uuidString
        model.beginEditing(model.tasks.first { $0.id == task.id }!)
        // Mode 5: the editor closes and reopens on the same Task, and the old attach fails late.
        await gate.next("tasks.attach", mode == 5 ? .holdThenFail(503, "OLD same-Task editor attach failed") : closedStep(mode, fail: "OLD closed-editor attach failed"))
        let attach = Task { await model.attachLink(link) }
        try await wait("attach held") { await gate.isHeld("tasks.attach") }
        model.editor = nil
        if mode == 2 { model.beginEditing(model.tasks.first { $0.id == other.id }!) }
        if mode == 5 { model.beginEditing(model.tasks.first { $0.id == task.id }!) }
        let newer = model.editor?.id
        let reads = await gate.count("tasks.list"), streams = await gate.streamCount
        if mode == 4 { await gate.next("tasks.list", .fail(503, "catalog read failed")) }
        await gate.release("tasks.attach"); await attach.value
        if try await closedOutcome(mode, model, gate, vault, streams: streams, "editor attachment") { await finish(model, gate, vault); return }
        if mode == 5 {
            #expect(model.editor?.id == task.id && model.editorError == nil, "the reopened editor on the same Task keeps no error from the old opening")
            await finish(model, gate, vault); return
        }
        #expect(model.editor?.id == newer && model.editorError == nil && model.message == nil, "mode \(mode)")
        if mode == 2 { #expect(!hasLink(model.editor?.base, link), "the newer editor is untouched") }
        if mode != 1 {
            #expect(await gate.count("tasks.list") > reads, "mode \(mode): the accepted change's read-back ran")
            #expect(hasLink(model.tasks.first { $0.id == task.id }, link), "mode \(mode): the list shows it")
        }
        await finish(model, gate, vault)
    }
    // MARK: quick-add, Delete and the picker toggle (instances, 401 and failed read-back after close)

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [0, 1, 3, 4])
    func quickAddCompletionsBelongToTheirOpening(mode: Int) async throws {
        // 0: late success after close-then-reopen; 1: late failure after close-then-reopen;
        // 3: 401 after close; 4: failed read-back after close.
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        let title = "Old quick add " + UUID().uuidString
        model.quickAdd = true; model.newTitle = title
        await gate.next("tasks.create", closedStep(mode, fail: "OLD quick add failed"))
        let create = Task { await model.create(openEditor: true) }
        try await wait("create held") { await gate.isHeld("tasks.create") }
        model.quickAdd = false
        let reopen = mode == 0 || mode == 1
        if reopen { model.quickAdd = true; model.newTitle = "Newer draft" }
        let reads = await gate.count("tasks.list"), streams = await gate.streamCount
        if mode == 4 { await gate.next("tasks.list", .fail(503, "catalog read failed")) }
        await gate.release("tasks.create"); _ = await create.value
        if try await closedOutcome(mode, model, gate, vault, streams: streams, "quick add") { await finish(model, gate, vault); return }
        #expect(model.quickAdd && model.newTitle == "Newer draft" && model.quickAddError == nil, "mode \(mode): the newer draft is untouched")
        if mode == 1 {
            // Ruling 2: a failure after its quick-add closed hands one named message to the main window.
            #expect(model.message?.hasPrefix("Couldn't add “\(title)”.") == true && String(describing: model.messageKind) == "Optional(TodoState.TodoModel.MessageKind.quickAdd)", "the failure names what failed: \(model.message ?? "nil")")
            #expect(model.editor == nil, "nothing opens")
        } else {
            #expect(model.editor == nil && model.message == nil, "mode \(mode): nothing opens and nothing is announced")
        }
        if mode == 0 {
            #expect(await gate.count("tasks.list") > reads, "the created Task's read-back ran")
            #expect(model.tasks.contains { $0.title == title }, "the list shows the created Task")
        }
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [3, 4])
    func deleteAfterCloseUnauthorizedOrFailedReadBack(mode: Int) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await model.openDependencyDelete(task)
        try await wait("delete preview") { model.dependencies.deletion?.acceptedFromVersion != nil }
        await gate.next("tasks.delete", closedStep(mode, fail: "unused"))
        let delete = Task { await model.deleteTask(task) }
        try await wait("delete held") { await gate.isHeld("tasks.delete") }
        model.closeDependencyDelete()
        let streams = await gate.streamCount
        if mode == 4 { await gate.next("tasks.list", .fail(503, "catalog read failed")) }
        await gate.release("tasks.delete"); await delete.value
        _ = try await closedOutcome(mode, model, gate, vault, streams: streams, "delete")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [0, 1, 3, 4])
    func pickerToggleAfterCloseReachesListAndShowsNothing(mode: Int) async throws {
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let candidate = try await secondTask(model, gate, vault)
        await model.openDependencyPicker(model.tasks.first { $0.id == root.id }!)
        try await wait("picker loaded") { model.dependencies.picker?.loading == false && model.dependencies.picker?.candidates.contains { $0.id == candidate.id } == true }
        await gate.next("tasks.depend", closedStep(mode, fail: "OLD closed-picker link failed"))
        let toggle = Task { await model.toggleDependency(model.dependencies.picker!.candidates.first { $0.id == candidate.id }!) }
        try await wait("depend held") { await gate.isHeld("tasks.depend") }
        model.closeDependencyPicker()
        let reads = await gate.count("tasks.list"), streams = await gate.streamCount
        if mode == 4 { await gate.next("tasks.list", .fail(503, "catalog read failed")) }
        await gate.release("tasks.depend"); await toggle.value
        if try await closedOutcome(mode, model, gate, vault, streams: streams, "picker toggle") { await finish(model, gate, vault); return }
        if mode == 1 {
            // Ruling 2: the picker could be closed while its link was pending; its failure is handed to the main window, named.
            #expect(model.dependencies.picker == nil, "mode 1")
            #expect(model.message?.hasPrefix("Couldn't add the Dependency on “\(candidate.title)”.") == true && String(describing: model.messageKind) == "Optional(TodoState.TodoModel.MessageKind.dependencyLink)", "the failure names what failed: \(model.message ?? "nil")")
        } else {
            #expect(model.dependencies.picker == nil && model.message == nil, "mode \(mode)")
        }
        if mode == 0 {
            #expect(await gate.count("tasks.list") > reads, "the committed edge's read-back ran")
            #expect(model.tasks.first { $0.id == root.id }?.depends_on?.contains(candidate.id) == true, "the list shows it")
        }
        await finish(model, gate, vault)
    }

    // MARK: completion order after each await (MAC-C1-S1-14 and the seat's P2 observations)

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [false, true])
    func batchEditClosedDuringItsReadBackShowsNothing(reopen: Bool) async throws {
        // The sheet closes, or closes and reopens, while the committed apply's catalog read-back is
        // still waiting; the read then fails. The instance is checked after that await, not before.
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        model.batchEdit = .init(profile: "work")
        await model.reloadBatchEditTargets()
        model.batchEdit?.selected = [task.id]; model.batchEdit?.field = .priority; model.batchEdit?.value = task.priority == "P1" ? "P2" : "P1"
        await gate.next("tasks.list", .holdThenFail(503, "catalog read failed"))
        let apply = Task { await model.applyBatchEdit(dryRun: false) }
        try await wait("read-back held") { await gate.isHeld("tasks.list") }
        model.batchEdit = nil
        if reopen { model.batchEdit = .init(profile: "work") }
        let newer = model.batchEdit?.id
        await gate.release("tasks.list"); await apply.value
        #expect(model.message == nil, "reopen \(reopen): no banner from a sheet closed during its read-back: \(model.message ?? "")")
        #expect(model.batchEdit?.id == newer && model.batchEdit?.report == nil && model.batchEdit?.error == nil, "reopen \(reopen): the newer sheet is untouched")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func pickerClosedDuringItsReloadStillReadsBackTheCommittedEdge() async throws {
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let candidate = try await secondTask(model, gate, vault)
        await model.openDependencyPicker(model.tasks.first { $0.id == root.id }!)
        try await wait("picker loaded") { model.dependencies.picker?.loading == false && model.dependencies.picker?.candidates.contains { $0.id == candidate.id } == true }
        await gate.next("tasks.show", .hold)
        let toggle = Task { await model.toggleDependency(model.dependencies.picker!.candidates.first { $0.id == candidate.id }!) }
        try await wait("picker reload held") { await gate.isHeld("tasks.show") }
        model.closeDependencyPicker()
        let reads = await gate.count("tasks.list")
        await gate.release("tasks.show"); await toggle.value
        #expect(await gate.count("tasks.list") > reads, "the committed edge's catalog read-back ran after the close")
        #expect(model.tasks.first { $0.id == root.id }?.depends_on?.contains(candidate.id) == true, "the list shows the committed edge")
        #expect(model.dependencies.picker == nil && model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func attachmentBatchReadsBackEvenWhenItsEditorReadFails() async throws {
        let gate = ScriptGate(); let (model, vault, source) = try await live(gate)
        let target = try await secondTask(model, gate, vault)
        let link = "https://example.test/batch-editor-" + UUID().uuidString
        model.beginEditing(source)
        await model.attachLink(link)
        try await wait("source link") { hasLink(model.tasks.first { $0.id == source.id }, link) }
        let reference = try #require(model.tasks.first { $0.id == source.id }?.attachments?.first { if case .link(let url) = $0.location { return url.absoluteString == link }; return false })
        model.editor = nil
        model.attachmentBatch = .init(profile: "work", reference: reference)
        await model.reloadAttachmentTargets()
        model.attachmentBatch?.selected = [target.id]
        model.beginEditing(model.tasks.first { $0.id == target.id }!)
        let reads = await gate.count("tasks.list")
        await gate.next("tasks.show", .fail(503, "editor read failed"))
        await model.applyAttachmentBatch(dryRun: false)
        #expect(await gate.count("tasks.list") > reads, "the committed Attachment's catalog read-back ran despite the failed editor read")
        #expect(hasLink(model.tasks.first { $0.id == target.id }, link), "the list shows the committed Attachment")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aBufferedCurrent401AfterCancellationStillEndsTheSession() async throws {
        // A reply already on its way when the task was cancelled still says the current credential
        // is refused; the Session ends whatever the task's cancellation.
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        model.batchEdit = .init(profile: "work")
        await gate.next("tasks.list", .holdThenFail(401, "expired"))
        let reload = Task { await model.reloadBatchEditTargets() }
        try await wait("reload held") { await gate.isHeld("tasks.list") }
        reload.cancel()
        await gate.release("tasks.list"); await reload.value
        try await wait("expired") { !model.signedIn }
        let stored = try vault.load()
        #expect(!model.signedIn && stored == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: ["save", "save-failure", "move-failure"])
    func anEditorWriteCannotPresentIntoANewerOpening(_ kind: String) async throws {
        // The editor that started the write is closed and the same Task reopened while the write
        // waits. Its completion may reach the list, but it must not close, fail or announce into
        // the newer opening.
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        model.beginEditing(task)
        let operation = kind == "move-failure" ? "tasks.move" : "tasks.edit"
        await gate.next(operation, kind == "save-failure" ? .holdThenFail(503, "OLD save failed") : .hold)
        let write = Task {
            if kind == "move-failure" { await model.write(.move("no-such-profile-\(UUID().uuidString.prefix(6))")) }
            else { model.editor?.title = task.title + " saved"; _ = await model.save() }
        }
        try await wait("write held") { await gate.isHeld(operation) }
        model.editor = nil
        model.beginEditing(model.tasks.first { $0.id == task.id }!)
        let newer = try #require(model.editor?.opening)
        await gate.release(operation); await write.value
        #expect(model.editor?.opening == newer, "\(kind): the newer opening stays open")
        #expect(model.editorError == nil && model.transferResult == nil && model.conflict == nil, "\(kind): nothing is presented into the newer opening: \(model.editorError ?? "")")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aQuickAddClosedDuringItsCreateDoesNotReportItsCompletionToTheView() async throws {
        // The view dismisses itself or opens the Tasks window when create returns true; an instance
        // closed during the create must not drive the view.
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        model.quickAdd = true; model.newTitle = "Closed quick add " + UUID().uuidString
        await gate.next("tasks.create", .hold)
        let create = Task { await model.create(openEditor: true) }
        try await wait("create held") { await gate.isHeld("tasks.create") }
        model.quickAdd = false; model.quickAdd = true; model.newTitle = "Newer draft"
        await gate.release("tasks.create")
        #expect(await create.value == false, "a closed instance's completion is not reported as presented")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aQuickAddSuccessTheViewHidesShowsTheCapsule() async throws {
        // Ruling 2: a created Task the current view filters out (no date, in Today) is confirmed
        // in the bottom capsule; one the view shows needs no confirmation.
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        model.selectView("today")
        try await wait("today loaded") { !model.loading && model.connection == .live }
        model.quickAdd = true; model.newTitle = "Undated quick add " + UUID().uuidString
        #expect(await model.create(openEditor: false))
        #expect(model.deletionNotice == "Task added", "hidden by Today: \(model.deletionNotice ?? "nil")")
        model.deletionNotice = nil
        model.selectView("all")
        try await wait("all loaded") { !model.loading && model.connection == .live }
        model.quickAdd = true; model.newTitle = "Visible quick add " + UUID().uuidString
        #expect(await model.create(openEditor: false))
        #expect(model.deletionNotice == nil, "shown in All tasks: no capsule")
        await finish(model, gate, vault)
    }
}
