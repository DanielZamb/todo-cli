import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TodoAPI
@testable import TodoState

/// S1-39 (coordinator's ruling, 2026-11-14 13:45 and 13:25): the client is safe against a transport
/// call that never returns once cancelled, whatever the library's reason. A cancelled send, read or
/// write, returns CancellationError to its awaiter at once, whether its caller was cancelled or the
/// transport was retired; a retired transport still invalidates its session; a late reply is
/// dropped and counted. And the hit's shape on the model: the refresh for TaskCreated has a read
/// that never returns after its cancellation, and the stream loop still reads TaskDeleted and
/// ProfileDeleted and leaves the deleted Profile.
private actor NeverEndingInner: ClientTransport {
    private var held: [CheckedContinuation<Void, Never>] = []
    private(set) var started = 0
    /// Ends every held send now, as a reply that arrives after its release.
    func endLate() { held.forEach { $0.resume() }; held = [] }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        started += 1
        await withCheckedContinuation { held.append($0) } // ignores cancellation, as the library's lost send does
        return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody("{}"))
    }
}
private final class InvalidationProbe: NSObject, URLSessionDelegate, @unchecked Sendable {
    private let lock = NSLock(); private var invalid = false
    var invalidated: Bool { lock.withLock { invalid } }
    func urlSession(_ session: URLSession, didBecomeInvalidWithError error: (any Error)?) { lock.withLock { invalid = true } }
}

@Suite struct StuckSendReleaseTests {
    private func request(_ method: HTTPRequest.Method) -> HTTPRequest { HTTPRequest(method: method, scheme: "http", authority: "127.0.0.1:1", path: "/profiles/work/tasks") }
    private func waitUntil(_ seconds: Double, _ condition: () async -> Bool) async -> Bool {
        let deadline = ProcessInfo.processInfo.systemUptime + seconds
        while ProcessInfo.processInfo.systemUptime < deadline { if await condition() { return true }; try? await Task.sleep(for: .milliseconds(5)) }
        return await condition()
    }
    /// A read and a write, each released by its caller's cancellation and by retire(): the awaiter
    /// gets CancellationError within a second although the inner send never ends.
    @Test(arguments: [("GET", "caller"), ("POST", "caller"), ("GET", "retire"), ("POST", "retire")])
    func aCancelledSendIsReleasedAtOnce(method: String, by source: String) async throws {
        let inner = NeverEndingInner()
        let transport = ScopedTransport(session: URLSession(configuration: .ephemeral), base: inner)
        let finished = Finished()
        let started = ProcessInfo.processInfo.systemUptime
        let call = Task {
            do { _ = try await transport.send(request(method == "GET" ? .get : .post), body: nil, baseURL: URL(string: "http://127.0.0.1:1")!, operationID: method == "GET" ? "tasks.list" : "tasks.create"); finished.set("returned") }
            catch is CancellationError { finished.set("cancelled") }
            catch { finished.set("other: \(error)") }
        }
        #expect(await waitUntil(2) { await inner.started == 1 })
        if source == "caller" { call.cancel() } else { transport.retire() }
        #expect(await waitUntil(1) { finished.value != nil }, "\(method) released by \(source) within a second")
        #expect(finished.value == "cancelled")
        #expect(ProcessInfo.processInfo.systemUptime - started < 3)
        #expect(transport.releaseCounts == .init(releasedEarly: 1, notEnded: 1, lateEnded: 0))
        // A reply that arrives after the release is dropped here and counted.
        await inner.endLate()
        #expect(await waitUntil(1) { transport.releaseCounts.lateEnded == 1 })
        #expect(transport.releaseCounts == .init(releasedEarly: 1, notEnded: 0, lateEnded: 1))
        #expect(finished.value == "cancelled", "the late reply never reached the caller")
    }

