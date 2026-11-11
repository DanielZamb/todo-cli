@MainActor private final class SlowExtras {
    let base: StateMeter
    var emptyMS = 0.0
    var searchPendingMS = 0.0
    var pickerLoadingMS = 0.0
    var unusableMS = 0.0
    private let model: TodoModel
    private var previous = DispatchTime.now().uptimeNanoseconds
    private var wasEmpty: Bool
    private var wasSearching = false
    private var wasPicking = false
    init(model: TodoModel) {
        self.model = model
        base = StateMeter(model: model)
        wasEmpty = model.tasks.isEmpty
    }
    func sample(searching: Bool, picking: Bool) {
        let now = DispatchTime.now().uptimeNanoseconds
        let delta = Double(now - previous) / 1_000_000
        if wasEmpty { emptyMS += delta }
        if wasSearching { searchPendingMS += delta }
        if wasPicking { pickerLoadingMS += delta }
        if !base.previousWritable || base.previousLoading || wasEmpty || wasPicking { unusableMS += delta }
        base.sample()
        previous = now
        wasEmpty = model.tasks.isEmpty
        wasSearching = searching
        wasPicking = picking
    }
}

@MainActor struct MacPerformanceMeasurement {
    @Test func session() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let address = env["MAC_PERF_SERVER"] else { return }
        let server = URL(string: address)!
        let output = URL(fileURLWithPath: env["MAC_PERF_OUTPUT"]!)
        let workCount = Int(env["MAC_PERF_WORK_TASKS"] ?? "180")!
        let personalCount = Int(env["MAC_PERF_PERSONAL_TASKS"] ?? "80")!
        let completionTitle = env["MAC_PERF_COMPLETE_TITLE"] ?? "Measurement Task 100"
        NSApplication.shared.setActivationPolicy(.prohibited)
        let meter = MainLoopMeter()
        meter.install()
        defer { meter.stop() }
        var rows: [[String: Any]] = []
        var model: TodoModel!
        var window: NSWindow?
        defer { window?.contentViewController = nil; window?.close() }
        @MainActor func control(_ path: String) async throws -> [String: Any] {
            let (data, response) = try await URLSession.shared.data(from: server.appending(path: "__perf/" + path))
            try #require((response as? HTTPURLResponse)?.statusCode == 200)
            return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        }
        @MainActor func wait(_ predicate: @MainActor () -> Bool) async throws {
            let deadline = Date().addingTimeInterval(300)
            while !predicate() && Date() < deadline { try await Task.sleep(for: .milliseconds(5)) }
            try #require(predicate(), "slow-reply action did not reach its literal state")
        }
        @MainActor func attach(_ view: AnyView) {
            window?.contentViewController = nil
            window?.close()
            let controller = NSHostingController(rootView: view.frame(width: 1280, height: 820))
            let next = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 1280, height: 820), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
            next.isReleasedWhenClosed = false
            next.contentViewController = controller
            controller.view.frame = NSRect(x: 0, y: 0, width: 1280, height: 820)
            controller.view.layoutSubtreeIfNeeded()
            window = next
        }
        @MainActor func step(_ name: String, _ action: @MainActor () async throws -> Void) async throws {
            _ = try await control("start/" + name)
            let priorRefreshes = PerfTrace.shared.snapshot().count
            let priorOperations = PerfTrace.shared.operations().count
            let sampledModel: TodoModel = model
            let extras = SlowExtras(model: sampledModel)
            let state = extras.base
            let observer = Task { @MainActor in
                while !Task.isCancelled {
                    var wasSearching = false
                    var wasPicking = false
                    // SEARCH_STATE
                    // PICKER_STATE
                    extras.sample(searching: wasSearching, picking: wasPicking)
                    try? await Task.sleep(for: .milliseconds(2))
                }
            }
            meter.reset()
            let start = DispatchTime.now().uptimeNanoseconds
            try await action()
            try await Task.sleep(for: .milliseconds(30))
            window?.contentView?.layoutSubtreeIfNeeded()
            extras.sample(searching: false, picking: false); observer.cancel()
            let busy = meter.finish()
            let counts = try await control("end/" + name)
            try #require(!NSApplication.shared.windows.contains { $0.isVisible || $0.attachedSheet != nil })
            rows.append(["step": name, "elapsedMS": Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000, "mainLoop": busy, "actorHeartbeat": ["longestUnservicedMS": max(0, state.longestGapMS - 2)], "requests": counts["requests"]!, "operationEvents": Array(PerfTrace.shared.operations().dropFirst(priorOperations)), "refreshes": Array(PerfTrace.shared.snapshot().dropFirst(priorRefreshes)), "notWritableMS": state.notWritableMS, "loadingMS": state.loadingMS, "busyMS": state.busyMS, "listEmptyMS": extras.emptyMS, "searchPendingMS": extras.searchPendingMS, "pickerLoadingMS": extras.pickerLoadingMS, "unusableMS": extras.unusableMS, "compactLayoutMS": 0, "fullLayoutMS": 0, "taskCount": model.tasks.count])
            try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys]).write(to: output)
        }
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-mac-perf"), clientFactory: { url, _ in measurementClient(server: url, credential: credential) })
        model.selectedView = "all"; model.signedIn = true
        defer { model.signedIn = false; model.connect() }
        await model.refreshAfterWrite("Measurement")
        model.connect()
        try await wait { model.canWrite && !model.loading && model.tasks.count == workCount }
        attach(AnyView(RootView(model: model, compactMode: .constant(false))))
        _ = try await control("delay/" + (env["MAC_PERF_REPLY_DELAY_MS"] ?? "0"))
        try await step("own-complete-with-echo") {
            let task = try #require(model.tasks.first { $0.title == completionTitle })
            await model.transition(task, action: "complete")
            let cursor = try await control("cursor")
            let afterText = try #require(cursor["after"] as? String)
            let after = try #require(Int64(afterText))
            try await wait { (Int64(model.lastSequence ?? "0") ?? 0) >= after }
            try #require(model.tasks.first { $0.id == task.id }?.status == "done")
        }
        try await step("profile-switch") {
            model.changeProfile("personal")
            try await wait { model.canWrite && !model.loading && model.tasks.count == personalCount }
        }
        try await step("search-keystroke-series") {
            // SEARCH_ACTION
        }
        _ = try await control("delay/0")
        // CLEAR_SEARCH
        try await Task.sleep(for: .milliseconds(350))
        // PICKER_ACTION
    }
}
