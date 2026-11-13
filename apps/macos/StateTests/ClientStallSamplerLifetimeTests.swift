import AppKit
import Darwin
import Foundation
import Testing
import TodoAPI
@testable import TodoState

/// MAC-C1-S1-21 and S1-22: the stall sampler and its queue have one lifetime, `stop` is complete
/// when it returns, and the sampler's caps hold whatever happens around them.
@Suite(.serialized) struct ClientStallSamplerLifetimeTests {
    @MainActor private func recorder() throws -> (ClientDiagnosticsRecorder, URL) {
        _ = NSApplication.shared
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("sampler-lifetime-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root); recorder.authorizeOwnerSession(true)
        return (recorder, root)
    }
    @MainActor private func until(seconds: Double = 5, _ what: String, _ condition: () -> Bool) async throws {
        let deadline = ProcessInfo.processInfo.systemUptime + seconds
        while !condition() {
            guard ProcessInfo.processInfo.systemUptime < deadline else { throw LifetimeTimeout(what: what) }
            try await Task.sleep(for: .milliseconds(5))
        }
    }

    /// The seat's case, deterministic: the stopped generation's first handler is held inside its
    /// tick while the monitor stops and starts again. Red on 6d00929c: `stop` returned at once, the
    /// new start made a second queue, and its handler ran while the held one was still inside
    /// (two at once on one sampler).
    @Test @MainActor func aStopThenStartNeverOverlapsAHandlerOfTheStoppedGeneration() async throws {
        let (recorder, root) = try recorder(); defer { try? FileManager.default.removeItem(at: root) }
        let probe = HeldHandlerProbe()
        let monitor = ClientDiagnosticsMonitor(recorder: recorder, applicationActive: { true }, notifications: NotificationCenter(), watchdogTick: { probe.enter() },
                                               stallSampler: ClientStallSampler(thread: mach_port_t(MACH_PORT_NULL), ownImages: [], windowLimitNS: 0))
        monitor.start()
        try await until("the first handler is held") { probe.entries >= 1 }
        monitor.stop()
        let stopReturned = probe.mark()
        monitor.start()
        try await until("a handler of the new generation runs") { probe.entries >= 2 }
        probe.releaseAll()
        monitor.stop(); recorder.clear(); await recorder.flush()
        #expect(probe.maxInFlight == 1, "handlers of two generations ran at once: \(probe.maxInFlight)")
        #expect(probe.firstExit.map { $0 < stopReturned } == true, "the stopped generation's handler ended before stop returned (exit \(probe.firstExit.map(String.init) ?? "none"), stop \(stopReturned))")
    }

    /// Every handler, before and after a stop and a start, runs on the monitor's one queue. A
    /// queue made per start fails here.
    @Test @MainActor func everyHandlerRunsOnTheMonitorsOneQueueAcrossStopAndStart() async throws {
        let (recorder, root) = try recorder(); defer { try? FileManager.default.removeItem(at: root) }
        let key = DispatchSpecificKey<String>()
        let seen = QueueLabels()
        let monitor = ClientDiagnosticsMonitor(recorder: recorder, applicationActive: { true }, notifications: NotificationCenter(), watchdogTick: { seen.add(DispatchQueue.getSpecific(key: key)) },
                                               stallSampler: ClientStallSampler(thread: mach_port_t(MACH_PORT_NULL), ownImages: [], windowLimitNS: 0))
        monitor.watchdogQueue.setSpecific(key: key, value: "the monitor's queue")
        monitor.start()
        try await until("first generation ticks") { seen.count >= 3 }
        monitor.stop(); monitor.start()
        let before = seen.count
        try await until("second generation ticks") { seen.count >= before + 3 }
        monitor.stop(); recorder.clear(); await recorder.flush()
        #expect(seen.labels.allSatisfy { $0 == "the monitor's queue" }, "\(Set(seen.labels.map { $0 ?? "another queue" }))")
    }

    /// The caps across a stop (`abandon`) and a start: at most 20 samples a stall, and at most 120
    /// records an hour, counting the stalls before and after.
    @Test func theCapsHoldAcrossAStopAndAStart() throws {
        let worker = SampledWorker(); defer { worker.finish() }
        let sampler = ClientStallSampler(thread: try worker.port(), ownImages: [], windowLimitNS: ClientStallSampler.windowLimitNS)
        var now = 1000.0
        func sampleStall(_ id: UUID, ticks: Int) -> Int {
            var took = 0
            for _ in 0..<ticks { if sampler.tick(stall: id, pendingMS: 150, nowMS: now) { took += 1 }; now += 50 }
            return took
        }
        let before = sampleStall(UUID(), ticks: 25)
        #expect(before >= 1 && before <= ClientStallSampler.capacity, "before the stop: \(before)")
        sampler.abandon()
        let after = sampleStall(UUID(), ticks: 25)
        #expect(after >= 1 && after <= ClientStallSampler.capacity, "after the start: \(after)")
        var records = 0
        for index in 0..<130 {
            let id = UUID()
            _ = sampleStall(id, ticks: 1)
            if sampler.finish(stall: id, nowMS: now) != nil { records += 1 }
            if index == 60 { sampler.abandon() }
        }
        #expect(records == ClientStallSampler.perHour, "records within the hour, across a stop and a start: \(records)")
    }

    /// MAC-C1-S1-22: after a sampling failure, every later stall would return a disabled record;
    /// the hourly budget comes first. Red on 6d00929c: 1,000 records in 200 seconds.
    @Test func aFailedSamplerStillRecordsAtMostTheHourlyCap() {
        let sampler = ClientStallSampler(thread: mach_port_t(MACH_PORT_NULL), ownImages: [], windowLimitNS: ClientStallSampler.windowLimitNS)
        var records = 0
        for index in 0..<1000 {
            let id = UUID(), now = 1000 + Double(index) * 200
            _ = sampler.tick(stall: id, pendingMS: 150, nowMS: now)
            if sampler.finish(stall: id, nowMS: now) != nil { records += 1 }
        }
        #expect(sampler.disabled?.contains("failed") == true)
        #expect(records == ClientStallSampler.perHour, "1,000 stalls in 200 s after a failure: \(records) records")
        let nextHour = UUID()
        _ = sampler.tick(stall: nextHour, pendingMS: 150, nowMS: 1000 + 3_600_000)
        #expect(sampler.finish(stall: nextHour, nowMS: 1000 + 3_600_000)?.disabled != nil, "the next hour records again")
    }

    /// The stall's time budget is checked before each suspend: with a window limit as large as the
    /// budget, only the first sample fits, and the second is refused without suspending.
    @Test func aStallsSuspendedTimeBudgetIsCheckedBeforeEachSuspend() throws {
        let worker = SampledWorker(); defer { worker.finish() }
        let sampler = ClientStallSampler(thread: try worker.port(), ownImages: [], windowLimitNS: ClientStallSampler.stallBudgetNS)
        let stall = UUID()
        #expect(sampler.tick(stall: stall, pendingMS: 150, nowMS: 1000), "the first sample fits the budget: \(sampler.disabled ?? "")")
        #expect(!sampler.tick(stall: stall, pendingMS: 200, nowMS: 1050), "the second would not fit, so it is not taken")
        #expect(sampler.samplesTaken == 1)
        let record = try #require(sampler.finish(stall: stall, nowMS: 1100))
        #expect(record.samples == 1 && record.suspendedMicroseconds?.count == 1, "each window is recorded: \(record.suspendedMicroseconds ?? [])")
    }

    @Test func diagnosticsShowsWhatTheSamplerCost() {
        let attribution = ClientStallAttribution(samples: 3, inLabel: "f", agreeing: 3, frames: [], disabled: nil, suspendedMicroseconds: [120, 80, 300])
        #expect(ClientDiagnosticDisplay.samplerCost(attribution) == "Sampled 3 times: main thread held 0.50 ms, longest 0.30 ms")
        let once = ClientStallAttribution(samples: 1, inLabel: "f", agreeing: 1, frames: [], disabled: nil, suspendedMicroseconds: [45])
        #expect(ClientDiagnosticDisplay.samplerCost(once) == "Sampled once: main thread held 0.04 ms, longest 0.04 ms")
        #expect(ClientDiagnosticDisplay.samplerCost(.init(samples: 0, inLabel: nil, agreeing: 0, frames: [], disabled: "off")) == nil)
    }
}

private struct LifetimeTimeout: Error { let what: String }

/// Counts watchdog handlers in flight; holds the first one inside its tick until released (or for
/// at most 1.5 s, the liveness bound when a draining stop is waiting on it).
private final class HeldHandlerProbe: @unchecked Sendable {
    private let lock = NSLock()
    private let hold = DispatchSemaphore(value: 0)
    private var sequence = 0, inFlight = 0, maximum = 0, count = 0, exit: Int?
    var entries: Int { lock.withLock { count } }
    var maxInFlight: Int { lock.withLock { maximum } }
    var firstExit: Int? { lock.withLock { exit } }
    func mark() -> Int { lock.withLock { sequence += 1; return sequence } }
    func releaseAll() { hold.signal() }
    func enter() {
        let first: Bool = lock.withLock {
            count += 1; inFlight += 1; maximum = max(maximum, inFlight)
            return count == 1
        }
        if first { _ = hold.wait(timeout: .now() + 1.5) }
        lock.withLock {
            inFlight -= 1
            if first { sequence += 1; exit = sequence }
        }
    }
}

private final class QueueLabels: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String?] = []
    func add(_ value: String?) { lock.withLock { values.append(value) } }
    var count: Int { lock.withLock { values.count } }
    var labels: [String?] { lock.withLock { values } }
}

/// A real thread to sample, spinning until finished.
private final class SampledWorker: @unchecked Sendable {
    private let lock = NSLock()
    private var thread: mach_port_t?
    private var stopped = false
    init() {
        Thread { [self] in
            lock.withLock { thread = mach_thread_self() }
            var value = 0.0
            while !lock.withLock({ stopped }) { value += sqrt(value + 1) }
            blackHole(value)
        }.start()
    }
    func port() throws -> mach_port_t {
        let deadline = ProcessInfo.processInfo.systemUptime + 2
        while ProcessInfo.processInfo.systemUptime < deadline {
            if let thread = lock.withLock({ thread }) { return thread }
        }
        throw LifetimeTimeout(what: "the worker thread started")
    }
    func finish() { lock.withLock { stopped = true } }
}
