import AppKit
import Foundation
import HTTPTypes
import OpenAPIRuntime
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

/// Candidate 12's room rule, measured and reached. Showing the sidebar makes room first: when what
/// AppKit will enforce is more than the window has, the window grows if the screen has room, and
/// otherwise the inspector closes. 456af04b had three faults, each with a test here that its fault
/// alone turns red:
/// - the rule was never reached in a hosted window, because scene storage dropped every write of the
///   sidebar's state outside a SwiftUI scene;
/// - from the toolbar, AppKit has already expanded the sidebar when the rule measures, and the rule
///   added the sidebar's share again (a 900 pt window with a Task open grew to 1,116 pt);
/// - the share was 228 pt, half of what showing the sidebar adds.
/// Every window here is hosted and never shown.
private struct NoNetwork: ClientTransport {
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) { throw URLError(.notConnectedToInternet) }
}

@MainActor struct SidebarRoomHarness {
    let model: TodoModel
    let window: NSWindow
    let probe = SidebarControlProbe()
    var compact = false
    static func fixtureModel(transport: any ClientTransport = NoNetwork()) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-sidebar-room"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) }, clientDiagnostics: .disabled,
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
    /// Off every screen, so the window cannot grow and the rule must close the inspector.
    static let offScreen = NSPoint(x: -40_000, y: -40_000)
    static var onScreen: NSPoint? { NSScreen.main.map { NSPoint(x: $0.visibleFrame.minX + 300, y: $0.visibleFrame.minY + 10) } }

    init(model: TodoModel, at origin: NSPoint, width: CGFloat = 1300, compact: Bool = false) async {
        self.model = model
        self.compact = compact
        var mode = compact
        let root = RootView(model: model, compactMode: Binding(get: { mode }, set: { mode = $0 })).environment(\.sidebarControlProbe, probe)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1300, height: 800), styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = NSHostingController(rootView: root)
        window.setFrame(NSRect(origin: origin, size: NSSize(width: width, height: 800)), display: true)
        await settle()
    }
    func close() { window.contentViewController = nil; window.close(); model.signedIn = false }
    func settle() async {
        for _ in 0..<6 { window.contentView?.layoutSubtreeIfNeeded(); try? await Task.sleep(for: .milliseconds(100)) }
    }
    private func splitViews(_ view: NSView) -> [NSSplitView] { ((view as? NSSplitView).map { [$0] } ?? []) + view.subviews.flatMap(splitViews) }
    var controllers: [NSSplitViewController] { splitViews(window.contentView!).compactMap { $0.delegate as? NSSplitViewController } }
    var items: [NSSplitViewItem] { controllers.flatMap(\.splitViewItems) }
    var sidebarShown: Bool { items.contains { $0.behavior == .sidebar && !$0.isCollapsed } }
    var inspector: NSSplitViewItem? { items.first { $0.behavior == .inspector } }
    var inspectorShown: Bool { inspector.map { !$0.isCollapsed && $0.viewController.view.frame.width > 1 } ?? false }
    var inspectorWidth: CGFloat { inspector?.viewController.view.frame.width ?? 0 }
    /// Columns laid out past the window's content.
    var outside: [String] {
        window.contentView!.layoutSubtreeIfNeeded()
        let bounds = window.contentView!.bounds
        return items.filter { !$0.isCollapsed && !$0.viewController.view.isHidden }.compactMap { item in
            let view = item.viewController.view
            let frame = view.convert(view.bounds, to: nil)
            guard frame.width > 1, frame.minX < bounds.minX - 0.5 || frame.maxX > bounds.maxX + 0.5 else { return nil }
            return "\(item.behavior.rawValue) \(Int(frame.minX))…\(Int(frame.maxX)) in 0…\(Int(bounds.maxX))"
        }
    }
    /// The toolbar's sidebar button: AppKit's toggle, which expands the sidebar before SwiftUI hears.
    func toolbarToggle() async {
        controllers.first { $0.splitViewItems.contains { $0.behavior == .sidebar } }?.toggleSidebar(nil)
        await settle()
    }
    /// View ▸ Hide/Show Sidebar: the window's `SidebarControl`, as the menu command calls it.
    func menuToggle() async {
        probe.control?.notePersonActed()
        probe.control?.toggle()
        await settle()
    }
    func toggle(_ path: String) async { if path == "menu" { await menuToggle() } else { await toolbarToggle() } }
    func resize(_ width: CGFloat) async {
        window.setFrame(NSRect(origin: window.frame.origin, size: NSSize(width: width, height: 800)), display: true)
        await settle()
    }
    /// Drags the inspector's divider so the inspector is `width` wide (its maximum is 480 pt).
    func widenInspector(to width: CGFloat) async throws {
        let inspector = try #require(inspector)
        let inner = try #require(controllers.first { $0.splitViewItems.contains(inspector) })
        inner.splitView.setPosition(inner.splitView.bounds.width - width - inner.splitView.dividerThickness, ofDividerAt: 0)
        await settle()
    }
}

