import Foundation
import HTTPTypes
import OpenAPIRuntime

private final class WeakSession {
    weak var value: URLSession?
    init(_ value: URLSession) { self.value = value }
}
struct PerfSession {
    let session: URLSession
    let id: Int
}

public final class PerfConnectionTrace: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    public static let shared = PerfConnectionTrace()
    private let lock = NSLock()
    private var policy = "fresh"
    private var context = 0
    private var nextRequest = 0
    private var nextSession = 0
    private var reused: PerfSession?
    private var weakSessions: [WeakSession] = []
    private var rows: [String: [String: Any]] = [:]
    private let run = UUID().uuidString

    public func configure(_ policy: String) {
        lock.lock(); self.policy = policy; lock.unlock()
    }
    public func beginRefresh(_ index: Int) {
        lock.lock(); context = index; lock.unlock()
    }
    func session(_ configuration: URLSessionConfiguration) -> PerfSession {
        lock.lock(); defer { lock.unlock() }
        if policy == "reused", let reused { return reused }
        nextSession += 1
        let delegate: (any URLSessionDelegate)? = ProcessInfo.processInfo.environment["MAC_PERF_NATIVE_SESSION"] == "1" ? nil : self
        let value = PerfSession(session: URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil), id: nextSession)
        weakSessions.append(WeakSession(value.session))
        if policy == "reused" { reused = value }
        return value
    }
    func started(factoryMS: Double, sessionID: Int, path: String) -> String {
        lock.lock(); defer { lock.unlock() }
        nextRequest += 1
        let id = "\(run)-\(nextRequest)"
        rows[id] = ["id": id, "ordinal": nextRequest, "refresh": context, "session": sessionID, "path": path, "factoryStartMS": factoryMS, "middlewareStartMS": Date().timeIntervalSince1970 * 1000]
        return id
    }
    func headers(_ id: String, status: Int) {
        lock.lock(); defer { lock.unlock() }
        rows[id]?["headersReturnedMS"] = Date().timeIntervalSince1970 * 1000
        rows[id]?["status"] = status
    }
    public func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        for transaction in metrics.transactionMetrics {
            guard let id = transaction.request.value(forHTTPHeaderField: "X-Mac-Perf-ID") else { continue }
            var values: [String: Any] = ["taskStartMS": metrics.taskInterval.start.timeIntervalSince1970 * 1000, "taskEndMS": metrics.taskInterval.end.timeIntervalSince1970 * 1000, "reused": transaction.isReusedConnection, "protocol": transaction.networkProtocolName ?? "unknown", "bytesReceived": transaction.countOfResponseBodyBytesReceived]
            for (name, date) in [("fetchStartMS", transaction.fetchStartDate), ("dnsStartMS", transaction.domainLookupStartDate), ("dnsEndMS", transaction.domainLookupEndDate), ("connectStartMS", transaction.connectStartDate), ("connectEndMS", transaction.connectEndDate), ("requestStartMS", transaction.requestStartDate), ("requestEndMS", transaction.requestEndDate), ("responseStartMS", transaction.responseStartDate), ("responseEndMS", transaction.responseEndDate)] {
                if let date { values[name] = date.timeIntervalSince1970 * 1000 }
            }
            if let port = transaction.localPort { values["localPort"] = port }
            if let port = transaction.remotePort { values["remotePort"] = port }
            lock.lock()
            for (key, value) in values { rows[id]?[key] = value }
            lock.unlock()
        }
    }
    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        guard let id = task.originalRequest?.value(forHTTPHeaderField: "X-Mac-Perf-ID"), let error else { return }
        lock.lock(); defer { lock.unlock() }
        rows[id]?["error"] = String(reflecting: error)
    }
    public func snapshot() -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        return rows.values.sorted { ($0["ordinal"] as! Int) < ($1["ordinal"] as! Int) }
    }
    public func sessionCounts() -> [String: Int] {
        lock.lock(); defer { lock.unlock() }
        return ["created": nextSession, "alive": weakSessions.filter { $0.value != nil }.count]
    }
    public func cleanup() {
        lock.lock()
        let sessions = weakSessions.compactMap(\.value)
        reused = nil
        lock.unlock()
        for session in sessions { session.invalidateAndCancel() }
    }
}

struct PerfConnectionTiming: ClientMiddleware {
    let factoryStartMS: Double
    let sessionID: Int
    func intercept(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String, next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        let id = PerfConnectionTrace.shared.started(factoryMS: factoryStartMS, sessionID: sessionID, path: request.path ?? "")
        request.headerFields[HTTPField.Name("X-Mac-Perf-ID")!] = id
        let (response, body) = try await next(request, body, baseURL)
        PerfConnectionTrace.shared.headers(id, status: response.status.code)
        return (response, body)
    }
}
