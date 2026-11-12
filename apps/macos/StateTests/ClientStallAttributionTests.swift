import AppKit
import Darwin
import Foundation
import Testing
import TodoAPI
@testable import TodoState

/// Stall attribution (candidate 8, approved design): what a stall record says the main thread was
/// doing, what it keeps, and when sampling turns itself off.
@Suite(.serialized) struct ClientStallAttributionTests {
    private func own(_ symbol: String) -> ClientStallSymbol { .init(imagePath: "/Applications/Todo.app/Contents/MacOS/Todo", symbol: symbol, own: true) }
    private func system(_ image: String, _ symbol: String) -> ClientStallSymbol { .init(imagePath: "/System/Library/Frameworks/\(image).framework/Versions/A/\(image)", symbol: symbol, own: false) }

    @Test func theLabelIsTheDeepestOfOurFramesThatIsNotAThunk() {
        let stack = [system("libsystem_malloc.dylib", "malloc"),
                     own("reabstraction thunk helper from @escaping @callee_guaranteed () -> () to @escaping @callee_unowned"),
                     own("partial apply for closure #1 in Todo.TodoModel.performRefresh()"),
                     own("Todo.TaskListView.sections(for:) -> [Todo.TaskSection]"),
                     own("Todo.TaskListView.body.getter"),
                     system("SwiftUI", "SwiftUI.ViewGraph.updateOutputs()")]
        #expect(ClientStallAttributor.label(stack) == "Todo.TaskListView.sections(for:) -> [Todo.TaskSection]")
    }

    @Test func withNoFrameOfOursTheLabelIsTheSystemEntry() {
        let stack = [system("libsystem_kernel.dylib", "mach_msg2_trap"), system("CoreFoundation", "__CFRunLoopServiceMachPort"),
                     system("AppKit", "-[NSApplication run]")]
        #expect(ClientStallAttributor.label(stack) == "CoreFoundation: __CFRunLoopServiceMachPort")
        let layout = [system("libswiftCore.dylib", "swift_retain"), system("AttributeGraph", "AG::Graph::update_attribute"), system("SwiftUI", "SwiftUI.ViewGraph.updateOutputs()")]
        #expect(ClientStallAttributor.label(layout) == "AttributeGraph: AG::Graph::update_attribute")
    }

    @Test func aRecordKeepsBaseNamesOurSymbolsAndSixSystemFrames() throws {
        var stack = [system("libsystem_malloc.dylib", "malloc"), own("Todo.TodoModel.decode<A, B>(_:_:recordingScope:) throws -> A")]
        for index in 0..<10 { stack.append(system("SwiftUI", "SwiftUI frame \(index)")) }
        stack.append(own("Todo.TodoApp.main() -> ()"))
        let record = ClientStallAttributor.attribute([stack, stack], disabled: nil)
        #expect(record.samples == 2 && record.agreeing == 2 && record.inLabel == "Todo.TodoModel.decode<A, B>(_:_:recordingScope:) throws -> A")
        #expect(record.frames.filter { !$0.own }.count == 6, "the innermost six system frames only")
        #expect(record.frames.filter(\.own).map(\.symbol) == ["Todo.TodoModel.decode<A, B>(_:_:recordingScope:) throws -> A", "Todo.TodoApp.main() -> ()"])
        #expect(record.frames.allSatisfy { !$0.image.contains("/") }, "image base names only")
        let encoded = String(decoding: try JSONEncoder().encode(record), as: UTF8.self)
        #expect(!encoded.contains("/Applications") && !encoded.contains("/System") && !encoded.contains("0x"), "no path or address: \(encoded)")
    }

    @Test func aRecordStaysWithinItsBound() {
        let long = String(repeating: "Todo.VeryLongGenericName<Swift.Array<Swift.Dictionary<Swift.String, Swift.Int>>>.", count: 4)
        let stack = (0..<32).map { own(long + "frame\($0)") }
        let record = ClientStallAttributor.attribute(Array(repeating: stack, count: 20), disabled: nil)
        #expect(ClientStallAttributor.encodedSize(record) <= ClientStallAttributor.recordLimit)
        #expect(record.inLabel?.count ?? 0 <= ClientStallAttributor.symbolLimit && !record.frames.isEmpty)
    }

