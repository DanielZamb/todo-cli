import ObjectiveC

@MainActor private final class RootLayoutPasses {
    var durations: [Double] = []
    private let view: NSView
    private let method: Method
    private let original: IMP
    private var replacement: IMP?
    init(_ view: NSView) {
        self.view = view
        let selector = #selector(NSView.layout)
        let inherited = class_getInstanceMethod(type(of: view), selector)!
        let original = method_getImplementation(inherited)
        class_addMethod(type(of: view), selector, original, method_getTypeEncoding(inherited))
        method = class_getInstanceMethod(type(of: view), selector)!
        self.original = original
        typealias Layout = @convention(c) (AnyObject, Selector) -> Void
        let invoke = unsafeBitCast(original, to: Layout.self)
        let block: @convention(block) (NSView) -> Void = { [weak self, weak view] receiver in
            let start = DispatchTime.now().uptimeNanoseconds
            invoke(receiver, selector)
            if receiver === view { MainActor.assumeIsolated { self?.durations.append(Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000) } }
        }
        replacement = imp_implementationWithBlock(block)
        method_setImplementation(method, replacement!)
    }
    func stop() { method_setImplementation(method, original); if let replacement { imp_removeBlock(replacement) }; replacement = nil }
    func reset() { durations.removeAll(keepingCapacity: true) }
}

@MainActor struct MacPerformanceMeasurement {
    @Test func session() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let address = env["MAC_PERF_SERVER"] else { return }
        let server = URL(string: address)!, output = URL(fileURLWithPath: env["MAC_PERF_OUTPUT"]!)
        NSApplication.shared.setActivationPolicy(.prohibited)
        func control(_ action: String) async throws -> Data { try await URLSession.shared.data(from: server.appending(path: "__perf/" + action)).0 }
        func wait(_ predicate: () -> Bool) async throws {
            let deadline = Date().addingTimeInterval(300)
            while !predicate() && Date() < deadline { try await Task.sleep(for: .milliseconds(5)) }
            try #require(predicate())
        }
        func textViews(_ root: NSView) -> [NSTextView] { (root as? NSTextView).map { [$0] } ?? root.subviews.flatMap(textViews) }
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        var results: [[String: Any]] = []
        for characters in [1260, 5000, 20000, 100000] {
            let setup = try #require(JSONSerialization.jsonObject(with: await control("description/\(characters)")) as? [String: String])
            let service = "unused-mac-inspector-\(characters)"
            UserDefaults.standard.set(setup["cursor"], forKey: "cursor.\(service).\(server.absoluteString).work")
            let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: service), clientFactory: { url, _ in measurementClient(server: url, credential: credential) })
            model.signedIn = true; model.selectedView = "all"
            await model.refreshAfterWrite("Inspector setup")
            let controller = NSHostingController(rootView: RootView(model: model, compactMode: .constant(false)).frame(width: 1280, height: 820))
            let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: 1280, height: 820), styleMask: [.titled], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false; window.contentViewController = controller
            defer { window.contentViewController = nil; window.close() }
            let passes = RootLayoutPasses(controller.view)
            defer { passes.stop() }
            let meter = MainLoopMeter(); meter.install()
            defer { meter.stop() }
            func record(_ step: String, _ action: () async throws -> Void) async throws {
                _ = try await control("start/\(step)"); passes.reset(); meter.reset()
                let start = ProcessInfo.processInfo.systemUptime
                try await action()
                controller.view.layoutSubtreeIfNeeded()
                try await Task.sleep(for: .milliseconds(100))
                controller.view.layoutSubtreeIfNeeded()
                let counts = try #require(JSONSerialization.jsonObject(with: await control("end/\(step)")) as? [String: Any])
                results.append(["step": step, "characters": characters, "elapsedMS": (ProcessInfo.processInfo.systemUptime - start) * 1000, "rootLayoutPassMS": passes.durations, "mainLoop": meter.finish(), "requests": counts["requests"]!, "operationEvents": counts["operationEvents"]!, "nativeDescriptionViews": textViews(window.contentView!).filter { $0.string.count == characters }.count])
                try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys]).write(to: output)
                try #require(!window.isVisible && window.attachedSheet == nil)
            }
            let task = try #require(model.tasks.first { $0.id == setup["task"] })
            try #require(task.description?.count == characters)
            try await record("open-inspector") {
                model.beginEditing(task)
                try await wait { !textViews(window.contentView!).filter { $0.string.count == characters }.isEmpty }
            }
            try await record("forced-root-layout") { window.setContentSize(.init(width: 1281, height: 820)); controller.view.needsLayout = true }
            try await record("one-refresh") { await model.refreshAfterWrite("Inspector refresh") }
            model.connect(); try await wait { model.connection == .live && !model.loading }
            try await record("one-stream-event") {
                _ = try await control("edit/0")
                let cursor = try #require(JSONSerialization.jsonObject(with: await control("cursor")) as? [String: String])
                try await wait { model.lastSequence == cursor["after"] }
            }
            try await record("idle-reconnect") {
                let before = model.reconnectCount
                _ = try await control("close-stream")
                try await wait { model.reconnectCount > before && model.connection == .live && !model.loading }
            }
            model.signedIn = false; model.connect(); model.editor = nil
        }
    }
}
