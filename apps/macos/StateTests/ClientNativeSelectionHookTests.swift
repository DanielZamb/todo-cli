import AppKit
import Foundation
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

@MainActor @Suite(.serialized) struct ClientNativeSelectionHookTests {
    @Test func productionRowsObserveTheirNativeSelectionChange() async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("todo-native-hook-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: directory)
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-native-hook"), clientDiagnostics: recorder, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("ses_synthetic_native_hook"); model.signedIn = true; model.connection = .live; model.selectedView = "all"
        model.tasks = (0..<178).map { index in
            TaskSnapshot(id: "native-hook-\(index)", profile_id: "work", row_version: 1, title: "Synthetic selection control \(index)", description: String(repeating: "x", count: 1260), priority: "P3", source: "manual", status: index < 50 ? "open" : index < 176 ? "done" : "cancelled", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
        }
        let host = NSHostingView(rootView: RootView(model: model, compactMode: .constant(false)))
        let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 1200, height: 900), styleMask: [.titled, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentView = host
        host.frame = NSRect(x: 0, y: 0, width: 1200, height: 900)
        defer { model.signedIn = false; model.replaceCredential(""); window.contentView = nil; window.close() }
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        func ancestors(_ view: NSView) -> [NSView] {
            var result: [NSView] = [], current: NSView? = view
            while let value = current { result.append(value); current = value.superview }
            return result
        }
        var markers: [ClientDiagnosticNativeView] = []
        for _ in 0..<100 {
            host.layoutSubtreeIfNeeded()
            markers = descendants(host).compactMap { $0 as? ClientDiagnosticNativeView }.filter { $0.task != nil && $0.bounds.width > 80 && $0.bounds.height > 10 }
            if !markers.isEmpty { break }
            try await Task.sleep(for: .milliseconds(20))
        }
        let marker = try #require(markers.first)
        let chain = ancestors(marker)
        let table = try #require(chain.compactMap { $0 as? NSTableView }.first)
        let point = marker.convert(NSPoint(x: 70, y: marker.bounds.midY), to: nil)
        let row = table.row(at: table.convert(point, from: nil))
        try #require(row >= 0 && table.selectedRow != row)
        let now = ProcessInfo.processInfo.systemUptime
        let down = try #require(NSEvent.mouseEvent(with: .leftMouseDown, location: point, modifierFlags: [], timestamp: now, windowNumber: window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: 1))
        model.clientDiagnosticsUI.input(down)
        let action = try #require(model.clientDiagnosticsUI.selectionAction)
        table.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        try await Task.sleep(for: .milliseconds(30))
        let events = (await recorder.snapshot()).recent
        let committed = events.filter { $0.name == .nativeSelectionCommitted && $0.actionID == action }.count
        let hierarchy: [String: Any] = ["rows": model.tasks.count, "row_markers": markers.count, "native_row_count": table.numberOfRows, "native_class": String(describing: type(of: table)), "ancestors": chain.map { String(describing: type(of: $0)) }, "table_notification": NSTableView.selectionDidChangeNotification.rawValue, "outline_notification": NSOutlineView.selectionDidChangeNotification.rawValue, "native_commits": committed, "window_visible": window.isVisible]
        if let path = ProcessInfo.processInfo.environment["TODO_MAC_NATIVE_HOOK_EVIDENCE"] {
            try JSONSerialization.data(withJSONObject: hierarchy, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path))
        }
        #expect(table.selectedRow == row)
        #expect(committed == 1)
        #expect(!window.isVisible)
        recorder.clear(); await recorder.flush()
    }
}