    // The link-register rule, deterministic: three stack shapes with supplied registers and a
    // supplied function table (functions start at 0x1000, 0x2000 and 0x3000; each spans 0x1000).
    private func start(_ address: UInt64) -> UInt64? { address >= 0x1000 && address < 0x4000 ? address & ~0xFFF : nil }
    @Test func aLeafWithNoFrameHasItsCallerFromTheLinkRegister() {
        // pc in leaf 0x1000; its caller 0x2000 only in LR; the walk starts at the grandcaller 0x3000.
        let stack = ClientStallStack.assemble(pcs: [0x1010, 0x3040], lr: 0x2020, functionStart: start)
        #expect(stack == [0x1010, 0x2020, 0x3040])
    }
    @Test func aFunctionMidBodyAfterACallSkipsTheLinkRegister() {
        // pc in 0x2000 after a call returned: LR points back into 0x2000 itself.
        let stack = ClientStallStack.assemble(pcs: [0x2080, 0x3040], lr: 0x2060, functionStart: start)
        #expect(stack == [0x2080, 0x3040])
    }
    @Test func aLinkRegisterEqualToTheSavedReturnAddressIsSkipped() {
        let stack = ClientStallStack.assemble(pcs: [0x1010, 0x2020, 0x3040], lr: 0x2020, functionStart: start)
        #expect(stack == [0x1010, 0x2020, 0x3040])
    }

    @Test func aFailedSampleTurnsSamplingOffForTheRun() {
        let sampler = ClientStallSampler(thread: mach_port_t(MACH_PORT_NULL), ownImages: [], windowLimitNS: ClientStallSampler.windowLimitNS)
        let stall = UUID()
        #expect(!sampler.tick(stall: stall, pendingMS: 150, nowMS: 1000))
        #expect(sampler.disabled?.contains("failed") == true, "\(sampler.disabled ?? "nil")")
        #expect(!sampler.tick(stall: stall, pendingMS: 400, nowMS: 1300) && sampler.samplesTaken == 0)
        #expect(sampler.finish(stall: stall, nowMS: 1400)?.disabled == sampler.disabled)
    }