extension MainThreadExclusive { @MainActor @Suite(.serialized) struct SidebarRoomTests {
    /// (c) The share is what showing the sidebar adds, with the inspector closed and open. Also what
    /// `enforcedMinimum` relies on: it takes the widest column's fitting width, which holds the list and
    /// the inspector only while the inspector is a column inside the detail item.
    @Test(arguments: [false, true])
    func theShareIsWhatShowingTheSidebarAdds(inspectorOpen: Bool) async throws {
        let room = await SidebarRoomHarness(model: SidebarRoomHarness.fixtureModel(), at: SidebarRoomHarness.offScreen)
        defer { room.close() }
        if inspectorOpen {
            room.model.beginEditing(room.model.tasks[3]); await room.settle()
            let outer = try #require(room.controllers.first { $0.splitViewItems.contains { $0.behavior == .sidebar } })
            let detail = try #require(outer.splitViewItems.first { $0.behavior != .sidebar })
            let inspector = try #require(room.inspector)
            #expect(!outer.splitViewItems.contains(inspector), "the inspector is a column of the outer split view")
            #expect(inspector.viewController.view.isDescendant(of: detail.viewController.view))
            #expect(SidebarRoom.enforcedMinimum(in: room.window) == detail.viewController.view.fittingSize.width)
        }
        let shown = SidebarRoom.enforcedMinimum(in: room.window)
        await room.menuToggle()
        try #require(!room.sidebarShown)
        let hidden = SidebarRoom.enforcedMinimum(in: room.window)
        await room.menuToggle()
        try #require(room.sidebarShown)
        #expect([hidden, shown] == (inspectorOpen ? [432, 888] : [52, 508]))
        #expect(shown - hidden == SidebarRoom.sidebarShare)
        #expect(SidebarRoom.sidebarShare == 456)
    }

    /// (b) The owner's scenario: a 900 pt window with a Task open, the sidebar hidden, then shown.
    /// Everything fits at 888 pt, so nothing grows and the inspector stays.
    @Test(arguments: ["toolbar", "menu"])
    func showingTheSidebarAt900WithATaskOpenChangesNothingElse(path: String) async throws {
        let origin = try #require(SidebarRoomHarness.onScreen)
        let room = await SidebarRoomHarness(model: SidebarRoomHarness.fixtureModel(), at: origin)
        defer { room.close() }
        try #require(room.window.screen != nil)
        room.model.beginEditing(room.model.tasks[3]); await room.settle()
        await room.toggle(path)
        await room.resize(900)
        try #require(!room.sidebarShown && room.window.frame.width == 900)
        await room.toggle(path)
        #expect(room.sidebarShown)
        #expect(room.window.frame.width == 900)
        #expect(room.model.editor?.id == "t003")
        #expect(room.inspectorShown)
        #expect(room.outside.isEmpty)
    }

    /// (a) The rule runs from the toolbar and from the menu command. With the inspector widened to
    /// 480 pt, a 900 pt window needs 532 pt with the sidebar hidden and 988 pt shown: the window grows
    /// by exactly the 88 pt that are missing, and keeps the inspector at its width.
    /// At the screen's left edge there is no room to the left: the window grows to the right.
    @Test func atTheScreensLeftEdgeTheWindowGrowsToTheRight() async throws {
        let visible = try #require(NSScreen.main?.visibleFrame)
        let room = await SidebarRoomHarness(model: SidebarRoomHarness.fixtureModel(), at: NSPoint(x: visible.minX, y: visible.minY + 10))
        defer { room.close() }
        try #require(room.window.screen != nil && visible.width >= 988)
        room.model.beginEditing(room.model.tasks[3]); await room.settle()
        try await room.widenInspector(to: 480)
        await room.toolbarToggle()
        await room.resize(900)
        try await room.widenInspector(to: 480)
        try #require(!room.sidebarShown && room.window.frame.minX == visible.minX)
        await room.toolbarToggle()
        #expect(room.window.frame.width == 988)
        #expect(room.window.frame.minX == visible.minX)
    }

    @Test(arguments: ["toolbar", "menu"])
    func aWidenedInspectorGrowsTheWindowByWhatIsMissing(path: String) async throws {
        let origin = try #require(SidebarRoomHarness.onScreen)
        let room = await SidebarRoomHarness(model: SidebarRoomHarness.fixtureModel(), at: origin)
        defer { room.close() }
        try #require(room.window.screen != nil && room.window.screen!.visibleFrame.width >= 988)
        room.model.beginEditing(room.model.tasks[3]); await room.settle()
        try await room.widenInspector(to: 480)
        await room.toggle(path)
        await room.resize(900)
        try await room.widenInspector(to: 480)
        try #require(!room.sidebarShown && room.window.frame.width == 900 && room.inspectorWidth == 480)
        #expect(SidebarRoom.enforcedMinimum(in: room.window) == 532)
        let before = room.window.frame
        await room.toggle(path)
        #expect(room.sidebarShown)
        #expect(room.window.frame.width == 988)
        // It grows to the left, so the list moves as little as it can under the pointer (UI seat).
        #expect(room.window.frame.maxX == before.maxX)
        #expect(room.model.editor?.id == "t003")
        #expect(room.inspectorWidth == 480)
        #expect(room.outside.isEmpty)
    }
} }
