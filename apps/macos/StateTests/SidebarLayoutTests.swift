import AppKit
import Foundation
import HTTPTypes
import OpenAPIRuntime
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

/// Candidate 12, the owner's report: "when you resize the window with the sidebar, it gets cut
/// through half, or after hiding it doesn't come back when pressing the button". The production
/// RootView in a window that is never shown, signed in on a fixture model with no server. At 900,
/// 1,000 and 1,100 pt, with the inspector closed and open, every column shown stays inside the
/// window's content, before and after the sidebar is hidden and shown again, and after it was hidden
/// while wide and asked for at the narrow width. On c9b21ed2 the sidebar started at x = -86 at
/// 900 pt with a Task open, and came back at x = -216 after hide and show at 1,100 pt.
private struct NoNetwork: ClientTransport {
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) { throw URLError(.notConnectedToInternet) }
}

extension MainThreadExclusive { @MainActor @Suite(.serialized) struct SidebarLayoutTests {
    private func model() -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-sidebar-layout"),
                              clientFactory: { url, _ in Client(serverURL: url, transport: NoNetwork()) }, clientDiagnostics: .disabled,
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.clientDiagnosticsUI.stop()
        model.signedIn = true; model.connection = .live; model.selectedView = "all"
        model.profiles = [.init(id: "work", name: "Work", open_task_count: 40, inbox_task_count: 3)]
        model.projects = [.init(id: "launch", name: "Launch", open_task_count: 20, inbox_task_count: nil)]
        model.tags = [.init(id: "focus", name: "focus", open_task_count: 40, inbox_task_count: nil)]
        model.tasks = (0..<40).map { index in
            TaskSnapshot(id: String(format: "t%03d", index), profile_id: "work", row_version: 1, title: "Review the long launch checklist with the whole team \(index)", description: nil,
                         priority: ["P1", "P2", "P3"][index % 3], source: "manual", status: "open", project_id: index % 2 == 0 ? "launch" : nil, tags: ["focus"],
                         due_at: nil, scheduled_at: nil, energy: 2, estimate_min: 30, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
        }
        return model
    }
    private func splitViews(_ view: NSView) -> [NSSplitView] { ((view as? NSSplitView).map { [$0] } ?? []) + view.subviews.flatMap(splitViews) }
    private func controllers(_ window: NSWindow) -> [NSSplitViewController] { splitViews(window.contentView!).compactMap { $0.delegate as? NSSplitViewController } }
    private func settle(_ window: NSWindow) async {
        for _ in 0..<6 { window.contentView?.layoutSubtreeIfNeeded(); try? await Task.sleep(for: .milliseconds(100)) }
    }
    /// Each column shown, by behaviour, with its frame in the window's content; and those outside it.
    private func columns(_ window: NSWindow) -> (shown: [String: NSRect], outside: [String]) {
        window.contentView!.layoutSubtreeIfNeeded()
        let bounds = window.contentView!.bounds
        var shown: [String: NSRect] = [:], outside: [String] = []
        for controller in controllers(window) {
            for item in controller.splitViewItems where !item.isCollapsed && !item.viewController.view.isHidden {
                let view = item.viewController.view
                let frame = view.convert(view.bounds, to: nil)
                guard frame.width > 1 else { continue }
                let name = item.behavior == .sidebar ? "sidebar" : item.behavior == .inspector ? "inspector" : "content"
                shown[name] = frame
                if frame.minX < bounds.minX - 0.5 || frame.maxX > bounds.maxX + 0.5 { outside.append("\(name) \(Int(frame.minX))…\(Int(frame.maxX)) in 0…\(Int(bounds.maxX))") }
            }
        }
        return (shown, outside)
    }
    /// What the toolbar's sidebar button does.
    private func toggleSidebar(_ window: NSWindow) {
        controllers(window).first { $0.splitViewItems.contains { $0.behavior == .sidebar } }?.toggleSidebar(nil)
    }
    private func sidebarShown(_ window: NSWindow) -> Bool {
        controllers(window).flatMap(\.splitViewItems).contains { $0.behavior == .sidebar && !$0.isCollapsed }
    }
    private func resize(_ window: NSWindow, _ width: CGFloat) { window.setFrame(NSRect(x: 0, y: 0, width: width, height: 800), display: true) }

    @Test(arguments: [false, true])
    func everyColumnStaysInsideTheWindow(inspectorOpen: Bool) async throws {
        var failures: [String] = []
        for width in [1100.0, 1000.0, 900.0] {
            let model = model()
            var compact = false
            let host = NSHostingController(rootView: RootView(model: model, compactMode: Binding(get: { compact }, set: { compact = $0 })))
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1300, height: 800), styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentViewController = host
            defer { window.contentViewController = nil; window.close(); model.signedIn = false }
            await settle(window)
            if inspectorOpen { model.beginEditing(model.tasks[3]); await settle(window) }
            func check(_ step: String, sidebar expected: Bool) {
                let (shown, outside) = columns(window)
                if !outside.isEmpty { failures.append("\(Int(width)) pt, \(step): outside the window: \(outside)") }
                if sidebarShown(window) != expected { failures.append("\(Int(width)) pt, \(step): sidebar shown \(sidebarShown(window)), expected \(expected)") }
                if expected, let bar = shown["sidebar"], bar.width < 200 - 0.5 { failures.append("\(Int(width)) pt, \(step): sidebar \(Int(bar.width)) pt wide") }
                if inspectorOpen && shown["inspector"] == nil && model.editor != nil { failures.append("\(Int(width)) pt, \(step): the inspector is not shown") }
            }
            resize(window, width); await settle(window)
            check("narrowed", sidebar: true)
            toggleSidebar(window); await settle(window)
            check("hidden", sidebar: false)
            toggleSidebar(window); await settle(window)
            check("shown again", sidebar: true)
            // The owner's second case: hidden while wide, then asked for at the narrow width.
            resize(window, 1300); await settle(window)
            toggleSidebar(window); await settle(window)
            resize(window, width); await settle(window)
            check("hidden while wide, narrowed", sidebar: false)
            toggleSidebar(window); await settle(window)
            check("asked for at the narrow width", sidebar: true)
        }
        #expect(failures.isEmpty, "inspector \(inspectorOpen ? "open" : "closed"): \(failures)")
    }
} }