    @Test func aWindowOverItsLimitTurnsSamplingOffForTheRun() throws {
        // A real other thread, sampled with a zero limit: the first window is over it.
        let port = ThreadPort()
        let worker = Thread { port.set(mach_thread_self()); while !port.done { _ = sqrt(Double(port.spins.add())) } }
        worker.start(); defer { port.finish() }
        while port.value == nil {}
        let sampler = ClientStallSampler(thread: try #require(port.value), ownImages: [], windowLimitNS: 0)
        #expect(!sampler.tick(stall: UUID(), pendingMS: 150, nowMS: 1000))
        #expect(sampler.disabled?.contains("suspended window") == true, "\(sampler.disabled ?? "nil")")
        let before = port.spins.read(), deadline = ProcessInfo.processInfo.systemUptime + 2
        while port.spins.read() == before && ProcessInfo.processInfo.systemUptime < deadline {}
        #expect(port.spins.read() > before, "the sampled thread was resumed")
    }

    @Test func belowTheThresholdNothingIsSampled() {
        let sampler = ClientStallSampler(thread: mach_port_t(MACH_PORT_NULL), ownImages: [], windowLimitNS: ClientStallSampler.windowLimitNS)
        #expect(!sampler.tick(stall: UUID(), pendingMS: 99, nowMS: 1000))
        #expect(sampler.disabled == nil && sampler.samplesTaken == 0, "a ping under 100 ms is not a stall; nothing is suspended")
    }

    @Test @MainActor func aRealMainThreadStallIsAttributedToTheFunctionThatStalled() async throws {
        _ = NSApplication.shared
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("stall-attribution-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root); recorder.authorizeOwnerSession(true)
        var info = Dl_info()
        #expect(dladdr(#dsohandle, &info) != 0)
        let testImage = String(cString: try #require(info.dli_fname))
        let sampler = ClientStallSampler(ownImages: [testImage])
        let monitor = ClientDiagnosticsMonitor(recorder: recorder, applicationActive: { true }, notifications: NotificationCenter(), stallSampler: sampler)
        monitor.start(); defer { monitor.stop() }
        // Idle while active: no stall, no sample.
        try await Task.sleep(for: .milliseconds(600))
        let idleStalls = (await recorder.snapshot()).recent.filter { $0.name == .stall }.count
        if idleStalls == 0 { #expect(sampler.samplesTaken == 0, "an idle main thread is never suspended") }
        let samplesBefore = sampler.samplesTaken
        stallTheMainThreadForAttribution(milliseconds: 450)
        try await Task.sleep(for: .milliseconds(400))
        let stall = try #require((await recorder.snapshot()).recent.last { $0.name == .stall && $0.stallAttribution != nil }, "the stall was recorded with an attribution")
        let attribution = try #require(stall.stallAttribution)
        #expect(attribution.samples >= 4 && sampler.samplesTaken - samplesBefore >= 4, "about one sample every 50 ms after the first 100: \(attribution.samples)")
        #expect(attribution.inLabel?.contains("stallTheMainThreadForAttribution") == true, "in: \(attribution.inLabel ?? "nil"); frames: \(attribution.frames.map { "\($0.image):\($0.symbol ?? "?")" })")
        #expect(attribution.agreeing * 2 >= attribution.samples)
        #expect(stall.applicationActive == true)
        #expect(attribution.frames.allSatisfy { !$0.image.contains("/") } && attribution.disabled == nil)
        #expect(ClientStallAttributor.encodedSize(attribution) <= ClientStallAttributor.recordLimit)
        monitor.stop(); recorder.clear(); await recorder.flush()
    }
}

@inline(never) @MainActor func stallTheMainThreadForAttribution(milliseconds: Double) {
    let end = ProcessInfo.processInfo.systemUptime + milliseconds / 1000
    var value = 0.0
    while ProcessInfo.processInfo.systemUptime < end { value += sqrt(value + 1) }
    blackHole(value)
}
@inline(never) func blackHole(_ value: Double) { if value.isNaN { print(value) } }

private final class ThreadPort: @unchecked Sendable {
    private let lock = NSLock()
    private var port: mach_port_t?
    private var stopped = false
    let spins = SpinCounter()
    var value: mach_port_t? { lock.withLock { port } }
    var done: Bool { lock.withLock { stopped } }
    func set(_ value: mach_port_t) { lock.withLock { port = value } }
    func finish() { lock.withLock { stopped = true } }
}
private final class SpinCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    func add() -> Int { lock.withLock { count += 1; return count } }
    func read() -> Int { lock.withLock { count } }
}

/// Observed events (candidate 8): passive, coalesced, nothing while idle.
@Suite(.serialized) struct ClientObservedActivityTests {
    @Test func countsAreCoalescedAndAnIdleWindowRecordsNothing() {
        let activity = ClientObservedActivity()
        #expect(activity.drain(nowMS: 1000) == nil, "nothing happened")
        for _ in 0..<40 { activity.scrollEvents.add(1, ordering: .relaxed) }
        activity.windowResizes.add(3, ordering: .relaxed); activity.splitResizes.add(2, ordering: .relaxed)
        activity.timelineTicks.add(178, ordering: .relaxed)
        let observed = activity.drain(nowMS: 2000)
        #expect(observed == .init(scrollEvents: 40, windowResizes: 3, splitResizes: 2, timelineTicks: 178, windowMS: 1000))
        #expect(activity.drain(nowMS: 3000) == nil, "drained to zero")
    }

    @Test @MainActor func theMonitorPassesScrollEventsThroughAndCountsResizes() async throws {
        _ = NSApplication.shared
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("observed-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root); recorder.authorizeOwnerSession(true)
        let center = NotificationCenter()
        let monitor = ClientDiagnosticsMonitor(recorder: recorder, applicationActive: { true }, notifications: center, stallSampler: ClientStallSampler(thread: mach_port_t(MACH_PORT_NULL), ownImages: [], windowLimitNS: 0))
        _ = ClientObservedActivity.shared.drain(nowMS: ProcessInfo.processInfo.systemUptime * 1000)
        monitor.start(); defer { monitor.stop() }
        for _ in 0..<5 { center.post(name: NSWindow.didResizeNotification, object: nil) }
        center.post(name: NSSplitView.didResizeSubviewsNotification, object: nil)
        ClientObservedActivity.timelineTick()
        try await Task.sleep(for: .milliseconds(2300))
        monitor.stop(); await recorder.flush()
        let records = try Data(contentsOf: root.appendingPathComponent("current.ndjson")).split(separator: 10).map { try JSONDecoder().decode(ClientDiagnosticEvent.self, from: Data($0)) }
        let observed = records.filter { $0.name == .observed }.compactMap(\.observed)
        #expect((await recorder.snapshot()).recent.allSatisfy { $0.name != .observed }, "kept out of Recent activity")
        #expect(observed.reduce(0) { $0 + $1.windowResizes } == 5 && observed.reduce(0) { $0 + $1.splitResizes } == 1, "\(observed)")
        #expect(observed.reduce(0) { $0 + $1.timelineTicks } >= 1)
        #expect(observed.count <= 2, "coalesced: at most one record a second")
        monitor.stop(); recorder.clear(); await recorder.flush()
    }
}
