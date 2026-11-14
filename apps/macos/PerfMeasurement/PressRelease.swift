import AppKit
import Foundation
import SwiftUI

// Press against release on the production RootView at 178 rows, inside a real
// NSApplication event loop. Compiled as main.swift of an executable together with
// the measured tree's Sources (TodoApp.swift excluded). Both the press and the
// release are posted to NSApp's queue, so AppKit dispatches them as real input,
// including into any tracking loop. Times are systemUptime in ms.

private func progress(_ text: String) { FileHandle.standardError.write(Data(("press: " + text + "\n").utf8)) }
private func now() -> Double { ProcessInfo.processInfo.systemUptime * 1000 }

private final class Posted: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Double?
    func set(_ time: Double) { lock.lock(); value = time; lock.unlock() }
    func get() -> Double? { lock.lock(); defer { lock.unlock() }; return value }
}

/// Records every event the window dispatches, so a run shows whether input arrived.
final class ProbeWindow: NSWindow {
    nonisolated(unsafe) static var dispatched: [(String, Double)] = []
    override func sendEvent(_ event: NSEvent) {
        ProbeWindow.dispatched.append((String(describing: event.type), now()))
        super.sendEvent(event)
    }
}

@MainActor final class PressProbe {
    var events: [(String, Double)] = []
    var observers: [NSObjectProtocol] = []
    var monitor: Any?
    let env = ProcessInfo.processInfo.environment

