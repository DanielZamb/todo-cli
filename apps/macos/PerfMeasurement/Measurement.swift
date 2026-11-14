import AppKit
import Foundation
import SwiftUI
import Testing
import TodoAPI
import OpenAPIRuntime
import OpenAPIURLSession
import HTTPTypes
@testable import TodoState

private struct MeasurementHeader: ClientMiddleware {
    func intercept(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String, next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if let id = PerfTrace.refreshID { request.headerFields[HTTPField.Name("X-Mac-Perf-Refresh")!] = id }
        return try await next(request, body, baseURL)
    }
}

private func measurementClient(server: URL, credential: String) -> Client {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = 60
    configuration.timeoutIntervalForResource = 86_400
    configuration.urlCache = nil
    return Client(serverURL: server, transport: URLSessionTransport(configuration: .init(session: URLSession(configuration: configuration))), middlewares: [BearerMiddleware(credential: credential), MeasurementHeader()])
}

@MainActor private final class MainLoopMeter {
    var observer: CFRunLoopObserver?
    var start: UInt64?
    var intervals: [Double] = []
    func install() {
        observer = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.allActivities.rawValue, true, Int.max) { [weak self] _, activity in
            MainActor.assumeIsolated {
                guard let self else { return }
                let now = DispatchTime.now().uptimeNanoseconds
                if activity == .afterWaiting || activity == .entry { if self.start == nil { self.start = now } }
                if activity == .beforeWaiting || activity == .exit, let start = self.start {
                    self.intervals.append(Double(now - start) / 1_000_000)
                    self.start = nil
                }
            }
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
    }
    func reset() { intervals = []; start = DispatchTime.now().uptimeNanoseconds }
    func finish() -> [String: Double] {
        if let start { intervals.append(Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000) }
        self.start = nil
        return ["longestBusyMS": intervals.max() ?? 0, "totalBusyMS": intervals.reduce(0, +), "busyStretches": Double(intervals.count)]
    }
    func stop() { if let observer { CFRunLoopRemoveObserver(CFRunLoopGetMain(), observer, .commonModes) } }
}

@MainActor private final class StateMeter {
    let model: TodoModel?
    var notWritableMS = 0.0
    var loadingMS = 0.0
    var busyMS = 0.0
    var longestGapMS = 0.0
    var totalDelayedMS = 0.0
    var previousSample = DispatchTime.now().uptimeNanoseconds
    var previousWritable: Bool
    var previousLoading: Bool
    var previousBusy: Bool
    init(model: TodoModel?) {
        self.model = model
        previousWritable = model?.canWrite ?? false
        previousLoading = model?.loading ?? false
        previousBusy = model?.busy ?? false
    }
    func sample() {
        let now = DispatchTime.now().uptimeNanoseconds
        let delta = Double(now - previousSample) / 1_000_000
        longestGapMS = max(longestGapMS, delta)
        if delta > 6 { totalDelayedMS += delta - 2 }
        if !previousWritable { notWritableMS += delta }
        if previousLoading { loadingMS += delta }
        if previousBusy { busyMS += delta }
        previousSample = now
        previousWritable = model?.canWrite ?? false
        previousLoading = model?.loading ?? false
        previousBusy = model?.busy ?? false
    }
}

