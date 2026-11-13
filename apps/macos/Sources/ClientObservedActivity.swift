import Foundation
import Synchronization
import TodoAPI

/// Passive counters for what happens on screen without being an action. Each hook is one atomic
/// increment: no allocation, no lock, no observable state, so a view that ticks it gains no
/// dependency and its body runs exactly as often as before.
final class ClientObservedActivity: Sendable {
    static let shared = ClientObservedActivity()
    let scrollEvents = Atomic<Int>(0)
    let windowResizes = Atomic<Int>(0)
    let splitResizes = Atomic<Int>(0)
    let timelineTicks = Atomic<Int>(0)
    private let lastDrainMS = Mutex<Double?>(nil)

    /// Called from a TimelineView's content closure on each tick.
    @inline(__always) static func timelineTick() { shared.timelineTicks.add(1, ordering: .relaxed) }

    /// Reads and resets the counters; nil when nothing happened since the last drain.
    func drain(nowMS: Double) -> ClientDiagnosticObserved? {
        let window = lastDrainMS.withLock { last in
            defer { last = nowMS }
            return last.map { nowMS - $0 } ?? 0
        }
        let observed = ClientDiagnosticObserved(scrollEvents: scrollEvents.exchange(0, ordering: .relaxed),
                                                windowResizes: windowResizes.exchange(0, ordering: .relaxed),
                                                splitResizes: splitResizes.exchange(0, ordering: .relaxed),
                                                timelineTicks: timelineTicks.exchange(0, ordering: .relaxed),
                                                windowMS: window)
        return observed.isEmpty ? nil : observed
    }
}