    /// A retired transport whose inner send never ends: the awaiter returns at once (S1-39), the
    /// session waits for the running send (S1-19), and the grace invalidates it anyway, counting the
    /// send still running, so a stuck send does not keep the session and its sockets for ever.
    @Test func aRetiredTransportWithANeverEndingSendInvalidatesItsSessionAfterTheGrace() async throws {
        let inner = NeverEndingInner()
        let probe = InvalidationProbe()
        let transport = ScopedTransport(session: URLSession(configuration: .ephemeral, delegate: probe, delegateQueue: nil), base: inner, stuckGrace: 0.4)
        let call = Task { _ = try? await transport.send(request(.get), body: nil, baseURL: URL(string: "http://127.0.0.1:1")!, operationID: "tasks.list") }
        #expect(await waitUntil(2) { await inner.started == 1 })
        let retired = ProcessInfo.processInfo.systemUptime
        transport.retire()
        await call.value
        #expect(ProcessInfo.processInfo.systemUptime - retired < 0.3, "the awaiter returned at once")
        #expect(!transport.sessionInvalidated, "not while the inner send runs")
        #expect(await waitUntil(3) { probe.invalidated }, "the grace invalidates the session although the inner send never ended")
        #expect(ProcessInfo.processInfo.systemUptime - retired >= 0.4)
        #expect(transport.releaseCounts == .init(releasedEarly: 1, notEnded: 1, lateEnded: 0, invalidatedWithRunning: 1))
        await inner.endLate()
    }
}

private final class Finished: @unchecked Sendable {
    private let lock = NSLock(); private var outcome: String?
    func set(_ value: String) { lock.withLock { if outcome == nil { outcome = value } } }
    var value: String? { lock.withLock { outcome } }
}

