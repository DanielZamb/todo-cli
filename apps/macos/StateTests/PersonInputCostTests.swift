import AppKit
import Foundation
import Testing
@testable import TodoState

/// MAC-C1-S1-32 (e): what the always-on observer adds to a row click with Diagnostics off.
/// Candidate 9 installs no input monitor while Diagnostics is off, so its click costs the row's own
/// selection work; candidate 10 adds the observer's handling of the click's mouse-down and mouse-up.
/// Paired and alternating: each pair runs both paths over the same 1,000 clicks, in alternating
/// order, and the receipt (PERSON_INPUT_COST_RECEIPT) gives per-click medians, the difference and
/// the baseline's own pair-to-pair spread.
@MainActor @Suite struct PersonInputCostTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["PERSON_INPUT_COST_RECEIPT"] != nil))
    func aRowClickWithDiagnosticsOff() throws {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-person-input-cost"),
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.clientDiagnosticsUI.stop()
        model.personInput.applicationActive = { true }
        let ids = (0..<1_000).map { "task-\($0)" }
        let down = PersonInputTests.mouse(.leftMouseDown), up = PersonInputTests.mouse(.leftMouseUp)
        // The row's own work on a click: the list's selection binding (AppViews), as both candidates run it.
        func selection(_ id: String) { model.clientDiagnosticsUI.selected(id); model.notePersonActed() }
        func candidate9() -> Duration { ContinuousClock().measure { for id in ids { selection(id) } } }
        func candidate10() -> Duration { ContinuousClock().measure { for id in ids { model.personInput.observe(down); model.personInput.observe(up); selection(id) } } }
        for _ in 0..<5 { _ = candidate9(); _ = candidate10() } // warm
        var c9: [Double] = [], c10: [Double] = [], differences: [Double] = []
        for pair in 0..<40 {
            let (a, b) = pair.isMultiple(of: 2) ? (candidate9(), candidate10()) : { let b = candidate10(); return (candidate9(), b) }()
            let nsA = Double(a.components.attoseconds) / 1e9 / 1_000 + Double(a.components.seconds) * 1e9 / 1_000
            let nsB = Double(b.components.attoseconds) / 1e9 / 1_000 + Double(b.components.seconds) * 1e9 / 1_000
            c9.append(nsA); c10.append(nsB); differences.append(nsB - nsA)
        }
        func median(_ values: [Double]) -> Double { let sorted = values.sorted(); return (sorted[sorted.count / 2] + sorted[(sorted.count - 1) / 2]) / 2 }
        func quartiles(_ values: [Double]) -> [Double] { let sorted = values.sorted(); return [sorted[sorted.count / 4], sorted[sorted.count * 3 / 4]] }
        let receipt: [String: Any] = [
            "unit": "nanoseconds per click", "pairs": 40, "clicksPerRun": 1_000, "order": "alternating",
            "candidate9MedianNs": median(c9), "candidate10MedianNs": median(c10),
            "differenceMedianNs": median(differences), "differenceQuartilesNs": quartiles(differences),
            "candidate9QuartilesNs": quartiles(c9), "candidate9PairToPairSpreadNs": quartiles(c9)[1] - quartiles(c9)[0],
        ]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: ProcessInfo.processInfo.environment["PERSON_INPUT_COST_RECEIPT"]!))
        // A click's budget is 20 ms median (the latency objective); the observer may add a microsecond at most.
        #expect(median(differences) < 1_000, "\(receipt)")
    }
}
