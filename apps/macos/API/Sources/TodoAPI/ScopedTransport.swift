import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Every request of a client goes through this. A cancelled send, read or write, returns
/// CancellationError to its awaiter at once, whether its caller was cancelled or the transport was
/// retired, and never waits for the inner send: the library can keep a cancelled send from ever
/// returning although its reply reached the socket (S1-39, `reports/mac-s139-investigation.md`).
/// Today's caller already got CancellationError in both cases, whatever the inner send returned;
/// only the moment changes. A send released early counts as finished for the drain, so a retiring
/// transport invalidates its session even if an inner send never ends; its late reply is dropped
/// here and never reaches a caller.
final class ScopedTransport: ClientTransport, @unchecked Sendable {
    private typealias Response = (HTTPResponse, HTTPBody?)
    private enum State { case active, retiring, invalidated }
    private struct Pending {
        let task: Task<Void, Never>
        let continuation: CheckedContinuation<Response, Error>
    }
    /// Sends released before their inner send ended, those of them still not ended, and the replies
    /// that arrived after their release and were dropped (S1-39, for tests and Diagnostics).
    struct ReleaseCounts: Equatable, Sendable { var releasedEarly = 0, notEnded = 0, lateEnded = 0 }
    private let lock = NSLock()
    private let session: URLSession
    private let base: any ClientTransport
    private var state = State.active
    private var sends: [UUID: Pending] = [:]
    private var abandoned: Set<UUID> = []
    private var counts = ReleaseCounts()

    init(session: URLSession, base: any ClientTransport) { self.session = session; self.base = base }

    var releaseCounts: ReleaseCounts { lock.withLock { counts } }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let id = UUID()
        do {
            let response = try await withTaskCancellationHandler {
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Response, Error>) in
                    let started: Bool = lock.withLock {
                        guard case .active = state, !Task.isCancelled else { return false }
                        let transport = base
                        let task = Task {
                            do {
                                try Task.checkCancellation()
                                self.ended(id, .success(try await transport.send(request, body: body, baseURL: baseURL, operationID: operationID)))
                            } catch {
                                self.ended(id, .failure(error))
                            }
                        }
                        sends[id] = Pending(task: task, continuation: continuation)
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
            if let pending = sends.removeValue(forKey: id) {
                invalidateIfDrainedLocked()
                return pending.continuation
            }
            if abandoned.remove(id) != nil {
                counts.notEnded -= 1
                counts.lateEnded += 1
            }
            return nil
        }
        continuation?.resume(with: result)
    }

    private func invalidateIfDrainedLocked() {
        guard case .retiring = state, sends.isEmpty else { return }
        state = .invalidated
        session.invalidateAndCancel()
    }
}