/// The hit's shape (loop 5 and loop 8 of the investigation), on the production model over
/// ScopedTransport: the Profile "gone" is deleted; the stream delivers TaskCreated, whose catalog
/// refresh finds every read answering 404 except the scheduled view, which never returns once
/// cancelled; then TaskDeleted and ProfileDeleted. The loop must read them and leave to "work".
private actor HitShapeInner: ClientTransport {
    enum Frames {
    static let frame4 = #"{"seq":4,"actor":"ecfacdd7a5095730f3233937c4d952a5","profile":"gone","from_version":null,"event":{"entity_version":1,"occurred_at":"2026-11-14T18:26:30.981Z","kind":"TaskCreated","task":{"title":"S139 fixture","description":null,"project_id":null,"priority":"P3","scheduled_at":null,"due_at":null,"energy":null,"estimate_min":null,"source":"manual","tags":[],"id":"3da7843b-4dff-4e89-b142-1345364da439","profile_id":"gone","entity_version":1,"row_version":1,"status":"open","occurrence":null,"created_at":"2026-11-14T18:26:30.981Z","updated_at":"2026-11-14T18:26:30.981Z","completed_at":null,"deleted_at":null},"series":null,"project":null,"tags":[]},"to_version":1,"outcome":"committed","reason":null}"#
    static let frame5 = #"{"seq":5,"actor":"ecfacdd7a5095730f3233937c4d952a5","profile":"gone","from_version":1,"event":{"entity_version":1,"occurred_at":"2026-11-14T18:26:31.507Z","kind":"TaskDeleted","before":{"title":"S139 fixture","description":null,"project_id":null,"priority":"P3","scheduled_at":null,"due_at":null,"energy":null,"estimate_min":null,"source":"manual","tags":[],"id":"3da7843b-4dff-4e89-b142-1345364da439","profile_id":"gone","entity_version":1,"row_version":1,"status":"open","occurrence":null,"created_at":"2026-11-14T18:26:30.981Z","updated_at":"2026-11-14T18:26:30.981Z","completed_at":null,"deleted_at":null},"after":{"title":"S139 fixture","description":null,"project_id":null,"priority":"P3","scheduled_at":null,"due_at":null,"energy":null,"estimate_min":null,"source":"manual","tags":[],"id":"3da7843b-4dff-4e89-b142-1345364da439","profile_id":"gone","entity_version":1,"row_version":2,"status":"open","occurrence":null,"created_at":"2026-11-14T18:26:30.981Z","updated_at":"2026-11-14T18:26:31.507Z","completed_at":null,"deleted_at":"2026-11-14T18:26:31.507Z"}},"to_version":2,"outcome":"committed","reason":null}"#
    static let frame6 = #"{"seq":6,"actor":"ecfacdd7a5095730f3233937c4d952a5","profile":"gone","from_version":null,"event":{"entity_version":1,"occurred_at":"2026-11-14T18:26:31.507Z","kind":"ProfileDeleted","profile":{"id":"gone","name":"gone","created_at":"2026-11-14T18:26:29.970Z","updated_at":"2026-11-14T18:26:29.970Z"},"access_token_ids":[]},"to_version":null,"outcome":"committed","reason":null}"#
    }
    private var stream: AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation?
    private var deleted = false
    private var stuckOnce = true
    private var held: [CheckedContinuation<Void, Never>] = []
    private(set) var stuckStarted = false
    private(set) var ops: [String] = []
    func delete() { deleted = true }
    func push(_ frame: String, id: String) { stream?.yield(Array("id: \(id)\nevent: operation\ndata: \(frame)\n\n".utf8)[...]) }
    func release() { held.forEach { $0.resume() }; held = [] }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let path = request.path ?? ""
        ops.append(operationID + " " + path)
        if operationID == "system.health" { return json(#"{"service":"todo-server","build":"hit-shape","contract":"\#(TodoContract.id)"}"#) }
        if operationID == "changes.stream" {
            let pair = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            if path.contains("/profiles/gone/") { stream = pair.continuation }
            pair.continuation.yield(Array("event: ready\ndata: null\n\n".utf8)[...])
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "text/event-stream", .cacheControl: "no-store"]), HTTPBody(pair.stream, length: .unknown))
        }
        if operationID == "reads.profiles" {
            let work = #"{"id":"work","name":"Work","created_at":"2026-11-14T00:00:00Z","updated_at":"2026-11-14T00:00:00Z","open_task_count":0,"inbox_task_count":0,"visible_task_count":0,"projects":[]}"#
            let gone = #"{"id":"gone","name":"gone","created_at":"2026-11-14T00:00:00Z","updated_at":"2026-11-14T00:00:00Z","open_task_count":0,"inbox_task_count":0,"visible_task_count":0,"projects":[]}"#
            return json(deleted ? "[\(work)]" : "[\(gone),\(work)]")
        }
        if deleted && path.contains("/profiles/gone") {
            if operationID == "reads.view" && path.contains("/views/scheduled") && stuckOnce {
                stuckOnce = false; stuckStarted = true
                await withCheckedContinuation { held.append($0) } // never returns once cancelled
            }
            if operationID != "tasks.list" { try? await Task.sleep(for: .milliseconds(3)) } // the tasks read answers first
            return json(#"{"message":"Profile not found","code":"not_found","exit_code":3,"exit_meaning":"not found or auth missing"}"#, status: 404)
        }
        if operationID == "tasks.list" || operationID == "reads.projects" || operationID == "reads.tags" { return json("[]") }
        if operationID == "reads.view" { return json(#"{"name":"today","now":"2026-11-14T12:00:00Z","groups":[]}"#) }
        if operationID == "reads.lookup" { return json("[]") }
        throw URLError(.unsupportedURL)
    }
    private func json(_ value: String, status: Int = 200) -> (HTTPResponse, HTTPBody?) { (HTTPResponse(status: .init(code: status), headerFields: [.contentType: "application/json"]), HTTPBody(value)) }
}

@MainActor @Suite(.serialized) struct StreamLeavesDespiteAStuckReadTests {
    @Test func theLoopReadsPastAStuckRefreshAndLeavesTheDeletedProfile() async throws {
        let inner = HitShapeInner()
        let transport = ScopedTransport(session: URLSession(configuration: .ephemeral), base: inner)
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1/hit-shape-\(UUID())")!, initialProfile: "gone", vaultService: "never-used-hit-shape-\(UUID())"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) },
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.clientDiagnosticsUI.stop()
        model.replaceCredential("ses_synthetic-hit-shape"); model.selectedView = "all"; model.signedIn = true
        defer { model.signedIn = false; model.connect(); Task { await inner.release() } }
        model.connect()
        func until(_ seconds: Double, _ condition: () -> Bool) async -> Bool {
            let deadline = ProcessInfo.processInfo.systemUptime + seconds
            while !condition() { if ProcessInfo.processInfo.systemUptime > deadline { return false }; try? await Task.sleep(for: .milliseconds(5)) }
            return true
        }
        let live = await until(5) { model.canWrite && !model.loading && model.profile == "gone" && model.streamFollowsCurrentProfile }
        let served = await inner.ops
        #expect(live, "not live on gone: connection \(model.connection) loading \(model.loading) canWrite \(model.canWrite) profile \(model.profile) follows \(model.streamFollowsCurrentProfile) error \(model.taskLoadError ?? "nil") ops \(served.suffix(14))")
        await inner.delete()
        await inner.push(HitShapeInner.Frames.frame4, id: "4")
        var stuck = false
        for _ in 0..<1000 where !stuck { stuck = await inner.stuckStarted; if !stuck { try? await Task.sleep(for: .milliseconds(5)) } }
        #expect(stuck, "the refresh's scheduled read is the one that never returns")
        await inner.push(HitShapeInner.Frames.frame5, id: "5")
        await inner.push(HitShapeInner.Frames.frame6, id: "6")
        #expect(await until(5) { model.profile == "work" }, "the model left the deleted Profile: \(model.profile)")
    }
}

/// MAC-C11-S1-19 (follow-up 94): an admitted inner send can be past its last cancellation check
/// and on its way to `dataTask` when the transport retires; the session must not be invalidated
/// before it ends, or URLSession throws an uncaught NSGenericException ("Task created in a session
/// that has been invalidated") and the process aborts. The gate stands where URLSessionTransport's
/// bufferedRequest stands after its last check (the correctness seat's probe), and the three
/// orders are forced: retire before the inner send starts, between its start and `dataTask`, and
/// after `dataTask`. In each the awaiter returns at once (S1-39) and the session is invalidated
/// only after the inner send has ended.
private final class CreationGate: ClientTransport, @unchecked Sendable {
    let session: URLSession, createFirst: Bool
    let entered = DispatchSemaphore(value: 0), proceed = DispatchSemaphore(value: 0)
    private let lock = NSLock(); private var calls = 0, created = 0
    var entries: Int { lock.withLock { calls } }
    var tasksCreated: Int { lock.withLock { created } }
    init(_ session: URLSession, createFirst: Bool) { self.session = session; self.createFirst = createFirst }
    /// Blocks this pool thread (synchronous, so it can be called from the async send).
    private func holdHere() { proceed.wait() }
    private func create() {
        let task = session.dataTask(with: URL(string: "http://127.0.0.1:9/health")!)
        task.cancel(); lock.withLock { created += 1 }
    }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        lock.withLock { calls += 1 }
        if createFirst { create() }
        entered.signal()
        holdHere() // a pool thread past its last check, as the library's send
        if !createFirst { create() }
        throw CancellationError()
    }
}

