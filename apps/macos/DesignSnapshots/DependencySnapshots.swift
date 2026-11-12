import AppKit
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

@MainActor private final class DependencyFrameRecorder {
    var frames: [String: CGRect] = [:]
    var chips: [String: CGRect] = [:]
}

@MainActor struct DependencySnapshots {
    static let checkpointStates = ["rows", "filter-ready", "filter-blocked", "order", "picker-depends", "picker-blocks", "picker-pending", "picker-refusal", "delete-empty", "delete-both", "delete-changed", "delete-long-end"]
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DAG_CHECKPOINT1"] == "1"))
    func checkpoint1() async throws {
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"]))
        let files = try await Self.render(directory: directory, compactOnly: true)
        #expect(files.count == 24)
        try JSONSerialization.data(withJSONObject: ["files": files], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("manifest.json"))
    }
    static func task(_ id: String, title: String, status: String = "open", blockers: [String] = [], ready: Bool = false, blocked: Bool = false, energy: Int? = 2) -> TaskSnapshot {
        TaskSnapshot(id: id, profile_id: "work", row_version: 3, depends_on: blockers, ready: ready, blocked: blocked, title: title, description: nil, priority: "P2", source: "manual", status: status, project_id: "project", tags: ["review"], due_at: nil, scheduled_at: nil, energy: energy, estimate_min: 30, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }
    static func render(directory: URL, compactOnly: Bool = false) async throws -> [String] {
        NSApplication.shared.setActivationPolicy(.prohibited)
        var files: [String] = []
        var geometry: [String: [String: [Double]]] = [:]
        var quickAddActions: [String: CGRect] = [:]
        var manifest: [[String: Any]] = []
        for compact in compactOnly ? [true] : [true, false] {
            for scheme in [ColorScheme.light, .dark] {
                let appearance = try #require(NSAppearance(named: scheme == .light ? .aqua : .darkAqua))
                NSApplication.shared.appearance = appearance
                for name in checkpointStates + (compactOnly ? [] : DependencyFixtureCases.names) {
                    let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-dependency-snapshot"))
                    model.signedIn = true
                    model.connection = .live
                    model.selectedView = "all"
                    model.projects = [.init(id: "project", name: "Launch", open_task_count: 4, inbox_task_count: 4)]
                    model.tags = [.init(id: "review", name: "review", open_task_count: 4, inbox_task_count: 4)]
                    let resolved = task("resolved", title: "Scope agreed", status: "done")
                    let cancelled = task("cancelled", title: "Old experiment", status: "cancelled")
                    let root = task("root", title: "Ship the release with the final reviewed changes", blockers: ["open", "snoozed", "cancelled"], blocked: true)
                    let open = task("open", title: "Review the final copy")
                    let snoozed = task("snoozed", title: "Check launch notes", status: "snoozed")
                    let ready = task("ready", title: "Send the update", blockers: ["resolved", "cancelled"], ready: true)
                    let noBadge = task("plain", title: "Write tomorrow's plan", ready: true)
                    model.tasks = [root, ready, noBadge, resolved, cancelled, open, snoozed]
                    let linked = name == "picker-blocks" ? [ready] : [cancelled, open]
                    if name.hasPrefix("picker") {
                        model.dependencies.picker = .init(profile: "work", root: root, direction: name == "picker-blocks" ? .blocks : .dependsOn, linked: linked, candidates: [snoozed, noBadge])
                        if name == "picker-pending" { model.dependencies.picker?.pending = ["open"] }
                        if name == "picker-refusal" { model.dependencies.picker?.failure = .init(message: "This Dependency would create a loop.", attemptTitle: "Check launch notes", detail: "error 2 - validation or usage", path: ["root", "open", "root"], recovery: "Choose another Task") }
                    }
                    if name.hasPrefix("delete") {
                        var edges: [DependencyEdge] = name == "delete-empty" ? [] : [.init(profile_id: "work", dependent_id: root.id, blocker_id: cancelled.id), .init(profile_id: "work", dependent_id: ready.id, blocker_id: root.id)]
                        var endpoints = [cancelled, ready]
                        if name == "delete-long-end" {
                            endpoints = (0..<30).map { task("long-\($0)", title: "Review Dependency \($0) with a longer title") }
                            edges = endpoints.map { .init(profile_id: "work", dependent_id: $0.id, blocker_id: root.id) }
                        }
                        model.dependencies.deletion = .init(profile: "work", task: root, edges: edges, endpoints: endpoints, fingerprint: "server-preview-fixture", acceptedFromVersion: root.row_version, loading: false, changed: name == "delete-changed")
                    }
                    if name == "filter-ready" { model.taskFilters.ready = true }
                    if name == "filter-blocked" { model.taskFilters.blocked = true }
                    if name == "order" { model.taskFilters.order = "topo" }
                    try DependencyFixtureCases.configure(name, model: model, root: root, blocker: open, cancelled: cancelled)
                    let width: CGFloat = compact ? 393 : 1024
                    let height: CGFloat = compact ? 426 : 720
                    let capture = DependencyFrameRecorder()
                    let view = Group {
                        if name == "series-initial" { SeriesView(model: model, compact: compact) }
                        else if let content = DependencyFixtureCases.content(name, model: model, compact: compact) { content }
                        else if name.hasPrefix("picker") { DependencyPickerView(model: model, compact: compact) }
                        else if name.hasPrefix("delete") { DependencyDeleteView(model: model, compact: compact) }
                        else if name == "filter-empty" { TaskListView(model: model, compactMode: compact).taskContent }
                        else if name.hasPrefix("filter") { TaskFilterView(draft: model.taskFilters, compact: compact, apply: { _ in }, close: {}) }
                        else if name.hasPrefix("rows") {
                            VStack(alignment: .leading, spacing: 0) {
                                Text("All tasks").font(.headline).padding(.bottom, 8)
                                ForEach(name == "rows" ? [root, ready, noBadge, resolved, cancelled] : model.tasks) { task in
                                    TaskRow(task: task, canWrite: false, compact: compact, projectName: "Launch", tagNames: ["review"], dependencyBadge: task.dependencyBadge(catalog: model.tasks), complete: {})
                                }
                                Spacer(minLength: 0)
                            }.padding(16)
                        } else { TaskListView(model: model, compactMode: compact).taskContent }
                    }.frame(width: width, height: height)
                        .onPreferenceChange(CompactLayoutKey.self) { value in MainActor.assumeIsolated { capture.frames = value } }
                        .onPreferenceChange(QuickAddChipFrames.self) { value in MainActor.assumeIsolated { capture.chips = value } }
                        .background(.background).environment(\.colorScheme, scheme).environment(\.controlActiveState, .key).tint(TodoColors.color("primary"))
                    let controller: NSViewController
                    if name == "series-initial" {
                        controller = NSHostingController(rootView: SeriesView(model: model, compact: compact).frame(width: width, height: height).background(.background).environment(\.colorScheme, scheme).tint(TodoColors.color("primary")).onPreferenceChange(CompactLayoutKey.self) { value in MainActor.assumeIsolated { capture.frames = value } })
                    } else { controller = NSHostingController(rootView: view) }
                    let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
                    window.isReleasedWhenClosed = false
                    window.appearance = appearance
                    window.contentViewController = controller
                    let host = controller.view
                    host.frame = .init(x: 0, y: 0, width: width, height: height)
                    host.layoutSubtreeIfNeeded()
                    try await Task.sleep(for: .milliseconds(150))
                    host.layoutSubtreeIfNeeded()
                    if name.hasSuffix("long-end") || name == "batch-select-long" || name.hasPrefix("error") || name.hasPrefix("history") {
                        func scrolls(_ view: NSView) -> [NSScrollView] { (view as? NSScrollView).map { [$0] } ?? view.subviews.flatMap(scrolls) }
                        if let scroll = scrolls(host).max(by: { ($0.documentView?.frame.height ?? 0) < ($1.documentView?.frame.height ?? 0) }), let document = scroll.documentView {
                            let bottom = max(0, document.frame.height - scroll.contentView.bounds.height)
                            scroll.contentView.scroll(to: .init(x: 0, y: document.isFlipped ? bottom : 0))
                            scroll.reflectScrolledClipView(scroll.contentView)
                            host.layoutSubtreeIfNeeded()
                            try await Task.sleep(for: .milliseconds(60))
                        }
                    }
                    let file = "dag-\(compact ? "compact" : "full")-\(name)-\(scheme == .light ? "light" : "dark").png"
                    if name.hasPrefix("picker") || name.hasPrefix("delete") || name.hasPrefix("batch") && name != "batch-cancelled" {
                        let actions = try #require(capture.frames["dependency-actions"])
                        #expect(actions.minY >= 0 && actions.maxY <= height && actions.minX >= 0 && actions.maxX <= width, "\(file) fixed actions \(actions)")
                    }
                    if name == "delete-empty" {
                        let sheet = try #require(capture.frames["dependency-delete-sheet"])
                        #expect(sheet.height < 220, "Empty Delete confirmation grows only to its content")
                    }
                    if name == "delete-long-end" {
                        let last = try #require(capture.frames["row-long-29"])
                        let body = try #require(capture.frames["dependency-body"])
                        #expect(last.minY >= body.minY - 0.5 && last.maxY <= body.maxY + 0.5, "\(file) last row \(last) in \(body)")
                    }
                    if name == "picker-long-end" || name == "batch-select-long" {
                        let last = try #require(capture.frames[name == "picker-long-end" ? "row-long-29" : "row-batch-29"])
                        let body = try #require(capture.frames["dependency-body"])
                        #expect(last.minY >= body.minY - 0.5 && last.maxY <= body.maxY + 0.5, "\(file) longest list last row \(last) in \(body)")
                    }
                    let bitmap = try await settledSnapshotBitmap(host, name: file)
                    if name.hasPrefix("drag") {
                        let during = capture.frames.filter { $0.key.hasPrefix("row-") }
                        model.dependencies.dropTarget = nil
                        host.layoutSubtreeIfNeeded()
                        try await Task.sleep(for: .milliseconds(80))
                        let before = capture.frames.filter { $0.key.hasPrefix("row-") }
                        #expect(during == before, "\(file) every drop target stays fixed during hover")
                        model.dependencies.dropTarget = root.id
                        host.layoutSubtreeIfNeeded()
                        try await Task.sleep(for: .milliseconds(80))
                        let row = try #require(capture.frames["row-root"])
                        let status = try #require(capture.frames["dependency-drop-status"])
                        #expect(row.contains(status), "\(file) drag status belongs to target metadata")
                    }
                    if ["initial", "initial-many", "initial-many-invalid", "initial-invalid", "follow-up"].contains(name) {
                        let viewport = try #require(capture.frames["quick-add-metadata"])
                        let chips = capture.frames.filter { $0.key.hasPrefix("dependency-initial-") }.map(\.value)
                        let rows = Array(Set(chips.map(\.minY))).sorted()
                        let shown = chips.filter { rows.prefix(2).contains($0.minY) }
                        #expect(!shown.isEmpty)
                        let expected = name == "initial-many-invalid" ? chips.filter { $0.minY == rows.first } : shown
                        #expect(expected.allSatisfy { viewport.insetBy(dx: -0.5, dy: -0.5).contains($0) }, "\(file) first two whole chip rows are visible")
                    }
                    if name == "picker-long-cycle" {
                        let loop = try #require(capture.frames["dependency-loop"])
                        #expect(loop.height == 56, "Three whole caption lines then scroll")
                        for index in 0..<3 { #expect(loop.insetBy(dx: -0.5, dy: -0.5).contains(try #require(capture.frames["dependency-loop-line-\(index)"]))) }
                        let viewport = try #require(capture.frames["dependency-body"])
                        let rows = try #require(model.dependencies.picker?.rows.prefix(2))
                        for task in rows {
                            let row = try #require(capture.frames["dependency-choice-\(task.id)"])
                            #expect(viewport.insetBy(dx: -0.5, dy: -0.5).contains(row), "\(file) at least two complete candidates remain visible")
                        }
                    }
                    if name == "initial-many-invalid" {
                        let sheet = try #require(capture.frames["quick-add-sheet"])
                        #expect(sheet.minY >= 0 && sheet.maxY <= height && sheet.minX >= 0 && sheet.maxX <= width)
                        let viewport = try #require(capture.frames["quick-add-metadata"])
                        let chips = capture.frames.filter { $0.key.hasPrefix("dependency-initial-") }.map(\.value)
                        #expect(chips.filter { $0.intersects(viewport) }.allSatisfy { viewport.insetBy(dx: -0.5, dy: -0.5).contains($0) }, "No partial chip rows at rest with validation")
                    }
                    if name == "series-initial" {
                        let actions = try #require(capture.frames["series-actions"])
                        let scroll = try #require(capture.frames["series-scroll"])
                        #expect(actions.minY >= 0 && actions.maxY <= height && actions.minX >= 0 && actions.maxX <= width)
                        #expect(scroll.maxY <= actions.minY, "Series Dependencies stay inside the scrolling form")
                    }
                    if ["initial", "initial-none", "initial-many"].contains(name) {
                        let actions = try #require(capture.frames["quick-add-actions"])
                        let metadata = try #require(capture.frames["quick-add-metadata"])
                        let key = "\(compact)-\(scheme)"
                        if let before = quickAddActions[key] { #expect(actions == before, "Chosen Dependencies cannot move the actions") }
                        else { quickAddActions[key] = actions }
                        #expect(abs(actions.minY - metadata.maxY - 16) < 0.5, "Main metadata-to-actions spacing stays16")
                        #expect(actions.minX >= 0 && actions.maxX <= width && actions.minY >= 0 && actions.maxY <= height)
                        if compact {
                            let add = try #require(capture.frames["quick-add-add"])
                            #expect(add == CGRect(x: 299.5, y: 295.5, width: 77.5, height: 36), "Main4c/cabf same-text five-chip fixture Add frame in viewport coordinates")
                        }
                        if name == "initial-many" {
                            let chips = capture.frames.filter { $0.key.hasPrefix("dependency-initial-") }.map(\.value)
                            #expect(chips.count == 13)
                            #expect(Set(chips.map(\.minY)).count > 1, "Chosen Dependency chips wrap inside metadata")
                            #expect(chips.allSatisfy { $0.minX >= metadata.minX - 0.5 && $0.maxX <= metadata.maxX + 0.5 })
                        }
                    }
                    if name == "filter-empty" || name == "series-initial" || name == "batch-conflict" || name.hasPrefix("picker") && model.dependencies.picker?.failure != nil {
                        let text = try SnapshotText.read(bitmap)
                        if name == "filter-empty" {
                            #expect(text.contains(compact ? "No matching tasks." : "No matching tasks"))
                            #expect(text.contains("Clear filters"))
                            #expect(!text.contains("Filter tasks"))
                        } else if name == "series-initial" {
                            #expect(text.contains("Create Series"))
                            #expect(text.contains("First Occurrence Dependencies"))
                            #expect(text.contains("Depends on"))
                            #expect(model.dependencies.firstOccurrenceInitial.map(\.id) == ["cancelled", "open"])
                        } else if name == "batch-conflict" {
                            #expect(text.joined(separator: " ").contains("This Task changed. Reload its Dependencies before trying again."))
                            #expect(text.joined(separator: " ").contains("error4") || text.joined(separator: " ").contains("error 4"))
                            #expect(!text.joined(separator: " ").contains("Agent copy"))
                        } else {
                            let picker = try #require(model.dependencies.picker)
                            let title = try #require(picker.failure?.attemptTitle)
                            let candidate = try #require(picker.rows.first { $0.title == title })
                            #expect(!picker.checked(candidate.id))
                            #expect(text.joined(separator: " ").contains("Can't add \(candidate.title)."))
                        }
                        try JSONEncoder().encode(text).write(to: directory.appendingPathComponent(file + ".text.json"))
                    }
                    try #require(bitmap.representation(using: .png, properties: [:])).write(to: directory.appendingPathComponent(file))
                    geometry[file] = capture.frames.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }
                    manifest.append(["client": "macos", "layout": compact ? "compact" : "full", "appearance": scheme == .light ? "light" : "dark", "state": name, "png": file, "identifiers": DependencyFixtureCases.identifiers(name, model: model), "behavior_receipt": NSNull(), "behavior_status": "pending"])
                    files.append(file)
                    window.close()
                }
            }
        }
        try JSONSerialization.data(withJSONObject: geometry, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("dag-layout.json"))
        try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("dag-capture-manifest.json"))
        return files
    }
}
