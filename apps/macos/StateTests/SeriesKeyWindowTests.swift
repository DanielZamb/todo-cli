import AppKit
import Foundation
import HTTPTypes
import OpenAPIRuntime
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

/// Records each operation and answers nothing: the Series write is seen, never sent.
private actor RecordingTransport: ClientTransport {
    private(set) var operations: [String] = []
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        operations.append(operationID)
        throw RequestFailure(status: 503, message: "recorded only", code: "unavailable")
    }
}

/// Mac UI review 2, item 4: the Series sheet's default action, in a real key window rather than an
/// inactive offscreen one. The real RootView opens the editor and its Series sheet in a titled
/// window that this process makes key; the cell measures the colour of "Create Series" against the
/// app's primary colour and the system accent, then presses Return and records whether the Series
/// write starts. It shows a window for a few seconds, so it runs only when its runner
/// (.agents/skills/verify-macos/scripts/series-key-window.py) has checked that no Todo app is
/// frontmost and that there has been no input for a minute (TODO_SERIES_KEY_WINDOW=1).
@MainActor @Suite(.serialized) struct SeriesKeyWindowTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SERIES_KEY_WINDOW"] == "1"))
    func createSeriesCarriesTheAppTintAndReturnTriggersItInAKeyWindow() async throws {
        let output = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_SERIES_KEY_WINDOW_EVIDENCE"]))
        let application = NSApplication.shared
        application.setActivationPolicy(.accessory)
        application.appearance = NSAppearance(named: .aqua)
        let transport = RecordingTransport()
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:9")!, initialProfile: "work", vaultService: "never-used-series-key-window"),
                              clientFactory: { url, token in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: token)]) },
                              clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.clientDiagnosticsUI.stop()
        let task = TaskSnapshot(
            id: "series-key-window", profile_id: "work", row_version: 1, title: "Water the plants", description: nil,
            priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil,
            scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: false, deleted_at: nil)
        model.replaceCredential("recorded-only"); model.signedIn = true; model.connection = .live
        model.tasks = [task]
        model.beginEditing(task)
        model.recurrenceDraft = .init(dtstart: .init(kind: "date", date: "2026-11-20"), rrule: "FREQ=DAILY", exdate: [])
        model.showingSeries = true
        var compact = false
        // macOS (14 and later) lets an app become active only when the frontmost app yields, so a
        // test process cannot take focus from the app in front. The window is made key within this
        // process and the hosted view is given the control state an active key window has; the
        // receipt records whether the application actually became active.
        let controller = NSHostingController(rootView: RootView(model: model, compactMode: Binding(get: { compact }, set: { compact = $0 })).environment(\.controlActiveState, .key))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1100, height: 760), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = controller
        window.center()
        defer { window.attachedSheet.map { window.endSheet($0) }; window.contentViewController = nil; window.close(); model.signedIn = false }
        application.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        var sheet: NSWindow?
        for _ in 0..<400 {
            sheet = window.attachedSheet
            if let sheet, sheet.isVisible { _ = sheet; if sheet.isKeyWindow || !application.isActive { break } }
            try await Task.sleep(for: .milliseconds(10))
        }
        let shown = try #require(sheet, "the Series sheet is presented")
        try await Task.sleep(for: .milliseconds(400)) // the sheet's own animation
        let key = shown.isKeyWindow, active = application.isActive
        // SwiftUI builds a sheet's accessibility children only for an accessibility client (a first
        // attempt found 2 elements), so the button is found by its pixels: the sheet's bottom-right
        // action area holds Close and Create Series, and only a tinted (or accent-coloured)
        // prominent button has saturated pixels there.
        let content = try #require(shown.contentView)
        content.layoutSubtreeIfNeeded()
        let bitmap = try #require(content.bitmapImageRepForCachingDisplay(in: content.bounds))
        content.cacheDisplay(in: content.bounds, to: bitmap)
        let scale = CGFloat(bitmap.pixelsWide) / content.bounds.width
        let local = NSRect(x: content.bounds.width - 300, y: 0, width: 300, height: 80) // points from the bottom-right
        var sum = [0.0, 0.0, 0.0], counted = 0
        for py in Int(local.minY * scale)..<Int(local.maxY * scale) {
            for px in Int(local.minX * scale)..<Int(local.maxX * scale) {
                let y = bitmap.pixelsHigh - 1 - py // bitmap rows start at the top
                guard let color = bitmap.colorAt(x: px, y: y)?.usingColorSpace(.sRGB) else { continue }
                let channels = [Double(color.redComponent), Double(color.greenComponent), Double(color.blueComponent)]
                guard channels.max()! - channels.min()! > 0.2 else { continue } // grey, white, black and text
                for index in 0..<3 { sum[index] += channels[index] }; counted += 1
            }
        }
        if let png = bitmap.representation(using: .png, properties: [:]) { try png.write(to: output.appendingPathComponent("series-key-window.png")) }
        try JSONSerialization.data(withJSONObject: ["can_write": model.canWrite, "connection": String(describing: model.connection), "busy": model.busy, "signed_in": model.signedIn,
                                                    "showing_series": model.showingSeries, "editor": model.editor?.id ?? "", "sheet_key": shown.isKeyWindow, "application_active": application.isActive,
                                                    "coloured_pixels": counted, "content_size": [content.bounds.width, content.bounds.height], "bitmap": [bitmap.pixelsWide, bitmap.pixelsHigh]],
                                     options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("series-state.json"))
        // AppKit draws a prominent button in its tint only in the active application's key window; in
        // an inactive one every button is grey, so the colour is measurable only when activation was
        // granted. A grey button in an active key window fails.
        let bezel = counted > 0 ? sum.map { $0 / Double(counted) } : []
        func components(_ color: NSColor?) -> [Double] {
            var value: [Double] = []
            NSAppearance(named: .aqua)?.performAsCurrentDrawingAppearance {
                if let c = color?.usingColorSpace(.sRGB) { value = [Double(c.redComponent), Double(c.greenComponent), Double(c.blueComponent)] }
            }
            return value
        }
        let primary = components(NSColor(named: "primary", bundle: TodoColors.bundle)), accent = components(.controlAccentColor)
        func distance(_ a: [Double], _ b: [Double]) -> Double { a.count == 3 && b.count == 3 ? sqrt(zip(a, b).map { ($0 - $1) * ($0 - $1) }.reduce(0, +)) : .infinity }
        let toPrimary = distance(bezel, primary), toAccent = distance(bezel, accent)
        // Return: through the application when it is active (as the system delivers a key press to
        // the key window), otherwise straight to the sheet window, whose key equivalents run the same way.
        let before = await transport.operations.filter { $0 == "tasks.createSeries" }.count
        let routed = active ? "application" : "sheet window"
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            let event = try #require(NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: shown.windowNumber, context: nil, characters: "\r", charactersIgnoringModifiers: "\r", isARepeat: false, keyCode: 36))
            if active { application.sendEvent(event) } else if type == .keyDown, !shown.performKeyEquivalent(with: event) { shown.sendEvent(event) }
        }
        var created = before
        for _ in 0..<200 {
            created = await transport.operations.filter { $0 == "tasks.createSeries" }.count
            if created > before { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        let receipt: [String: Any] = [
            "sheet_key": key, "application_active": active, "return_routed_through": routed, "control_active_state": "key (set on the hosted view)", "sampled_area_points_from_bottom_right": [local.minX, local.minY, local.width, local.height],
            "bezel_srgb": bezel, "primary_srgb": primary, "system_accent_srgb": accent,
            "distance_to_primary": toPrimary.isFinite ? toPrimary as Any : NSNull(), "distance_to_system_accent": toAccent.isFinite ? toAccent as Any : NSNull(), "samples": counted,
            "return_started_create_series": created > before, "operations": await transport.operations, "app_launched": false,
        ]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("series-key-window.json"))
        if let png = bitmap.representation(using: .png, properties: [:]) { try png.write(to: output.appendingPathComponent("series-key-window.png")) }
        let tint = active && key ? (toPrimary < 0.08 ? "primary" : counted == 0 ? "grey" : toAccent < 0.08 ? "system accent" : "other") : "not measurable: the window was not the active application's key window"
        try JSONSerialization.data(withJSONObject: ["tint": tint], options: []).write(to: output.appendingPathComponent("series-tint.json"))
        if active && key { #expect(tint == "primary", "Create Series is drawn in the app's primary colour: bezel \(bezel), primary \(primary), accent \(accent)") }
        #expect(created > before, "Return starts the Series write")
    }
}
