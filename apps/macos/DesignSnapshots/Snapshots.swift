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
            NSApplication.shared.appearance = NSAppearance(named: scheme == .light ? .aqua : .darkAqua)
            let mode = scheme == .light ? "light" : "dark"
            let model = fixture()
            func render<V: View>(_ name: String, _ view: V, width: CGFloat, height: CGFloat, scrollEditor: Bool = false) async throws {
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
                try await Task.sleep(for: .milliseconds(100))
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
                        if let previous = rows.filter({ $0.maxY <= label.minY }).max(by: { $0.maxY < $1.maxY }) {
                            #expect(abs(label.minY - previous.maxY - 12) < 0.5)
                        }
                    }
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
                let template = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                let backing = try #require(
                    NSBitmapImageRep(
                        bitmapDataPlanes: nil, pixelsWide: Int(width * 2), pixelsHigh: Int(height * 2),
                        bitsPerSample: template.bitsPerSample, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0))
                backing.size = NSSize(width: width, height: height)
                host.cacheDisplay(in: host.bounds, to: backing)
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
            model.newTitle = #"Ship tomorrow p1 #focus #planning @Client"#
            model.signedIn = true
            model.connection = .live
            model.parsedInput = model.newTitle
            model.parsedTask = ParsedTask(title: "Ship", due_at: TaskTime(kind: "date", date: "2026-10-29"), priority: "P1", tags: ["focus", "planning"], project: "Client")
            try await render("compact-quick-add-short", QuickAddView(model: model, floating: true, compact: true, referenceDate: referenceDate).content, width: 393, height: 426)
            if ProcessInfo.processInfo.environment["TODO_SNAPSHOT_QUICK_ONLY"] == "1" { continue }
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
                .init(id: "jira", location: .file(directory.appendingPathComponent("missing-jira-draft.md").path), label: "jira", added_at: "2026-10-29T00:00:00Z"),
                .init(id: "image", location: .image(preview.path), name: "launch-sketch.png", byte_size: previewData.count, added_at: "2026-10-29T00:00:00Z"),
                .init(id: "link", location: .link(URL(string: "https://example.com/issue/42")!), label: "Issue 42", added_at: "2026-10-29T00:00:00Z")
            ]
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
            let previewJSON = #"{"generated_at":"2026-10-29T00:00:00Z","dry_run":true,"items":[{"external_id":"repository:weekly-export","outcome":"created","task_id":null,"from_version":null,"changed_fields":["title","project_name","tag_names"]},{"external_id":"repository:jira-follow-up","outcome":"updated","task_id":"b","from_version":2,"changed_fields":["description","status"]},{"external_id":"repository:validation","outcome":"unchanged","task_id":"c","from_version":1,"changed_fields":[]},{"external_id":"repository:review","outcome":"rejected","task_id":"d","from_version":1,"changed_fields":[],"error":{"code":"title_required","message":"New Tasks need a title. Add a title and import again."}}],"totals":{"created":1,"updated":1,"unchanged":1,"rejected":1}}"#
            for state in ["file", "single-file", "preview", "long-preview", "result", "conflict", "empty", "error", "offline"] {
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
                        json = #"{"generated_at":"2026-10-29T00:00:00Z","dry_run":false,"items":[{"external_id":"repository:weekly-export","outcome":"rejected","task_id":"a","from_version":2,"changed_fields":[],"error":{"code":"occ_conflict","message":"Task changed since preview. Preview again and apply the current Version.","details":{"current_version":3}}}],"totals":{"created":0,"updated":0,"unchanged":0,"rejected":1}}"#
                    }
                    if state == "empty" { json = #"{"generated_at":"2026-10-29T00:00:00Z","dry_run":true,"items":[],"totals":{"created":0,"updated":0,"unchanged":0,"rejected":0}}"# }
                    model.importReport = try JSONDecoder().decode(ImportSummary.self, from: Data(json.utf8))
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
                if state == "error" { model.importError = "Cannot read this file. Choose a JSON array or NDJSON file." }
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
                        }
                    }
                    importLayouts.append(.init(screen: "\(isCompact ? "compact-" : "")import-\(state)-\(mode)", compact: isCompact, wholeRows: wholeRows, partialRows: intersecting-wholeRows, viewportHeight: viewport?.height, summaryHeight: summaryHeight, targetHeights: targets))
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
        #expect(files.count == (ProcessInfo.processInfo.environment["TODO_SNAPSHOT_QUICK_ONLY"] == "1" ? 2 : 278))
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