    func observe() {
        let names = [NSTableView.selectionIsChangingNotification, NSTableView.selectionDidChangeNotification, NSOutlineView.selectionIsChangingNotification, NSOutlineView.selectionDidChangeNotification]
        for name in names {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { [weak self] note in
                let time = now(); let name = note.name.rawValue
                MainActor.assumeIsolated { self?.events.append((name, time)) }
            })
        }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp, .leftMouseDragged]) { [weak self] event in
            let time = now(); let name = "monitor." + String(describing: event.type)
            MainActor.assumeIsolated { self?.events.append((name, time)) }
            return event
        }
    }
    func first(_ name: String, after start: Double) -> Double? { events.first { $0.0 == name && $0.1 >= start }?.1 }

    func run() async throws {
        let output = env["MAC_PRESS_OUTPUT"]!
        let hold = Double(env["MAC_PRESS_HOLD_MS"] ?? "300") ?? 300
        let samples = Int(env["MAC_PRESS_SAMPLES"] ?? "12") ?? 12
        let visible = env["MAC_PRESS_VISIBLE"] == "1"
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-press-release")/*MODEL_INIT_EXTRA*/)
        model.replaceCredential("ses_synthetic_press_release"); model.signedIn = true; model.connection = .live; model.selectedView = "all"
        var rows: [[String: Any]] = []
        let priorities = ["P1", "P2", "P3", "P4"]
        let description = String(repeating: "Ordinary planning words. ", count: 50)
        for index in 0..<178 {
            var row: [String: Any] = [:]
            row["id"] = "press-\(index)"
            row["profile_id"] = "work"
            row["row_version"] = 1
            row["title"] = "Selection press " + String(format: "%03d", index)
            row["description"] = description
            row["priority"] = priorities[index % 4]
            row["source"] = "manual"
            let status: String = index < 50 ? "open" : (index < 176 ? "done" : "cancelled")
            row["status"] = status
            row["tags"] = [String]()
            rows.append(row)
        }
        model.tasks = try JSONDecoder().decode([TaskSnapshot].self, from: JSONSerialization.data(withJSONObject: rows))
        let host = NSHostingView(rootView: RootView(model: model, compactMode: .constant(false)))
        let frame = visible ? NSRect(x: 80, y: 80, width: 1200, height: 900) : NSRect(x: -10000, y: -10000, width: 1200, height: 900)
        let window = ProbeWindow(contentRect: frame, styleMask: [.titled, .resizable, .closable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentView = host
        if visible { NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil); window.makeMain() }
        for _ in 0..<50 where visible && !window.isKeyWindow { try await Task.sleep(for: .milliseconds(20)); window.makeKeyAndOrderFront(nil) }
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        var table: NSTableView?
        for _ in 0..<200 {
            host.layoutSubtreeIfNeeded()
            // SwiftUI can keep a hidden copy of the list outside this window; use the visible one.
            table = descendants(host).compactMap { $0 as? NSTableView }.first { $0.numberOfRows >= 178 && $0.window === window && !$0.visibleRect.isEmpty }
            if table != nil { break }
            try await Task.sleep(for: .milliseconds(20))
        }
        guard let list = table else { throw NSError(domain: "press", code: 1, userInfo: [NSLocalizedDescriptionKey: "no 178-row table"]) }
        progress("table \(list.numberOfRows) key=\(window.isKeyWindow) active=\(NSApp.isActive)")
        observe()
        var results: [[String: Any]] = []
        // SwiftUI rebuilds the outline list (for example when the window becomes key), so a
        // table reference goes stale; find the attached, visible one before every press.
        func currentTable() async throws -> NSTableView {
            for _ in 0..<200 {
                host.layoutSubtreeIfNeeded()
                if let table = descendants(host).compactMap({ $0 as? NSTableView }).first(where: { $0.numberOfRows >= 178 && $0.window === window && !$0.visibleRect.isEmpty }) { return table }
                try await Task.sleep(for: .milliseconds(20))
            }
            for table in descendants(host).compactMap({ $0 as? NSTableView }) { progress("table rows=\(table.numberOfRows) attached=\(table.window === window) visible=\(table.visibleRect) class=\(type(of: table))") }
            progress("window key=\(window.isKeyWindow) visible=\(window.isVisible) sheet=\(String(describing: window.attachedSheet)) windows=\(NSApp.windows.map { "\(type(of: $0)) \($0.isVisible)" })")
            throw NSError(domain: "press", code: 4, userInfo: [NSLocalizedDescriptionKey: "no attached 178-row table"])
        }
        for index in 0..<samples {
            let row = 4 + (index % 2) * 3
            try await Task.sleep(for: .milliseconds(300))
            let list = try await currentTable()
            list.scrollRowToVisible(row); host.layoutSubtreeIfNeeded()
            try await Task.sleep(for: .milliseconds(200))
            let rect = list.rect(ofRow: row)
            let point = list.convert(NSPoint(x: rect.minX + 90, y: rect.midY), to: nil)
            guard list.row(at: list.convert(point, from: nil)) == row else { throw NSError(domain: "press", code: 2, userInfo: [NSLocalizedDescriptionKey: "point misses row \(row)"]) }
            PressReleaseTrace.handlers = []
            events = []
            ProbeWindow.dispatched = []
            progress("geometry point=\(point) content=\(window.contentView!.bounds) frameView=\(String(describing: window.contentView?.superview?.frame)) row=\(rect) visible=\(list.visibleRect) sameWindow=\(list.window === window) tableInWindow=\(list.convert(list.visibleRect, to: nil))")
            // The frame view's coordinates are window coordinates.
            let hit = window.contentView?.superview?.hitTest(point)
            var chain: [String] = []
            var ancestor = hit
            while let view = ancestor, chain.count < 12 { chain.append(String(describing: type(of: view))); ancestor = view.superview }
            let selectedBefore = list.selectedRow
            let keyAtPress = window.isKeyWindow, activeAtPress = NSApp.isActive
            let editorBefore = model.editor?.id
            let start = ProcessInfo.processInfo.systemUptime
            guard let down = NSEvent.mouseEvent(with: .leftMouseDown, location: point, modifierFlags: [], timestamp: start, windowNumber: window.windowNumber, context: nil, eventNumber: 2 * index + 1, clickCount: 1, pressure: 1),
                  let up = NSEvent.mouseEvent(with: .leftMouseUp, location: point, modifierFlags: [], timestamp: start + hold / 1000, windowNumber: window.windowNumber, context: nil, eventNumber: 2 * index + 2, clickCount: 1, pressure: 0) else { throw NSError(domain: "press", code: 3) }
            let posted = Posted()
            nonisolated(unsafe) let release = up
            let pressed = start * 1000
            // MAC_PRESS_DELIVERY=send hands the press to the window inside the running event loop;
            // post (default) queues it for NSApp like hardware input.
            if env["MAC_PRESS_DELIVERY"] == "send" { DispatchQueue.main.async { window.sendEvent(down) } } else { NSApp.postEvent(down, atStart: false) }
            Thread.detachNewThread {
                Thread.sleep(forTimeInterval: hold / 1000)
                posted.set(now())
                NSApplication.shared.postEvent(release, atStart: false)
            }
            let deadline = ProcessInfo.processInfo.systemUptime + 3
            while ProcessInfo.processInfo.systemUptime < deadline {
                if posted.get() != nil, first("monitor.leftMouseUp", after: pressed) != nil || ProcessInfo.processInfo.systemUptime * 1000 - pressed > hold + 400 { break }
                try await Task.sleep(for: .milliseconds(1))
            }
            try await Task.sleep(for: .milliseconds(400))
            let releasePosted = posted.get()
            let handler = PressReleaseTrace.handlers.first
            let committed = first(NSOutlineView.selectionDidChangeNotification.rawValue, after: pressed) ?? first(NSTableView.selectionDidChangeNotification.rawValue, after: pressed)
            func since(_ value: Double?) -> Any { value.map { $0 - pressed } ?? NSNull() }
            func before(_ value: Double?) -> Any { value.flatMap { v in releasePosted.map { v < $0 } } ?? NSNull() }
            results.append([
                "row": row, "key_at_press": keyAtPress, "active_at_press": activeAtPress, "key_after": window.isKeyWindow, "active_after": NSApp.isActive, "selected_before": selectedBefore, "selected_after": list.selectedRow, "editor_before": editorBefore ?? NSNull(), "editor_after": model.editor?.id ?? NSNull(),
                "release_posted_ms": since(releasePosted),
                "monitor_down_ms": since(first("monitor.leftMouseDown", after: pressed)), "monitor_up_ms": since(first("monitor.leftMouseUp", after: pressed)),
                "native_changing_ms": since(first(NSOutlineView.selectionIsChangingNotification.rawValue, after: pressed) ?? first(NSTableView.selectionIsChangingNotification.rawValue, after: pressed)),
                "native_committed_ms": since(committed),
                "handler_ms": since(handler), "handlers": PressReleaseTrace.handlers.count,
                "native_before_release": before(committed), "handler_before_release": before(handler),
                "hit_chain": chain, "first_responder": window.firstResponder.map { String(describing: type(of: $0)) } ?? NSNull(),
                "window_dispatched": ProbeWindow.dispatched.map { "\($0.0)@\(Int($0.1 - pressed))" },
            ])
            progress("sample \(index) row=\(row) selected=\(list.selectedRow) handler=\(String(describing: since(handler))) release=\(String(describing: since(releasePosted)))")
        }
        let summary: [String: Any] = ["delivery": env["MAC_PRESS_DELIVERY"] ?? "post", "activation_policy": NSApp.activationPolicy().rawValue, "hold_ms": hold, "rows": model.tasks.count, "native_rows": list.numberOfRows, "native_class": String(describing: type(of: list)), "visible_window": visible, "key_window": window.isKeyWindow, "app_active": NSApp.isActive, "samples": results]
        try JSONSerialization.data(withJSONObject: summary, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: output))
        model.signedIn = false; window.contentView = nil; window.close()
    }
}

let application = NSApplication.shared
let policy = ProcessInfo.processInfo.environment["MAC_PRESS_POLICY"]
application.setActivationPolicy(policy == "regular" ? .regular : ProcessInfo.processInfo.environment["MAC_PRESS_VISIBLE"] == "1" ? .accessory : .prohibited)
let probe = PressProbe()
Task { @MainActor in
    do { try await probe.run(); progress("done"); exit(0) }
    catch { progress("failed: \(error)"); exit(1) }
}
application.run()
