import AppKit
import SwiftUI
import CoreGraphics
@testable import TodoState

@MainActor private final class RowProbeDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { .terminateCancel }
}

@MainActor private func measureRowSelection(_ model: TodoModel) async throws -> [String: Any] {
    let env = ProcessInfo.processInfo.environment
    let visible = env["MAC_PERF_VISIBLE_ROW"] == "1"
    func progress(_ phase: String, _ extra: [String: Any] = [:]) {
        guard let output = env["MAC_PERF_OUTPUT"] else { return }
        let data = try? JSONSerialization.data(withJSONObject: extra.merging(["phase": phase]) { _, new in new }, options: [.prettyPrinted, .sortedKeys])
        try? data?.write(to: URL(fileURLWithPath: output + ".row-progress.json"))
    }
    progress("before-application")
    NSApplication.shared.setActivationPolicy(visible ? .regular : .prohibited)
    let priorDelegate = NSApplication.shared.delegate
    let delegate = RowProbeDelegate()
    NSApplication.shared.delegate = delegate
    defer { NSApplication.shared.delegate = priorDelegate }
    model.connection = .live
    let controller = NSHostingController(rootView: RootView(model: model, compactMode: .constant(false)).frame(width: 1000, height: 720))
    let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 1000, height: 720), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    window.title = "Todo scratch row probe " + (env["MAC_PERF_VARIANT"] ?? "production")
    window.contentViewController = controller
    controller.view.frame = NSRect(x: 0, y: 0, width: 1000, height: 720)
    defer { window.orderOut(nil); window.contentViewController = nil; window.close() }
    if visible {
        let screen = NSScreen.main!.visibleFrame
        window.setFrameOrigin(NSPoint(x: screen.midX - 500, y: screen.midY - 360))
        window.orderFrontRegardless()
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
        _ = NSRunningApplication.current.activate(options: [.activateIgnoringOtherApps, .activateAllWindows])
        window.makeKey()
    }
    func views(_ root: NSView) -> [NSView] { [root] + root.subviews.flatMap(views) }
    for _ in 0..<30 { controller.view.layoutSubtreeIfNeeded(); try await Task.sleep(for: .milliseconds(20)) }
    guard window.attachedSheet == nil else { throw NSError(domain: "MacRowProbe", code: 1) }
    let allViews = views(controller.view)
    guard let table = allViews.compactMap({ $0 as? NSTableView }).max(by: { $0.numberOfRows < $1.numberOfRows }) else {
        return ["decided": false, "reason": "No native table", "classes": Array(Set(allViews.map { String(describing: type(of: $0)) })).sorted()]
    }
    var observedMouseEvents: [[String: Any]] = []
    let monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp]) { event in
        MainActor.assumeIsolated { observedMouseEvents.append(["type": event.type.rawValue, "window": event.windowNumber, "ownWindow": event.windowNumber == window.windowNumber]) }
        return event
    }
    defer { if let monitor { NSEvent.removeMonitor(monitor) } }
    let postAccess = visible && CGPreflightPostEventAccess()
    let originalPointer = CGEvent(source: nil)?.location
    defer {
        if postAccess, let originalPointer { CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: originalPointer, mouseButton: .left)?.post(tap: .cghidEventTap) }
    }
    var attempts: [[String: Any]] = []
    for method in postAccess ? ["sendEvent", "CGEvent"] : ["sendEvent"] {
        for x in [200.0, max(220, table.bounds.width - 20)] {
            table.deselectAll(nil)
            model.editor = nil
            if visible { try await Task.sleep(for: .milliseconds(40)) }
            let row = min(2, table.numberOfRows - 1)
            let rect = table.rect(ofRow: row)
            let point = table.convert(NSPoint(x: x, y: rect.midY), to: nil)
            progress("before-mouse", ["row": row, "x": x, "method": method, "point": NSStringFromPoint(point), "rows": table.numberOfRows])
            if method == "CGEvent" {
                let screenPoint = window.convertPoint(toScreen: point)
                let globalPoint = CGPoint(x: screenPoint.x, y: CGDisplayBounds(CGMainDisplayID()).height - screenPoint.y)
                CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: globalPoint, mouseButton: .left)?.post(tap: .cghidEventTap)
                CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: globalPoint, mouseButton: .left)?.post(tap: .cghidEventTap)
                try await Task.sleep(for: .milliseconds(40))
                CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: globalPoint, mouseButton: .left)?.post(tap: .cghidEventTap)
            } else {
                let down = NSEvent.mouseEvent(with: .leftMouseDown, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: 1)!
                let up = NSEvent.mouseEvent(with: .leftMouseUp, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime + 0.01, windowNumber: window.windowNumber, context: nil, eventNumber: 2, clickCount: 1, pressure: 0)!
                NSApplication.shared.postEvent(up, atStart: true)
                window.sendEvent(down)
                window.sendEvent(up)
            }
            if visible { try await Task.sleep(for: .milliseconds(150)) }
            let result: [String: Any] = ["method": method, "x": x, "row": row, "selectedRow": table.selectedRow, "editorOpened": model.editor != nil, "windowKey": window.isKeyWindow, "applicationActive": NSApplication.shared.isActive, "hitClass": window.contentView?.hitTest(point).map { String(describing: type(of: $0)) } ?? "none"]
            attempts.append(result)
            progress("after-mouse", result)
        }
    }
    table.selectRowIndexes(IndexSet(integer: min(2, table.numberOfRows - 1)), byExtendingSelection: false)
    if visible { try await Task.sleep(for: .milliseconds(100)) }
    let programmatic = ["selectedRow": table.selectedRow, "editorOpened": model.editor != nil] as [String: Any]
    let result: [String: Any] = ["decided": attempts.contains { $0["editorOpened"] as? Bool == true }, "rows": table.numberOfRows, "canWrite": model.canWrite, "windowVisible": window.isVisible, "sheetOpen": window.attachedSheet != nil, "cgPostAccess": postAccess, "observedMouseEvents": observedMouseEvents, "windowFrame": NSStringFromRect(window.frame), "screenFrame": NSStringFromRect(NSScreen.main!.frame), "canBecomeKey": window.canBecomeKey, "windowNumber": window.windowNumber, "cgPermissionRequested": false, "attempts": attempts, "programmatic": programmatic]
    model.editor = nil
    progress("finished", result)
    return result
}
