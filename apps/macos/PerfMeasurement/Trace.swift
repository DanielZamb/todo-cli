import Foundation

@MainActor public enum PerfSearchInput {
    public static var applied = ""
}

public final class PerfTrace: @unchecked Sendable {
    public static func record(_ error: any Error) {
        if let path = ProcessInfo.processInfo.environment["MAC_PERF_OUTPUT"] {
            try? Data(String(reflecting: error).utf8).write(to: URL(fileURLWithPath: path + ".stream-error.txt"))
        }
    }
    public static let shared = PerfTrace()
    @TaskLocal public static var refreshID: String?
    private let lock = NSLock()
    private var next = 0
    private var rows: [[String: Double]] = []
    private var events: [Int64] = []
    public func consumed(_ sequence: Int64) { lock.lock(); events.append(sequence); lock.unlock() }
    public func operations() -> [Int64] { lock.lock(); defer { lock.unlock() }; return events }
    public func begin() -> String {
        lock.lock(); defer { lock.unlock() }
        next += 1
        rows.append(["id": Double(next), "startMS": Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000, "decodeMS": 0, "decodeOffMainMS": 0])
        return String(next)
    }
    public func end(_ id: String) {
        lock.lock(); defer { lock.unlock() }
        if let index = rows.firstIndex(where: { $0["id"] == Double(id) }) { rows[index]["endMS"] = Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000 }
    }
    public static func decode<T>(_ action: () throws -> T) rethrows -> T {
        let start = DispatchTime.now().uptimeNanoseconds
        defer {
            if let id = refreshID {
                let elapsed = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
                shared.lock.lock()
                if let index = shared.rows.firstIndex(where: { $0["id"] == Double(id) }) {
                    shared.rows[index][Thread.isMainThread ? "decodeMS" : "decodeOffMainMS", default: 0] += elapsed
                }
                shared.lock.unlock()
            }
        }
        return try action()
    }
    public func snapshot() -> [[String: Double]] { lock.lock(); defer { lock.unlock() }; return rows }
}
