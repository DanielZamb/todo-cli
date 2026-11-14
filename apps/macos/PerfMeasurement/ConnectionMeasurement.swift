import Foundation
import Darwin
import PerfDescriptors
import Testing
import TodoAPI
@testable import TodoState

@MainActor struct MacConnectionMeasurement {
    @Test func session() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let address = env["MAC_PERF_SERVER"] else { return }
        var inherited = rlimit()
        _ = getrlimit(RLIMIT_NOFILE, &inherited)
        var requested = inherited
        requested.rlim_cur = rlim_t(Int(env["MAC_PERF_NOFILE"] ?? "256")!)
        try #require(setrlimit(RLIMIT_NOFILE, &requested) == 0)
        let nativeSession = env["MAC_PERF_NATIVE_SESSION"] == "1"
        let server = URL(string: address)!
        let outputURL = URL(fileURLWithPath: env["MAC_PERF_OUTPUT"]!)
        try #require(FileManager.default.createFile(atPath: outputURL.path, contents: nil))
        let writer = try FileHandle(forWritingTo: outputURL)
        defer { try? writer.close() }
        let credential = env["MAC_PERF_CREDENTIAL"]!
        let maximum = Int(env["MAC_PERF_REFRESHES"] ?? "300")!
        let trace = PerfConnectionTrace.shared
        trace.configure(env["MAC_PERF_CONNECTION_POLICY"] ?? "fresh")
        defer { trace.cleanup() }
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-mac-perf"), clientFactory: { url, _ in todoClient(server: url, credential: credential) })
        model.signedIn = true; model.selectedView = "all"
        var limit = rlimit()
        _ = getrlimit(RLIMIT_NOFILE, &limit)
        func descriptors() throws -> [String: Any] {
            var count: Int32 = 0
            var sockets: Int32 = 0
            let begin = DispatchTime.now().uptimeNanoseconds
            try #require(mac_perf_descriptors(&count, &sockets) == 0)
            var currentLimit = rlimit()
            _ = getrlimit(RLIMIT_NOFILE, &currentLimit)
            return ["descriptors": count, "sockets": sockets, "softLimit": currentLimit.rlim_cur, "samplingMS": Double(DispatchTime.now().uptimeNanoseconds - begin) / 1_000_000]
        }
        var refreshes: [[String: Any]] = []
        var checkpoints: [[String: Any]] = []
        var rowSelection: [String: Any] = [:]
        for index in 1...maximum {
            trace.beginRefresh(index)
            let before = try descriptors()
            let start = DispatchTime.now().uptimeNanoseconds
            await model.refreshAfterWrite("Connection measurement")
            refreshes.append(["index": index, "elapsedMS": Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000, "before": before, "after": try descriptors()])
            if [1, 20, 300, maximum].contains(index) || model.taskLoadError != nil {
                let deadline = Date().addingTimeInterval(10)
                while model.taskLoadError == nil && trace.snapshot().filter({ nativeSession ? $0["status"] != nil : $0["responseEndMS"] != nil }).count < index * 8 && Date() < deadline { try await Task.sleep(for: .milliseconds(5)) }
                let rows = trace.snapshot()
                checkpoints.append(["index": index, "sessions": trace.sessionCounts(), "requests": rows.count, "completed": rows.filter { nativeSession ? $0["status"] != nil : $0["responseEndMS"] != nil }.count])
                if index == maximum && env["MAC_PERF_ROW_SELECTION"] == "1" { rowSelection = try await measureRowSelection(model) }
                let data = try JSONSerialization.data(withJSONObject: ["rowSelection": rowSelection, "inheritedSoftLimit": inherited.rlim_cur, "nofileSoft": limit.rlim_cur, "nofileHard": limit.rlim_max, "nativeSession": nativeSession, "measurementFDs": 1, "checkpoints": checkpoints, "refreshes": refreshes, "requests": rows], options: [.prettyPrinted, .sortedKeys])
                try writer.truncate(atOffset: 0)
                try writer.seek(toOffset: 0)
                try writer.write(contentsOf: data)
                try #require(model.tasks.count == 178 && model.tags.count == 39 && model.projects.count == 6, "Refresh failed: \(String(describing: model.taskLoadError))")
                try #require(rows.count == index * 8 && rows.allSatisfy { ($0["status"] as? Int) == 200 && $0["error"] == nil })
            }
        }
    }
}
