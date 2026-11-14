import AppKit
import CryptoKit
import SwiftUI
import Testing
@testable import TodoState

/// Opt-in control for the design harness (TODO_SNAPSHOT_SETTLE_CONTROL=<mode>,
/// TODO_SNAPSHOT_SETTLE_OUT=<json>): hosts the compact quick-add content offscreen the way
/// Snapshots.render does and records the title field's frame and a pixel digest at each stage.
/// A stale field is laid out at the default 13 pt rounded-border height (24 pt) while carrying the
/// .title3 15 pt font (28 pt). Modes: sleep (the suite's waits), settle (settledSnapshotBitmap),
/// trace (digest every 10 ms), force (explicit constraints/layout/flush variants), suite (the
/// suite's resize sequence), pinned (suite with sizingOptions = [], rejected: it changes layout).
/// Isolated, idle or under full CPU load, every mode gives 28 pt; the stale field so far appears
/// only inside a full design run.
@MainActor @Suite(.serialized) struct SnapshotSettleControl {
    private func fieldHeights(_ view: NSView) -> [Double] {
        func fields(_ view: NSView) -> [NSTextField] { ((view as? NSTextField).map { $0.isEditable ? [$0] : [] } ?? []) + view.subviews.flatMap(fields) }
        return fields(view).map { Double($0.frame.height) }
    }
    private func digest(_ view: NSView) throws -> String {
        let rep = try snapshotBitmap(view)
        return SHA256.hash(data: Data(bytes: rep.bitmapData!, count: rep.bytesPerRow * rep.pixelsHigh)).prefix(6).map { String(format: "%02x", $0) }.joined()
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_SETTLE_CONTROL"] != nil))
    func quickAddFieldHeightAtEachCaptureStage() async throws {
        let mode = ProcessInfo.processInfo.environment["TODO_SNAPSHOT_SETTLE_CONTROL"]!
        let referenceDate = try #require(ISO8601DateFormatter().date(from: "2026-10-28T15:00:00Z"))
        var rows: [[String: Any]] = []
        for iteration in 0..<(mode == "trace" ? 6 : mode == "force" ? 20 : mode == "suite" || mode == "pinned" ? 6 : 40) {
            let model = TodoModel(configuration: ClientConfiguration(server: URL(string: "http://127.0.0.1:9")!, initialProfile: "work", vaultService: "unused.settle.control"))
            model.signedIn = true
            model.connection = .live
            model.newTitle = #"Ship tomorrow p1 #focus #planning @Client"#
            model.parsedInput = model.newTitle
            model.parsedTask = ParsedTask(title: "Ship", due_at: TaskTime(kind: "date", date: "2026-10-29"), priority: "P1", tags: ["focus", "planning"], project: "Client")
            let scheme: ColorScheme = iteration.isMultiple(of: 2) ? .light : .dark
            NSApplication.shared.appearance = NSAppearance(named: scheme == .light ? .aqua : .darkAqua)
            let content = QuickAddView(model: model, floating: true, compact: true, referenceDate: referenceDate).content
                .frame(width: 393, height: 426).background(.background).environment(\.colorScheme, scheme).environment(\.controlActiveState, .key)
            let controller = NSHostingController(rootView: content)
            if mode == "pinned" { controller.sizingOptions = [] }
            let host = controller.view
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 393, height: 426), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentViewController = controller
            host.frame = NSRect(x: 0, y: 0, width: 393, height: 426)
            host.layoutSubtreeIfNeeded()
            let immediate = fieldHeights(host)
            let immediateDigest = try digest(host)
            if mode == "suite" || mode == "pinned" {
                try await Task.sleep(for: .milliseconds(400))
                window.makeFirstResponder(nil)
                window.setContentSize(NSSize(width: 393, height: 426))
                host.frame = NSRect(x: 0, y: 0, width: 393, height: 426)
                host.layoutSubtreeIfNeeded()
                var trace: [String] = ["sizing:\(controller.sizingOptions.rawValue)"]
                var last = ""
                let start = ContinuousClock.now
                for _ in 0..<60 {
                    let next = "\(Int(host.bounds.height))/\(Int(window.contentLayoutRect.height)):\(fieldHeights(host)):\(try digest(host))"
                    if next != last { trace.append("\((ContinuousClock.now - start).components.attoseconds / 1_000_000_000_000_000)ms \(next)"); last = next }
                    try await Task.sleep(for: .milliseconds(10))
                }
                rows.append(["iteration": iteration, "trace": trace])
                window.contentViewController = nil
                window.close()
                continue
            }
            if mode == "force" {
                let variant = ["none", "display", "constraints", "flush", "all"][iteration % 5]
                switch variant {
                case "display": window.displayIfNeeded()
                case "constraints": window.updateConstraintsIfNeeded(); window.layoutIfNeeded()
                case "flush": CATransaction.flush()
                case "all": window.updateConstraintsIfNeeded(); window.layoutIfNeeded(); window.displayIfNeeded(); CATransaction.flush()
                default: break
                }
                let forced = try digest(host)
                if iteration < 5 { try snapshotBitmap(host).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_SETTLE_OUT"]! + "-\(variant).png")) }
                try await Task.sleep(for: .milliseconds(200))
                rows.append(["iteration": iteration, "variant": variant, "scheme": scheme == .light ? "light" : "dark", "forced": forced, "later": try digest(host)])
                window.contentViewController = nil
                window.close()
                continue
            }
            if mode == "trace" {
                var trace: [String] = []
                var last = immediateDigest
                let start = ContinuousClock.now
                for _ in 0..<100 {
                    try await Task.sleep(for: .milliseconds(10))
                    let next = try digest(host)
                    if next != last { trace.append("\((ContinuousClock.now - start).components.attoseconds / 1_000_000_000_000_000)ms:\(next)"); last = next }
                }
                if iteration < 2 {
                    try snapshotBitmap(host).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_SETTLE_OUT"]! + "-final-\(iteration).png"))
                }
                rows.append(["iteration": iteration, "trace": trace])
                window.contentViewController = nil
                window.close()
                continue
            }
            try await Task.sleep(for: .milliseconds(400))
            window.makeFirstResponder(nil)
            host.layoutSubtreeIfNeeded()
            try await Task.sleep(for: .milliseconds(100))
            let slept = fieldHeights(host)
            let sleptDigest = try digest(host)
            let settled: [Double]
            let settledDigest: String
            if mode == "settle" {
                _ = try await settledSnapshotBitmap(host, name: "control-\(iteration)")
                settled = fieldHeights(host)
                settledDigest = try digest(host)
            } else {
                settled = slept
                settledDigest = sleptDigest
            }
            rows.append(["iteration": iteration, "scheme": scheme == .light ? "light" : "dark", "immediate": immediate, "slept": slept, "captured": settled,
                         "immediateDigest": immediateDigest, "sleptDigest": sleptDigest, "capturedDigest": settledDigest])
            window.contentViewController = nil
            window.close()
        }
        let out = try #require(ProcessInfo.processInfo.environment["TODO_SNAPSHOT_SETTLE_OUT"])
        try JSONSerialization.data(withJSONObject: ["mode": mode, "rows": rows], options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: out))
    }
}
