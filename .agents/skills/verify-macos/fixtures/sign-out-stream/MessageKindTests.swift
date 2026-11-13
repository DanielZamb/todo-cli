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

/// `corrupt`: the request reaches the server (a write commits), then the client gets a 200 whose
/// body it cannot read (S1-19). `holdAs`: held under "operation#label", so two requests of one
/// operation can be pending at once and released in either order.
private enum Step: Sendable { case pass, hold, holdAs(String), fail(Int, String), holdThenFail(Int, String), drop, corrupt }

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
        case .holdAs(let label): await withCheckedContinuation { held[operationID + "#" + label] = $0 }
        case .fail(let status, let message): throw RequestFailure(status: status, message: message, code: status == 401 ? "unauthorized" : "unavailable")
        case .drop: throw URLError(.networkConnectionLost)
        case .corrupt:
            if stopped { throw CancellationError() }
            let (response, _) = try await base.send(request, body: body, baseURL: baseURL, operationID: operationID)
            return (response, HTTPBody("{\"unreadable\":true}"))
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
    func aPickerFollowUpFailureShowsInThePicker() async throws {
        // Ruling 3: the failure shows where the person is looking, inside the picker, not in the
        // main window's banner under the sheet; closing the picker ends it with the picker.
        // Candidate 8 ruling 1: the notice that offered "Create follow-up" stays, with its button,
        // and the failure shows with it, saying what failed and that the person can try again.
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        model.dependencies.picker = .init(profile: "work", root: task, direction: .dependsOn)
        model.dependencies.picker?.failure = DependencyNotice(message: "ORIGINAL This Task blocks done Tasks.", followUp: task.id)
        _ = await newerFollowUpError(model, gate)
        let notice = String(describing: model.dependencies.picker?.failure)
        #expect(model.dependencies.picker?.failure?.message == "ORIGINAL This Task blocks done Tasks." && model.dependencies.picker?.failure?.followUp == task.id, "the original notice and its follow-up stay: \(notice)")
        // Read the field itself: a debug description escapes the apostrophe in "Couldn't".
        #expect(model.dependencies.picker?.failure?.followUpFailure == "Couldn't prepare the follow-up Task: NEWER follow-up failed Try again.", "the failure is shown with it: \(notice)")
        #expect(model.message == nil, "not under the sheet: \(model.message ?? "")")
        model.closeDependencyPicker()
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func anImportFollowUpFailureShowsInTheImportReport() async throws {
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        model.showingImport = true
        _ = await newerFollowUpError(model, gate)
        #expect(model.importFollowUpError?.contains("NEWER follow-up failed") == true, "in the Import report: \(model.importFollowUpError ?? "nil")")
        #expect(model.importFollowUpError?.hasPrefix("Couldn't prepare the follow-up Task") == true && model.importFollowUpError?.contains("Try again") == true, "says what failed and that it can be tried again: \(model.importFollowUpError ?? "nil")")
        #expect(model.message == nil, "not under the sheet: \(model.message ?? "")")
        model.showingImport = false
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [false, true])
    func aFailedSignOutSaysThatTheSignOutFailed(unreachable: Bool) async throws {
        // Ruling 3: the text says what failed, and a sign-out has no draft to preserve.
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        let streams = await gate.streamCount
        await gate.next("credentials.signOut", unreachable ? .drop : .fail(503, "The server rejected this request (HTTP 503)."))
        await model.signOut()
        #expect(model.message?.hasPrefix("Couldn't sign out. ") == true, "\(model.message ?? "nil")")
        #expect(model.message?.contains("draft") == false, "\(model.message ?? "nil")")
        try await ready(model, gate, streams: streams + 1)
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
        // Ruling 3: the newer picker's follow-up failure shows in that picker.
        let error = try #require(model.dependencies.picker?.failure?.message)
        await gate.release("tasks.show"); await older.value
        #expect(model.dependencies.picker?.id == newer && !model.quickAdd && model.dependencies.picker?.failure?.message == error && model.message == nil)
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
            // Candidate 8 ruling 2: both Tasks, dependent first; no pointer to the closed picker.
            let rootTitle = model.tasks.first { $0.id == root.id }?.title ?? root.title
            #expect(model.message?.hasPrefix("Couldn't make “\(rootTitle)” depend on “\(candidate.title)”.") == true && String(describing: model.messageKind) == "Optional(TodoState.TodoModel.MessageKind.dependencyLink)", "the failure names what failed: \(model.message ?? "nil")")
            #expect(model.message?.contains("Choose another Task") == false)
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

    // MARK: what ends a follow-up failure in its surface (counterparts of the seat's
    // SeatSurfaceLifetimeTests.swift:85 and SeatMessageScopeObservationTests.swift:42, ruling 3)

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),
          arguments: ["picker", "import"], ["close", "profile-change", "credential-change", "unrelated-write", "ready", "same-follow-up-succeeds"])
    func whatEndsAFollowUpFailureShownInItsSurface(_ surface: String, _ event: String) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let target = try await secondTask(model, gate, vault)
        if surface == "picker" { pickerFor(model, task) } else { model.showingImport = true }
        let picker = model.dependencies.picker?.id
        func shown() -> String? { surface == "picker" ? model.dependencies.picker?.failure?.message : model.importFollowUpError }
        await gate.next("tasks.show", .fail(404, "SURFACE follow-up failed"))
        await model.createDependencyFollowUp(UUID().uuidString)
        let failure = try #require(shown(), "\(surface): the failure shows in its surface")
        #expect(failure.contains("SURFACE follow-up failed") && model.message == nil)
        switch event {
        case "close":
            if surface == "picker" { model.closeDependencyPicker() } else { model.showingImport = false }
            #expect(shown() == nil, "\(surface): closing the surface ends it")
        case "profile-change":
            model.changeProfile("personal")
            #expect(shown() == nil && model.dependencies.picker == nil && !model.showingImport, "\(surface): a Profile change ends it with the surface")
        case "credential-change":
            model.replaceCredential(try await owner())
            #expect(shown() == nil && model.dependencies.picker == nil && !model.showingImport, "\(surface): a credential change ends it with the surface")
        case "unrelated-write":
            await model.transition(task, action: "complete")
            try await wait("write landed") { model.tasks.first { $0.id == task.id }?.status == "done" }
            #expect(shown() == failure, "\(surface): a successful unrelated write leaves it: \(shown() ?? "nil")")
            if surface == "picker" { #expect(model.dependencies.picker?.id == picker, "the picker stays open") }
        case "ready":
            let streams = await gate.streamCount
            model.connect()
            try await ready(model, gate, streams: streams + 1)
            #expect(shown() == failure, "\(surface): reaching ready leaves it: \(shown() ?? "nil")")
            if surface == "picker" { #expect(model.dependencies.picker?.id == picker, "the picker stays open") }
        default:
            await model.createDependencyFollowUp(target.id)
            #expect(shown() == nil && model.quickAdd, "\(surface): the same follow-up succeeding replaces it with its Quick Add draft: \(shown() ?? "nil")")
        }
        await finish(model, gate, vault)
    }

    // MARK: MAC-C1-S1-15: the message rule inside a surface (Import report and picker follow-ups)

    /// Opens the surface and returns how to read its follow-up failure.
    private func followUpSurface(_ surface: String, _ model: TodoModel, _ task: TaskSnapshot) async throws -> () -> String? {
        if surface == "import" {
            model.showingImport = true
            model.loadImport(data: Data("[{\"title\":\"Report remains open\"}]".utf8), name: "report.json")
            await model.previewImport()
            try #require(model.importReport != nil)
            return { model.importFollowUpError }
        }
        pickerFor(model, task)
        return { model.dependencies.picker?.failure?.message }
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),
          arguments: ["import", "picker"], ["older-success-after-newer-failure", "older-failure-after-newer-success", "older-success-after-newer-success"])
    func anOlderFollowUpCannotChangeANewerOneInTheSameSurface(_ surface: String, _ order: String) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let other = try await secondTask(model, gate, vault)
        let shown = try await followUpSurface(surface, model, task)
        let instance = surface == "import" ? model.importInstance : model.dependencies.picker!.id
        await gate.next("tasks.show", order == "older-failure-after-newer-success" ? .holdThenFail(404, "OLDER follow-up failed") : .hold)
        let older = Task { await model.createDependencyFollowUp(task.id) }
        try await wait("older held") { await gate.isHeld("tasks.show") }
        if order == "older-success-after-newer-failure" {
            await gate.next("tasks.show", .fail(404, "NEWER follow-up failed"))
            // The picker's follow-ups are targeted by their row (D1): only a newer one for the same
            // row supersedes. The Import report's are not targeted, so any newer one does.
            await model.createDependencyFollowUp(surface == "picker" ? task.id : UUID().uuidString)
            let newer = try #require(shown(), "\(surface): the newer failure shows")
            await gate.release("tasks.show"); await older.value
            #expect(shown() == newer, "\(surface): the older success leaves the newer failure: \(shown() ?? "nil")")
            #expect(!model.quickAdd, "\(surface): the older success opens no Quick Add")
            #expect(surface == "import" ? model.showingImport && model.importInstance == instance : model.dependencies.picker?.id == instance, "\(surface): the same surface stays open")
        } else {
            await model.createDependencyFollowUp(other.id)
            #expect(model.quickAdd && model.dependencies.initial.contains { $0.id == other.id }, "\(surface): the newer success presents")
            await gate.release("tasks.show"); await older.value
            #expect(shown() == nil && model.message == nil, "\(surface): the older completion shows nothing: \(shown() ?? model.message ?? "nil")")
            #expect(!model.dependencies.initial.contains { $0.id == task.id }, "\(surface): the older completion adds nothing to the draft")
        }
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),
          arguments: ["import-apply", "batch-edit", "dependency-batch", "delete", "save", "quick-add"])
    func aGatedSurfaceStartsNoSecondActionOfTheSameKindWhileOneIsPending(_ kind: String) async throws {
        // These surfaces cannot interleave two actions of one kind: busy or pending refuses the
        // second start, so the older one is never overtaken (S1-15 ruling, gated case).
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let operation: String
        let start: () async -> Void
        switch kind {
        case "import-apply":
            model.showingImport = true
            model.loadImport(data: Data(#"[{"external_id":"gated:\#(UUID().uuidString)","title":"Gated import"}]"#.utf8), name: "gated.json")
            await model.previewImport(); try #require(model.importReport?.dry_run == true)
            operation = "tasks.importTasks"; start = { await model.applyImport() }
        case "batch-edit":
            model.batchEdit = .init(profile: "work"); await model.reloadBatchEditTargets()
            model.batchEdit?.selected = [task.id]; model.batchEdit?.field = .priority; model.batchEdit?.value = task.priority == "P1" ? "P2" : "P1"
            operation = "tasks.batchEdit"; start = { await model.applyBatchEdit(dryRun: false) }
        case "dependency-batch":
            let target = try await secondTask(model, gate, vault)
            model.dependencies.batch = .init(profile: "work", root: model.tasks.first { $0.id == task.id }!, direction: .dependsOn)
            await model.reloadDependencyBatch(); model.dependencies.batch?.selected = [target.id]
            await model.previewDependencyBatch(); try #require(model.dependencies.batch?.report?.dry_run == true)
            operation = "tasks.batchDepend"; start = { await model.applyDependencyBatch() }
        case "delete":
            await model.openDependencyDelete(task)
            try await wait("delete preview") { model.dependencies.deletion?.acceptedFromVersion != nil }
            operation = "tasks.delete"; start = { await model.deleteTask(task) }
        case "save":
            model.beginEditing(task); model.editor?.title = task.title + " gated"
            operation = "tasks.edit"; start = { _ = await model.save() }
        default:
            model.quickAdd = true; model.newTitle = "Gated quick add " + UUID().uuidString
            operation = "tasks.create"; start = { _ = await model.create(openEditor: false) }
        }
        let before = await gate.count(operation)
        await gate.next(operation, .hold)
        let first = Task { await start() }
        try await wait("\(kind) held") { await gate.isHeld(operation) }
        await start()
        #expect(await gate.count(operation) == before + 1, "\(kind): the second start sent nothing")
        await gate.release(operation); await first.value
        await finish(model, gate, vault)
    }

    // MARK: S1-15, every surface-local message whose same-kind actions are not gated

    private struct Interleaving { let op: String; let older: () async -> Void; let newer: () async -> Void; let shown: () -> String? }

    /// Opens the surface; `older` and `newer` start one action of the same kind on it.
    private func interleaving(_ surface: String, _ model: TodoModel, _ gate: ScriptGate, _ vault: SessionVault, _ task: TaskSnapshot) async throws -> Interleaving {
        switch surface {
        case "picker-link":
            // Blocks: each candidate is its own dependent, so two links can be pending at once.
            let first = try await secondTask(model, gate, vault), second = try await secondTask(model, gate, vault)
            model.dependencies.picker = .init(profile: "work", root: model.tasks.first { $0.id == task.id }!, direction: .blocks)
            await model.reloadDependencyPicker()
            return .init(op: "tasks.depend", older: { await model.toggleDependency(first) }, newer: { await model.toggleDependency(second) }, shown: { model.dependencies.picker?.failure?.message })
        case "snapshot-list":
            return .init(op: "snapshots.list", older: { await model.loadSnapshots() }, newer: { await model.loadSnapshots() }, shown: { model.snapshotError })
        case "history":
            model.beginEditing(task)
            return .init(op: "reads.history", older: { await model.loadHistory() }, newer: { await model.loadHistory() }, shown: { model.historyError })
        default: // editor-conflict: the conflict reload of the editor's definitions
            model.beginEditing(task); model.editor?.title = task.title + " mine"
            try await edit(task, credential: try #require(try vault.load()))
            _ = await model.save()
            try #require(model.conflict != nil, "a save conflict opens the conflict view")
            return .init(op: "reads.projects", older: { await model.refreshConflictDefinitions() }, newer: { await model.refreshConflictDefinitions() }, shown: { model.editorError })
        }
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),
          // The picker's links are targeted by their row (D1, 2026-11-12): the D1 tests below cover
          // them, on another row (both live) and on the same row (superseded).
          arguments: ["snapshot-list", "history", "editor-conflict"], ["older-success-after-newer-failure", "older-failure-after-newer-success", "older-success-after-newer-success"])
    func anOlderActionCannotChangeANewerOneOfItsKindInTheSameSurface(_ surface: String, _ order: String) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let s = try await interleaving(surface, model, gate, vault, task)
        await gate.next(s.op, order == "older-failure-after-newer-success" ? .holdThenFail(503, "OLDER \(surface) failed") : .hold)
        let older = Task { await s.older() }
        try await wait("older held") { await gate.isHeld(s.op) }
        if order == "older-success-after-newer-failure" {
            await gate.next(s.op, .fail(503, "NEWER \(surface) failed"))
            await s.newer()
            let newer = try #require(s.shown(), "\(surface): the newer failure shows")
            await gate.release(s.op); await older.value
            #expect(s.shown() == newer, "\(surface): the older success leaves the newer failure: \(s.shown() ?? "nil")")
            if surface == "picker-link" { #expect(model.dependencies.picker?.feedback == nil, "picker: the older success shows no feedback") }
        } else {
            await s.newer()
            #expect(s.shown() == nil, "\(surface): the newer success shows no message: \(s.shown() ?? "nil")")
            let feedback = model.dependencies.picker?.feedback
            await gate.release(s.op); await older.value
            #expect(s.shown() == nil, "\(surface): the older completion shows nothing: \(s.shown() ?? "nil")")
            if surface == "picker-link" { #expect(model.dependencies.picker?.feedback == feedback, "picker: only the newer link presents feedback") }
        }
        await finish(model, gate, vault)
    }

    // MARK: S1-15, across kinds in one surface: a reload's success clears nothing newer

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aDependencyBatchReloadKeepsARunFailurePublishedWhileItLoaded() async throws {
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let target = try await secondTask(model, gate, vault)
        model.dependencies.batch = .init(profile: "work", root: model.tasks.first { $0.id == root.id }!, direction: .dependsOn)
        await model.reloadDependencyBatch()
        model.dependencies.batch?.selected = [target.id]
        await model.previewDependencyBatch()
        try #require(model.dependencies.batch?.report?.dry_run == true)
        try await wait("quiet catalog") { !model.loading }
        try await Task.sleep(for: .milliseconds(200))
        await gate.next("tasks.list", .hold)
        let reload = Task { await model.reloadDependencyBatch() }
        try await wait("reload held") { await gate.isHeld("tasks.list") }
        await gate.next("tasks.batchDepend", .fail(503, "NEWER apply failed"))
        await model.applyDependencyBatch()
        let failure = try #require(model.dependencies.batch?.failure?.message, "the apply's failure shows")
        await gate.release("tasks.list"); await reload.value
        #expect(model.dependencies.batch?.failure?.message == failure, "the reload's success leaves the newer failure: \(model.dependencies.batch?.failure?.message ?? "nil")")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aDeleteConfirmationReloadKeepsARefusalPublishedWhileItLoaded() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        await model.openDependencyDelete(task)
        try await wait("delete preview") { model.dependencies.deletion?.acceptedFromVersion != nil }
        await gate.next("tasks.delete", .holdThenFail(503, "NEWER delete failed"))
        let delete = Task { await model.deleteTask(task) }
        try await wait("delete held") { await gate.isHeld("tasks.delete") }
        await gate.next("tasks.show", .hold)
        let reload = Task { await model.reloadDependencyDelete(changed: true) }
        try await wait("reload held") { await gate.isHeld("tasks.show") }
        await gate.release("tasks.delete"); await delete.value
        let refusal = try #require(model.dependencies.deletion?.failure?.message, "the delete's failure shows")
        await gate.release("tasks.show"); await reload.value
        #expect(model.dependencies.deletion?.failure?.message == refusal, "the reload's success leaves the newer refusal: \(model.dependencies.deletion?.failure?.message ?? "nil")")
        await finish(model, gate, vault)
    }

    // MARK: MAC-C1-S1-16: supersession is final, in the surface and in the hand-off after close

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),
          arguments: [false, true], [[false, false], [false, true], [true, false], [true, true]])
    func twoLinksOnDifferentRowsAreBothLiveAndHandOffTheirOwnFailures(_ olderFails: Bool, _ newer: [Bool]) async throws {
        // D1 (2026-11-12): the older link acts on another row, so it is not superseded; after the
        // picker closes it hands off its own failure, merged with a newer hand-off of the same kind (D2).
        // newer[0]: the newer link fails; newer[1]: the picker closes before the newer link finishes.
        let newerFails = newer[0], closeFirst = newer[1]
        let gate = ScriptGate(); let (model, vault, rootSeed) = try await live(gate)
        let older = try await secondTask(model, gate, vault), newerTask = try await secondTask(model, gate, vault)
        // Blocks: each candidate is its own dependent. The newer Task already depends on the root,
        // so its toggle is a removal (tasks.undepend) and can be held apart from the older add.
        let credential = try #require(try vault.load())
        _ = try await todoClient(server: url, credential: credential).tasks_period_depend(path: .init(profile: "work", task: newerTask.id), body: .json(.init(blocker_id: rootSeed.id, from_version: newerTask.row_version))).ok
        await model.refreshAfterWrite("Seeded")
        let root = model.tasks.first { $0.id == rootSeed.id }!
        model.dependencies.picker = .init(profile: "work", root: root, direction: .blocks)
        await model.reloadDependencyPicker()
        try #require(model.dependencies.picker?.checked(newerTask.id) == true)
        let newerNow = model.tasks.first { $0.id == newerTask.id }!
        await gate.next("tasks.depend", olderFails ? .holdThenFail(503, "OLDER link failed") : .hold)
        let olderRun = Task { await model.toggleDependency(older) }
        try await wait("older held") { await gate.isHeld("tasks.depend") }
        if closeFirst {
            await gate.next("tasks.undepend", newerFails ? .holdThenFail(503, "NEWER link failed") : .hold)
            let newerRun = Task { await model.toggleDependency(newerNow) }
            try await wait("newer held") { await gate.isHeld("tasks.undepend") }
            model.closeDependencyPicker()
            await gate.release("tasks.undepend"); await newerRun.value
        } else {
            if newerFails { await gate.next("tasks.undepend", .fail(503, "NEWER link failed")) }
            await model.toggleDependency(newerNow)
            model.closeDependencyPicker()
        }
        let afterNewer = model.message
        await gate.release("tasks.depend"); await olderRun.value
        let label = "older \(olderFails ? "fails" : "succeeds"), newer \(newerFails ? "fails" : "succeeds"), closed \(closeFirst ? "before" : "after") the newer finished"
        if !olderFails {
            #expect(model.message == afterNewer, "\(label): an older success clears only its own row: \(model.message ?? "nil")")
        } else if newerFails && closeFirst {
            // An add and a removal: mixed verbs, so the picker's form with "change" (seat, 2026-11-12).
            #expect(model.message?.hasPrefix("Couldn't change 2 Dependencies: \u{201C}\(newerTask.title)\u{201D} and \u{201C}\(older.title)\u{201D}.") == true,
                    "\(label): both hand-offs merge: \(model.message ?? "nil")")
        } else {
            #expect(model.message?.contains(older.title) == true && model.messageKind == .dependencyLink, "\(label): the older row hands off its own failure: \(model.message ?? "nil")")
        }
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [false, true], [false, true])
    func aSupersededCreateHandsOffNothingAndShowsNoCapsule(_ olderFails: Bool, _ superseded: Bool) async throws {
        // A create is gated by busy, so a newer create cannot start while one is pending (the gated
        // test); this control begins the newer ticket directly to prove the newest check governs the
        // hand-off and the capsule, with the newest (not superseded) case as its pair.
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        model.selectedView = "today"; await model.refreshAfterWrite("Today")
        model.quickAdd = true; model.newTitle = "Quiet create " + UUID().uuidString
        let title = model.newTitle
        await gate.next("tasks.create", olderFails ? .holdThenFail(503, "OLDER create failed") : .hold)
        let create = Task { await model.create(openEditor: false) }
        try await wait("create held") { await gate.isHeld("tasks.create") }
        model.quickAdd = false
        if superseded { _ = model.quickAddMessages.begin(.create) }
        model.deletionNotice = nil
        await gate.release("tasks.create"); _ = await create.value
        let label = "older \(olderFails ? "fails" : "succeeds"), \(superseded ? "superseded" : "newest")"
        if superseded {
            #expect(model.message == nil && model.deletionNotice == nil, "\(label): nothing presented: \(model.message ?? model.deletionNotice ?? "nil")")
        } else if olderFails {
            #expect(model.message?.contains(title) == true && model.messageKind == .quickAdd, "\(label): the newest create hands off: \(model.message ?? "nil")")
        } else {
            #expect(model.deletionNotice == "Task added", "\(label): a Task outside Today is confirmed quietly")
        }
        await finish(model, gate, vault)
    }

    // MARK: MAC-C1-S1-17: who may present a read-back is asked when it publishes, never before

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),
          arguments: ["complete", "reopen", "save", "move", "delete", "quick-add",
                      "copy-closed", "link-closed", "batch-edit-closed", "attachment-batch-closed", "dependency-batch-closed", "attachment-closed", "import-closed"])
    func aReadBackPresentsOnlyForItsOwnerWhenItPublishes(_ kind: String) async throws {
        // The write commits; its catalog read-back is held; the boundary happens (nothing, for a
        // write the main window owns; its surface closes, otherwise); the read-back fails.
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let credential = try #require(try vault.load())
        var start: () async -> Void = {}
        var boundary: () -> Void = {}
        let mainWindowOwns = ["complete", "reopen", "save", "move", "delete", "quick-add"].contains(kind)
        switch kind {
        case "complete":
            start = { await model.transition(task, action: "complete") }
        case "reopen":
            _ = try await todoClient(server: url, credential: credential).tasks_period_transition(path: .init(profile: "work", task: task.id), body: .json(.init(from_version: task.row_version, action: .complete))).ok
            await model.refreshAfterWrite("Seeded")
            let done = try #require(model.tasks.first { $0.id == task.id })
            start = { await model.transition(done, action: "reopen") }
        case "save":
            model.beginEditing(task); model.editor?.title = task.title + " saved"
            start = { _ = await model.save() }
        case "move":
            model.beginEditing(task)
            start = { await model.write(.move("transfer")) }
        case "copy-closed":
            model.beginEditing(task)
            start = { await model.write(.copy("transfer")) }
            boundary = { model.editor = nil }
        case "delete":
            await model.openDependencyDelete(task)
            try await wait("delete preview") { model.dependencies.deletion?.acceptedFromVersion != nil }
            start = { await model.deleteTask(task) }
        case "quick-add":
            model.quickAdd = true; model.newTitle = "Read-back create " + UUID().uuidString
            start = { _ = await model.create(openEditor: false) }
        case "link-closed":
            let candidate = try await secondTask(model, gate, vault)
            model.dependencies.picker = .init(profile: "work", root: model.tasks.first { $0.id == task.id }!, direction: .blocks)
            await model.reloadDependencyPicker()
            start = { await model.toggleDependency(candidate) }
            boundary = { model.closeDependencyPicker() }
        case "batch-edit-closed":
            model.batchEdit = .init(profile: "work"); await model.reloadBatchEditTargets()
            model.batchEdit?.selected = [task.id]; model.batchEdit?.field = .priority; model.batchEdit?.value = task.priority == "P1" ? "P2" : "P1"
            await model.applyBatchEdit(dryRun: true)
            start = { await model.applyBatchEdit(dryRun: false) }
            boundary = { model.batchEdit = nil }
        case "attachment-batch-closed":
            let target = try await secondTask(model, gate, vault)
            let link = "https://example.test/readback-" + UUID().uuidString
            model.beginEditing(task); await model.attachLink(link)
            try await wait("source link") { hasLink(model.tasks.first { $0.id == task.id }, link) }
            let reference = try #require(model.tasks.first { $0.id == task.id }?.attachments?.first { if case .link(let url) = $0.location { return url.absoluteString == link }; return false })
            model.editor = nil
            model.attachmentBatch = .init(profile: "work", reference: reference)
            await model.reloadAttachmentTargets(); model.attachmentBatch?.selected = [target.id]
            await model.applyAttachmentBatch(dryRun: true)
            start = { await model.applyAttachmentBatch(dryRun: false) }
            boundary = { model.attachmentBatch = nil }
        case "dependency-batch-closed":
            let target = try await secondTask(model, gate, vault)
            model.dependencies.batch = .init(profile: "work", root: model.tasks.first { $0.id == task.id }!, direction: .dependsOn)
            await model.reloadDependencyBatch(); model.dependencies.batch?.selected = [target.id]
            await model.previewDependencyBatch(); try #require(model.dependencies.batch?.report?.dry_run == true)
            start = { await model.applyDependencyBatch() }
            boundary = { model.dependencies.batch = nil }
        case "attachment-closed":
            model.beginEditing(task)
            start = { await model.attachLink("https://example.test/editor-readback-" + UUID().uuidString) }
            boundary = { model.editor = nil }
        default: // import-closed
            model.showingImport = true
            model.loadImport(data: Data(#"[{"external_id":"readback:\#(UUID().uuidString)","title":"Read-back import"}]"#.utf8), name: "readback.json")
            await model.previewImport(); try #require(model.importReport?.dry_run == true)
            start = { await model.applyImport() }
            boundary = { model.showingImport = false }
        }
        await gate.next("reads.profiles", .holdThenFail(503, "READ-BACK failed"))
        let write = Task { await start() }
        try await wait("\(kind): read-back held") { await gate.isHeld("reads.profiles") }
        boundary()
        await gate.release("reads.profiles"); await write.value
        let reconnecting = model.message?.contains("The live view is reconnecting.") == true
        #expect(reconnecting == mainWindowOwns, "\(kind): \(mainWindowOwns ? "its owner presents" : "a closed surface presents nothing"): \(model.message ?? "nil")")
        if kind == "copy-closed" { #expect(model.transferResult == nil, "copy-closed: no transfer report for a closed editor") }
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func anOldInstancesFailureReplacesTheHandOffOnlyByPublishingItsOwnMessage() async throws {
        // S1-18 ruling: a later failure is a newer message. It replaces the earlier hand-off by
        // publishing (the sequence grows and the text names its own Task), never by clearing.
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let older = try await secondTask(model, gate, vault), newer = try await secondTask(model, gate, vault)
        _ = try await todoClient(server: url, credential: try #require(try vault.load())).tasks_period_depend(path: .init(profile: "work", task: newer.id), body: .json(.init(blocker_id: root.id, from_version: newer.row_version))).ok
        await model.refreshAfterWrite("Seeded")
        let rootNow = model.tasks.first { $0.id == root.id }!, newerNow = model.tasks.first { $0.id == newer.id }!
        model.dependencies.picker = .init(profile: "work", root: rootNow, direction: .blocks); await model.reloadDependencyPicker()
        await gate.next("tasks.depend", .holdThenFail(503, "OLD instance link failed"))
        let olderRun = Task { await model.toggleDependency(older) }
        try await wait("older held") { await gate.isHeld("tasks.depend") }
        model.closeDependencyPicker()
        model.dependencies.picker = .init(profile: "work", root: rootNow, direction: .blocks); await model.reloadDependencyPicker()
        await gate.next("tasks.undepend", .holdThenFail(503, "NEW instance link failed"))
        let newerRun = Task { await model.toggleDependency(newerNow) }
        try await wait("newer held") { await gate.isHeld("tasks.undepend") }
        model.closeDependencyPicker(); await gate.release("tasks.undepend"); await newerRun.value
        let handOff = try #require(model.message), sequence = model.messageSequence
        #expect(handOff.contains(newer.title))
        await gate.release("tasks.depend"); await olderRun.value
        #expect(model.message != nil && model.message?.contains(older.title) == true, "the later failure names its own Task: \(model.message ?? "nil")")
        #expect(model.messageSequence == sequence + 1, "it replaced the hand-off by publishing, not by clearing")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aBlocksDirectionHandOffNamesTheDependentFirst() async throws {
        // Candidate 8 ruling 2, Blocks direction: the candidate is the dependent.
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let candidate = try await secondTask(model, gate, vault)
        await model.openDependencyPicker(model.tasks.first { $0.id == root.id }!)
        try await wait("picker loaded") { model.dependencies.picker?.loading == false && model.dependencies.picker?.candidates.contains { $0.id == candidate.id } == true }
        model.dependencies.picker?.direction = .blocks
        await gate.next("tasks.depend", .holdThenFail(503, "OLD closed-picker link failed"))
        let toggle = Task { await model.toggleDependency(model.dependencies.picker!.candidates.first { $0.id == candidate.id }!) }
        try await wait("depend held") { await gate.isHeld("tasks.depend") }
        model.closeDependencyPicker()
        await gate.release("tasks.depend"); await toggle.value
        let rootTitle = model.tasks.first { $0.id == root.id }?.title ?? root.title
        #expect(model.message?.hasPrefix("Couldn't make “\(candidate.title)” depend on “\(rootTitle)”.") == true, "Blocks: \(model.message ?? "nil")")
        await finish(model, gate, vault)
    }

    // MARK: MAC-C1-S1-19: a committed write's read-back cannot be skipped by a later failure

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),
          arguments: ["create", "save", "complete", "delete", "move", "link", "batch-edit", "dependency-batch", "import", "attach-paths"])
    func aCommittedWriteReadsTheCatalogBackWhenItsReplyOrSecondaryReadFails(_ kind: String) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let credential = try #require(try vault.load())
        var run: () async -> Void = {}
        var landed: () -> Bool = { false }
        var operation = ""
        // Lives for the whole test: a defer inside a case would delete it before the attach runs.
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("committed-\(UUID().uuidString).txt")
        defer { try? FileManager.default.removeItem(at: file) }
        switch kind {
        case "create":
            let title = "Committed create " + UUID().uuidString
            model.quickAdd = true; model.newTitle = title
            operation = "tasks.create"; run = { _ = await model.create(openEditor: false) }
            landed = { model.tasks.contains { $0.title == title } }
        case "save":
            let title = task.title + " committed"
            model.beginEditing(task); model.editor?.title = title
            operation = "tasks.edit"; run = { _ = await model.save() }
            landed = { model.tasks.contains { $0.id == task.id && $0.title == title } }
        case "complete":
            operation = "tasks.transition"; run = { await model.transition(task, action: "complete") }
            landed = { model.tasks.first { $0.id == task.id }?.status == "done" || !model.tasks.contains { $0.id == task.id && $0.status == "open" } }
        case "delete":
            await model.openDependencyDelete(task)
            try await wait("delete preview") { model.dependencies.deletion?.acceptedFromVersion != nil }
            operation = "tasks.delete"; run = { await model.deleteTask(task) }
            landed = { !model.tasks.contains { $0.id == task.id } }
        case "move":
            model.beginEditing(task)
            operation = "tasks.move"; run = { await model.write(.move("transfer")) }
            landed = { !model.tasks.contains { $0.id == task.id } }
        case "link":
            let candidate = try await secondTask(model, gate, vault)
            model.dependencies.picker = .init(profile: "work", root: model.tasks.first { $0.id == task.id }!, direction: .blocks)
            await model.reloadDependencyPicker()
            operation = "tasks.depend"; run = { await model.toggleDependency(candidate) }
            landed = { model.tasks.first { $0.id == candidate.id }?.depends_on?.contains(task.id) == true }
        case "batch-edit":
            let wanted = task.priority == "P1" ? "P2" : "P1"
            model.batchEdit = .init(profile: "work"); await model.reloadBatchEditTargets()
            model.batchEdit?.selected = [task.id]; model.batchEdit?.field = .priority; model.batchEdit?.value = wanted
            await model.applyBatchEdit(dryRun: true)
            operation = "tasks.batchEdit"; run = { await model.applyBatchEdit(dryRun: false) }
            landed = { model.tasks.first { $0.id == task.id }?.priority == wanted }
        case "dependency-batch":
            let target = try await secondTask(model, gate, vault)
            model.dependencies.batch = .init(profile: "work", root: model.tasks.first { $0.id == task.id }!, direction: .dependsOn)
            await model.reloadDependencyBatch(); model.dependencies.batch?.selected = [target.id]
            await model.previewDependencyBatch(); try #require(model.dependencies.batch?.report?.dry_run == true)
            operation = "tasks.batchDepend"; run = { await model.applyDependencyBatch() }
            landed = { model.tasks.first { $0.id == task.id }?.depends_on?.contains(target.id) == true }
        case "import":
            let title = "Committed import " + UUID().uuidString
            model.showingImport = true
            model.loadImport(data: Data(#"[{"external_id":"committed:\#(UUID().uuidString)","title":"\#(title)"}]"#.utf8), name: "committed.json")
            await model.previewImport(); try #require(model.importReport?.dry_run == true)
            operation = "tasks.importTasks"; run = { await model.applyImport() }
            landed = { model.tasks.contains { $0.title == title } }
        default: // attach-paths: the write commits; its secondary tasks.show fails
            try Data("attachment".utf8).write(to: file)
            model.beginEditing(task)
            await gate.next("tasks.show", .fail(503, "SECONDARY read failed"))
            operation = ""; run = { await model.attachPaths([file.path]) }
            landed = { (model.tasks.first { $0.id == task.id }?.attachments ?? []).contains { if case .file(let path) = $0.location { return path.hasSuffix(file.lastPathComponent) }; return false } }
        }
        _ = credential
        if !operation.isEmpty { await gate.next(operation, .corrupt) }
        await run()
        try await wait("\(kind): the committed change reaches the list") { landed() }
        #expect(landed(), "\(kind): the read-back ran after the failure")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aDeletedProfilesFailedReadBackIsNotADeletionFailure() async throws {
        let gate = ScriptGate(); let (model, vault, _) = try await live(gate)
        model.changeProfile("deletable")
        try await ready(model, gate, streams: 2)
        try await wait("deletable live") { model.profile == "deletable" && !model.loading && model.canWrite }
        try await Task.sleep(for: .milliseconds(100))
        model.beginProfileDeletion()
        try #require(model.profileDeletion != nil)
        await gate.next("reads.profiles", .fail(503, "PROFILES read failed"))
        await model.deleteProfile()
        #expect(model.profileDeletionError == nil, "the deletion stands; no deletion failure: \(model.profileDeletionError ?? "nil")")
        #expect(model.message?.contains("was deleted. The live view is reconnecting.") == true, "\(model.message ?? "nil")")
        await finish(model, gate, vault)
    }

    // MARK: MAC-C1-S1-20: a 401 for the current credential ends the Session even if unwanted

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),
          arguments: ["transition-cancelled", "catalog-cancelled", "catalog-superseded", "retired-control"])
    func aCurrentUnauthorizedReplyEndsTheSessionWhetherOrNotItsActionIsStillWanted(_ kind: String) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        // A search refresh reads tasks.list; the transition is its own write.
        let operation = kind == "transition-cancelled" || kind == "retired-control" ? "tasks.transition" : "tasks.list"
        await gate.next(operation, .holdThenFail(401, "CURRENT credential refused"))
        let action = Task {
            if operation == "tasks.transition" { await model.transition(task, action: "complete") }
            else { _ = await model.retrySearch() }
        }
        try await wait("\(kind): held") { await gate.isHeld(operation) }
        switch kind {
        case "transition-cancelled", "catalog-cancelled": action.cancel()
        case "catalog-superseded": _ = await model.retrySearch()
        default:
            let replacement = try await owner()
            try vault.save(replacement); model.replaceCredential(replacement); model.signedIn = true
        }
        await gate.release(operation); await action.value
        if kind == "retired-control" {
            #expect(model.signedIn, "a superseded credential's 401 never ends the new Session")
        } else {
            try await wait("\(kind): Session ended") { !model.signedIn }
            #expect(!model.signedIn, "\(kind): the dead Session is noticed")
        }
        await finish(model, gate, vault)
    }

    // MARK: D1 and D2: supersession is per target; same-kind failures on different rows merge

    /// A Blocks picker whose candidates are their own dependents, so two links can be live at once.
    private func blocksPicker(_ model: TodoModel, _ gate: ScriptGate, _ vault: SessionVault, root: TaskSnapshot) async throws -> (TaskSnapshot, TaskSnapshot) {
        let a = try await secondTask(model, gate, vault), b = try await secondTask(model, gate, vault)
        model.dependencies.picker = .init(profile: "work", root: model.tasks.first { $0.id == root.id }!, direction: .blocks)
        await model.reloadDependencyPicker()
        return (a, b)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func anOlderLinkOnAnotherRowStillReportsItsRefusalInThePicker() async throws {
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let (a, b) = try await blocksPicker(model, gate, vault, root: root)
        await gate.next("tasks.depend", .holdThenFail(503, "ROW A refused"))
        let older = Task { await model.toggleDependency(a) }
        try await wait("A held") { await gate.isHeld("tasks.depend") }
        await model.toggleDependency(b)
        #expect(model.dependencies.picker?.feedback == "Dependency added", "B succeeds")
        await gate.release("tasks.depend"); await older.value
        #expect(model.dependencies.picker?.failure?.attemptTitle == a.title, "A's refusal shows for its own row: \(model.dependencies.picker?.failure?.message ?? "nil")")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func anOlderLinkOnAnotherRowSucceedingLeavesTheNewerRefusalAndShowsItsOwnSuccess() async throws {
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let (a, b) = try await blocksPicker(model, gate, vault, root: root)
        await gate.next("tasks.depend", .hold, .fail(503, "ROW B refused"))
        let older = Task { await model.toggleDependency(a) }
        try await wait("A held") { await gate.isHeld("tasks.depend") }
        await model.toggleDependency(b)
        let refusal = try #require(model.dependencies.picker?.failure, "B's refusal shows")
        await gate.release("tasks.depend"); await older.value
        #expect(model.dependencies.picker?.failure?.attemptTitle == refusal.attemptTitle && refusal.attemptTitle == b.title, "B's refusal stays: \(model.dependencies.picker?.failure?.message ?? "nil")")
        #expect(model.dependencies.picker?.feedback == "Dependency added", "A reports its own success")
        await finish(model, gate, vault)
    }

    // Follow-ups are navigations (coordinator ruling, 2026-11-12): "Create follow-up" commits
    // nothing and opens Quick Add, so in one picker only the newest follow-up is live, whatever its
    // row. Links commit writes and stay per row (D1).
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func anOlderFollowUpForAnotherRowPresentsNothingAndTheNewerFailureKeepsItsNotice() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        pickerFor(model, task)
        let picker = try #require(model.dependencies.picker?.id)
        model.dependencies.picker?.failure = DependencyNotice(message: "ORIGINAL This Task blocks done Tasks.", followUp: task.id)
        await gate.next("tasks.show", .hold)
        let older = Task { await model.createDependencyFollowUp(task.id) }
        try await wait("A held") { await gate.isHeld("tasks.show") }
        await gate.next("tasks.show", .fail(404, "ROW B follow-up failed"))
        await model.createDependencyFollowUp(UUID().uuidString)
        await gate.release("tasks.show"); await older.value
        #expect(model.dependencies.picker?.id == picker && !model.quickAdd, "the picker stays open and A opens no Quick Add")
        #expect(model.dependencies.picker?.failure?.message == "ORIGINAL This Task blocks done Tasks.", "the notice stays")
        #expect(model.dependencies.picker?.failure?.followUp == task.id, "its button stays")
        #expect(model.dependencies.picker?.failure?.followUpFailure == "Couldn't prepare the follow-up Task: ROW B follow-up failed Try again.", "B's failure stays with it")
        #expect(model.dependencies.initial.isEmpty && model.message == nil, "A adds nothing and says nothing")
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: ["older-completes-first", "older-completes-last"])
    func ofTwoSucceedingFollowUpsInOnePickerOnlyTheNewerOpensQuickAdd(_ order: String) async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let other = try await secondTask(model, gate, vault)
        pickerFor(model, task)
        await gate.next("tasks.show", .holdAs("A"), .holdAs("B"))
        let older = Task { await model.createDependencyFollowUp(task.id) }
        try await wait("A held") { await gate.isHeld("tasks.show#A") }
        let newer = Task { await model.createDependencyFollowUp(other.id) }
        try await wait("B held") { await gate.isHeld("tasks.show#B") }
        if order == "older-completes-first" {
            await gate.release("tasks.show#A"); await older.value
            #expect(!model.quickAdd && model.dependencies.picker != nil, "A, superseded, opens nothing")
            await gate.release("tasks.show#B"); await newer.value
        } else {
            await gate.release("tasks.show#B"); await newer.value
            await gate.release("tasks.show#A"); await older.value
        }
        #expect(model.quickAdd && model.dependencies.picker == nil, "B opens Quick Add")
        #expect(model.dependencies.initial.map(\.id) == [other.id], "only B's Task: \(model.dependencies.initial.map(\.title))")
        #expect(model.message == nil)
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aLinkOnARowStillEndsThatRowsFollowUpNotice() async throws {
        let gate = ScriptGate(); let (model, vault, task) = try await live(gate)
        let other = try await secondTask(model, gate, vault)
        pickerFor(model, task); await model.reloadDependencyPicker()
        model.dependencies.picker?.failure = DependencyNotice(message: "ORIGINAL This Task blocks done Tasks.", followUp: task.id)
        await gate.next("tasks.show", .fail(404, "ROW follow-up failed"))
        await model.createDependencyFollowUp(task.id)
        try #require(model.dependencies.picker?.failure?.followUpFailure == "Couldn't prepare the follow-up Task: ROW follow-up failed Try again.")
        await gate.next("tasks.depend", .hold)
        let link = Task { await model.toggleDependency(other) }
        try await wait("link held") { await gate.isHeld("tasks.depend") }
        #expect(model.dependencies.picker?.failure == nil, "a link on this row ends its follow-up notice when it starts: \(model.dependencies.picker?.failure?.message ?? "nil")")
        await gate.release("tasks.depend"); await link.value
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [false, true])
    func anOlderLinkSupersededOnTheSameRowPresentsNothing(_ closed: Bool) async throws {
        // A second tick on a pending row is refused by the pending gate, so the newer action on the
        // same row is begun directly: the rule under test is the per-target supersession itself.
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let (a, _) = try await blocksPicker(model, gate, vault, root: root)
        await gate.next("tasks.depend", .holdThenFail(503, "SUPERSEDED same-row link"))
        let older = Task { await model.toggleDependency(a) }
        try await wait("A held") { await gate.isHeld("tasks.depend") }
        _ = model.dependencies.picker?.messages.begin(.link, target: a.id)
        if closed { model.closeDependencyPicker() }
        await gate.release("tasks.depend"); await older.value
        #expect(model.dependencies.picker?.failure == nil && model.message == nil, "closed \(closed): \(model.message ?? model.dependencies.picker?.failure?.message ?? "nil")")
        await finish(model, gate, vault)
    }

    /// The seat's candidate 7c probe (line 52) under D1: a link's committed write whose catalog
    /// read-back fails. Superseded on its own row, the read-back presents nothing; on another row it
    /// is live and reports its own read-back, while the newer row's refusal stays in the picker.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: ["same-row", "other-row"])
    func aLinkReadBackFailureFollowsItsRowsSupersession(_ row: String) async throws {
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let (a, b) = try await blocksPicker(model, gate, vault, root: root)
        await gate.next("reads.profiles", .holdThenFail(503, "A catalog read-back"))
        let older = Task { await model.toggleDependency(a) }
        try await wait("A's read-back held") { await gate.isHeld("reads.profiles") }
        var newer: String?
        if row == "same-row" {
            _ = model.dependencies.picker?.messages.begin(.link, target: a.id)
        } else {
            await gate.next("tasks.depend", .fail(503, "ROW B refused"))
            await model.toggleDependency(b)
            newer = try #require(model.dependencies.picker?.failure?.message, "B's refusal shows")
        }
        await gate.release("reads.profiles"); await older.value
        if row == "same-row" {
            #expect(model.message == nil, "superseded on its row: \(model.message ?? "nil")")
        } else {
            #expect(model.message?.hasSuffix(". The live view is reconnecting.") == true, "A's own read-back: \(model.message ?? "nil")")
            #expect(model.dependencies.picker?.failure?.message == newer, "B's refusal stays in the picker")
        }
        await finish(model, gate, vault)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func twoRefusedLinksOnDifferentRowsMergeIntoOneNotice() async throws {
        let gate = ScriptGate(); let (model, vault, root) = try await live(gate)
        let (a, b) = try await blocksPicker(model, gate, vault, root: root)
        await gate.next("tasks.depend", .holdThenFail(503, "ROW A refused"), .fail(503, "ROW B refused"))
        let older = Task { await model.toggleDependency(a) }
        try await wait("A held") { await gate.isHeld("tasks.depend") }
        await model.toggleDependency(b)
        await gate.release("tasks.depend"); await older.value
        let notice = model.dependencies.picker?.failure?.message ?? "nil"
        #expect(notice.hasPrefix("Couldn't add 2 Dependencies:") && notice.contains(a.title) && notice.contains(b.title), "merged: \(notice)")
        await finish(model, gate, vault)
    }
}