@Suite(.serialized) struct RetireWhileASendCreatesItsTaskTests {
    private func waitUntil(_ seconds: Double, _ condition: () -> Bool) async -> Bool {
        let deadline = ProcessInfo.processInfo.systemUptime + seconds
        while ProcessInfo.processInfo.systemUptime < deadline { if condition() { return true }; try? await Task.sleep(for: .milliseconds(5)) }
        return condition()
    }
    private func wait(_ semaphore: DispatchSemaphore) async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in DispatchQueue.global().async { semaphore.wait(); done.resume() } }
    }
    private func start(_ transport: ScopedTransport) -> (Task<Void, Never>, Finished) {
        let finished = Finished()
        let call = Task {
            do { _ = try await transport.send(HTTPRequest(method: .get, scheme: "http", authority: "127.0.0.1:9", path: "/health"), body: nil, baseURL: URL(string: "http://127.0.0.1:9")!, operationID: "system.health"); finished.set("returned") }
            catch is CancellationError { finished.set("cancelled") }
            catch { finished.set("other: \(error)") }
        }
        return (call, finished)
    }

    /// The seat's order: the inner send is between its start and `dataTask` when the transport
    /// retires. Red without the fix: the process aborts creating the task.
    @Test func retireBetweenTheInnerSendsStartAndItsDataTask() async throws {
        let probe = InvalidationProbe()
        let session = URLSession(configuration: .ephemeral, delegate: probe, delegateQueue: nil)
        let gate = CreationGate(session, createFirst: false)
        let transport = ScopedTransport(session: session, base: gate)
        let (call, finished) = start(transport)
        await wait(gate.entered)
        transport.retire()
        #expect(await waitUntil(1) { finished.value != nil } && finished.value == "cancelled", "the awaiter returns at once")
        try? await Task.sleep(for: .milliseconds(150))
        #expect(!transport.sessionInvalidated && !probe.invalidated, "the session waits for the running send")
        gate.proceed.signal()
        #expect(await waitUntil(2) { probe.invalidated }, "invalidated once the inner send ended")
        #expect(gate.tasksCreated == 1, "the data task was created on a live session")
        #expect(transport.releaseCounts == .init(releasedEarly: 1, notEnded: 0, lateEnded: 1, invalidatedWithRunning: 0))
        await call.value
    }

    /// The transport retires before the inner send has started: it finds the cancellation, never
    /// reaches the base, and the session is invalidated as soon as it has ended.
    @Test func retireBeforeTheInnerSendStarts() async throws {
        let probe = InvalidationProbe()
        let session = URLSession(configuration: .ephemeral, delegate: probe, delegateQueue: nil)
        let gate = CreationGate(session, createFirst: false)
        let transport = ScopedTransport(session: session, base: gate)
        let started = DispatchSemaphore(value: 0), go = DispatchSemaphore(value: 0)
        transport.innerStartHook = { started.signal(); go.wait() }
        let (call, finished) = start(transport)
        await wait(started)
        transport.retire()
        #expect(await waitUntil(1) { finished.value != nil } && finished.value == "cancelled", "the awaiter returns at once")
        try? await Task.sleep(for: .milliseconds(150))
        #expect(!transport.sessionInvalidated && !probe.invalidated, "the session waits for the admitted send")
        go.signal()
        #expect(await waitUntil(2) { probe.invalidated }, "invalidated once the inner send ended")
        #expect(gate.entries == 0, "the inner send stopped at its cancellation check")
        await call.value
    }

    /// The inner send has created its task and is waiting for the reply when the transport retires.
    @Test func retireAfterTheDataTask() async throws {
        let probe = InvalidationProbe()
        let session = URLSession(configuration: .ephemeral, delegate: probe, delegateQueue: nil)
        let gate = CreationGate(session, createFirst: true)
        let transport = ScopedTransport(session: session, base: gate)
        let (call, finished) = start(transport)
        await wait(gate.entered)
        transport.retire()
        #expect(await waitUntil(1) { finished.value != nil } && finished.value == "cancelled", "the awaiter returns at once")
        try? await Task.sleep(for: .milliseconds(150))
        #expect(!transport.sessionInvalidated && !probe.invalidated, "the session waits for the running send")
        gate.proceed.signal()
        #expect(await waitUntil(2) { probe.invalidated }, "invalidated once the inner send ended")
        #expect(gate.tasksCreated == 1)
        await call.value
    }
}

