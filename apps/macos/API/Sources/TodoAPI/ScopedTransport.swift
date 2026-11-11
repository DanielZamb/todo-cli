import Foundation
import HTTPTypes
import OpenAPIRuntime

final class ScopedTransport: ClientTransport, @unchecked Sendable {
    private typealias Response = (HTTPResponse, HTTPBody?)
    private enum State { case active, retiring, invalidated }
    private let lock = NSLock()
    private let session: URLSession
    private let base: any ClientTransport
    private var state = State.active
    private var sends: [UUID: Task<Response, Error>] = [:]

    init(session: URLSession, base: any ClientTransport) { self.session = session; self.base = base }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let id = UUID()
        return try await withTaskCancellationHandler {
            let send = try lock.withLock {
                guard case .active = state else { throw CancellationError() }
                try Task.checkCancellation()
                let transport = base
                let task = Task {
                    try Task.checkCancellation()
                    return try await transport.send(request, body: body, baseURL: baseURL, operationID: operationID)
                }
                sends[id] = task
                return task
            }
            defer { finished(id) }
            do {
                let response = try await send.value
                try Task.checkCancellation()
                try lock.withLock { guard case .active = state else { throw CancellationError() } }
                return response
            } catch {
                let active = lock.withLock { if case .active = state { true } else { false } }
                if Task.isCancelled || !active { throw CancellationError() }
                throw error
            }
        } onCancel: { self.cancel(id) }
    }

    func retire() {
        let pending = lock.withLock {
            guard case .active = state else { return [Task<Response, Error>]() }
            state = .retiring
            invalidateIfDrainedLocked()
            return Array(sends.values)
        }
        for task in pending { task.cancel() }
    }

    private func cancel(_ id: UUID) {
        let task = lock.withLock { sends[id] }
        task?.cancel()
    }

    private func finished(_ id: UUID) {
        lock.withLock {
            sends.removeValue(forKey: id)
            invalidateIfDrainedLocked()
        }
    }

    private func invalidateIfDrainedLocked() {
        guard case .retiring = state, sends.isEmpty else { return }
        state = .invalidated
        session.invalidateAndCancel()
    }
}
