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
/// retires. An inner send that never ends (S1-39's lost send) does not keep the session for ever:
/// `stuckGrace` after the retirement the session is invalidated anyway, which cancels its tasks and
/// closes its sockets, and the sends still running then are counted. By then a send admitted before
/// the retirement is long past the creation of its task (microseconds after admission).
final class ScopedTransport: ClientTransport, @unchecked Sendable {
    private typealias Response = (HTTPResponse, HTTPBody?)
    private enum State { case active, retiring, invalidated }
    private struct Pending {
        let task: Task<Void, Never>
        let continuation: CheckedContinuation<Response, Error>
    }
    /// Sends released before their inner send ended, those of them still not ended, and the replies
    /// that arrived after their release and were dropped (S1-39, for tests and Diagnostics).
    /// `invalidatedWithRunning`: inner sends still running when the grace invalidated the session.
    struct ReleaseCounts: Equatable, Sendable { var releasedEarly = 0, notEnded = 0, lateEnded = 0, invalidatedWithRunning = 0 }
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
        // Inner sends may still be running: the session waits for them, at most stuckGrace.
        if !sessionInvalidated {
            DispatchQueue.global().asyncAfter(deadline: .now() + stuckGrace) { [self] in invalidateAfterGrace() }
        }
    }

    /// The grace after the retirement is over: an inner send still running is stuck past the
    /// creation of its task, so invalidating now cancels it and closes the session's sockets.
    private func invalidateAfterGrace() {
        lock.withLock {
            guard case .retiring = state else { return }
            counts.invalidatedWithRunning += running.count
            state = .invalidated
            session.invalidateAndCancel()
        }
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
