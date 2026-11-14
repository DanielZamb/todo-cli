import AppKit
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

@MainActor private final class DiscoveryFrames { var frames: [String: CGRect] = [:]; var reportFrames: [String: CGRect] = [:] }

@MainActor struct DiscoverySnapshots {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DISCOVERY_ONLY"] == "1"))
    func renderDiscoveryScreens() async throws {
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"]))
        let files = try await Self.render(directory: directory)
        try JSONSerialization.data(withJSONObject: ["files": files], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("manifest.json"))
    }
    static func render(directory: URL) async throws -> [String] {
        NSApplication.shared.setActivationPolicy(.prohibited)
        var files: [String] = []
        var geometry: [String: [String: [Double]]] = [:]
        let profile = DiscoveryName(id: "work", name: "Work")
        let match = TaskLookupMatch(profile: profile, task_id: "aaaaaaaa-1111-4222-8333-444444444444", title: "Review ARG report before Friday", project: "ARG")
        let states: [(String, DiscoveryDialog, DiscoveryPhase)] = [
            ("directory-ready", .directory, .showing), ("directory-empty", .directory, .empty),
            ("directory-loading", .directory, .requesting), ("directory-error", .directory, .error),
            ("directory-offline", .directory, .offline), ("directory-dense", .directory, .showing),
            ("lookup-editing", .lookup, .editing), ("lookup-invalid", .lookup, .invalid),
            ("lookup-loading", .lookup, .requesting), ("lookup-ready", .lookup, .showing),
            ("lookup-empty", .lookup, .empty), ("lookup-error", .lookup, .error),
            ("lookup-offline", .lookup, .offline), ("lookup-copied", .lookup, .showing),
            ("lookup-copy-failed", .lookup, .showing), ("lookup-dense", .lookup, .showing),
            ("show-gone", .lookup, .error), ("editor-not-found", .lookup, .error),
            ("history-not-found", .lookup, .error), ("batch-not-found", .lookup, .error),
            ("import-not-found", .lookup, .error), ("attachment-not-found", .lookup, .error),
            ("batch-not-found-end", .lookup, .error), ("import-not-found-end", .lookup, .error), ("attachment-not-found-end", .lookup, .error),
            ("batch-generic-error", .lookup, .error), ("attachment-generic-error", .lookup, .error),
            ("import-task-deleted", .lookup, .error), ("import-occ-conflict", .lookup, .error)
        ]
        for compact in [true, false] {
            for scheme in [ColorScheme.light, .dark] {
                let appearance = try #require(NSAppearance(named: scheme == .light ? .aqua : .darkAqua))
                NSApplication.shared.appearance = appearance
                for (name, dialog, phase) in states {
                    let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-discovery-snapshot"))
                    model.profiles = [.init(id: "work", name: "Work", open_task_count: 0, inbox_task_count: 0), .init(id: "personal", name: "Personal", open_task_count: 0, inbox_task_count: 0)]
                    model.signedIn = true
                    model.connection = phase == .offline ? .offline : .live
                    model.discovery.dialog = dialog
                    model.discovery.phase = phase
                    model.discovery.prefix = phase == .invalid ? "invalid!" : dialog == .lookup ? "aaaa" : ""
                    model.discovery.error = phase == .invalid ? "Enter 1 to 36 hexadecimal digits or hyphens." : model.describe(RequestFailure(status: 500, message: "Couldn't read discovery. Try again.", exitCode: 1, exitMeaning: "runtime failure"), at: .discovery)
                    let identity = DiscoveryIdentity(credentialEpoch: 0, generation: 0, dialog: dialog, prefix: model.discovery.prefix)
                    if phase == .error || phase == .requesting || phase == .showing || phase == .empty { model.discovery.requestedIdentity = identity }
                    let projects = [DiscoveryName(id: "63bbdd22-1111-4222-8333-444444444444", name: "ARG")]
                    let profiles = [ProfileDirectoryEntry(id: "work", name: "Work", projects: projects), ProfileDirectoryEntry(id: "personal", name: "Personal", projects: [])]
                    model.discovery.appliedSnapshot = .init(appliedIdentity: identity, profiles: name == "directory-dense" ? (0..<12).map { ProfileDirectoryEntry(id: "profile-\($0)", name: "Profile \($0)", projects: projects) } : profiles, matches: name == "lookup-dense" ? (0..<12).map { TaskLookupMatch(profile: profile, task_id: "aaaaaaaa-1111-4222-8333-4444444444\(String(format: "%02d", $0))", title: "Review report \($0)", project: nil) } : [match])
                    if name == "lookup-copied" || name == "lookup-copy-failed" {
                        model.discovery.copiedID = match.id
                        model.taskIDCopyFeedback = name == "lookup-copied" ? "Copied" : "Couldn't copy. Try again."
                    }
                    let reportScreen = name.hasPrefix("batch-") || name.hasPrefix("attachment-") || name.hasPrefix("import-")
                    let customScreen = name == "show-gone" || name.contains("not-found") || reportScreen
                    let failure = ServerFailure(message: "Run todo list --prefix aa. HTTP: GET /tasks/lookup?prefix=aa.", code: "not_found", exitCode: 3, exitMeaning: "not found or auth missing", details: .init(profile: .init(id: "work", name: "Work"), taskID: match.task_id))
                    let reportIDs = ["ordinary-before", "aa", "bb", "ordinary-after"]
                    let reportTitles = ["Ordinary before", "First missing Task", "Second missing Task", "Ordinary after"]
                    let reportTasks = reportIDs.indices.map { TaskSnapshot(id: reportIDs[$0], profile_id: "work", row_version: 1, title: reportTitles[$0], description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil) }
                    func reportFailure(_ index: Int) -> ServerFailure? {
                        guard index == 1 || index == 2 else { return nil }
                        if name == "import-task-deleted" { return .init(message: "This Task is deleted. Restore it before importing changes.", code: "task_deleted", exitCode: 2, exitMeaning: "validation or usage", details: .init(currentVersion: 2)) }
                        if name == "import-occ-conflict" { return .init(message: "Task changed since preview. Preview again and apply the current Version.", code: "occ_conflict", exitCode: 4, exitMeaning: "Conflict") }
                        if name == "batch-generic-error" { return .init(message: "Conflict. Reload Tasks, preview and apply with the current Version.", code: "occ_conflict", exitCode: 4, exitMeaning: "Conflict", details: .init(currentVersion: 2)) }
                        if name == "attachment-generic-error" { return .init(message: "Task changed. Read its current Version and retry.", code: "occ_conflict", exitCode: 4, exitMeaning: "Conflict", details: .init(currentVersion: 2)) }
                        return .init(message: "Run todo lookup --prefix aa. HTTP: GET /tasks/lookup?prefix=aa.", code: "not_found", exitCode: 3, exitMeaning: "not found or auth missing", details: .init(profile: .init(id: "work", name: "Work"), taskID: reportIDs[index]))
                    }
                    if name.hasPrefix("batch-") {
                        model.batchEdit = BatchEditDraft(profile: "work")
                        model.batchEdit?.targets = reportTasks
                        model.batchEdit?.selected = Set(reportIDs)
                        model.batchEdit?.loading = false
                        model.batchEdit?.report = .init(dry_run: true, items: reportIDs.indices.map { .init(task_id: reportIDs[$0], from_version: 1, current_version: name.hasSuffix("generic-error") ? 2 : 1, outcome: reportFailure($0) == nil ? "updated" : "rejected", error: reportFailure($0)) })
                    }
                    if name.hasPrefix("attachment-") {
                        model.attachmentBatch = .init(profile: "work", reference: .init(id: "reference", location: .link(URL(string: "https://example.com/report")!), added_at: "2026-11-09T00:00:00Z"))
                        model.attachmentBatch?.targets = reportTasks
                        model.attachmentBatch?.selected = Set(reportIDs)
                        model.attachmentBatch?.loading = false
                        model.attachmentBatch?.report = .init(dry_run: true, items: reportIDs.indices.map { .init(task_id: reportIDs[$0], outcome: reportFailure($0) == nil ? "attached" : "rejected", current_version: name.hasSuffix("generic-error") ? 2 : 1, error: reportFailure($0)) })
                    }
                    if name.hasPrefix("import-") {
                        model.loadImport(data: try JSONSerialization.data(withJSONObject: reportIDs.indices.map { ["external_id": reportIDs[$0], "title": reportTitles[$0]] }), name: "Typed UI fixture; live import returns Conflict")
                        model.importReport = .init(generated_at: "2026-11-09T00:00:00Z", dry_run: true, items: reportIDs.indices.map { .init(external_id: reportIDs[$0], outcome: reportFailure($0) == nil ? "updated" : "rejected", task_id: reportIDs[$0], from_version: 1, changed_fields: [], error: reportFailure($0)) }, totals: .init(created: 0, updated: 2, unchanged: 0, rejected: 2))
                    }
                    let frames = DiscoveryFrames()
                    let width: CGFloat = compact ? 393 : 1024
                    let height: CGFloat = compact ? 426 : 720
                    let view = ZStack {
                        if !compact {
                            HStack(spacing: 0) {
                                TaskListView(model: model).sidebar.frame(width: 220)
                                Divider()
                                TaskListView(model: model).taskContent
                            }.frame(width: width, height: height)
                            Color.black.opacity(0.08)
                        }
                        if name.hasPrefix("batch-") {
                            BatchEditView(model: model, compact: compact).background(.background)
                        } else if name.hasPrefix("attachment-") {
                            AttachmentBatchView(model: model).background(.background)
                        } else if name.hasPrefix("import-") {
                            ImportView(model: model, compact: compact).background(.background)
                        } else if customScreen {
                            VStack(alignment: .leading, spacing: 16) {
                                Text(name == "show-gone" ? "All tasks" : name.replacingOccurrences(of: "-not-found", with: "").capitalized).font(.headline)
                                ServerErrorNotice(model: model, failure: failure)
                                Spacer()
                            }.padding(16).frame(width: compact ? 393 : 560, height: compact ? 426 : 600, alignment: .topLeading)
                                .background(.background, in: RoundedRectangle(cornerRadius: compact ? 0 : 12))
                        } else {
                            DiscoveryView(model: model, compact: compact).background(.background, in: RoundedRectangle(cornerRadius: compact ? 0 : 12))
                        }
                    }.frame(width: width, height: height)
                        .onPreferenceChange(CompactLayoutKey.self) { value in MainActor.assumeIsolated { frames.frames = value } }
                        .onPreferenceChange(ReportErrorLayoutFrames.self) { value in MainActor.assumeIsolated { frames.reportFrames = value } }
                        .environment(\.colorScheme, scheme).environment(\.controlActiveState, .key)
                        .tint(TodoColors.color("primary")).background(.background)
                    let controller = NSHostingController(rootView: view)
                    let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
                    window.isReleasedWhenClosed = false
                    window.appearance = appearance
                    window.contentViewController = controller
                    let host = controller.view
                    host.frame = .init(x: 0, y: 0, width: width, height: height)
                    host.layoutSubtreeIfNeeded()
                    try await Task.sleep(for: .milliseconds(120))
                    host.layoutSubtreeIfNeeded()
                    if reportScreen {
                        func scrollViews(_ view: NSView) -> [NSScrollView] { (view as? NSScrollView).map { [$0] } ?? view.subviews.flatMap(scrollViews) }
                        let target = try #require(frames.reportFrames["viewport"])
                        func distance(_ scroll: NSScrollView) -> CGFloat { abs(scroll.bounds.width - target.width) + abs(scroll.bounds.height - target.height) }
                        let scroller = try #require(scrollViews(host).min { distance($0) < distance($1) })
                        let document = try #require(scroller.documentView)
                        for fraction in name.hasSuffix("-end") ? [CGFloat(0), 0.25, 0.5, 0.75, 1] : [CGFloat(0)] {
                            let maximum = max(0, document.frame.height - scroller.contentView.bounds.height)
                            let offset = name.hasSuffix("-end") ? maximum * fraction : min(56, maximum)
                            scroller.contentView.scroll(to: .init(x: 0, y: document.isFlipped ? offset : maximum - offset))
                            scroller.reflectScrolledClipView(scroller.contentView)
                            host.layoutSubtreeIfNeeded()
                            try await Task.sleep(for: .milliseconds(60))
                        }
                        if name.hasSuffix("-end") {
                            let last = try #require(frames.reportFrames["row-ordinary-after"])
                            let viewport = try #require(frames.reportFrames["viewport"])
                            #expect(last.minY >= viewport.minY - 0.5 && last.maxY <= viewport.maxY + 0.5)
                        }
                    }
                    let file = "discovery-\(compact ? "compact" : "full")-\(name)-\(scheme == .light ? "light" : "dark").png"
                    for key in customScreen ? [] : dialog == .lookup ? ["discovery-close", "discovery-find", "discovery-prefix"] : ["discovery-close"] {
                        let frame = try #require(frames.frames[key])
                        #expect(frame.minX >= 0 && frame.maxX <= width && frame.minY >= 0 && frame.maxY <= height, "\(file) \(key) \(frame)")
                    }
                    geometry[file] = frames.frames.merging(frames.reportFrames, uniquingKeysWith: { _, next in next }).mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }
                    let bitmap = try await settledSnapshotBitmap(host, name: file)
                    try #require(bitmap.representation(using: .png, properties: [:])).write(to: directory.appendingPathComponent(file))
                    files.append(file)
                    window.close()
                }
            }
        }
        #expect(files.count == 116)
        try JSONSerialization.data(withJSONObject: geometry, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("discovery-layout.json"))
        return files
    }
}
