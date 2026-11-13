import AppKit
import HTTPTypes
import OpenAPIRuntime
import SwiftUI
import Testing
import TodoAPI

@testable import TodoState

@MainActor private final class SnapshotBoundsCapture { var bounds: [String: CGRect] = [:] }

@MainActor final class AttachmentMeasurements { var frames: [String: CGRect] = [:] }
private struct ImportLayoutReceipt: Codable {
    let screen: String
    let compact: Bool
    let wholeRows: Int
    let partialRows: Int
    let viewportHeight: CGFloat?
    let summaryHeight: CGFloat?
    let targetHeights: [CGFloat]
    let rowBounds: [[CGFloat]]
    let textBounds: [[CGFloat]]
}

@MainActor private final class ImportFrameCapture { var frames: [ImportLayoutRegion: CGRect] = [:] }
@MainActor private final class TransferFrameCapture { var frames: [TransferFeedbackRegion: CGRect] = [:] }
private struct TransferLayoutReceipt: Codable {
    let screen: String
    let compact: Bool
    let messageToActions: CGFloat
    let primaryHeight: CGFloat
    let cancelHeight: CGFloat
    let actionsBottom: CGFloat
    let windowHeight: CGFloat
}

@MainActor
struct Snapshots {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"] != nil))
    func renderScreens() async throws {
        if ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DISCOVERY_ONLY"] == "1" || ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DAG_CHECKPOINT1"] == "1" || ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DAG_CHECKPOINT2"] == "1" || ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DAG_ONLY"] == "1" || ProcessInfo.processInfo.environment["TODO_SNAPSHOT_SC1_ONLY"] == "1" { return }
        NSApplication.shared.setActivationPolicy(.prohibited)
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"]))
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        #expect(NSColor(named: "primary", bundle: TodoColors.bundle) != nil)
        let referenceDate = try #require(ISO8601DateFormatter().date(from: "2026-10-28T15:00:00Z"))
        var files: [String] = []
        var importLayouts: [ImportLayoutReceipt] = []
        var transferLayouts: [TransferLayoutReceipt] = []
        var compactLayouts: [String: [String: [Double]]] = [:]
        for scheme in [ColorScheme.light, .dark] {
            let appearance = try #require(NSAppearance(named: scheme == .light ? .aqua : .darkAqua))
            NSApplication.shared.appearance = appearance
            var highlightComponents: [Int] = []
            appearance.performAsCurrentDrawingAppearance {
                if let highlight = NSColor(named: "search-highlight", bundle: TodoColors.bundle)?.usingColorSpace(.sRGB) {
                    highlightComponents = [highlight.redComponent, highlight.greenComponent, highlight.blueComponent].map { Int(($0 * 255).rounded()) }
                }
            }
            #expect(highlightComponents == (scheme == .light ? [221, 239, 216] : [52, 88, 63]))
            let mode = scheme == .light ? "light" : "dark"
            let model = fixture()
            func render<V: View>(_ name: String, _ view: V, width: CGFloat, height: CGFloat, scrollEditor: Bool = false, scrollTasks: CGFloat? = nil) async throws {
                let capture = SnapshotBoundsCapture()
                let measurements = AttachmentMeasurements()
                let compactMeasurements = AttachmentMeasurements()
                let receipt = DiagnosticsLayoutReceipt()
                let chipFrames = ChipFrameRecorder()
                let content = view.onPreferenceChange(AttachmentLayoutKey.self) { value in Task { @MainActor in measurements.frames = value } }.frame(width: width, height: height)
                    .onPreferenceChange(DiagnosticsBounds.self) { frames in MainActor.assumeIsolated { receipt.frames = frames } }
                    .onPreferenceChange(SnapshotBoundsKey.self) { capture.bounds = $0 }
                    .onPreferenceChange(QuickAddChipFrames.self) { frames in
                        MainActor.assumeIsolated { chipFrames.frames = frames }
                    }
                    .onPreferenceChange(QuickAddChipLabels.self) { labels in
                        MainActor.assumeIsolated { chipFrames.labels = labels }
                    }
                    .onPreferenceChange(CompactLayoutKey.self) { frames in
                        MainActor.assumeIsolated { compactMeasurements.frames = frames }
                    }
                    .background(.background)
                    .environment(\.colorScheme, scheme)
                    .environment(\.controlActiveState, .key)
                    .tint(TodoColors.color("primary"))
                let controller = NSHostingController(rootView: content)
                let host = controller.view
                let window = NSWindow(
                    contentRect: NSRect(x: -10000, y: -10000, width: width, height: height), styleMask: [.titled, .closable, .resizable],
                    backing: .buffered, defer: false)
                window.isReleasedWhenClosed = false
                host.appearance = NSAppearance(named: scheme == .light ? .aqua : .darkAqua)
                window.appearance = host.appearance
                window.contentViewController = controller
                host.frame = NSRect(x: 0, y: 0, width: width, height: height)
                host.layoutSubtreeIfNeeded()
                try await Task.sleep(for: .milliseconds(400))
                window.makeFirstResponder(nil)
                window.setContentSize(NSSize(width: width, height: height))
                host.frame = NSRect(x: 0, y: 0, width: width, height: height)
                host.layoutSubtreeIfNeeded()
                if scrollEditor {
                    func scrollViews(_ view: NSView) -> [NSScrollView] { (view as? NSScrollView).map { [$0] } ?? view.subviews.flatMap(scrollViews) }
                    if let scroller = scrollViews(host).max(by: { ($0.documentView?.frame.height ?? 0) < ($1.documentView?.frame.height ?? 0) }), let document = scroller.documentView {
                        let bottom = max(0, document.bounds.height - scroller.contentView.bounds.height)
                        scroller.contentView.scroll(to: NSPoint(x: 0, y: document.isFlipped ? bottom : 0))
                        scroller.reflectScrolledClipView(scroller.contentView)
                        host.layoutSubtreeIfNeeded()
                    }
                }
                if let scrollTasks {
                    func scrollViews(_ view: NSView) -> [NSScrollView] { (view as? NSScrollView).map { [$0] } ?? view.subviews.flatMap(scrollViews) }
                    if let scroller = scrollViews(host).max(by: { ($0.documentView?.frame.height ?? 0) < ($1.documentView?.frame.height ?? 0) }), let document = scroller.documentView {
                        let bottom = max(0, document.bounds.height - scroller.contentView.bounds.height)
                        let offset = min(scrollTasks, bottom)
                        scroller.contentView.scroll(to: NSPoint(x: 0, y: document.isFlipped ? offset : bottom - offset))
                        scroller.reflectScrolledClipView(scroller.contentView)
                        host.layoutSubtreeIfNeeded()
                    }
                }
                try await Task.sleep(for: .milliseconds(100))
                if name.hasPrefix("c8-") {
                    // Candidate 8 bounds receipt: the window, where its content starts (global frames
                    // include the title bar), every Compact frame, and whether every action, footer
                    // and Dismiss frame lies inside the content (nothing cut off at this size).
                    let top = window.frame.height - window.contentRect(forFrameRect: window.frame).height
                    let frames = compactMeasurements.frames.mapValues { ["x": Double($0.minX), "y": Double($0.minY), "width": Double($0.width), "height": Double($0.height)] }
                    let controls = compactMeasurements.frames.filter { key, _ in ["actions", "footer", "dismiss"].contains { key.contains($0) } }
                    let inside = controls.values.allSatisfy { $0.minX >= -0.5 && $0.maxX <= width + 0.5 && $0.minY >= top - 0.5 && $0.maxY <= top + height + 0.5 }
                    #expect(inside, "\(name): every action and footer is inside the \(Int(width)) by \(Int(height)) window: \(controls)")
                    let data: [String: Any] = ["window": ["width": Double(width), "height": Double(height)], "contentTop": Double(top), "controlsInside": inside, "controls": Array(controls.keys).sorted(), "frames": frames]
                    try JSONSerialization.data(withJSONObject: data, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("\(name)-\(mode)-bounds.json"))
                    if let dismiss = compactMeasurements.frames["message-dismiss"] {
                        #expect(dismiss.width >= 28 && dismiss.height >= 28, "\(name): the Dismiss target is at least 28 by 28 (ruling 3)")
                    }
                }
                if name.hasPrefix("search-") {
                    let frames = compactMeasurements.frames
                    compactLayouts[name + "-" + mode] = frames.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }
                    if name.hasPrefix("search-compact-") {
                        // Candidate 8 ruling 5: the Find field belongs to the list and is hidden while the editor is shown.
                        if name.hasSuffix("detail") || name.hasSuffix("copied") || name.hasSuffix("copy-failed") {
                            #expect(frames["search"] == nil, "\(name): no Find field over the Compact editor")
                        } else {
                            let search = try #require(frames["search"])
                            #expect(search.minX >= 0 && search.maxX <= width && search.minY >= 0 && search.maxY <= height)
                        }
                    }
                    if name.hasSuffix("initial-error") {
                        _ = try #require(frames["task-load-error"])
                        _ = try #require(frames["state-action"])
                        #expect(frames.keys.allSatisfy { !$0.hasPrefix("row-") })
                    }
                    if name.hasSuffix("budget-error") {
                        #expect(frames["search-retry"] == nil)
                    }
                    if name == "search-compact-offline" {
                        let row = try #require(frames["row-6aa2647d-1234-4567-89ab-0123456789ab"])
                        #expect(row.maxY > 0 && row.minY < height)
                        #expect(frames["search-retry"] == nil)
                        _ = try #require(frames["connection-status"])
                    }
                    if name.hasSuffix("detail") || name.hasSuffix("copied") || name.hasSuffix("copy-failed") {
                        let title = try #require(frames["task-title"])
                        let id = try #require(frames["task-id"])
                        #expect(id.minY >= title.maxY)
                    }
                }
                if name == "compact-editor" {
                    // Candidate 8 ruling 5: the footer sits below the scrolling body, so nothing in the
                    // body is drawn under it; the body scrolls with visible scroll bars.
                    let frames = compactMeasurements.frames
                    let body = try #require(frames["editor-scroll"]), footer = try #require(frames["editor-footer"])
                    #expect(footer.minY >= body.maxY - 0.5, "the footer starts at or below the body: \(footer) \(body)")
                    // Global frames include the title bar: measure from where the content starts.
                    let top = window.frame.height - window.contentRect(forFrameRect: window.frame).height
                    #expect(footer.maxY <= top + height + 0.5 && body.minY >= top - 0.5, "both inside the window's content: top \(top), \(footer) \(body)")
                    #expect(frames["search"] == nil, "no Find field over the editor")
                    let fields = frames.filter { ["task-title", "task-id", "edit-description"].contains($0.key) }
                    let receipt: [String: Any] = ["window_height": height, "contentTop": Double(top), "body": [body.minY, body.maxY], "footer": [footer.minY, footer.maxY],
                        "fields": fields.mapValues { ["minY": $0.minY, "maxY": $0.maxY, "fully_visible": $0.maxY <= body.maxY + 0.5] }]
                    try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("compact-editor-bounds-\(mode).json"))
                }
                if name.hasPrefix("compact-quick-add") {
                    // Candidate 8 ruling 5: the chip region ends on a row boundary; no chip is cut.
                    let frames = compactMeasurements.frames
                    if let region = frames["quick-add-metadata"] {
                        let chips = frames.filter { $0.key.hasPrefix("chip-") }
                        for (key, chip) in chips {
                            let inside = chip.minY >= region.minY - 0.5 && chip.maxY <= region.maxY + 0.5
                            let below = chip.minY >= region.maxY - 0.5
                            #expect(inside || below, "\(name) \(key) is cut by the region edge: chip \(chip) region \(region)")
                        }
                        let receipt: [String: Any] = ["region": [region.minY, region.maxY], "chips": chips.mapValues { [$0.minY, $0.maxY] }]
                        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("\(name)-chip-rows-\(mode).json"))
                    }
                }
                if name == "full-priority-ready" {
                    let frames = compactMeasurements.frames
                    let header = try #require(frames["section-label-P1"])
                    let row = try #require(frames["row-priority-urgent"])
                    #expect(row.minY >= header.maxY, "P1 header must precede the whole first Task row")
                    compactLayouts[name + "-" + mode] = frames.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }
                }
                if name.hasPrefix("compact-") {
                    let frames = compactMeasurements.frames
                    compactLayouts[name + "-" + mode] = frames.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }
                    for (key, frame) in frames where key.hasPrefix("complete-") || ["back", "editor-actions", "add-task", "navigate", "state-action"].contains(key) {
                        #expect(frame.width >= 28 && frame.height >= 28, "\(name) \(key) target \(frame)")
                    }
                    if name == "compact-editor" {
                        let back = try #require(frames["back"])
                        let actions = try #require(frames["editor-actions"])
                        #expect(abs(back.midY - actions.midY) < 1)
                        #expect(actions.minX >= back.maxX + 8)
                    }
                    for (key, frame) in frames where key.hasPrefix("metadata-") {
                        #expect(frame.height <= 18)
                        #expect(frame.minX >= 0 && frame.maxX <= width)
                    }
                    let rows = frames.filter { $0.key.hasPrefix("row-") }.map(\.value)
                    if name == "compact-action-error" { #expect(!rows.isEmpty) }
                    if name == "compact-lifecycle" {
                        let statuses = frames.filter { $0.key.hasPrefix("status-") }.map(\.value)
                        #expect(statuses.count == 2)
                        for frame in statuses { #expect(frame.minX >= 0 && frame.maxX <= width) }
                    }
                    let separators = frames.filter { $0.key.hasPrefix("separator-") }.map(\.value)
                    #expect(separators.count == rows.count)
                    if let first = separators.first {
                        for frame in separators { #expect(abs(frame.minX - first.minX) < 0.5 && abs(frame.maxX - first.maxX) < 0.5) }
                    }
                    for (key, label) in frames where key.hasPrefix("section-label-") {
                        let headers = frames.filter { $0.key.hasPrefix("section-label-") && $0.key != key }.map(\.value)
                        let preceding = rows.map { ($0, CGFloat(12)) } + headers.map { ($0, CGFloat(20)) }
                        if let previous = preceding.filter({ $0.0.maxY <= label.minY }).max(by: { $0.0.maxY < $1.0.maxY }) {
                            #expect(abs(label.minY - previous.0.maxY - previous.1) < 0.5, "\(name) \(key) section spacing")
                        }
                    }
                    if name.hasPrefix("compact-priority-") {
                        let screen = try #require(frames["task-screen"])
                        let viewport = try #require(frames["whole-task-viewport"])
                        #expect(viewport.height > 0)
                        #expect(viewport.minY >= screen.minY && viewport.maxY <= screen.maxY)
                        for row in rows where row.maxY > viewport.minY + 0.5 && row.minY < viewport.maxY - 0.5 {
                            #expect(row.minY >= viewport.minY - 0.5 && row.maxY <= viewport.maxY + 0.5)
                        }
                        let primary = try #require(frames[name == "compact-priority-empty" ? "state-action" : "add-task"])
                        #expect(primary.minY >= screen.minY && primary.maxY <= screen.maxY)
                    }
                }
                if ["attachment-batch-ready-compact", "attachment-batch-preview-compact", "attachment-batch-conflict-compact"].contains(name) {
                    let frames = measurements.frames
                    let viewport = try #require(frames["batch-viewport"])
                    let footer = try #require(frames["batch-footer"])
                    let rows = frames.filter { $0.key.hasPrefix("batch-row-") }.map(\.value)
                    #expect(rows.count == 4)
                    #expect(viewport.height == 224)
                    #expect(viewport.maxY <= footer.minY)
                    for row in rows { #expect(row.minY >= viewport.minY - 0.5 && row.maxY <= viewport.maxY + 0.5) }
                    try JSONSerialization.data(withJSONObject: frames.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }, options: [.sortedKeys]).write(to: directory.appendingPathComponent("\(name)-bounds-\(mode).json"))
                }
                if name == "attachments-compact" {
                    let heading = try #require(measurements.frames["heading"])
                    let rows = measurements.frames.filter { $0.key.hasPrefix("row-") }.map(\.value).sorted { $0.minY < $1.minY }
                    #expect(rows.count == 3)
                    for frame in [heading] + rows { #expect(frame.minY >= 0 && frame.maxY <= height && frame.minX >= 0 && frame.maxX <= width) }
                    for pair in zip(rows, rows.dropFirst()) { #expect(abs(pair.1.minY - pair.0.maxY - 16) < 0.5) }
                    let targets = measurements.frames.filter { $0.key == "add" || ["remove-", "open-", "reveal-", "actions-"].contains(where: $0.key.hasPrefix) }
                    #expect(targets.count == 11)
                    for frame in targets.values { #expect(frame.width >= 28 && frame.height >= 28) }
                    let receipt = measurements.frames.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }
                    try JSONSerialization.data(withJSONObject: receipt, options: [.sortedKeys, .prettyPrinted]).write(to: directory.appendingPathComponent("attachments-compact-bounds-\(mode).json"))
                }
                host.display()
                if name.contains("diagnostics"), !receipt.frames.isEmpty {
                    for (key, row) in receipt.frames where key.hasPrefix("row:") {
                        let title = key.components(separatedBy: ":")[1]
                        let section = try #require(receipt.frames["section:\(title)"])
                        if name.hasPrefix("compact-") {
                            let label = try #require(receipt.frames["title:\(title)"])
                            #expect(abs(row.minX - label.minX) <= 1)
                        }
                        #expect(row.height >= 10)
                        #expect(row.minY >= section.minY - 0.5)
                        #expect(row.maxY <= section.maxY + 0.5)
                    }
                    if name == "compact-diagnostics-expanded" {
                        #expect(receipt.frames.keys.filter { $0.hasPrefix("content:") }.count == 8)
                        for (key, content) in receipt.frames where key.hasPrefix("content:") {
                            let title = try #require(receipt.frames["title:\(key.dropFirst(8))"])
                            #expect(abs(content.minX - title.minX) <= 1)
                        }
                    }
                    if name.hasPrefix("compact-"), name != "compact-diagnostics-expanded", model.diagnostics != nil {
                        let visible = receipt.frames.filter { $0.key.hasPrefix("summary:") && $0.value.minY >= 0 && $0.value.maxY <= height }
                        #expect(visible.count >= 4)
                        #expect(receipt.frames["target:live"]?.height ?? 0 >= 28)
                        #expect(receipt.frames["target:profile"]?.height ?? 0 >= 28)
                    }
                    let data = receipt.frames.mapValues { ["x": $0.minX, "y": $0.minY, "width": $0.width, "height": $0.height] }
                    try JSONSerialization.data(withJSONObject: data, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("\(name)-\(mode)-bounds.json"))
                }
                if name == "attachments-compact-row" {
                    let marker = try #require(measurements.frames["jira-row-marker"])
                    #expect(marker.minX >= 0 && marker.maxX <= width && marker.width >= 20 && marker.height >= 10)
                }
                if ["quick-add", "menu-bar-quick-add", "compact-quick-add", "compact-quick-add-short"].contains(name) {
                    #expect(chipFrames.labels["due"] == "Due Tomorrow")
                }
                if name == "compact-quick-add-short" {
                    let frames = chipFrames.frames
                    let chips = frames.filter { !$0.key.hasPrefix("control:") }
                    let rows = Set(chips.values.map { Int($0.minY.rounded()) }).count
                    #expect(chips.count == 5)
                    #expect(frames.count == 8)
                    #expect(rows <= 2)
                    for frame in frames.values {
                        #expect(frame.minX >= 0)
                        #expect(frame.maxX <= width)
                        #expect(frame.width >= 28)
                        #expect(frame.height >= 28)
                    }
                    let receipt: [String: Any] = ["width": width, "chips": chips.count, "rows": rows, "labels": chipFrames.labels,
                        "frames": frames.mapValues { ["x": $0.minX, "y": $0.minY, "width": $0.width, "height": $0.height] }]
                    try JSONSerialization.data(withJSONObject: receipt, options: [.sortedKeys]).write(to: directory.appendingPathComponent("compact-quick-chip-bounds-\(mode).json"))
                }
                #expect(window.isVisible == false)
                let backing = try await settledSnapshotBitmap(host, name: name)
                defer {
                    window.contentViewController = nil
                    window.close()
                }
                let data = try #require(backing.representation(using: .png, properties: [:]))
                let filename = "\(name)-\(mode).png"
                try data.write(to: directory.appendingPathComponent(filename))
                #expect(backing.pixelsWide == Int(width * 2))
                #expect(backing.pixelsHigh == Int(height * 2))
                files.append(filename)
                if name == "compact-density-snapshots" {
                    let viewport = try #require(capture.bounds["viewport"])
                    let rows = capture.bounds.filter { $0.key.hasPrefix("row-") }.map(\.value)
                    let full = rows.filter { $0.minY >= viewport.minY && $0.maxY <= viewport.maxY }.count
                    let partial = rows.filter { $0.intersects(viewport) && !viewport.contains($0) }.count
                    let targets = capture.bounds.filter { $0.key.hasPrefix("restore-") || $0.key.hasPrefix("finder-") }.map(\.value)
                    let minimumTarget = targets.flatMap { [$0.width, $0.height] }.min() ?? 0
                    let glyphs = capture.bounds.filter { $0.key.hasPrefix("text-") }.map(\.value)
                    let partialGlyphs = glyphs.filter { $0.intersects(viewport) && !viewport.contains($0) }.count
                    let actionOrder = capture.bounds.filter { $0.key.hasPrefix("finder-") }.allSatisfy { id, frame in
                        guard let restore = capture.bounds["restore-" + id.dropFirst("finder-".count)] else { return false }
                        return frame.minX >= restore.maxX
                    }
                    try JSONSerialization.data(withJSONObject: ["fully_visible_rows": full, "partially_visible_rows": partial, "partial_glyphs": partialGlyphs, "minimum_target": minimumTarget, "restore_before_finder": actionOrder]).write(to: directory.appendingPathComponent("compact-bounds-\(mode).json"))
                    #expect(full >= 3)
                    #expect(partial == 0)
                    #expect(partialGlyphs == 0)
                    #expect(minimumTarget >= 28)
                    #expect(actionOrder == true)
                }

            }
            if ProcessInfo.processInfo.environment["TODO_SNAPSHOT_C8_ONLY"] == "1" {
                // Candidate 8 review states for the Opus Mac UI seat: rulings 1, 2, 3 and 5, and D1/D2.
                func banner(_ text: String, _ kind: TodoModel.MessageKind) -> TodoModel {
                    let state = fixture(); state.signedIn = true; state.publishMessage(text, kind: kind); return state
                }
                let picker = fixture(); picker.signedIn = true
                picker.dependencies.picker = .init(profile: "work", root: picker.tasks[0], direction: .dependsOn)
                picker.dependencies.picker?.failure = DependencyNotice(message: "This Task blocks done Tasks.", followUp: picker.tasks[1].id,
                    followUpFailure: "Couldn't prepare the follow-up Task. The server rejected this request (HTTP 404). Try again.")
                try await render("c8-picker-follow-up-failed", DependencyPickerView(model: picker, compact: true), width: 393, height: 426)
                try await render("c8-banner-hand-off-depends", WorkspaceSnapshot(model: banner("Couldn't make “Review the interaction design” depend on “Prepare the release notes”. This Dependency would create a loop. Choose another Task.", .dependencyLink)), width: 1100, height: 720)
                try await render("c8-banner-hand-off-blocks", WorkspaceSnapshot(model: banner("Couldn't stop “Prepare the release notes” depending on “Review the interaction design”. The Task changed. Reload its Dependencies before trying again.", .dependencyLink)), width: 1100, height: 720)
                let conflict = banner("The Task changed. Close and reopen it before trying that action again.", .transition)
                try await render("c8-banner-dismiss", WorkspaceSnapshot(model: conflict), width: 1100, height: 720)
                try await render("c8-compact-banner-dismiss", TaskListView(model: conflict, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
                let editing = fixture(); editing.signedIn = true; editing.editor = TaskDraft(editing.tasks[0])
                try await render("c8-compact-editor", TaskListView(model: editing, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
                let adding = fixture(); adding.signedIn = true; adding.quickAdd = true
                adding.newTitle = "Review the launch notes tomorrow 9am p1 #review +Launch"
                try await render("c8-compact-quick-add-short", QuickAddView(model: adding, floating: true, compact: true, referenceDate: referenceDate).content, width: 393, height: 426)
                // D2: two refused links on different rows merge, saying a shared reason once.
                let merging = fixture(); merging.signedIn = true
                merging.dependencies.picker = .init(profile: "work", root: merging.tasks[0], direction: .blocks)
                for (index, task) in merging.tasks.dropFirst().prefix(2).enumerated() {
                    var notice = DependencyNotice(message: "This Dependency would create a loop. Choose another Task.", failure: ServerFailure(message: "loop", code: "dependency_cycle"))
                    notice.attemptTitle = task.title
                    merging.dependencies.picker?.messages.publish(notice, kind: .link, target: "row-\(index)", subject: task.title, reasonCode: "dependency_cycle", reasonText: notice.message)
                }
                try await render("c8-picker-merged", DependencyPickerView(model: merging, compact: true), width: 393, height: 426)
                for (name, codes) in [("c8-banner-merged-same-reason", ["dependency_cycle", "dependency_cycle"]), ("c8-banner-merged-different-reasons", ["dependency_cycle", "occ_conflict"])] {
                    let handed = fixture(); handed.signedIn = true
                    var tickets = SurfaceMessages<DependencyPicker.MessageKind, DependencyNotice>()
                    for (index, task) in handed.tasks.dropFirst().prefix(2).enumerated() {
                        let ticket = tickets.begin(.link, target: "row-\(index)")
                        let reason = codes[index] == "dependency_cycle" ? "This Dependency would create a loop. Choose another Task." : "The Task changed. Reload its Dependencies before trying again."
                        handed.handOff("Couldn't make “\(task.title)” depend on “\(handed.tasks[0].title)”. " + reason, kind: .dependencyLink, from: ticket, subject: task.title, reasonCode: codes[index], reasonText: reason,
                                       attempt: LinkAttempt(verb: "add", dependentID: task.id, dependent: task.title, blockerID: handed.tasks[0].id, blocker: handed.tasks[0].title))
                    }
                    try await render(name, WorkspaceSnapshot(model: handed), width: 1100, height: 720)
                }
                // This client: a stall with its attribution and what the sampler cost (S1-21 review;
                // the seat's hands-on check 7 asks whether the "In …" line reads and wraps in two lines).
                let stallClock = C7ReviewClock(); stallClock.now = 5000
                let stallRecorder = ClientDiagnosticsRecorder(journalDirectory: directory.appendingPathComponent("c8-stall-recorder-\(mode)"), clock: { stallClock.now })
                stallRecorder.authorizeOwnerSession(true)
                var stall = ClientDiagnosticEvent(name: .stall, run: stallRecorder.run, now: 5000)
                stall.durationMS = 412; stall.applicationActive = true
                stall.stallAttribution = ClientStallAttribution(samples: 7, inLabel: "closure #1 in TodoModel.refreshAfterWrite(_:clearing:since:owner:) in TodoState.TodoModel.applyCatalogSnapshot(_:generation:)", agreeing: 6, frames: [], disabled: nil, suspendedMicroseconds: [38, 41, 35, 52, 40, 37, 44])
                stallRecorder.record(stall)
                let stalled = fixture(); stalled.signedIn = true
                stalled.clientDiagnosticsUI.summary = await stallRecorder.snapshot()
                try await render("c8-this-client-stall", ScrollView { ClientDiagnosticsView(model: stalled, compact: false, initiallyExpanded: ["Recent activity"]).padding(20) }, width: 1160, height: 900)
                try await render("c8-compact-this-client-stall", ScrollView { ClientDiagnosticsView(model: stalled, compact: true, initiallyExpanded: ["Recent activity"]).padding(16) }, width: 393, height: 900)
                stallRecorder.clear()
                continue
            }
            if ProcessInfo.processInfo.environment["TODO_SNAPSHOT_C7_ONLY"] == "1" {
                // Candidate 7 review states for the Opus Mac UI seat: the banner's two controls,
                // the named hand-offs, the sign-out caption, the follow-up failure in its picker,
                // the quick-add capsule and the hold rows of This client.
                func banner(_ text: String, _ kind: TodoModel.MessageKind) -> TodoModel {
                    let state = fixture(); state.signedIn = true; state.publishMessage(text, kind: kind); return state
                }
                let conflict = banner("The Task changed. Close and reopen it before trying that action again.", .transition)
                try await render("c7-banner-dismiss", WorkspaceSnapshot(model: conflict), width: 1100, height: 720)
                try await render("c7-compact-banner-dismiss", TaskListView(model: conflict, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
                try await render("c7-banner-reconnect", WorkspaceSnapshot(model: banner("Task saved. The live view is reconnecting.", .connection)), width: 1100, height: 720)
                try await render("c7-banner-quick-add-failed", WorkspaceSnapshot(model: banner("Couldn't add “Ship the release”. The server rejected this request (HTTP 503).", .quickAdd)), width: 1100, height: 720)
                try await render("c7-banner-dependency-failed", WorkspaceSnapshot(model: banner("Couldn't make “Review the interaction design” depend on “Prepare the release notes”. This Dependency would create a loop.", .dependencyLink)), width: 1100, height: 720)
                let signOutSettings = SettingsView(
                    model: banner("Couldn't sign out. The server rejected this request (HTTP 503).", .signOut), selectedTab: .general, notifications: NotificationSettingsState(authorization: "Allowed"),
                    serverStatus: ManagedServerStatus(label: "fixture.todo.server", path: "/fixture/LaunchAgents/todo.plist", installed: true, loaded: true,
                                                      configuration: ManagedServerConfiguration(executable: "/fixture/Todo/Server/todo-server", database: "/fixture/todo.db", port: 4310)))
                try await render("c7-settings-sign-out-failed", signOutSettings, width: 640, height: 560)
                let importing = fixture(); importing.signedIn = true; importing.showingImport = true
                importing.importMessages.publish("Couldn't prepare the follow-up Task. The server rejected this request (HTTP 404). Try again.", kind: .followUp)
                try await render("c7-import-follow-up-failed", ImportView(model: importing, compact: false), width: 760, height: 620)
                let picker = fixture(); picker.signedIn = true
                picker.dependencies.picker = .init(profile: "work", root: picker.tasks[0], direction: .dependsOn)
                picker.dependencies.picker?.failure = DependencyNotice(message: "This Task blocks done Tasks.", followUp: picker.tasks[1].id,
                    followUpFailure: "Couldn't prepare the follow-up Task. The server rejected this request (HTTP 404). Try again.")
                try await render("c7-picker-follow-up-failed", DependencyPickerView(model: picker), width: 560, height: 620)
                let added = fixture(); added.signedIn = true; added.deletionNotice = "Task added"
                try await render("c7-capsule-task-added", WorkspaceSnapshot(model: added), width: 1100, height: 720)
                // This client: a row click with its release taken from the selection, and a
                // pointer action whose release was not recorded.
                let clock = C7ReviewClock()
                let recorder = ClientDiagnosticsRecorder(journalDirectory: directory.appendingPathComponent("c7-recorder-\(mode)"), clock: { clock.now })
                recorder.authorizeOwnerSession(true)
                let click = recorder.beginAction(.taskSelection, inputMS: 1000, mode: .full, inputKind: .pointer)
                clock.now = 1054; recorder.inputReleased(click, atMS: 1053.9, source: .nativeSelection)
                var released = ClientDiagnosticEvent(name: .inputReleased, run: recorder.run, now: 1054)
                released.actionID = click; released.traceID = click; released.inputKind = .pointer; released.inputMS = 1053.9; released.durationMS = 53.9; released.releaseSource = .nativeSelection
                recorder.record(released)
                clock.now = 1086; recorder.handlerStarted(click); clock.now = 1128; recorder.resultPublished(click); clock.now = 1321; recorder.layoutCommitted(click)
                clock.now = 2000
                let settings = recorder.beginAction(.openSettings, inputMS: 2000, mode: .full, inputKind: .pointer)
                clock.now = 2030; recorder.handlerStarted(settings); clock.now = 2040; recorder.resultPublished(settings); clock.now = 2190; recorder.layoutCommitted(settings)
                let diagnostics = fixture(); diagnostics.signedIn = true
                diagnostics.clientDiagnosticsUI.summary = await recorder.snapshot()
                try await render("c7-this-client-holds", ScrollView { ClientDiagnosticsView(model: diagnostics, compact: false, initiallyExpanded: ["Interaction phases", "Recent activity"]).padding(20) }, width: 1160, height: 1400)
                try await render("c7-compact-this-client-holds", ScrollView { ClientDiagnosticsView(model: diagnostics, compact: true, initiallyExpanded: ["Interaction phases"]).padding(16) }, width: 393, height: 1400)
                recorder.clear()
                continue
            }
            if ProcessInfo.processInfo.environment["TODO_SNAPSHOT_SEARCH_ONLY"] == "1" {
                for compact in [true, false] {
                    for state in ["ready", "excerpt-trimmed", "typing", "requesting", "empty", "error", "budget-error", "initial-error", "offline", "prefix", "prefix-invalid", "detail", "quick-add", "copied", "copy-failed"] {
                        let searchModel = fixture()
                        searchModel.selectedView = "all"
                        searchModel.searchText = "rent"
                        let raw = #"{"id":"6aa2647d-1234-4567-89ab-0123456789ab","profile_id":"work","row_version":1,"title":"Pay rent today","description":"Make the transfer before Friday","priority":"P1","status":"open","project_id":null,"tags":[],"source":"manual","due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"occurrence":null,"legacy_series_detached":true,"deleted_at":null,"search_matches":[{"field":"title","start":4,"end":8}]}"#
                        var descriptionTask = try JSONDecoder().decode(TaskSnapshot.self, from: Data(raw.replacingOccurrences(of: "Pay rent today", with: "Transfer receipt").replacingOccurrences(of: "Make the transfer before Friday", with: "A receipt for the rent payment before Friday").replacingOccurrences(of: "6aa2647d", with: "7aa2647d").replacingOccurrences(of: #"{"field":"title","start":4,"end":8}"#, with: #"{"field":"description","start":18,"end":22}"#).utf8))
                        descriptionTask.search_matches = [.init(field: .description, start: 18, end: 22)]
                        let titleTask = try JSONDecoder().decode(TaskSnapshot.self, from: Data(raw.utf8))
                        var rows = state == "empty" ? [] : [titleTask, descriptionTask]
                        if state == "excerpt-trimmed" {
                            searchModel.searchText = "cancion"
                            rows = [try JSONDecoder().decode(TaskSnapshot.self, from: Data(#"{"id":"long-excerpt","profile_id":"work","row_version":1,"title":"Receipt","description":"This is a deliberately long introductory phrase. Find the blue Canción receipt in the cabinet.","priority":"P3","source":"manual","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"occurrence":null,"legacy_series_detached":true,"deleted_at":null,"search_matches":[{"field":"description","start":63,"end":70}]}"#.utf8))]
                        }
                        searchModel.tasks = rows
                        searchModel.appliedSearchSnapshot = .init(appliedIdentity: searchModel.requestedIdentity, rows: rows, groups: [])
                        searchModel.searchPhase = .showing
                        if ["typing", "requesting", "error"].contains(state) { searchModel.searchText = "rent friday" }
                        if state == "typing" { searchModel.searchPhase = .debouncing }
                        if state == "requesting" { searchModel.searchPhase = .requesting }
                        if state == "error" { searchModel.searchPhase = .error; searchModel.searchError = .transient("Couldn't search. Showing results for \"rent\".") }
                        if state == "budget-error" {
                            searchModel.searchText = "probe"
                            searchModel.searchPhase = .error
                            searchModel.searchError = .tooBroad("Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase.\nerror 2 - validation or usage", context: TaskSearchPresentation.appliedContext(searchModel.appliedSearchSnapshot?.appliedIdentity.text))
                        }
                        if state == "initial-error" {
                            searchModel.searchText = ""
                            searchModel.appliedSearchSnapshot = nil
                            searchModel.tasks = []
                            searchModel.searchPhase = .error
                            searchModel.taskLoadError = "The server could not be reached."
                        }
                        if state == "offline" {
                            searchModel.connection = .offline
                            searchModel.searchText = "rent friday"
                            searchModel.searchPhase = .error
                            searchModel.searchError = .transient("Couldn't search. Showing results for \"rent\".")
                        }
                        if ["detail", "copied", "copy-failed"].contains(state) { searchModel.beginEditing(titleTask) }
                        if state == "quick-add" { searchModel.quickAdd = true; searchModel.newTitle = "Keep this draft" }
                        if state == "copied" { searchModel.taskIDCopyFeedback = "Copied" }
                        if state == "copy-failed" { searchModel.taskIDCopyFeedback = "Couldn't copy. Try again." }
                        let screen = compact ? AnyView(TaskListView(model: searchModel, compactMode: true).compactContent) : AnyView(WorkspaceSnapshot(model: searchModel))
                        let content = ["prefix", "prefix-invalid"].contains(state) ? AnyView(screen.overlay {
                            TaskFilterView(draft: .init(prefix: state == "prefix-invalid" ? "zz" : "6AA2"), compact: compact, apply: { _ in }, close: {})
                                .background(.background, in: .rect(cornerRadius: 12)).shadow(radius: 12)
                        }) : screen
                        try await render("search-\(compact ? "compact" : "full")-\(state)", content, width: compact ? 393 : 1100, height: compact ? 426 : 720)
                    }
                }
                continue
            }
            if ProcessInfo.processInfo.environment["TODO_SNAPSHOT_QUICK_ONLY"] != "1" && ProcessInfo.processInfo.environment["TODO_SNAPSHOT_PRIORITY_ONLY"] != "1" {
                for compact in [true, false] {
                    for state in ["ready", "preview", "applied", "conflict", "empty", "loading", "error"] {
                        let batchModel = fixture()
                        batchModel.signedIn = true
                        batchModel.connection = .live
                        var draft = BatchEditDraft(profile: "work")
                        draft.targets = state == "empty" ? [] : Array(batchModel.tasks.prefix(4))
                        if state == "conflict" {
                            draft.targets = try draft.targets.map { task in
                                var value = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(task)) as? [String: Any])
                                value["row_version"] = 1
                                return try JSONDecoder().decode(TaskSnapshot.self, from: JSONSerialization.data(withJSONObject: value))
                            }
                        }
                        draft.selected = Set(draft.targets.prefix(2).map(\.id))
                        draft.loading = state == "loading"
                        if state == "error" { draft.error = "The server is unavailable. Reconnect and reload Tasks." }
                        if ["preview", "applied", "conflict"].contains(state) {
                            let rows: [[String: Any]] = draft.targets.prefix(2).enumerated().map { index, task in
                                var row: [String: Any] = ["task_id": task.id, "from_version": task.row_version, "outcome": state == "conflict" && index == 1 ? "rejected" : "updated", "current_version": state == "conflict" ? 2 : task.row_version]
                                if state == "conflict" && index == 1 { row["error"] = ["code": "occ_conflict", "message": "Reload Tasks."] }
                                return row
                            }
                            draft.report = try JSONDecoder().decode(BatchEditReport.self, from: JSONSerialization.data(withJSONObject: ["dry_run": state == "preview", "items": rows]))
                        }
                        batchModel.batchEdit = draft
                        try await render("batch-edit-\(state)-\(compact ? "compact" : "full")", ZStack {
                            if !compact { WorkspaceSnapshot(model: batchModel); Color.black.opacity(0.08) }
                            BatchEditView(model: batchModel, compact: compact).frame(width: compact ? 369 : 460, height: compact ? 390 : 510).background(.background, in: RoundedRectangle(cornerRadius: 12)).shadow(radius: 16)
                        }, width: compact ? 393 : 1100, height: compact ? 426 : 720)
                    }
                }
            }
            if ProcessInfo.processInfo.environment["TODO_SNAPSHOT_BATCH_EDIT_ONLY"] == "1" { continue }
            model.newTitle = #"Ship tomorrow p1 #focus #planning @Client"#
            model.signedIn = true
            model.connection = .live
            model.parsedInput = model.newTitle
            model.parsedTask = ParsedTask(title: "Ship", due_at: TaskTime(kind: "date", date: "2026-10-29"), priority: "P1", tags: ["focus", "planning"], project: "Client")
            try await render("compact-quick-add-short", QuickAddView(model: model, floating: true, compact: true, referenceDate: referenceDate).content, width: 393, height: 426)
            if ProcessInfo.processInfo.environment["TODO_SNAPSHOT_QUICK_ONLY"] == "1" { continue }
            let priorities = fixture()
            priorities.signedIn = true
            priorities.selectedView = "all"
            priorities.planning = nil
            for state in ["ready", "empty", "dense"] {
                priorities.tasks = state == "empty" ? [] : state == "dense"
                    ? (1...9).map { task(id: "priority-dense-\($0)", title: "Review release task \($0)", priority: "P1", tags: ["review"], hasDates: false) }
                    : [
                        task(id: "priority-later", title: "Review someday ideas", priority: "P4", tags: [], hasDates: false),
                        task(id: "priority-urgent", title: "Ship priority groups", priority: "P1", tags: [], hasDates: false),
                        task(id: "priority-normal", title: "Review the release notes", priority: "P3", tags: [], hasDates: false),
                    ]
                for compact in [true, false] {
                    let size: (CGFloat, CGFloat) = compact ? (393, 426) : (1100, 720)
                    let view = compact ? AnyView(TaskListView(model: priorities, compactMode: true, referenceDate: referenceDate).compactContent) : AnyView(WorkspaceSnapshot(model: priorities))
                    try await render("\(compact ? "compact" : "full")-priority-\(state)", view, width: size.0, height: size.1)
                    if compact && state == "dense" {
                        try await render("compact-priority-dense-scrolled", view, width: size.0, height: size.1, scrollTasks: 53)
                        try await render("compact-priority-dense-bottom", view, width: size.0, height: size.1, scrollTasks: 10000)
                    }
                }
            }
            if ProcessInfo.processInfo.environment["TODO_SNAPSHOT_PRIORITY_ONLY"] == "1" { continue }
            for compact in [true, false] {
                let size: (CGFloat, CGFloat) = compact ? (393, 426) : (1100, 720)
                let stale = fixture()
                stale.outdatedServerBuild = "verify-old"
                try await render("outdated-\(compact ? "compact" : "full")", OutdatedServerView(model: stale, serverBuild: "verify-old", compact: compact), width: size.0, height: size.1)
                try await render("planning-status-\(compact ? "compact" : "full")", TaskFilterView(draft: .init(), compact: compact, planning: true, apply: { _ in }, close: {}).background(.background), width: size.0, height: size.1)
            }
            let filteredModel = fixture()
            filteredModel.projects.append(DiscoveryEntry(id: "other", name: "Operations", open_task_count: 1, inbox_task_count: nil))
            let unplanned = task(id: "filter-inbox", title: "Review launch revenue", priority: "P1", tags: ["design", "review"], hasDates: false)
            let dated = task(id: "filter-dated", title: "Prepare the launch invoice", priority: "P2", tags: ["review"])
            let otherProject = task(id: "filter-other", title: "Review Operations revenue", priority: "P2", tags: ["review"], hasDates: false, project: "other")
            let otherTag = task(id: "filter-tag", title: "Polish keyboard navigation", priority: "P3", tags: ["macos"], hasDates: false)
            filteredModel.tasks = [unplanned, dated, otherProject, otherTag]
            for compact in [false, true] {
                func workspace() -> AnyView {
                    compact ? AnyView(TaskListView(model: filteredModel, compactMode: true, referenceDate: referenceDate).compactContent) : AnyView(WorkspaceSnapshot(model: filteredModel))
                }
                let size: (CGFloat, CGFloat) = compact ? (393, 426) : (1100, 720)
                filteredModel.selectedView = "all"
                filteredModel.planning = nil
                filteredModel.selectedProject = "todo"
                filteredModel.selectedTag = "review"
                #expect(TaskListView(model: filteredModel).visibleTasks.map(\.id) == ["filter-inbox", "filter-dated"])
                try await render("filters-tasks-\(compact ? "compact" : "full")", workspace(), width: size.0, height: size.1)
                filteredModel.selectedView = "inbox"
                filteredModel.planning = PlanningResult(name: "inbox", groups: [.init(name: "Inbox", tasks: [unplanned, otherProject, otherTag])])
                #expect(TaskListView(model: filteredModel).visibleTasks.map(\.id) == ["filter-inbox"])
                try await render("filters-inbox-\(compact ? "compact" : "full")", workspace(), width: size.0, height: size.1)
                filteredModel.selectedProject = "other"
                filteredModel.selectedTag = "macos"
                #expect(TaskListView(model: filteredModel).visibleTasks.isEmpty)
                try await render("filters-empty-\(compact ? "compact" : "full")", workspace(), width: size.0, height: size.1)
                filteredModel.selectedView = "all"
                filteredModel.planning = nil
                filteredModel.selectedProject = "todo"
                filteredModel.selectedTag = "review"
                let filters = TaskListFilters(status: "open", priority: "P1", attachment: "enterprise", energy: "3", estimate: "45")
                filteredModel.taskFilters = filters
                filteredModel.matchingTaskIDs = [unplanned.id]
                try await render("filters-active-\(compact ? "compact" : "full")", workspace(), width: size.0, height: size.1)
                try await render("filters-panel-\(compact ? "compact" : "full")", workspace().overlay {
                    TaskFilterView(draft: filters, compact: compact, apply: { _ in }, close: {})
                        .background(.background, in: .rect(cornerRadius: 12)).shadow(radius: 12)
                }, width: size.0, height: size.1)
                let dates = TaskListFilters(due: "2030-11-01", scheduled: "2030-11-02")
                try await render("filters-dates-\(compact ? "compact" : "full")", workspace().overlay {
                    TaskFilterView(draft: dates, compact: compact, apply: { _ in }, close: {})
                        .background(.background, in: .rect(cornerRadius: 12)).shadow(radius: 12)
                }, width: size.0, height: size.1)
                filteredModel.taskFilters = .init()
                filteredModel.matchingTaskIDs = nil
            }
            model.newTitle = ""
            model.parsedTask = nil
            model.signedIn = false
            model.connection = .live
            let longTags = ["accessibility review", "deep focus", "international launch", "release planning"]
            for compact in [false, true] {
                try await render(
                    compact ? "metadata-row-compact" : "metadata-row-full",
                    TaskRow(task: model.tasks[0], canWrite: true, compact: compact,
                        projectName: "International Platform Accessibility and Release Planning",
                        tagNames: longTags, complete: {}).padding(16),
                    width: compact ? 393 : 650, height: 150)
                for kind in [MetadataKind.project, .tag] {
                    try await render(
                        "new-\(kind.rawValue.lowercased())-\(compact ? "compact" : "full")",
                        ZStack {
                            if compact { TaskListView(model: model, compactMode: true, referenceDate: referenceDate).compactContent }
                            else { WorkspaceSnapshot(model: model) }
                            Color.black.opacity(0.08)
                            MetadataNameSheet(kind: kind, canWrite: true, initialName: kind == .project ? "Client Project" : "deep focus", add: { _ in })
                                .frame(width: 340).background(.background, in: RoundedRectangle(cornerRadius: 12)).shadow(radius: 16)
                        },
                        width: compact ? 393 : 1100, height: compact ? 426 : 720)
                }
                for (state, kind, canWrite, name) in [("empty", MetadataKind.project, true, ""), ("offline", MetadataKind.tag, false, "deep focus")] {
                    try await render(
                        "metadata-sheet-\(state)-\(compact ? "compact" : "full")",
                        ZStack {
                            if compact { TaskListView(model: model, compactMode: true, referenceDate: referenceDate).compactContent }
                            else { WorkspaceSnapshot(model: model) }
                            Color.black.opacity(0.08)
                            MetadataNameSheet(kind: kind, canWrite: canWrite, initialName: name, add: { _ in })
                                .frame(width: 340).background(.background, in: RoundedRectangle(cornerRadius: 12)).shadow(radius: 16)
                        }, width: compact ? 393 : 1100, height: compact ? 426 : 720)
                }
            }
            let attachmentModel = fixture()
            attachmentModel.signedIn = true
            attachmentModel.planning = nil
            attachmentModel.selectedView = "all"
            var attachmentTask = attachmentModel.tasks[0]
            let preview = directory.appendingPathComponent("attachment-preview.png")
            let previewSource = ProcessInfo.processInfo.environment["TODO_ATTACHMENT_PREVIEW"] ?? URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures/attachment-preview.png").path
            let previewData = try Data(contentsOf: URL(fileURLWithPath: previewSource))
            try previewData.write(to: preview)
            attachmentTask.attachments = [
                .init(id: "jira", location: .file("/var/empty/todo-design-fixture/missing-jira-draft.md"), label: "jira", added_at: "2026-10-29T00:00:00Z"),
                .init(id: "image", location: .image(preview.path), name: "launch-sketch.png", byte_size: previewData.count, added_at: "2026-10-29T00:00:00Z"),
                .init(id: "link", location: .link(URL(string: "https://example.com/issue/42")!), label: "Issue 42", added_at: "2026-10-29T00:00:00Z")
            ]
            let batchModel = fixture()
            batchModel.signedIn = true
            batchModel.connection = .live
            let batchReference = AttachmentSnapshot(id: "batch-reference", location: .link(URL(string: "t3-thread://v2/host/thread")!), label: "thread", added_at: "2026-11-03T00:00:00Z")
            for compact in [true, false] {
                for state in ["ready", "preview", "conflict", "empty", "loading", "error"] {
                    var draft = AttachmentBatchDraft(profile: "work", reference: batchReference)
                    draft.targets = state == "empty" ? [] : Array(batchModel.tasks.prefix(4))
                    draft.selected = Set(draft.targets.prefix(2).map(\.id))
                    draft.loading = state == "loading"
                    if state == "error" { draft.error = "The server is unavailable. Reconnect and reload Tasks." }
                    if state == "preview" || state == "conflict" {
                        let rows: [[String: Any]] = draft.targets.prefix(2).map { task in
                            var row: [String: Any] = ["task_id": task.id, "outcome": state == "preview" ? "attached" : "rejected", "current_version": task.row_version]
                            if state == "conflict" { row["error"] = ["code": "occ_conflict", "message": "Task changed. Reload Tasks and try again."] }
                            return row
                        }
                        draft.report = try JSONDecoder().decode(AttachmentBatchReport.self, from: JSONSerialization.data(withJSONObject: ["dry_run": state == "preview", "items": rows]))
                    }
                    batchModel.attachmentBatch = draft
                    try await render("attachment-batch-\(state)-\(compact ? "compact" : "full")", ZStack {
                        if !compact { WorkspaceSnapshot(model: batchModel); Color.black.opacity(0.08) }
                        AttachmentBatchView(model: batchModel).frame(width: compact ? 369 : 420, height: compact ? 402 : 426).background(.background, in: RoundedRectangle(cornerRadius: 12)).shadow(radius: 16)
                    }, width: compact ? 393 : 1100, height: compact ? 426 : 720)
                }
            }
            attachmentModel.tasks = [attachmentTask]
            attachmentModel.editor = TaskDraft(attachmentTask)
            try await render("attachments-compact-row", TaskRow(task: attachmentTask, now: referenceDate, canWrite: true, compact: true, projectName: "International Platform Accessibility and Release Planning", tagNames: longTags, complete: {}).padding(16), width: 393, height: 150)
            try await render("attachments-editor", WorkspaceSnapshot(model: attachmentModel), width: 1100, height: 927, scrollEditor: true)
            try await render("attachments-compact", TaskListView(model: attachmentModel, compactMode: true).compactContent, width: 393, height: 426, scrollEditor: true)
            try await render("attachments-section", VStack(spacing: 12) { TaskRow(task: attachmentTask, canWrite: true, projectName: "Todo", tagNames: [], complete: {}); AttachmentsSection(model: attachmentModel); Spacer() }.padding(16), width: 390, height: 520)
            try await render("attachments-label", AttachmentLabelEditor(attachment: try #require(attachmentTask.attachments?.first), label: .constant("jira"), disabled: false, cancel: {}, save: {}).frame(maxWidth: .infinity, maxHeight: .infinity), width: 393, height: 426)
            try await render("attachments-link", AttachmentsSection(model: attachmentModel, showsLinkForm: true).padding(20), width: 390, height: 520)
            attachmentModel.editorError = "Images must be 20 MiB or smaller."
            try await render("attachments-error", EditorView(model: attachmentModel), width: 390, height: 800, scrollEditor: true)
            attachmentTask.attachments = []
            attachmentModel.tasks = [attachmentTask]
            attachmentModel.editor = TaskDraft(attachmentTask)
            attachmentModel.editorError = nil
            try await render("attachments-empty", AttachmentsSection(model: attachmentModel).padding(20), width: 390, height: 260)
            model.signedIn = true
            let profileProjects = model.projects
            let profileTags = model.tags
            let profileTasks = model.tasks
            let profilePlanning = model.planning
            let profileCounts = model.viewCounts
            for state in ["empty", "refusal", "failed", "tasks", "single-task"] {
                let empty = state == "empty"
                model.profile = empty ? "personal" : "work"
                model.tasks = empty ? [] : (state == "single-task" ? Array(profileTasks.prefix(1)) : profileTasks)
                model.projects = empty ? [] : profileProjects
                model.tags = empty ? [] : profileTags
                model.planning = empty || state == "single-task" ? nil : profilePlanning
                model.viewCounts = empty ? ["all": 0, "today": 0, "overdue": 0, "scheduled": 0, "inbox": 0] : profileCounts
                model.profileDeletion = ProfileDeletionPrompt(name: model.profileName, count: model.tasks.count, deleteTasks: state == "tasks" || state == "single-task")
                model.profileDeletionError = state == "failed" ? model.profileDeletion?.refusal : nil
                try await render("profile-delete-" + state, ZStack {
                    WorkspaceSnapshot(model: model)
                    Color.black.opacity(0.2)
                    ProfileDeletionView(model: model).frame(width: 480).background(.background, in: .rect(cornerRadius: 12)).shadow(radius: 20)
                }, width: 1100, height: 720)
                try await render("compact-profile-delete-" + state, ZStack {
                    TaskListView(model: model, compactMode: true).compactContent
                    Color.black.opacity(0.2)
                    ProfileDeletionView(model: model).frame(width: 369).background(.background, in: .rect(cornerRadius: 12)).shadow(radius: 20)
                }, width: 393, height: 426)
            }
            let notice = fixture()
            notice.signedIn = true
            notice.profile = "personal"
            notice.tasks = []
            notice.projects = []
            notice.tags = []
            notice.planning = nil
            notice.viewCounts = ["all": 0, "today": 0, "overdue": 0, "scheduled": 0, "inbox": 0]
            notice.deletionNotice = "\"Work\" was deleted. Switched to Personal."
            try await render("profile-deleted-notice", WorkspaceSnapshot(model: notice), width: 1100, height: 720)
            notice.deletionNotice = "\"Work\" was deleted. Switched to Personal."
            try await render("compact-profile-deleted-notice", TaskListView(model: notice, compactMode: true).compactContent, width: 393, height: 426)
            model.signedIn = false
            model.profile = "work"
            model.projects = profileProjects
            model.tags = profileTags
            model.tasks = profileTasks
            model.planning = profilePlanning
            model.viewCounts = profileCounts
            model.profileDeletion = nil
            model.profileDeletionError = nil
            try await render("sign-in", SignInView(model: model), width: 900, height: 640)
            try await render("compact-sign-in", SignInView(model: model, compact: true), width: 393, height: 426)
            model.signedIn = true
            let diagnosticsURL = ProcessInfo.processInfo.environment["TODO_DIAGNOSTICS_SNAPSHOT"].map { URL(fileURLWithPath: $0) }
            let diagnosticsData = try diagnosticsURL.map { try Data(contentsOf: $0) }
                ?? Data(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("API/Fixtures/diagnostics.json"))
            let diagnostics = try JSONDecoder().decode(DiagnosticsSnapshot.self, from: diagnosticsData)
            model.diagnostics = diagnostics
            try await render("diagnostics", DiagnosticsView(model: model, live: false), width: 1160, height: 840)
            try await render("compact-diagnostics", DiagnosticsView(model: model, live: false), width: 393, height: 426)
            try await render("compact-diagnostics-expanded", DiagnosticsView(model: model, live: false, initiallyExpanded: ["Latency", "Operations", "Errors", "Storage", "Scheduler", "Clients", "Sessions", "Profiles"]), width: 393, height: 426)
            model.diagnosticsLive = false
            try await render("diagnostics-paused", DiagnosticsView(model: model, live: false), width: 1160, height: 840)
            try await render("compact-diagnostics-paused", DiagnosticsView(model: model, live: false), width: 393, height: 426)
            model.diagnosticsLive = true
            model.diagnostics = nil
            try await render("diagnostics-empty", DiagnosticsView(model: model, live: false), width: 1160, height: 840)
            try await render("compact-diagnostics-empty", DiagnosticsView(model: model, live: false), width: 393, height: 426)
            model.diagnostics = diagnostics
            model.diagnosticsError = "Server unavailable; retrying when live."
            try await render("diagnostics-error", DiagnosticsView(model: model, live: false), width: 1160, height: 840)
            try await render("compact-diagnostics-error", DiagnosticsView(model: model, live: false), width: 393, height: 426)
            model.diagnosticsError = nil
            try await render("compact-main", TaskListView(model: model, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
            for view in ["all", "today", "overdue", "scheduled", "inbox"] {
                let listing = fixture()
                listing.signedIn = true
                listing.selectedView = view
                if view == "all" {
                    listing.planning = nil
                    listing.tasks = (1...8).map { task(id: "compact-density-\($0)", title: "Review release task \($0)", priority: "P3", tags: ["review"], hasDates: false) }
                    listing.viewCounts["all"] = 8
                }
                if view == "today", let planning = listing.planning {
                    listing.tasks = listing.tasks.filter { $0.status == "open" }
                    listing.planning = PlanningResult(name: planning.name, groups: planning.groups.filter { $0.name != "Completed" })
                }
                if view != "all" && view != "today" {
                    let tasks = view == "overdue" ? Array(listing.tasks.prefix(1)) : [
                        task(id: "compact-\(view)-1", title: "Prepare the release notes", priority: "P2", tags: ["review"], hasDates: false, scheduled: view == "scheduled" ? TaskTime(kind: "date", date: "2026-10-28") : nil),
                        task(id: "compact-\(view)-2", title: "Polish keyboard navigation", priority: "P3", tags: ["macos"], hasDates: false, scheduled: view == "scheduled" ? TaskTime(kind: "date", date: "2026-10-29") : nil),
                    ]
                    listing.tasks = tasks
                    listing.planning = PlanningResult(name: view, groups: [.init(name: view.capitalized, tasks: tasks)])
                }
                try await render("compact-list-" + view, TaskListView(model: listing, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
            }
            let failed = fixture()
            let actionFailed = fixture()
            actionFailed.signedIn = true
            actionFailed.message = "The Task changed. Close and reopen it before trying that action again."
            try await render("compact-action-error", TaskListView(model: actionFailed, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
            let lifecycle = fixture()
            lifecycle.signedIn = true
            lifecycle.selectedView = "all"
            lifecycle.planning = nil
            lifecycle.tasks = ["cancelled", "snoozed"].map { task(id: $0, title: "Review lifecycle task", priority: "P3", status: $0, tags: [], hasDates: false) }
            try await render("compact-lifecycle", TaskListView(model: lifecycle, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
            failed.signedIn = true
            failed.message = "The scratch server could not load tasks."
            failed.taskLoadError = failed.message
            try await render("compact-error", TaskListView(model: failed, compactMode: true).compactContent, width: 393, height: 426)
            try await render("compact-settings-entry", TaskListView(model: model, compactMode: true).compactContent.overlay {
                VStack(alignment: .leading, spacing: 8) { CompactUtilityActions(model: model) }.buttonStyle(.bordered).padding(16).background(.background, in: .rect(cornerRadius: 8)).shadow(radius: 8)
            }, width: 393, height: 426)
            model.connection = .offline
            try await render("compact-offline", TaskListView(model: model, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
            model.connection = .live
            model.editor = TaskDraft(model.tasks[0])
            try await render("compact-editor", TaskListView(model: model, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
            try await render("main", WorkspaceSnapshot(model: model), width: 1100, height: 720)
            try await render("copy-to-profile", TaskTransferPicker(model: model, request: .init(kind: .copy, task: model.tasks[0])), width: 468, height: 320)
            try await render("move-to-profile", TaskTransferPicker(model: model, request: .init(kind: .move, task: model.tasks[0])), width: 468, height: 320)
            for compact in [false, true] {
                let prefix = compact ? "compact-transfer" : "transfer"
                let width: CGFloat = compact ? 393 : 1100
                let height: CGFloat = compact ? 426 : 720
                func workspace() -> AnyView {
                    compact ? AnyView(TaskListView(model: model, compactMode: true, referenceDate: referenceDate).compactContent) : AnyView(WorkspaceSnapshot(model: model))
                }
                let actions = VStack(alignment: .leading, spacing: 14) { TaskTransferActions(model: model, task: model.tasks[0]) }
                    .buttonStyle(.plain).padding(16).frame(width: 200).background(.background, in: .rect(cornerRadius: 8)).shadow(radius: 8)
                try await render("\(prefix)-menu", workspace().overlay(alignment: .topTrailing) { actions.padding(24) }, width: width, height: height)
                for kind in [TaskTransferRequest.Kind.move, .copy] {
                    let picker = TaskTransferPicker(model: model, request: .init(kind: kind, task: model.tasks[0]))
                        .background(.background, in: .rect(cornerRadius: 12)).shadow(radius: 12)
                    try await render("\(prefix)-\(kind.rawValue)-picker", workspace().overlay { picker.frame(width: compact ? 360 : 420) }, width: width, height: height)
                }
                let sourceTask = model.tasks[0]
                let copyTask = task(id: "copied-review", title: sourceTask.title, version: 1, priority: "P1", tags: sourceTask.tags, profile: "personal")
                model.transferResult = .init(kind: .copy, task: copyTask, profileName: "Personal")
                try await render("\(prefix)-copy-result", workspace(), width: width, height: height)
                model.transferResult = nil
                let originalTasks = model.tasks
                let originalPlanning = model.planning
                let originalCounts = model.viewCounts
                model.tasks = originalTasks.filter { $0.id != sourceTask.id }
                if let planning = originalPlanning {
                    model.planning = PlanningResult(name: planning.name, groups: planning.groups.map { .init(name: $0.name, tasks: $0.tasks.filter { $0.id != sourceTask.id }) })
                }
                for key in ["all", "today", "overdue"] { model.viewCounts[key] = max(0, (model.viewCounts[key] ?? 1) - 1) }
                model.editor = nil
                model.transferResult = .init(kind: .move, task: task(id: sourceTask.id, title: sourceTask.title, version: 5, priority: "P1", tags: sourceTask.tags, profile: "personal"), profileName: "Personal")
                try await render("\(prefix)-move-result", workspace(), width: width, height: height)
                model.tasks = originalTasks; model.planning = originalPlanning; model.viewCounts = originalCounts
                model.transferResult = nil
                model.editor = TaskDraft(sourceTask)
                for kind in [TaskTransferRequest.Kind.copy, .move] {
                    model.conflict = TaskConflict(latest: task(id: "review", title: "Latest source Task", version: 5, priority: "P1", tags: ["design"]))
                    model.writeIntent = kind == .copy ? .copy("personal") : .move("personal")
                    try await render("\(prefix)-\(kind.rawValue)-conflict", workspace(), width: width, height: height)
                }
                model.conflict = nil
                model.writeIntent = .move("personal")
                model.editorError = "\"Personal\" already has a Task with external id \"repo:move\". Choose another Profile."
                let capture = TransferFrameCapture()
                try await render("\(prefix)-move-validation", workspace().onPreferenceChange(TransferFeedbackFrames.self) { value in Task { @MainActor in capture.frames = value } }, width: width, height: height)
                let message = try #require(capture.frames[.message])
                let primary = try #require(capture.frames[.primary])
                let cancel = try #require(capture.frames[.cancel])
                let gap = primary.minY - message.maxY
                #expect(gap >= 0 && gap <= 20)
                #expect(primary.height >= 28 && cancel.height >= 28)
                #expect(primary.minX >= 0 && primary.maxX <= width)
                #expect(cancel.minX >= 0 && cancel.maxX <= width)
                #expect(primary.maxY <= height && cancel.maxY <= height)
                transferLayouts.append(.init(screen: "\(prefix)-move-validation-\(mode)", compact: compact, messageToActions: gap, primaryHeight: primary.height, cancelHeight: cancel.height, actionsBottom: max(primary.maxY, cancel.maxY), windowHeight: height))
                model.editorError = nil
                model.conflict = nil; model.writeIntent = nil
                model.editor = TaskDraft(sourceTask)
                let profiles = model.profiles
                model.profiles = model.profiles.filter { $0.id == model.profile }
                try await render("\(prefix)-empty-picker", workspace().overlay { TaskTransferPicker(model: model, request: .init(kind: .copy, task: model.tasks[0])).frame(width: compact ? 360 : 420).background(.background) }, width: width, height: height)
                model.profiles = profiles
            }
            try await render("inspector", EditorView(model: model), width: 380, height: 800)
            model.editor?.title = "Review the revised interaction design"
            model.conflict = TaskConflict(
                latest: task(
                    id: "review", title: "Review the new sidebar design", version: 5, priority: "P1", tags: ["design", "macos", "review"]))
            try await render("conflict", EditorView(model: model), width: 440, height: 700)
            try await render("compact-conflict", TaskListView(model: model, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
            #expect(model.editorError == nil)
            try await render(
                "navigation-conflict", DraftNavigationPrompt(model: model, target: .edit(model.tasks[1])), width: 580, height: 260)
            model.conflict = nil
            try await render(
                "navigation-confirmation", DraftNavigationPrompt(model: model, target: .edit(model.tasks[1])), width: 580, height: 240)
            model.editor = nil
            let savedTasks = model.tasks
            let savedPlanning = model.planning
            model.tasks = []
            model.planning = nil
            try await render("compact-empty", TaskListView(model: model, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
            model.tasks = savedTasks
            model.planning = savedPlanning
            let remaining = Array(model.tasks.dropFirst())
            let originalTasks = model.tasks
            let originalPlanning = model.planning
            let originalCounts = model.viewCounts
            let originalProjects = model.projects
            let originalTags = model.tags
            model.viewCounts["all"] = max(0, (model.viewCounts["all"] ?? 0) - 1)
            model.viewCounts["today"] = 3
            model.viewCounts["overdue"] = 0
            model.projects = model.projects.map {
                DiscoveryEntry(
                    id: $0.id, name: $0.name, open_task_count: max(0, $0.open_task_count - 1), inbox_task_count: $0.inbox_task_count)
            }
            model.tags = model.tags.map {
                DiscoveryEntry(
                    id: $0.id, name: $0.name, open_task_count: max(0, $0.open_task_count - 1), inbox_task_count: $0.inbox_task_count)
            }
            model.tasks = remaining
            model.planning = PlanningResult(
                name: "Today",
                groups: [
                    .init(name: "Today", tasks: Array(remaining.prefix(2))), .init(name: "Completed", tasks: Array(remaining.suffix(1))),
                ])
            model.deletionNotice = "Task deleted"
            try await render("deleted-task-notice", WorkspaceSnapshot(model: model), width: 1100, height: 720)
            model.tasks = originalTasks
            model.planning = originalPlanning
            model.viewCounts = originalCounts
            model.projects = originalProjects
            model.tags = originalTags
            model.deletionNotice = nil
            model.newTitle = #"Send the design tomorrow p1 #"deep focus" #ready @"Client Project""#
            model.parsedInput = model.newTitle
            model.parsedTask = ParsedTask(
                title: "Send the design", due_at: TaskTime(kind: "date", date: "2026-10-29"), scheduled_at: nil, priority: "P1",
                tags: ["deep focus", "ready"], project: "Client Project")
            try await render("quick-add", QuickAddView(model: model, floating: true, referenceDate: referenceDate).content, width: 590, height: 360)
            try await render("menu-bar-quick-add", QuickAddView(model: model, floating: false, referenceDate: referenceDate).content, width: 590, height: 360)
            model.quickAdd = true
            try await render("compact-quick-add", TaskListView(model: model, compactMode: true, referenceDate: referenceDate).compactContent, width: 393, height: 426)
            #expect(model.parsedTask?.project == "Client Project")
            #expect(model.parsedTask?.tags == ["deep focus", "ready"])
            model.quickAdd = false
            model.newTitle = #"Ship #"planning p1 work""#
            model.parsedInput = model.newTitle
            model.parsedTask = ParsedTask(title: "Ship", priority: "P3", tags: ["planning p1 work"])
            #expect(model.parsedTask?.displayingTokens(in: model.newTitle).priority == nil)
            try await render("quoted-name-priority", QuickAddView(model: model, floating: true, referenceDate: referenceDate).content, width: 590, height: 300)
            try await render("quoted-name-priority-compact", QuickAddView(model: model, floating: true, compact: true, referenceDate: referenceDate).content, width: 393, height: 300)
            model.editor = nil
            model.quickAdd = false
            model.connection = .live
            let importFile = Data(#"[{"external_id":"repository:weekly-export","title":"Enable weekly telemetry export"},{"external_id":"repository:jira-follow-up","title":"Jira: draft the ETL follow-up"},{"external_id":"repository:validation","title":"Validate the dashboard refresh"},{"external_id":"repository:review","title":"Review the repository inventory"}]"#.utf8)
            let previewJSON = #"{"generated_at":"2026-10-29T00:00:00Z","dry_run":true,"items":[{"external_id":"repository:weekly-export","outcome":"created","task_id":null,"from_version":null,"changed_fields":["title","project_name","tag_names"]},{"external_id":"repository:jira-follow-up","outcome":"updated","task_id":"b","from_version":2,"changed_fields":["description","status"]},{"external_id":"repository:validation","outcome":"unchanged","task_id":"c","from_version":1,"changed_fields":[]},{"external_id":"repository:review","outcome":"rejected","task_id":"d","from_version":1,"changed_fields":[],"error":{"code":"task_deleted","message":"This Task is deleted. Restore it before importing changes.","exit_code":2,"exit_meaning":"validation or usage"}}],"totals":{"created":1,"updated":1,"unchanged":1,"rejected":1}}"#
            for state in ["file", "single-file", "preview", "preview-rejected-first", "preview-rejected-last", "preview-two-rejected", "preview-dependency-rejected", "long-preview", "result", "conflict", "empty", "error", "offline"] {
                model.resetImport()
                model.connection = state == "offline" ? .offline : .live
                if state == "single-file" {
                    model.loadImport(data: Data(#"[{"external_id":"u02:single-count","title":"Single import Task"}]"#.utf8), name: "single-task.json")
                    #expect(model.importDocument?.items.count == 1)
                }
                if state != "file" && state != "single-file" && state != "error" && state != "offline" {
                    model.loadImport(data: importFile, name: "repository-sync.json")
                    var json = previewJSON
                    if state == "result" { json = json.replacingOccurrences(of: "\"dry_run\":true", with: "\"dry_run\":false") }
                    if state == "conflict" {
                        json = #"{"generated_at":"2026-10-29T00:00:00Z","dry_run":false,"items":[{"external_id":"repository:weekly-export","outcome":"rejected","task_id":"a","from_version":2,"changed_fields":[],"error":{"code":"occ_conflict","message":"Task changed since preview. Preview again and apply the current Version.","exit_code":4,"exit_meaning":"Conflict","details":{"current_version":3}}}],"totals":{"created":0,"updated":0,"unchanged":0,"rejected":1}}"#
                    }
                    if state == "empty" { json = #"{"generated_at":"2026-10-29T00:00:00Z","dry_run":true,"items":[],"totals":{"created":0,"updated":0,"unchanged":0,"rejected":0}}"# }
                    model.importReport = try JSONDecoder().decode(ImportSummary.self, from: Data(json.utf8))
                }
                if let report = model.importReport, state.hasPrefix("preview-") {
                    var rows = report.items
                    if state == "preview-rejected-first" {
                        rows.insert(rows.removeLast(), at: 0)
                        var input = try #require(model.importDocument).items
                        input.insert(input.removeLast(), at: 0)
                        model.loadImport(data: try JSONEncoder().encode(input), name: "repository-rejected-first.json")
                    }
                    if state == "preview-two-rejected" {
                        let original = rows[1]
                        rows[1] = .init(external_id: original.external_id, outcome: "rejected", task_id: original.task_id, from_version: original.from_version, changed_fields: [], error: rows[3].error)
                    }
                    if state == "preview-dependency-rejected" {
                        let payload = #"{"code":"invalid_args","message":"AGENT ONLY outer copy","exit_code":2,"exit_meaning":"validation or usage","details":{"dependency_error":{"generated_at":"2026-11-10T00:00:00Z","code":"dependency_cycle","message":"AGENT ONLY nested copy","exit_code":2,"exit_meaning":"validation or usage","details":{"dependent_id":"a","blocker_id":"b","path":["a","b","a"]}}}}"#
                        let failure = try JSONDecoder().decode(ServerFailure.self, from: Data(payload.utf8))
                        let original = rows[1]
                        rows[1] = .init(external_id: original.external_id, outcome: "rejected", task_id: original.task_id, from_version: original.from_version, changed_fields: [], error: failure)
                        rows.insert(rows.removeLast(), at: 0)
                        var input = try #require(model.importDocument).items
                        input.insert(input.removeLast(), at: 0)
                        model.loadImport(data: try JSONEncoder().encode(input), name: "repository-dependency-refusal.json")
                        #expect(rows[0].reasonText == "This Task is deleted. Restore it before importing changes.")
                        #expect(rows[2].reasonText == "This Dependency would create a loop.")
                        #expect(rows[2].exitDetail == "error 2 - validation or usage")
                    }
                    model.importReport = .init(generated_at: report.generated_at, dry_run: true, items: rows, totals: state == "preview-two-rejected" || state == "preview-dependency-rejected" ? .init(created: 1, updated: 0, unchanged: 1, rejected: 2) : report.totals)
                }
                if state == "long-preview" {
                    let items = (0..<12).map { index in ["external_id": "repository:scroll:\(index)", "title": "Review the repository inventory \(index + 1)"] }
                    model.loadImport(data: try JSONSerialization.data(withJSONObject: items), name: "repository-scroll.json")
                    let rows: [[String: Any]] = items.map { ["external_id": $0["external_id"]!, "outcome": "created", "task_id": NSNull(), "from_version": NSNull(), "changed_fields": ["title", "external_id", "project_name", "tag_names"]] }
                    let data = try JSONSerialization.data(withJSONObject: ["generated_at": "2026-10-29T00:00:00Z", "dry_run": true, "items": rows, "totals": ["created": 12, "updated": 0, "unchanged": 0, "rejected": 0]])
                    model.importReport = try JSONDecoder().decode(ImportSummary.self, from: data)
                }
                let fullFrames = ImportFrameCapture()
                let compactFrames = ImportFrameCapture()
                if state == "error" { model.importMessages.publish("Cannot read this file. Choose a JSON array or NDJSON file.", kind: .file) }
                try await render("import-\(state)", ZStack {
                    WorkspaceSnapshot(model: model)
                    Color.black.opacity(0.12)
                    ImportView(model: model).onPreferenceChange(ImportLayoutFrames.self) { value in Task { @MainActor in fullFrames.frames = value } }.background(.background, in: RoundedRectangle(cornerRadius: 12)).shadow(radius: 16)
                }, width: 1100, height: 720)
                try await render("compact-import-\(state)", ImportView(model: model, compact: true).onPreferenceChange(ImportLayoutFrames.self) { value in Task { @MainActor in compactFrames.frames = value } }, width: 393, height: 426)
                for (capture, isCompact, height) in [(fullFrames, false, CGFloat(620)), (compactFrames, true, CGFloat(426))] {
                    let targets = [ImportLayoutRegion.fileChange, .fileChoose, .primary, .cancel].compactMap { capture.frames[$0]?.height }
                    #expect(targets.allSatisfy { $0 >= 28 })
                    let viewport = capture.frames[.viewport]
                    let summaryHeight = capture.frames[.summary]?.height
                    let rows = capture.frames.compactMap { region, bounds -> CGRect? in
                        if case .row = region { return bounds }
                        return nil
                    }
                    let wholeRows = viewport.map { viewport in rows.filter { viewport.contains($0) }.count } ?? 0
                    let intersecting = viewport.map { viewport in rows.filter { $0.intersection(viewport).height > 0 }.count } ?? 0
                    if let report = model.importReport, !report.items.isEmpty {
                        let viewport = try #require(viewport)
                        let footer = try #require(capture.frames[.footer])
                        #expect(viewport.height >= 100)
                        #expect(viewport.maxY <= footer.minY)
                        #expect(footer.maxY <= height)
                        if isCompact {
                            #expect(wholeRows >= min(4, report.items.count))
                            #expect(intersecting == wholeRows)
                            #expect(try #require(summaryHeight) <= 18)
                            #expect(rows.map(\.height) == Array(repeating: CGFloat(56), count: report.items.count))
                            for (index, row) in report.items.enumerated() {
                                let rowFrame = try #require(capture.frames[.row(index)])
                                let regions: [ImportLayoutRegion] = [.rowTitle(index), .outcome(index)] + (row.error == nil ? [.externalID(index), .changes(index)] : [.reason(index), .exitPair(index)])
                                for region in regions {
                                    let line = try #require(capture.frames[region])
                                    #expect(line.height > 0)
                                    #expect(rowFrame.contains(line), "\(state) \(region) \(line) must fit inside \(rowFrame)")
                                }
                                if row.error != nil {
                                    #expect(try #require(capture.frames[.reason(index)]).height <= 14)
                                    #expect(try #require(capture.frames[.exitPair(index)]).height <= 14)
                                }
                            }
                        }
                    }
                    importLayouts.append(.init(screen: "\(isCompact ? "compact-" : "")import-\(state)-\(mode)", compact: isCompact, wholeRows: wholeRows, partialRows: intersecting-wholeRows, viewportHeight: viewport?.height, summaryHeight: summaryHeight, targetHeights: targets, rowBounds: rows.map { [$0.minX, $0.minY, $0.width, $0.height] }, textBounds: capture.frames.compactMap { region, frame in
                        switch region {
                        case .rowTitle, .outcome, .externalID, .changes, .reason, .exitPair: return [frame.minX, frame.minY, frame.width, frame.height]
                        default: return nil
                        }
                    }))
                }
            }
            model.connection = .live
            model.resetImport()
            model.snapshotsLoaded = true
            model.ownerSnapshots = [OwnerSnapshot(id: "11111111-1111-1111-1111-111111111111", created_at: "2026-10-29T14:30:00Z", schema_version: 3, seq: 42, size: 245760, reason: "manual", sha256: String(repeating: "a", count: 64), path: "/fixture/snapshots/11111111.sqlite", task_counts: [.init(profile: "work", name: "Work", count: 16), .init(profile: "personal", name: "Personal", count: 3)])]
            for tab in SettingsView.Tab.allCases {
                let settings = SettingsView(
                    model: model, selectedTab: tab, notifications: NotificationSettingsState(authorization: "Allowed"),
                    serverStatus: ManagedServerStatus(
                        label: "fixture.todo.server", path: "/fixture/LaunchAgents/todo.plist", installed: true, loaded: true,
                        configuration: ManagedServerConfiguration(
                            executable: "/fixture/Todo/Server/todo-server", database: "/fixture/todo.db", port: 4310)))
                try await render(
                    "settings-\(tab.rawValue.lowercased())",
                    VStack(spacing: 0) {
                        HStack(spacing: 20) {
                            ForEach(SettingsView.Tab.allCases, id: \.self) { value in
                                Label(value.rawValue, systemImage: value.symbol).foregroundStyle(
                                    value == tab ? Color.accentColor : .secondary)
                            }
                        }.padding(16)
                        Divider()
                        settings.page(tab)
                    }, width: 600, height: 460)
            }
            let snapshotSettings = SettingsView(model: model, selectedTab: .snapshots)
            try await render("compact-snapshots", snapshotSettings.page(.snapshots), width: 393, height: 426)
            let firstSnapshot = model.ownerSnapshots[0]
            model.ownerSnapshots = snapshotDensity()
            #expect(model.ownerSnapshots.count == 7)
            try await render("density-snapshots", snapshotSettings.page(.snapshots), width: 600, height: 460)
            try await render("compact-density-snapshots", snapshotSettings.page(.snapshots), width: 393, height: 426)
            model.ownerSnapshots = [firstSnapshot]
            model.snapshotRestoreTarget = model.ownerSnapshots[0]
            model.snapshotRestore = try JSONDecoder().decode(SnapshotRestorePreview.self, from: Data(#"{"id":"11111111-1111-1111-1111-111111111111","dry_run":true,"seq_before":56,"seq_after":42,"seq_delta":-14,"generation":"initial","task_counts":[{"profile":"work","name":"Work","before":21,"after":16},{"profile":"personal","name":"Personal","before":4,"after":3}]}"#.utf8))
            try await render("snapshot-restore", SnapshotRestoreConfirmation(model: model), width: 520, height: 340)
            try await render("compact-snapshot-restore", SnapshotRestoreConfirmation(model: model), width: 393, height: 426)
            model.snapshotError = "Snapshot checksum mismatch. Choose another Snapshot."
            try await render("snapshot-restore-error", SnapshotRestoreConfirmation(model: model), width: 520, height: 380)
            try await render("compact-snapshot-restore-error", SnapshotRestoreConfirmation(model: model), width: 393, height: 426)
            model.snapshotRestore = nil; model.snapshotRestoreTarget = nil; model.snapshotError = nil
            model.ownerSnapshots = []
            try await render("snapshots-empty", snapshotSettings.page(.snapshots), width: 600, height: 460)
            try await render("compact-snapshots-empty", snapshotSettings.page(.snapshots), width: 393, height: 426)
            model.snapshotError = "Couldn't reach the server. Retry when it is available."
            try await render("snapshots-error", snapshotSettings.page(.snapshots), width: 600, height: 460)
            try await render("compact-snapshots-error", snapshotSettings.page(.snapshots), width: 393, height: 426)
            model.snapshotError = nil; model.snapshotsLoaded = false
            try await render("snapshots-loading", snapshotSettings.page(.snapshots), width: 600, height: 460)
            try await render("compact-snapshots-loading", snapshotSettings.page(.snapshots), width: 393, height: 426)
        }
        try JSONSerialization.data(
            withJSONObject: [
                "renderer": "offscreen NSHostingView cacheDisplay", "appLaunched": false, "keychainAccess": false, "files": files,
                "bundle": TodoColors.bundle.bundlePath, "accentAssetLoaded": NSColor(named: "primary", bundle: TodoColors.bundle) != nil,
            ], options: [.prettyPrinted, .sortedKeys]
        ).write(to: directory.appendingPathComponent("manifest.json"))
        try JSONEncoder().encode(importLayouts).write(to: directory.appendingPathComponent("import-layout.json"))
        try JSONEncoder().encode(transferLayouts).write(to: directory.appendingPathComponent("transfer-layout.json"))
        try JSONSerialization.data(withJSONObject: compactLayouts, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("compact-layout.json"))
        #expect(files.count == (ProcessInfo.processInfo.environment["TODO_SNAPSHOT_C8_ONLY"] == "1" ? 24 : ProcessInfo.processInfo.environment["TODO_SNAPSHOT_C7_ONLY"] == "1" ? 22 : ProcessInfo.processInfo.environment["TODO_SNAPSHOT_SEARCH_ONLY"] == "1" ? 60 : ProcessInfo.processInfo.environment["TODO_SNAPSHOT_QUICK_ONLY"] == "1" ? 2 : ProcessInfo.processInfo.environment["TODO_SNAPSHOT_PRIORITY_ONLY"] == "1" ? 18 : ProcessInfo.processInfo.environment["TODO_SNAPSHOT_BATCH_EDIT_ONLY"] == "1" ? 28 : 362))
        if !ProcessInfo.processInfo.environment.contains(where: { $0.key.hasPrefix("TODO_SNAPSHOT_") && $0.key.hasSuffix("_ONLY") && $0.value == "1" }) {
            let discovery = try await DiscoverySnapshots.render(directory: directory)
            let dependencies = try await DependencyMatrixSnapshots.render(directory: directory)
            files += discovery + dependencies
            #expect(files.count == 872)
            #expect(Set(files).count == files.count)
            var manifest = try #require(JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("manifest.json"))) as? [String: Any])
            manifest["files"] = files
            manifest["counts"] = ["baseline": 362, "discovery": discovery.count, "dependencies": dependencies.count]
            try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("manifest.json"))
        }
    }

    private func fixture() -> TodoModel {
        let model = TodoModel(
            configuration: ClientConfiguration(
                server: URL(string: "http://127.0.0.1:4310")!, initialProfile: "work", vaultService: "unused.offscreen.fixture"),
            clientFactory: { url, _ in
                Client(serverURL: url, transport: FixtureTransport())
            })
        model.connection = .live
        model.profiles = [
            DiscoveryEntry(id: "work", name: "Work", open_task_count: 6, inbox_task_count: 1),
            DiscoveryEntry(id: "personal", name: "Personal", open_task_count: 2, inbox_task_count: 1),
        ]
        model.projects = [DiscoveryEntry(id: "todo", name: "Todo", open_task_count: 4, inbox_task_count: nil)]
        model.tags = ["design", "macos", "review"].map { DiscoveryEntry(id: $0, name: $0, open_task_count: 2, inbox_task_count: nil) }
        let overdue = task(id: "review", title: "Review the interaction design", priority: "P1", tags: ["design", "macos", "review"])
        let today = task(id: "notes", title: "Prepare the release notes", priority: "P2", tags: ["review"])
        let later = task(id: "polish", title: "Polish keyboard navigation", priority: "P3", tags: ["macos"])
        let done = task(id: "done", title: "Choose the planning groups", priority: "P4", status: "done", tags: ["design"])
        model.tasks = [overdue, today, later, done]
        model.planning = PlanningResult(
            name: "Today",
            groups: [
                .init(name: "Overdue", tasks: [overdue]), .init(name: "Today", tasks: [today, later]),
                .init(name: "Completed", tasks: [done]),
            ])
        model.viewCounts = ["all": 6, "today": 4, "overdue": 1, "scheduled": 3, "inbox": 1]
        model.lastSequence = "42"
        model.resumeSequence = "39"
        model.reconnectCount = 1
        model.series = SeriesDefinition(
            id: "weekly", profile_id: "work",
            recurrence: Recurrence(dtstart: TaskTime(kind: "date", date: "2026-10-28"), rrule: "FREQ=WEEKLY;BYDAY=WE", exdate: []),
            deleted_at: nil)
        return model
    }
    private func task(id: String, title: String, version: Int = 4, priority: String, status: String = "open", tags: [String], profile: String = "work", hasDates: Bool = true, scheduled: TaskTime? = nil, project: String = "todo")
        -> TaskSnapshot
    {
        TaskSnapshot(
            id: id, profile_id: profile, row_version: version, title: title,
            description: "Check the planning groups, keyboard controls and the task inspector.", priority: priority, source: "manual",
            status: status, project_id: project, tags: tags,
            due_at: !hasDates ? nil : id == "review"
                ? TaskTime(kind: "instant", utc: "2026-10-28T14:00:00Z", time_zone: "America/Bogota")
                : TaskTime(kind: "date", date: "2026-10-28"), scheduled_at: scheduled, energy: 3, estimate_min: 25, occurrence: nil,
            legacy_series_detached: true, deleted_at: nil)
    }
}

private func snapshotDensity() -> [OwnerSnapshot] {
    ["manual", "daily", "pre-restore", "pre-migration", "pre-purge", "before Profile delete Personal", "before import Tasks.csv"].enumerated().map { index, reason in
        OwnerSnapshot(id: "density-\(index)", created_at: "2026-10-\(29 - index)T14:30:00Z", schema_version: 3, seq: 42 - index, size: 245760 - index * 4096, reason: reason, sha256: String(repeating: "a", count: 64), path: "/fixture/snapshots/11111111.sqlite", task_counts: [.init(profile: "work", name: "Work", count: index == 0 ? 1 : 16), .init(profile: "personal", name: "Personal", count: 3)])
    }
}

private struct FixtureTransport: ClientTransport {
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let json: String
        switch operationID {
        case "reads.projects":
            json =
                #"[{"id":"todo","profile_id":"work","name":"Todo","created_at":"2026-10-28T00:00:00Z","updated_at":"2026-10-28T00:00:00Z","open_task_count":4}]"#
        case "reads.tags":
            json =
                #"[{"id":"design","profile_id":"work","name":"design","open_task_count":2},{"id":"macos","profile_id":"work","name":"macos","open_task_count":2},{"id":"review","profile_id":"work","name":"review","open_task_count":2}]"#
        case "reads.quickAdd":
            json =
                #"{"title":"Send the design","due_at":{"kind":"date","date":"2026-10-29"},"scheduled_at":null,"priority":"P1","tags":["deep focus","ready"],"project":"Client Project"}"#
        default: throw FixtureFailure.unexpectedOperation(operationID)
        }
        return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(json))
    }
    enum FixtureFailure: Error { case unexpectedOperation(String) }
}

private struct WorkspaceSnapshot: View {
    let model: TodoModel
    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                HStack {
                    Text(model.selectedView == "all" ? "All tasks" : model.selectedView.capitalized).font(.headline)
                    Text("\(model.profileName) · \(TaskCount.text(TaskListView(model: model).visibleTasks.count))").foregroundStyle(.secondary)
                    Spacer()
                    TaskListView(model: model).searchField.frame(width: 260)
                    Image(systemName: "plus")
                }.padding(16)
                Divider()
                HStack(spacing: 0) {
                    TaskListView(model: model).sidebar.frame(width: 220)
                    Divider()
                    TaskListView(model: model).taskContent.frame(maxWidth: .infinity)
                }
            }
            if model.editor != nil {
                Divider()
                VStack(spacing: 0) {
                    HStack {
                        Spacer()
                        Image(systemName: "sidebar.right")
                    }.padding(16)
                    Divider()
                    EditorView(model: model)
                }.frame(width: 360)
            }
        }
    }
}

@MainActor
private final class DiagnosticsLayoutReceipt {
    var frames: [String: CGRect] = [:]
}

@MainActor private final class ChipFrameRecorder {
    var frames: [String: CGRect] = [:]
    var labels: [String: String] = [:]
}

/// Renders a view for the design suite at a fixed 2x scale in generic (calibrated) RGB and tags it
/// sRGB, independent of the capturing host's display scale and colour profile, so two runs of the
/// same source give byte-identical PNGs. verify-design.py records this in result.json.
final class C7ReviewClock: @unchecked Sendable { private let lock = NSLock(); private var value = 1000.0; var now: Double { get { lock.withLock { value } } set { lock.withLock { value = newValue } } } }

@MainActor func snapshotBitmap(_ view: NSView) throws -> NSBitmapImageRep {
    let size = view.bounds.size
    let rep = try #require(NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int((size.width * 2).rounded()), pixelsHigh: Int((size.height * 2).rounded()),
                                            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                            colorSpaceName: .calibratedRGB, bytesPerRow: 0, bitsPerPixel: 0))
    rep.size = size
    view.cacheDisplay(in: view.bounds, to: rep)
    return try #require(rep.retagging(with: .sRGB))
}

/// Maximum captures a render may need before two consecutive ones are byte-identical. 2 means the
/// first capture was already final; 3 allows one late change. More fails the render.
let settleCaptureLimit = 3

/// Captures the verdict image and records how it got there. Before each capture it applies pending
/// constraints, layout and Core Animation work (work already scheduled, nothing forced), then
/// captures every 100 ms until two consecutive bitmaps are byte-identical. The number of captures
/// and every control whose frame changed between them go to settle.jsonl in TODO_SNAPSHOT_DIR, and
/// the render fails above `settleCaptureLimit`.
///
/// A layout that is stale and stays stale (a control measured before its font arrived, never
/// re-measured) is stable, so it passes the count. The detector after the verdict image forces
/// every control to re-measure and captures again: when that image differs, the render was wrong
/// on its first layout and the controls that moved are recorded as `staleControls`. The forced
/// image never replaces the verdict image; with TODO_SNAPSHOT_INVALIDATED_DIR set it is written
/// there so runs can be compared with and without the invalidation.
@MainActor func settledSnapshotBitmap(_ view: NSView, name: String = #function) async throws -> NSBitmapImageRep {
    func bytes(_ rep: NSBitmapImageRep) -> Data { Data(bytes: rep.bitmapData!, count: rep.bytesPerRow * rep.pixelsHigh) }
    func apply() {
        view.window?.updateConstraintsIfNeeded()
        view.window?.layoutIfNeeded()
        view.layoutSubtreeIfNeeded()
        CATransaction.flush()
    }
    func settle() async throws -> (NSBitmapImageRep, Int, [[String: Any]]) {
        apply()
        var previous = try snapshotBitmap(view)
        var frames = controlFrames(view)
        var changes: [[String: Any]] = []
        for capture in 2...30 {
            try await Task.sleep(for: .milliseconds(100))
            apply()
            let next = try snapshotBitmap(view)
            let nextFrames = controlFrames(view)
            if bytes(next) == bytes(previous) { return (next, capture, changes) }
            changes += frameChanges(frames, nextFrames).map { $0.merging(["between": [capture - 1, capture]]) { a, _ in a } }
            previous = next
            frames = nextFrames
        }
        return (previous, 31, changes)
    }
    let (verdict, captures, changes) = try await settle()
    let verdictFrames = controlFrames(view)
    // Detector only: force every control to re-measure and see whether the layout moves.
    func controls(_ view: NSView) -> [NSControl] { ((view as? NSControl).map { [$0] } ?? []) + view.subviews.flatMap(controls) }
    controls(view).forEach { $0.invalidateIntrinsicContentSize() }
    let (forced, forcedCaptures, _) = try await settle()
    let stale = bytes(forced) != bytes(verdict)
    let sequence = SettleLedger.shared.next()
    var row: [String: Any] = ["sequence": sequence, "name": name, "captures": captures, "changes": changes, "forcedCaptures": forcedCaptures, "staleOnFirstLayout": stale,
                              "appearance": view.effectiveAppearance.name.rawValue]
    if stale { row["staleControls"] = frameChanges(verdictFrames, controlFrames(view)) }
    SettleLedger.shared.append(row)
    if let directory = ProcessInfo.processInfo.environment["TODO_SNAPSHOT_INVALIDATED_DIR"] {
        try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        try forced.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: directory).appendingPathComponent(String(format: "%04d-%@.png", sequence, name)))
    }
    probeTextFields(view, name: name)
    if captures > settleCaptureLimit {
        Issue.record("\(name): needed \(captures) captures to settle (limit \(settleCaptureLimit)); changes \(changes)")
    }
    return verdict
}

/// Frames of every control and scroll view, keyed by depth-first index, class and accessibility identifier.
@MainActor func controlFrames(_ root: NSView) -> [String: CGRect] {
    var result: [String: CGRect] = [:]
    var index = 0
    func walk(_ view: NSView) {
        if view is NSControl || view is NSScrollView {
            let identifier = view.accessibilityIdentifier()
            result["\(index):\(type(of: view))\(identifier.isEmpty ? "" : ":" + identifier)"] = view.convert(view.bounds, to: root)
            index += 1
        }
        view.subviews.forEach(walk)
    }
    walk(root)
    return result
}

@MainActor func frameChanges(_ before: [String: CGRect], _ after: [String: CGRect]) -> [[String: Any]] {
    Set(before.keys).union(after.keys).sorted().compactMap { key in
        let a = before[key], b = after[key]
        guard a != b else { return nil }
        func list(_ r: CGRect?) -> Any { r.map { [$0.minX, $0.minY, $0.width, $0.height].map(Double.init) } ?? NSNull() }
        return ["control": key, "from": list(a), "to": list(b), "dHeight": Double((b?.height ?? 0) - (a?.height ?? 0)), "dY": Double((b?.minY ?? 0) - (a?.minY ?? 0))]
    }
}

/// Appends one settle row per render to TODO_SNAPSHOT_DIR/settle.jsonl.
@MainActor final class SettleLedger {
    static let shared = SettleLedger()
    private var sequence = 0
    func next() -> Int { sequence += 1; return sequence }
    func append(_ row: [String: Any]) {
        guard let directory = ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"],
              let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) else { return }
        let path = URL(fileURLWithPath: directory).appendingPathComponent("settle.jsonl").path
        if !FileManager.default.fileExists(atPath: path) { FileManager.default.createFile(atPath: path, contents: nil) }
        guard let handle = FileHandle(forWritingAtPath: path) else { return }
        handle.seekToEndOfFile(); handle.write(data + Data("\n".utf8)); try? handle.close()
    }
}

/// Diagnostic for the text-field height flip: with TODO_SNAPSHOT_FIELD_PROBE set, appends each
/// text field's drawing state at capture time to that JSONL file.
@MainActor func probeTextFields(_ view: NSView, name: String) {
    guard let path = ProcessInfo.processInfo.environment["TODO_SNAPSHOT_FIELD_PROBE"] else { return }
    func fields(_ view: NSView) -> [NSControl] { ((view as? NSControl).map { [$0] } ?? []) + view.subviews.flatMap(fields) }
    let rows: [[String: Any]] = fields(view).map { field in
        let frame = field.convert(field.bounds, to: view)
        return ["class": String(describing: type(of: field)), "cell": String(describing: type(of: field.cell)), "frame": [frame.minX, frame.minY, frame.width, frame.height].map(Double.init),
                "intrinsic": [Double(field.intrinsicContentSize.width), Double(field.intrinsicContentSize.height)], "controlSize": field.controlSize.rawValue,
                "font": "\(field.font?.fontName ?? "nil") \(field.font?.pointSize ?? 0)", "bezelStyle": (field as? NSTextField)?.bezelStyle.rawValue ?? -1, "appearance": field.effectiveAppearance.name.rawValue,
                "editing": field.currentEditor() != nil, "layer": field.layer != nil, "wantsLayer": field.wantsLayer, "firstResponder": field.window?.firstResponder === field,
                "windowKey": field.window?.isKeyWindow ?? false, "windowAppearance": field.window?.effectiveAppearance.name.rawValue ?? "nil", "appAppearance": NSApp.effectiveAppearance.name.rawValue]
    }
    guard let data = try? JSONSerialization.data(withJSONObject: ["name": name, "fields": rows], options: [.sortedKeys]),
          let handle = FileHandle(forWritingAtPath: path) ?? { FileManager.default.createFile(atPath: path, contents: nil); return FileHandle(forWritingAtPath: path) }() else { return }
    handle.seekToEndOfFile(); handle.write(data + Data("\n".utf8)); try? handle.close()
}