/// The stress's scope check that failed once in 3,000 with S1-19's fix (correctness seat, ASan run
/// 3, iteration 2314): a send admitted under the old credential whose inner send started after the
/// credential change, and so after the recorder's next scope began, was recorded in that scope
/// (`reads.profiles`, started and finished there under the old refresh's id). Before the fix that
/// same window aborted the process (S1-19). The scope is now read at admission and carried to the
/// inner send; the recorder records a request only in the scope it was admitted in.
private struct ReplyOK: ClientTransport {
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody("[]"))
    }
}
private final class GateInFront: ClientTransport, @unchecked Sendable {
    let base: any ClientTransport
    let entered = DispatchSemaphore(value: 0), proceed = DispatchSemaphore(value: 0)
    init(_ base: any ClientTransport) { self.base = base }
    private func holdHere() { proceed.wait() }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        entered.signal(); holdHere()
        return try await base.send(request, body: body, baseURL: baseURL, operationID: operationID)
    }
}

@Suite(.serialized) struct AdmittedScopeTests {
    @Test(arguments: [false, true])
    func aSendIsRecordedOnlyInTheScopeItWasAdmittedIn(nextScopeBegins: Bool) async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("admitted-scope-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: directory); recorder.authorizeOwnerSession(true)
        let gate = GateInFront(DiagnosticTransport(transport: ReplyOK(), recorder: recorder))
        let transport = ScopedTransport(session: URLSession(configuration: .ephemeral), base: gate, scopeToken: { recorder.scopeToken })
        let call = Task { try await transport.send(HTTPRequest(method: .get, scheme: "http", authority: "127.0.0.1:1", path: "/profiles"), body: nil, baseURL: URL(string: "http://127.0.0.1:1")!, operationID: "reads.profiles") }
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in DispatchQueue.global().async { gate.entered.wait(); done.resume() } }
        if nextScopeBegins { recorder.clear(); recorder.authorizeOwnerSession(true) } // the next credential's scope
        gate.proceed.signal()
        _ = try await call.value
        let requests = (await recorder.snapshot()).requests
        #expect(requests == (nextScopeBegins ? 0 : 1), "requests recorded: \(requests)")
        await recorder.flush()
    }
}