@MainActor struct MacPerformanceMeasurement {
    @Test func session() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let address = env["MAC_PERF_SERVER"] else { return }
        let server = URL(string: address)!
        let output = URL(fileURLWithPath: env["MAC_PERF_OUTPUT"]!)
        NSApplication.shared.setActivationPolicy(.prohibited)
        let meter = MainLoopMeter()
        meter.install()
        defer { meter.stop() }
        var rows: [[String: Any]] = []
        var windows: [NSWindow] = []
        defer { for window in windows { window.close() } }
        func control(_ path: String) async throws -> Data {
            let (data, response) = try await URLSession.shared.data(from: server.appending(path: "__perf/" + path))
            #expect((response as? HTTPURLResponse)?.statusCode == 200)
            return data
        }
        var model: TodoModel!
        func measureView(_ view: AnyView, compact: Bool) -> Double {
            let start = DispatchTime.now().uptimeNanoseconds
            let host = NSHostingView(rootView: view.frame(width: compact ? 393 : 1000, height: compact ? 426 : 720))
            host.frame = NSRect(x: 0, y: 0, width: compact ? 393 : 1000, height: compact ? 426 : 720)
            host.layoutSubtreeIfNeeded()
            return Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
        }
        @MainActor func wait(seconds: Double = 600, _ predicate: @MainActor () -> Bool) async throws {
            let deadline = Date().addingTimeInterval(seconds)
            while !predicate() && Date() < deadline { try await Task.sleep(for: .milliseconds(5)) }
            try #require(predicate(), "session step did not reach its literal state")
        }
        func layout(_ compact: Bool) -> Double {
            guard let model else { return 0 }
            let start = DispatchTime.now().uptimeNanoseconds
            let view = compact
                ? AnyView(TaskListView(model: model, compactMode: true).taskContent)
                : AnyView(HStack(spacing: 0) { TaskListView(model: model).sidebar.frame(width: 220); TaskListView(model: model).taskContent })
            let host = NSHostingView(rootView: view.frame(width: compact ? 393 : 1280, height: compact ? 426 : 820))
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: compact ? 393 : 1280, height: compact ? 426 : 820), styleMask: [.titled], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentView = host
            host.frame = NSRect(x: 0, y: 0, width: compact ? 393 : 1280, height: compact ? 426 : 820)
            host.layoutSubtreeIfNeeded()
            let elapsed = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
            windows.append(window)
            return elapsed
        }
        @MainActor func step(_ name: String, _ action: @MainActor () async throws -> Void) async throws {
            _ = try await control("start/" + name)
            let priorRefreshes = PerfTrace.shared.snapshot().count
            let priorOperations = PerfTrace.shared.operations().count
            let priorReconnects = model?.reconnectCount ?? 0
            let stateMeter = StateMeter(model: model)
            let observer = Task { @MainActor in
                while !Task.isCancelled { stateMeter.sample(); try? await Task.sleep(for: .milliseconds(2)) }
            }
            defer { observer.cancel() }
            meter.reset()
            let start = DispatchTime.now().uptimeNanoseconds
            try await action()
            try await Task.sleep(for: .milliseconds(30))
            for window in windows { window.contentView?.layoutSubtreeIfNeeded() }
            stateMeter.sample()
            observer.cancel()
            let busy = meter.finish()
            let elapsed = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
            let counts = try #require(JSONSerialization.jsonObject(with: await control("end/" + name)) as? [String: Any])
            for window in windows { window.close() }
            windows = []
            let compact = layout(true)
            let full = layout(false)
            rows.append(["step": name, "elapsedMS": elapsed, "mainLoop": busy, "actorHeartbeat": ["longestUnservicedMS": max(0, stateMeter.longestGapMS - 2), "totalDelayedMS": stateMeter.totalDelayedMS], "reconnects": (model?.reconnectCount ?? 0) - priorReconnects, "requests": counts["requests"]!, "wireEvents": counts["operationEvents"]!, "operationEvents": Array(PerfTrace.shared.operations().dropFirst(priorOperations)), "refreshes": Array(PerfTrace.shared.snapshot().dropFirst(priorRefreshes)), "notWritableMS": stateMeter.notWritableMS, "loadingMS": stateMeter.loadingMS, "busyMS": stateMeter.busyMS, "compactLayoutMS": compact, "fullLayoutMS": full, "taskCount": model?.tasks.count ?? 0])
            try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys]).write(to: output)
        }
        try await step("sign-in-equivalent") {
            let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
            model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-mac-perf"), clientFactory: { url, _ in measurementClient(server: url, credential: credential) })
            model.selectedView = "all"
            model.signedIn = true
        }
        defer { model.signedIn = false; model.connect() }
        try await step("first-load") {
            await model.refreshAfterWrite("Measurement")
            try #require(model.tasks.count == 180 && model.tags.count == 70 && model.projects.count == 12)
        }
        try await step("stream-ready") { model.connect(); try await wait(seconds: 10) { model.connection == .live && !model.loading } }
        for index in 0..<10 {
            try await step("cli-operation-\(index)") {
                let previous = model.lastSequence
                _ = try await control("edit/\(index)")
                try await wait { model.lastSequence != previous && model.tasks.contains { $0.title == "Live edit \(index)" } }
            }
        }
        try await step("profile-switch") { model.changeProfile("personal"); try await wait { model.connection == .live && !model.loading && model.tasks.count == 180 } }
        try await step("open-task") {
            model.beginEditing(model.tasks[0]); try #require(model.editor != nil)
            _ = measureView(AnyView(EditorView(model: model, compact: true)), compact: true)
            _ = measureView(AnyView(EditorView(model: model)), compact: false)
        }
        // DEPENDENCY_STEPS
        model.editor = nil
        try await step("idle-baseline") { try await Task.sleep(for: .seconds(1)) }
        try await step("idle-end-reconnect") {
            let previous = model.reconnectCount
            _ = try await control("close-stream")
            try await wait { model.reconnectCount > previous && model.connection == .live && !model.loading }
        }
        for backlog in [0, 50, 300] {
            model.changeProfile("work")
            try await wait { model.connection == .live && !model.loading }
            let boundary = try #require(JSONSerialization.jsonObject(with: await control("backlog/\(backlog)")) as? [String: String])
            UserDefaults.standard.set(boundary["before"], forKey: "cursor.unused-mac-perf.\(server.absoluteString).personal")
            var toLive = 0.0
            try await step("profile-switch-backlog-\(backlog)") {
                let start = DispatchTime.now().uptimeNanoseconds
                model.changeProfile("personal")
                try await wait { model.connection == .live && !model.loading }
                toLive = Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
                if backlog > 0 { try await wait { (Int64(model.lastSequence ?? "0") ?? 0) >= Int64(boundary["after"]!)! } }
            }
            rows[rows.count - 1]["switchToLiveMS"] = toLive
        }
        try await wait { model.canWrite && !model.loading }
        try await step("own-complete-with-echo") {
            let task = try #require(model.tasks.first { $0.title == "Measurement Task 100" })
            await model.transition(task, action: "complete")
            let cursor = try #require(JSONSerialization.jsonObject(with: await control("cursor")) as? [String: String])
            try await wait { (Int64(model.lastSequence ?? "0") ?? 0) >= Int64(cursor["after"]!)! }
            try #require(model.tasks.first { $0.id == task.id }?.status == "done")
        }
        try await step("burst-20-cli") {
            let cursor = try #require(JSONSerialization.jsonObject(with: await control("burst")) as? [String: String])
            try await wait { (Int64(model.lastSequence ?? "0") ?? 0) >= Int64(cursor["after"]!)! && model.tasks.contains { $0.title == "Burst 19" } }
        }
        try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys]).write(to: output)
    }
}
