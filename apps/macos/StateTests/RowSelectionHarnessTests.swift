import AppKit
import Foundation
import HTTPTypes
import OpenAPIRuntime
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

/// Follow-up 80's harness: keyboard row selection measured as the owner's journal measures it.
/// - a real arrow keyDown, handed to PersonInput (what its local monitor does) and then to
///   NSApp.sendEvent, so AppKit's outline view selects as in the app;
/// - Diagnostics authorized for the owner, so the same eight events are recorded, and the steps are
///   computed from the journal (`current.ndjson`), not from a stopwatch;
/// - an on-screen window (the runner checks the owner is away first), 150 Task rows;
/// - inputs about 200 ms apart, as in the owner's sessions.
/// Runs only when ROW_HARNESS_OUT names a file for the results; apps/macos/PerfMeasurement/row_harness.py
/// waits for the owner to be away, builds and runs it, and describes the calibration.
private struct NoNetwork: ClientTransport {
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) { throw URLError(.notConnectedToInternet) }
}

extension MainThreadExclusive { @MainActor @Suite(.serialized) struct RowSelectionHarnessTests {
    private var env: [String: String] { ProcessInfo.processInfo.environment }
    private func views(_ v: NSView) -> [NSView] { [v] + v.subviews.flatMap(views) }
    private func settle(_ ms: Int) async { try? await Task.sleep(for: .milliseconds(ms)) }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["ROW_HARNESS_OUT"] != nil))
    func keyboardSelectionSteps() async throws {
        let rounds = Int(env["ROW_HARNESS_ROUNDS"] ?? "120")!, rows = Int(env["ROW_HARNESS_ROWS"] ?? "150")!
        let journal = FileManager.default.temporaryDirectory.appendingPathComponent("row-harness-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: journal, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: journal) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: journal); recorder.authorizeOwnerSession(true)
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-row-harness"),
                              clientFactory: { url, _ in Client(serverURL: url, transport: NoNetwork()) }, clientDiagnostics: recorder,
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.personInput.applicationActive = { true }
        // An owner Session's credential, so signedIn authorizes Diagnostics as in the app.
        model.replaceCredential("ses_row-harness")
        model.signedIn = true; model.connection = .live; model.selectedView = "all"
        model.profiles = [.init(id: "work", name: "Work", open_task_count: rows, inbox_task_count: 3)]
        model.projects = [.init(id: "launch", name: "Launch", open_task_count: rows / 2, inbox_task_count: nil)]
        model.tags = [.init(id: "focus", name: "focus", open_task_count: rows, inbox_task_count: nil)]
        // ROW_HARNESS_RICH=1: Tasks like the owner's (Dependencies, blocked badges, due dates, several
        // Tags, longer descriptions), to find what the plain fixture leaves out.
        let rich = env["ROW_HARNESS_RICH"] == "1"
        if rich { model.tags = ["focus", "review", "deep work", "release", "ops"].map { .init(id: $0, name: $0, open_task_count: rows, inbox_task_count: nil) } }
        model.tasks = (0..<rows).map { index in
            var task = TaskSnapshot(id: String(format: "t%03d", index), profile_id: "work", row_version: 1, title: "Review the long launch checklist with the whole team \(index)",
                         description: rich ? String(repeating: "Context for \(index): what was agreed, what is left, who to ask.\n", count: 6) : (index % 3 == 0 ? "Notes for \(index)\nSecond line" : nil),
                         priority: ["P1", "P2", "P3"][index % 3], source: "manual", status: "open", project_id: index % 2 == 0 ? "launch" : nil,
                         tags: rich ? Array(["focus", "review", "deep work", "release", "ops"].prefix(1 + index % 4)) : ["focus"],
                         due_at: rich && index % 2 == 0 ? TaskTime(kind: "date", date: "2026-11-\(10 + index % 18)") : nil, scheduled_at: nil, energy: 2, estimate_min: 30, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
            if rich && index > 2 && index % 3 == 0 {
                task.depends_on = [String(format: "t%03d", index - 1), String(format: "t%03d", index - 2)]; task.blocked = true; task.ready = false
            }
            return task
        }
        model.clientDiagnosticsUI.start()
        var compact = false
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1300, height: 800), styleMask: [.titled, .closable, .resizable, .miniaturizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = NSHostingController(rootView: RootView(model: model, compactMode: Binding(get: { compact }, set: { compact = $0 })))
        let visible = try #require(NSScreen.main?.visibleFrame)
        let height = Double(env["ROW_HARNESS_HEIGHT"] ?? "800")!
        window.setFrame(NSRect(x: visible.minX + 20, y: visible.minY + 20, width: min(1300, visible.width - 40), height: min(height, visible.height - 40)), display: true)
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        defer { model.clientDiagnosticsUI.stop(); window.contentViewController = nil; window.close(); model.signedIn = false }
        await settle(800)
        let outline = try #require(views(window.contentView!).compactMap { $0 as? NSOutlineView }.first, "the list's outline view")
        // Open the first P1 Task, as the owner works with the inspector open; the app's
        // onChange(of: model.editor?.id) selects its row.
        model.beginEditing(try #require(model.tasks.first { $0.priority == "P1" }))
        await settle(800)
        window.makeFirstResponder(outline)
        await settle(300)
        try #require(model.editor != nil && outline.selectedRow >= 0, "the first Task did not open or its row is not selected: \(outline.selectedRow)")
        let first = outline.selectedRow
        let realized = outline.rows(in: outline.visibleRect)
        var direction: UInt16 = 125, sent = 0
        for _ in 0..<rounds {
            if outline.selectedRow >= outline.numberOfRows - 2 { direction = 126 }
            if outline.selectedRow <= first { direction = 125 }
            let arrow = String(UnicodeScalar(direction == 125 ? 0xF701 : 0xF700)!)
            let now = ProcessInfo.processInfo.systemUptime
            let down = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [.numericPad, .function], timestamp: now, windowNumber: window.windowNumber, context: nil, characters: arrow, charactersIgnoringModifiers: arrow, isARepeat: false, keyCode: direction)!
            let up = NSEvent.keyEvent(with: .keyUp, location: .zero, modifierFlags: [.numericPad, .function], timestamp: now + 0.05, windowNumber: window.windowNumber, context: nil, characters: arrow, charactersIgnoringModifiers: arrow, isARepeat: false, keyCode: direction)!
            model.personInput.observe(down) // what the app's local monitor does before dispatch
            NSApp.sendEvent(down)
            await settle(50)
            NSApp.sendEvent(up)
            await settle(150)
            sent += 1
        }
        await settle(1000)
        await recorder.flush()
        // The journal's events for keyboard selections, by action.
        let lines = try String(contentsOf: journal.appendingPathComponent("current.ndjson"), encoding: .utf8).split(separator: "\n")
        var byAction: [String: [String: Double]] = [:]
        var context: [String: Any] = [:]
        for line in lines {
            if let object = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any], object["name"] as? String == "ui.layout.committed",
               let selection = object["selectionContext"] as? [String: Any] {
                context = selection.filter { ["realizedRows", "listRows", "windowWidth", "listWidth"].contains($0.key) }
            }
            guard let object = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any], let name = object["name"] as? String,
                  let action = object["actionID"] as? String, let ms = object["monotonicMS"] as? Double else { continue }
            if byAction[action]?[name] == nil { byAction[action, default: [:]][name] = ms }
        }
        let steps = byAction.values.compactMap { e -> [String: Double]? in
            guard let input = e["ui.input.observed"], let native = e["ui.selection.nativeCommitted"], let started = e["ui.action.started"],
                  let published = e["model.published"], let layout = e["ui.layout.committed"] else { return nil }
            return ["nativeCommit": native - input, "handlerStart": started - input, "published": published - input, "layout": layout - input,
                    "step1": started - native, "step2": published - started, "step3": layout - published]
        }
        func stat(_ key: String) -> [String: Double] {
            let values = steps.compactMap { $0[key] }.sorted()
            guard !values.isEmpty else { return [:] }
            return ["median": values[values.count / 2], "p90": values[min(values.count - 1, Int(Double(values.count) * 0.9))]]
        }
        let summary: [String: Any] = ["rich": rich, "windowHeight": window.frame.height, "rounds": sent, "complete": steps.count, "rows": rows, "realizedRows": realized.length, "journalContext": context, "loadAverage": { var l = [Double](repeating: 0, count: 3); getloadavg(&l, 3); return l }(),
                                      "cumulative": ["nativeCommit": stat("nativeCommit"), "handlerStart": stat("handlerStart"), "published": stat("published"), "layout": stat("layout")],
                                      "steps": ["nativeToHandler": stat("step1"), "handlerToPublished": stat("step2"), "publishedToLayout": stat("step3")]]
        try JSONSerialization.data(withJSONObject: summary, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: env["ROW_HARNESS_OUT"]!))
        print("ROWHARNESS \(summary)")
        #expect(steps.count >= rounds * 8 / 10, "complete selections: \(steps.count) of \(rounds)")
    }
} }
