import AppKit
import Observation
import SwiftUI
import Testing

@testable import TodoState

@MainActor
@Suite(.serialized)
struct WindowLayoutTests {
    @Observable
    final class Layout {
        var compact: Bool
        init(compact: Bool) { self.compact = compact }
    }

    @Test func collapseAndRestore() async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let layout = Layout(compact: false)
        let model = TodoModel(configuration: ClientConfiguration(
            server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused.window-layout"))
        model.signedIn = true
        model.connection = .live
        let task = TaskSnapshot(
            id: "draft", profile_id: "work", row_version: 1, title: "Original title", description: nil,
            priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil,
            scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: false, deleted_at: nil)
        model.tasks = [task]
        model.editor = TaskDraft(task)
        model.editor?.title = "Keep this unsaved draft"
        let controller = NSHostingController(rootView: RootView(model: model, compactMode: Binding(
            get: { layout.compact }, set: { layout.compact = $0 })))
        let window = NSWindow(
            contentRect: NSRect(x: -10000, y: -10000, width: 1180, height: 780),
            styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = controller
        defer { window.contentViewController = nil; window.close() }
        try await settle(window)
        let expanded = window.frame
        layout.compact = true
        try await settle(window)
        #expect(window.contentLayoutRect.width == 393)
        #expect(window.contentLayoutRect.height == 426)
        #expect(window.frame.minX == expanded.minX)
        #expect(window.frame.maxY == expanded.maxY)
        #expect(window.isVisible == false)
        #expect(model.editor?.title == "Keep this unsaved draft")
        layout.compact = false
        try await settle(window)
        #expect(window.frame == expanded)
        #expect(model.editor?.title == "Keep this unsaved draft")
        layout.compact = true
        try await settle(window)
        #expect(window.contentLayoutRect.width == 393)
        #expect(window.contentLayoutRect.height == 426)
        #expect(window.isVisible == false)
    }

    @Test func startCompactAndExpand() async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let layout = Layout(compact: true)
        let controller = NSHostingController(rootView: Color.clear.background(TaskWindowSizing(compact: layout.compact)))
        let window = NSWindow(
            contentRect: NSRect(x: -10000, y: -10000, width: 1100, height: 760),
            styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = controller
        defer { window.contentViewController = nil; window.close() }
        try await settle(window)
        #expect(window.contentLayoutRect.width == 393)
        #expect(window.contentLayoutRect.height == 426)
        layout.compact = false
        controller.rootView = Color.clear.background(TaskWindowSizing(compact: layout.compact))
        try await settle(window)
        #expect(window.contentLayoutRect.width == 1100)
        #expect(window.contentLayoutRect.height == 760)
        #expect(window.isVisible == false)
    }

    private func settle(_ window: NSWindow) async throws {
        window.contentView?.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(200))
        window.contentView?.layoutSubtreeIfNeeded()
    }
}
