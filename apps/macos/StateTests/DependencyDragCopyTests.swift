import AppKit
import Foundation
import SwiftUI
import Testing
import Vision
@testable import TodoState

@MainActor private final class DragCopyFrames { var values: [String: CGRect] = [:] }

@MainActor struct DependencyDragCopyTests {
    @Test func dragRowsUseSourceOnlyCopyAndKeepTheFullAccessibleSentence() async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-drag-copy"))
        func task(_ id: String, _ title: String, status: String = "done") -> TaskSnapshot {
            TaskSnapshot(id: id, profile_id: "work", row_version: 1, title: title, description: nil, priority: "P3", source: "manual", status: status, project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
        }
        let source = task("source", "Source Task")
        let directory = ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"].map { URL(fileURLWithPath: $0).deletingLastPathComponent() }
        for linked in [false, true] {
            let status = linked ? "done" : "open"
            let rows = [task("first", "First Task", status: status), task("second", "Second Task", status: status), task("last", "Last Task", status: status)]
            for var target in rows {
                target.depends_on = linked ? [source.id] : []
                model.tasks = [source, task("control", "Metadata control")] + rows.map { $0.id == target.id ? target : $0 }
                let status = model.dependencyDropStatus(source: .init(profile: "work", task: source.id), target: target)
                #expect(status.text == (linked ? "Already depends on Source Task" : "Will depend on Source Task"))
                #expect(status.accessibilityValue == (linked ? "\(target.title) already depends on Source Task" : "\(target.title) will depend on Source Task"))
                if let directory {
                    for compact in [true, false] {
                        for dark in [false, true] {
                            try await renderDragRows(model, source: source, target: target, status: status, directory: directory, compact: compact, dark: dark, linked: linked)
                        }
                    }
                }
            }
        }
    }
    private func renderDragRows(_ model: TodoModel, source: TaskSnapshot, target: TaskSnapshot, status: DependencyDropStatus, directory: URL, compact: Bool, dark: Bool, linked: Bool) async throws {
        model.dependencies.dropTarget = nil; model.dependencies.dropStatus = nil
        let width: CGFloat = compact ? 393 : 560, height: CGFloat = compact ? 426 : 600
        let capture = DragCopyFrames()
        let appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        let previous = NSApplication.shared.appearance
        NSApplication.shared.appearance = appearance
        defer { NSApplication.shared.appearance = previous }
        let view = VStack(alignment: .leading, spacing: 0) {
            ForEach(model.tasks.filter { $0.id != source.id }) { task in
                TaskRow(task: task, canWrite: true, compact: compact, projectName: task.id == "control" ? "Control Project" : nil, tagNames: [], dependencyBadge: task.dependencyBadge(catalog: model.tasks), metadataOverride: model.dependencies.dropTarget == task.id ? model.dependencies.dropStatus : nil, complete: {})
            }
        }.padding(16).frame(width: width, height: height, alignment: .topLeading).background(.background).environment(\.colorScheme, dark ? .dark : .light)
            .onPreferenceChange(CompactLayoutKey.self) { frames in MainActor.assumeIsolated { capture.values = frames } }
        let host = NSHostingView(rootView: view)
        let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.appearance = appearance; window.contentView = host
        defer { window.contentView = nil; window.close() }
        host.frame = .init(x: 0, y: 0, width: width, height: height)
        host.layoutSubtreeIfNeeded()
        for _ in 0..<200 {
            if capture.values.keys.filter({ $0.hasPrefix("row-") }).count == 4 { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        let before = capture.values.filter { $0.key.hasPrefix("row-") }
        try #require(before.count == 4)
        model.dependencies.dropStatus = status; model.dependencies.dropTarget = target.id
        host.layoutSubtreeIfNeeded()
        for _ in 0..<200 {
            if capture.values["dependency-drop-status"] != nil { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        let stem = "drag-copy-\(linked ? "already" : "allowed")-\(target.id)-\(compact ? "compact" : "full")-\(dark ? "dark" : "light")"
        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        let png = try #require(bitmap.representation(using: .png, properties: [:]))
        try png.write(to: directory.appendingPathComponent(stem + ".png"))
        let textRequest = VNRecognizeTextRequest(); textRequest.recognitionLevel = .accurate; textRequest.recognitionLanguages = ["en-US"]
        try VNImageRequestHandler(data: png, options: [:]).perform([textRequest])
        let visible = (textRequest.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
        let after = capture.values.filter { $0.key.hasPrefix("row-") }
        let statusFrame = try #require(capture.values["dependency-drop-status"])
        let targetTitle = try #require(capture.values["title-" + target.id])
        let textFrames = capture.values.filter { $0.key.hasPrefix("title-") || $0.key.hasPrefix("metadata-text-") }
        let metadataTextIDs = capture.values.keys.filter { $0.hasPrefix("metadata-text-") }.sorted()
        let collisions = textFrames.filter { $0.value.width > 0 && $0.value.height > 0 && $0.value.intersects(statusFrame) }.map(\.key)
        func frames(_ values: [String: CGRect]) -> [String: [Double]] { values.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] } }
        let fact: [String: Any] = ["text": status.text, "accessibility_value": status.accessibilityValue, "visible_text": visible, "before": frames(before), "during": frames(after), "text_frames": frames(textFrames), "metadata_containers": frames(capture.values.filter { $0.key.hasPrefix("metadata-") && !$0.key.hasPrefix("metadata-text-") }), "status": frames(["status": statusFrame]), "collisions": collisions, "viewport": [Double(width), Double(height)]]
        try JSONSerialization.data(withJSONObject: fact, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent(stem + ".json"))
        try #require(before == after)
        try #require(metadataTextIDs == ["metadata-text-control"])
        try #require(CGRect(x: 0, y: 0, width: width, height: height).contains(statusFrame))
        try #require(try #require(after["row-" + target.id]).contains(statusFrame))
        try #require(abs(statusFrame.minX - targetTitle.minX) < 0.5)
        try #require(collisions.isEmpty)
        try #require(visible.contains(status.text))
        #expect(!window.isVisible)
    }
}
