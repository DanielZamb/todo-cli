import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Every request of a client goes through this. A cancelled send, read or write, returns
/// CancellationError to its awaiter at once, whether its caller was cancelled or the transport was
/// retired, and never waits for the inner send: the library can keep a cancelled send from ever
/// returning although its reply reached the socket (S1-39, `reports/mac-s139-investigation.md`).
/// Today's caller already got CancellationError in both cases, whatever the inner send returned;
/// only the moment changes. Its late reply is dropped here and never reaches a caller.
///
/// The session is invalidated only when no admitted inner send can still create a task in it
/// (f7e0829e's invariant; MAC-C11-S1-19, follow-up 94): an inner send counts as running from its
/// admission until it ends, whether or not its awaiter was released. Creating a task on an
/// invalidated session throws an uncaught NSGenericException and aborts the process, and an inner
/// send can be past its last cancellation check, on its way to `dataTask`, when the transport
/// retires. The session is never invalidated while an admitted inner send has not ended: an inner
/// task that has not run yet (a starved executor, a suspended process) can still create its task.
/// An inner send that never ends (S1-39's lost send) does not keep its connection open for ever:
/// `stuckGrace` after the retirement every task of the session is cancelled (`getAllTasks`), which
/// closes its connections, and the sends still running are counted; the session itself stays valid
/// and is invalidated when they end. A send that creates its task after that runs into its own
/// cancellation (the inner task was cancelled at the retirement), and nothing throws.
final class ScopedTransport: ClientTransport, @unchecked Sendable {
    private typealias Response = (HTTPResponse, HTTPBody?)
    private enum State { case active, retiring, invalidated }
    private struct Pending {
        let task: Task<Void, Never>
        let continuation: CheckedContinuation<Response, Error>
    }
    /// Sends released before their inner send ended, those of them still not ended, and the replies
    /// that arrived after their release and were dropped (S1-39, for tests and Diagnostics).
    /// `runningAtGrace`: inner sends still running when the grace cancelled the session's tasks (the
    /// session waits for them; one that never ends keeps it, without a connection).
    struct ReleaseCounts: Equatable, Sendable { var releasedEarly = 0, notEnded = 0, lateEnded = 0, runningAtGrace = 0 }
    private let lock = NSLock()
    private let session: URLSession
    private let base: any ClientTransport
    private var state = State.active
    private var sends: [UUID: Pending] = [:]
    private var abandoned: Set<UUID> = []
    /// Inner sends admitted and not yet ended, released or not: the session waits for them.
    private var running: Set<UUID> = []
    private var counts = ReleaseCounts()
    private let stuckGrace: TimeInterval
    /// Tests only: runs at the start of each inner send, before its cancellation check.
    var innerStartHook: (@Sendable () -> Void)?

    /// The Diagnostics recorder's scope token, read at each admission (nil without Diagnostics).
    private let scopeToken: (@Sendable () -> Int)?

    init(session: URLSession, base: any ClientTransport, stuckGrace: TimeInterval = 10, scopeToken: (@Sendable () -> Int)? = nil) {
        self.session = session; self.base = base; self.stuckGrace = stuckGrace; self.scopeToken = scopeToken
    }

    /// Whether the session has been invalidated (for tests).
    var sessionInvalidated: Bool { lock.withLock { if case .invalidated = state { true } else { false } } }

    var releaseCounts: ReleaseCounts { lock.withLock { counts } }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let id = UUID()
        // Read before admission: the retirement precedes the recorder's next scope, so an admitted
        // send never carries a newer scope than its own.
        let admittedScope = scopeToken?()
        do {
            let response = try await withTaskCancellationHandler {
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Response, Error>) in
                    let started: Bool = lock.withLock {
                        guard case .active = state, !Task.isCancelled else { return false }
                        let transport = base, hook = innerStartHook
                        let task = ClientDiagnosticContext.$admittedScope.withValue(admittedScope) {
                            Task {
                                do {
                                    hook?()
                                    try Task.checkCancellation()
                                    self.ended(id, .success(try await transport.send(request, body: body, baseURL: baseURL, operationID: operationID)))
                                } catch {
                                    self.ended(id, .failure(error))
                                }
                            }
                        }
                        sends[id] = Pending(task: task, continuation: continuation)
                        running.insert(id)
                        return true
                    }
                    if !started { continuation.resume(throwing: CancellationError()) }
                }
            } onCancel: { self.release(id) }
            try Task.checkCancellation()
            try lock.withLock { guard case .active = state else { throw CancellationError() } }
            return response
        } catch {
            let active = lock.withLock { if case .active = state { true } else { false } }
            if Task.isCancelled || !active { throw CancellationError() }
            throw error
        }
    }

    func retire() {
        let released: [Pending] = lock.withLock {
            guard case .active = state else { return [] }
            state = .retiring
            let pending = Array(sends.values)
            for id in sends.keys { abandoned.insert(id) }
            counts.releasedEarly += pending.count
            counts.notEnded += pending.count
            sends.removeAll()
            invalidateIfDrainedLocked()
            return pending
        }
        for pending in released {
            pending.continuation.resume(throwing: CancellationError())
            pending.task.cancel()
        }
        // Inner sends may still be running: the session waits for them; after stuckGrace their
        // tasks are cancelled so a stuck one does not keep its connection.
        if !sessionInvalidated {
            DispatchQueue.global().asyncAfter(deadline: .now() + stuckGrace) { [self] in cancelAfterGrace() }
        }
    }

    /// The grace after the retirement is over and inner sends are still running: cancel every task
    /// the session has (closing their connections), count them, and keep the session valid, so a
    /// send whose task is created later cannot make URLSession throw.
    private func cancelAfterGrace() {
        let stuck: Bool = lock.withLock {
            guard case .retiring = state, !running.isEmpty else { return false }
            counts.runningAtGrace += running.count
            return true
        }
        guard stuck else { return }
        session.getAllTasks { tasks in tasks.forEach { $0.cancel() } }
    }

    /// The caller was cancelled: its awaiter returns now; the inner send is cancelled and may end
    /// later, or never.
    private func release(_ id: UUID) {
        let pending: Pending? = lock.withLock {
            guard let pending = sends.removeValue(forKey: id) else { return nil }
            abandoned.insert(id)
            counts.releasedEarly += 1
            counts.notEnded += 1
            invalidateIfDrainedLocked()
            return pending
        }
        guard let pending else { return }
        pending.continuation.resume(throwing: CancellationError())
        pending.task.cancel()
    }

    /// The inner send ended: its awaiter gets the result, unless it was released already, in which
    /// case the result is dropped here.
    private func ended(_ id: UUID, _ result: Result<Response, Error>) {
        let continuation: CheckedContinuation<Response, Error>? = lock.withLock {
            running.remove(id)
            defer { invalidateIfDrainedLocked() }
            if let pending = sends.removeValue(forKey: id) { return pending.continuation }
            if abandoned.remove(id) != nil {
                counts.notEnded -= 1
                counts.lateEnded += 1
            }
            return nil
        }
        continuation?.resume(with: result)
    }

    private func invalidateIfDrainedLocked() {
        guard case .retiring = state, sends.isEmpty, running.isEmpty else { return }
        state = .invalidated
        session.invalidateAndCancel()
    }
}
