import AppKit
import SwiftUI
import Testing
import WebKit
@testable import TodoState

@MainActor private final class DependencyGraphFrames { var frames: [String: CGRect] = [:]; var rows: [DependencyGraphRowID] = [] }

@MainActor struct DependencyGraphSnapshots {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DAG_CHECKPOINT2"] == "1"))
    func checkpoint2() async throws {
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"]))
        try await DependencyWebSnapshots.prove(directory: directory)
        let corrected = try await DependencySnapshots.render(directory: directory, compactOnly: true)
        let graph = try await Self.render(directory: directory)
        #expect(corrected.count == 24)
        #expect(graph.count == 8)
        try JSONSerialization.data(withJSONObject: ["files": corrected + graph], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("manifest.json"))
    }
    static func fixture(failing: Bool = false) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-graph-snapshot"))
        model.signedIn = true
        model.connection = .live
        let blocker = DependencySnapshots.task("blocker", title: "Review the launch copy", ready: true)
        let root = DependencySnapshots.task("root", title: "Ship the release", blockers: [blocker.id], blocked: true)
        model.tasks = [blocker, root]
        model.projects = [.init(id: "project", name: "Launch", open_task_count: 2, inbox_task_count: 2)]
        let report = DependencyGraphReport(profile_id: "work", task_id: root.id, nodes: [
            .init(mermaid_id: "n0", task: blocker, in_degree: 0, out_degree: 1, ready: true, blocked: false, depth: 0, remaining_energy: .init(energy: 2, unweighted: 0)),
            .init(mermaid_id: "n1", task: root, in_degree: 1, out_degree: 0, ready: false, blocked: true, depth: 1, remaining_energy: .init(energy: 4, unweighted: 0))
        ], edges: [.init(profile_id: "work", dependent_id: root.id, blocker_id: blocker.id)], ancestors: [blocker.id], descendants: [], lightest_next: [blocker.id], sources: [blocker.id], sinks: [root.id], topological_order: [blocker.id, root.id], shape: "chain", orientation: nil, mermaid: failing ? "flowchart TD\nn0[\"unterminated" : "flowchart TD\nn0[\"Review the launch copy\"] --> n1[\"Ship the release\"]")
        model.dependencies.graph = .init(profile: "work", root: root.id, request: 1, selected: root.id, focused: root.id)
        model.dependencies.graph?.publish(report)
        return model
    }
    static func webViews(_ view: NSView) -> [WKWebView] { (view as? WKWebView).map { [$0] } ?? view.subviews.flatMap(webViews) }
    static func image(host: NSView) async throws -> Data {
        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        guard !webViews(host).isEmpty else { return try #require(bitmap.representation(using: .png, properties: [:])) }
        let original = try #require(bitmap.cgImage)
        let context = try #require(CGContext(data: nil, width: original.width, height: original.height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(original, in: .init(x: 0, y: 0, width: original.width, height: original.height))
        let scale = CGFloat(original.width) / host.bounds.width
        for web in webViews(host) {
            let image = try await web.takeSnapshot(configuration: nil)
            let cg = try #require(image.cgImage(forProposedRect: nil, context: nil, hints: nil))
            let frame = web.convert(web.bounds, to: host)
            let y = host.isFlipped ? host.bounds.height - frame.maxY : frame.minY
            context.draw(cg, in: .init(x: frame.minX * scale, y: y * scale, width: frame.width * scale, height: frame.height * scale))
        }
        let combined = try #require(context.makeImage())
        return try #require(NSBitmapImageRep(cgImage: combined).representation(using: .png, properties: [:]))
    }
    static func render(directory: URL, matrix: Bool = false) async throws -> [String] {
        NSApplication.shared.setActivationPolicy(.prohibited)
        var files: [String] = []
        var receipts: [[String: Any]] = []
        for scheme in [ColorScheme.light, .dark] {
            let appearance = try #require(NSAppearance(named: scheme == .light ? .aqua : .darkAqua))
            NSApplication.shared.appearance = appearance
            let cases = [("list-first", true, false, false), ("diagram", true, true, false), ("full-diagram", false, true, false), ("pele-failure", true, true, true)] + (matrix ? [("full-pele-failure", false, true, true)] + [true, false].flatMap { compact in DependencyGraphFixtures.names.map { ("\(compact ? "compact" : "full")-\($0)", compact, !compact, false) } } : [])
            for (name, compact, diagram, failing) in cases {
                let scenario = DependencyGraphFixtures.names.first { name == "compact-\($0)" || name == "full-\($0)" }
                let model = scenario.map(DependencyGraphFixtures.model) ?? fixture(failing: failing)
                let frames = DependencyGraphFrames()
                let width: CGFloat = compact ? 393 : 1024
                let height: CGFloat = compact ? 426 : 720
                let view = Group {
                    if model.dependencies.graph == nil { TaskListView(model: model, compactMode: compact).taskContent }
                    else { DependencyGraphView(model: model, compact: compact, initialDiagram: diagram, initialDetails: scenario == "details") }
                }.onPreferenceChange(CompactLayoutKey.self) { value in MainActor.assumeIsolated { frames.frames = value } }
                    .onPreferenceChange(DependencyGraphRowIdentities.self) { value in MainActor.assumeIsolated { frames.rows = value } }
                    .frame(width: width, height: height).background(.background).environment(\.colorScheme, scheme).environment(\.controlActiveState, .key).tint(TodoColors.color("primary"))
                let controller = NSHostingController(rootView: view)
                let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
                window.isReleasedWhenClosed = false
                window.appearance = appearance
                window.contentViewController = controller
                let host = controller.view
                host.frame = .init(x: 0, y: 0, width: width, height: height)
                host.layoutSubtreeIfNeeded()
                for _ in 0..<600 {
                    if !diagram || model.dependencies.graph?.report == nil || model.dependencies.graph?.renderedNodeCount != nil || model.dependencies.graph?.renderError != nil { break }
                    try await Task.sleep(for: .milliseconds(10))
                }
                if diagram && !failing && model.dependencies.graph?.report != nil { #expect(model.dependencies.graph?.renderedNodeCount == model.dependencies.graph?.visibleIDs.count); #expect(model.dependencies.graph?.renderError == nil) }
                if failing { #expect(model.dependencies.graph?.renderError == "Couldn't draw Dependencies. Use the Task list or Retry.") }
                try await Task.sleep(for: .milliseconds(120))
                host.layoutSubtreeIfNeeded()
                var edgeStroke: String? = nil
                var expectedStroke: String? = nil
                let suppliedMuted = DependencyWebView.themeTokens(appearance: appearance)["muted-text"]
                if diagram && !failing && model.dependencies.graph?.report?.edges.isEmpty == false {
                    let web = try #require(webViews(host).first)
                    let supplied = try #require(suppliedMuted)
                    let colors = try await web.callAsyncJavaScript("const path = document.querySelector('.pele-edge path'); const span = document.createElement('span'); span.style.color = supplied; document.body.append(span); const result = {actual:getComputedStyle(path).stroke,expected:getComputedStyle(span).color}; span.remove(); return result;", arguments: ["supplied": supplied], in: nil, contentWorld: .page) as? [String: String]
                    edgeStroke = colors?["actual"]
                    expectedStroke = colors?["expected"]
                    #expect(edgeStroke == expectedStroke)
                    #expect(edgeStroke != nil)
                }
                let file = "dag-graph-\(name)-\(scheme == .light ? "light" : "dark").png"
                #expect(Set(frames.rows.map(\.taskIdentifier)).count == frames.rows.count, "\(file) unique simultaneous Task controls")
                #expect(Set(frames.rows.map(\.menuIdentifier)).count == frames.rows.count, "\(file) unique simultaneous action menus")
                if scenario == "details" {
                    let repeated = frames.rows.filter { $0.task == "g0" }
                    #expect(Set(repeated.map { $0.section.rawValue }) == ["lightest-next", "starts-at", "ancestors", "shown"])
                    #expect(repeated.allSatisfy { $0.task == "g0" })
                    try JSONSerialization.data(withJSONObject: ["task_id": "g0", "sections": repeated.map { $0.section.rawValue }, "task_identifiers": repeated.map(\.taskIdentifier), "menu_identifiers": repeated.map(\.menuIdentifier), "expand_identifiers": repeated.map(\.expandIdentifier), "native_key_dispatch": "held", "source": "production SwiftUI row identity preferences"], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("\(file).selectors.json"))
                }
                if model.dependencies.graph != nil {
                    let actions = try #require(frames.frames["dependency-graph-actions"])
                    #expect(actions.minX >= 0 && actions.maxX <= width && actions.minY >= 0 && actions.maxY <= height, "\(file) fixed footer \(actions)")
                    if compact && model.dependencies.graph?.report != nil {
                        let toggle = try #require(frames.frames["dependency-graph-view-toggle"])
                        #expect(toggle.minX >= 0 && toggle.maxX <= width && toggle.minY >= 0 && toggle.maxY <= height, "\(file) view toggle \(toggle)")
                        let scroll = try #require(frames.frames["dependency-graph-scroll"])
                        #expect(scroll.maxY <= actions.minY + 0.5, "\(file) list does not overlap the footer")
                    }
                    if diagram && !failing && model.dependencies.graph?.report != nil {
                        let tools = try #require(frames.frames["dependency-graph-tools"])
                        let frame = try #require(frames.frames["dependency-graph-frame"])
                        #expect(frame.insetBy(dx: -0.5, dy: -0.5).contains(tools), "\(file) tools inside diagram \(tools) in \(frame)")
                        #expect(tools.minX >= 0 && tools.maxX <= width && tools.minY >= 0 && tools.maxY <= height, "\(file) tools inside viewport")
                    } else { #expect(frames.frames["dependency-graph-tools"] == nil, "\(file) has no diagram tools") }
                }
                try await image(host: host).write(to: directory.appendingPathComponent(file))
                files.append(file)
                receipts.append(["client": "macos", "layout": compact ? "compact" : "full", "appearance": scheme == .light ? "light" : "dark", "state": name, "png": file, "rendered_nodes": model.dependencies.graph?.renderedNodeCount as Any? ?? NSNull(), "render_error": model.dependencies.graph?.renderError as Any? ?? NSNull(), "geometry": frames.frames.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }, "adapter": "canonical Pele 1.13.0", "supplied_muted_text": suppliedMuted as Any? ?? NSNull(), "computed_edge_stroke": edgeStroke as Any? ?? NSNull(), "expected_edge_stroke": expectedStroke as Any? ?? NSNull(), "identifiers": ["dependency-graph", "dependency-graph-list", "dependency-graph-details", "dependency-graph-diagram", "dependency-graph-close", "dependency-graph-task-<id>", "dependency-graph-related-<section>-<id>"], "behavior_status": "pending", "behavior_receipt": NSNull()])
                window.close()
            }
        }
        try JSONSerialization.data(withJSONObject: receipts, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("dag-graph-capture-manifest.json"))
        return files
    }
}
