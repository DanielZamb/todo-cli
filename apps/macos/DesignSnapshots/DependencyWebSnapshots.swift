import AppKit
import SwiftUI
import Testing
import WebKit
@testable import TodoState

@MainActor private final class GraphReplyRecorder { var replies: [DependencyGraphReply] = [] }

@MainActor enum DependencyWebSnapshots {
    static func prove(directory: URL) async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let model = DependencyGraphSnapshots.fixture()
        let base = try #require(model.dependencies.graph?.report)
        let extra = [("done", "Archive the draft", "done"), ("cancelled", "Retired experiment", "cancelled"), ("blocked", "Check the schedule", "open")].enumerated().map { index, item in
            DependencyGraphReport.Node(mermaid_id: "n\(index + 2)", task: DependencySnapshots.task(item.0, title: item.1, status: item.2), in_degree: 1, out_degree: 0, ready: false, blocked: item.0 == "blocked", depth: 1, remaining_energy: .init(energy: 0, unweighted: 0))
        }
        model.dependencies.graph?.publish(.init(profile_id: base.profile_id, task_id: base.task_id, nodes: base.nodes + extra, edges: base.edges, ancestors: base.ancestors, descendants: base.descendants, lightest_next: base.lightest_next, sources: base.sources, sinks: base.sinks, topological_order: base.topological_order + extra.map { $0.task.id }, shape: base.shape, orientation: base.orientation, mermaid: base.mermaid + "\nn0 --> n2[\"Archive the draft\"]\nn0 --> n3[\"Retired experiment\"]\nn0 --> n4[\"Check the schedule\"]"))
        model.dependencies.graph?.overview = true
        model.dependencies.graph?.selected = "blocker"
        model.beginEditing(DependencySnapshots.task("dirty", title: "Unrelated Task"))
        model.editor?.title = "Keep this draft"
        let recorder = GraphReplyRecorder()
        let view = DependencyWebView(model: model, onReply: { recorder.replies.append($0) }).frame(width: 600, height: 360)
        let controller = NSHostingController(rootView: view)
        let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: 600, height: 360), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = controller
        let host = controller.view
        host.frame = .init(x: 0, y: 0, width: 600, height: 360)
        host.layoutSubtreeIfNeeded()
        defer { window.close() }
        for _ in 0..<600 {
            if model.dependencies.graph?.renderedNodeCount == 5 || model.dependencies.graph?.renderError != nil { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(model.dependencies.graph?.renderedNodeCount == 5)
        #expect(model.dependencies.graph?.renderError == nil)
        let web = try #require(DependencyGraphSnapshots.webViews(host).first)
        let originalURL = try #require(web.url)
        #expect(originalURL.isFileURL)
        #expect(originalURL.lastPathComponent == "index.html")
        func javascript(_ source: String, arguments: [String: Any] = [:]) async throws -> Any? {
            try await web.callAsyncJavaScript(source, arguments: arguments, in: nil, contentWorld: .page)
        }
        try await Task.sleep(for: .milliseconds(150))
        let fitted = try #require(model.dependencies.graph?.viewport)
        #expect(fitted.scale > 0 && fitted.scale <= 1)
        func viewportReplies() -> Int { recorder.replies.filter { if case .viewport = $0.event { true } else { false } }.count }
        #expect(viewportReplies() == 1)
        let geometry = try await javascript("const frame=document.getElementById('graph').getBoundingClientRect();const boxes=[...document.querySelectorAll('.pele-node:not(.graph-hidden),.pele-edge:not(.graph-hidden)')].map(n=>n.getBoundingClientRect());const left=Math.min(...boxes.map(b=>b.left)),right=Math.max(...boxes.map(b=>b.right)),top=Math.min(...boxes.map(b=>b.top)),bottom=Math.max(...boxes.map(b=>b.bottom));return {dx:Math.abs((left+right-frame.left-frame.right)/2),dy:Math.abs((top+bottom-frame.top-frame.bottom)/2),inside:left>=frame.left-1&&right<=frame.right+1&&top>=frame.top-1&&bottom<=frame.bottom+1};") as? [String: Any]
        #expect(geometry?["inside"] as? Bool == true)
        #expect((geometry?["dx"] as? Double ?? 99) < 1)
        #expect((geometry?["dy"] as? Double ?? 99) < 1)
        let nodeProof = try await javascript("const color=value=>{const s=document.createElement('span');s.style.color=value;document.body.append(s);const result=getComputedStyle(s).color;s.remove();return result;}; const nodes=[...document.querySelectorAll('.pele-node')];return Object.fromEntries(nodes.map(n=>[n.dataset.taskId,{name:n.getAttribute('aria-label'),root:n.dataset.root,selected:n.dataset.selected,state:n.dataset.state,stroke:getComputedStyle(n.firstElementChild).stroke}]));") as? [String: [String: String]]
        #expect(nodeProof?["root"]?["name"] == "Ship the release, blocked")
        #expect(nodeProof?["done"]?["name"] == "Archive the draft, done")
        #expect(nodeProof?["cancelled"]?["name"] == "Retired experiment, cancelled")
        #expect(nodeProof?["root"]?["root"] == "true")
        #expect(nodeProof?["root"]?["selected"] == "false")
        let tokens = DependencyWebView.themeTokens(appearance: web.appearance)
        for (id, role) in [("root", "primary"), ("blocked", "warning"), ("done", "muted-text"), ("cancelled", "muted-text")] {
            let token = try #require(tokens[role])
            let expected = try await javascript("const s=document.createElement('span');s.style.color=token;document.body.append(s);const color=getComputedStyle(s).color;s.remove();return color;", arguments: ["token": token]) as? String
            #expect(nodeProof?[id]?["stroke"] == expected)
        }
        model.dependencies.graph?.viewport = .init(x: 21, y: 13, scale: 0.75)
        try await Task.sleep(for: .milliseconds(150))
        #expect(try await javascript("return document.querySelector('.graph-content').style.transform;") as? String == "translate(21px, 13px) scale(0.75)")
        #expect(viewportReplies() == 1)
        _ = try await javascript("const root = document.getElementById('graph'); root.testPointerDowns = 0; root.addEventListener('pointerdown', () => root.testPointerDowns++); const node = root.querySelector('.pele-node'); node.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, pointerId:1, button:0})); node.dispatchEvent(new MouseEvent('click', {bubbles:true}));")
        for _ in 0..<100 {
            if model.pendingNavigation != nil { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(model.pendingNavigation != nil)
        #expect(model.editor?.title == "Keep this draft")
        #expect(try await javascript("return document.getElementById('graph').testPointerDowns;") as? Int == 0)
        model.pendingNavigation = nil
        _ = try await javascript("document.getElementById('graph').dispatchEvent(new WheelEvent('wheel', {deltaY:-1, bubbles:true, cancelable:true}));")
        for _ in 0..<100 {
            if model.dependencies.graph?.viewport?.scale == 0.75 * 1.15 { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(model.dependencies.graph?.viewport?.scale == 0.75 * 1.15)
        try await Task.sleep(for: .milliseconds(100))
        _ = try await javascript("const root = document.getElementById('graph'); const node = root.querySelector('.pele-node'); node.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, pointerId:2, button:0})); node.dispatchEvent(new MouseEvent('click', {bubbles:true}));")
        for _ in 0..<100 {
            if model.pendingNavigation != nil { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(model.pendingNavigation != nil)
        #expect(try await javascript("return document.getElementById('graph').testPointerDowns;") as? Int == 0)
        let activations = recorder.replies.filter { if case .activate = $0.event { true } else { false } }.count
        #expect(activations == 2)
        model.pendingNavigation = nil
        _ = try await javascript("const node = document.querySelector('[data-task-id=root]'); node.focus();")
        try await Task.sleep(for: .milliseconds(80))
        _ = try await javascript("const button = document.createElement('button'); button.textContent = 'Reset fixture'; document.getElementById('graph').append(button); button.focus(); button.hidden = true;")
        try await Task.sleep(for: .milliseconds(100))
        #expect(try await javascript("return document.activeElement.dataset.taskId;") as? String == "root")
        let epoch = model.discovery.credentialEpoch
        let identity = DependencyGraphIdentity(profile: "work", root: "root", credentialEpoch: epoch, request: 1)
        let identityValue = try JSONSerialization.jsonObject(with: JSONEncoder().encode(identity))
        let focused = model.dependencies.graph?.focused
        _ = try await javascript("window.webkit.messageHandlers.todoGraph.postMessage({v:1,type:'focus',identity,task_id:'foreign'});", arguments: ["identity": identityValue])
        try await Task.sleep(for: .milliseconds(50))
        #expect(model.dependencies.graph?.focused == focused)
        let staleValue = try JSONSerialization.jsonObject(with: JSONEncoder().encode(DependencyGraphIdentity(profile: "work", root: "root", credentialEpoch: epoch - 1, request: 1)))
        _ = try await javascript("window.webkit.messageHandlers.todoGraph.postMessage({v:99,type:'obsolete',identity});", arguments: ["identity": staleValue])
        try await Task.sleep(for: .milliseconds(50))
        #expect(model.dependencies.graph?.renderError == nil)
        _ = try await javascript("window.webkit.messageHandlers.todoGraph.postMessage({v:99,type:'unknown',identity});", arguments: ["identity": identityValue])
        try await Task.sleep(for: .milliseconds(50))
        #expect(model.dependencies.graph?.renderError == "The diagram response is incompatible. Use the Task list or Retry.")
        let networkBlocked = try await javascript("return await fetch('https://example.invalid/todo-graph-proof').then(() => false, () => true);") as? Bool
        #expect(networkBlocked == true)
        let outside = directory.appendingPathComponent("outside-graph-navigation.html")
        try Data("<title>Outside bundle</title>".utf8).write(to: outside)
        web.loadFileURL(outside, allowingReadAccessTo: directory)
        try await Task.sleep(for: .milliseconds(100))
        #expect(web.url == originalURL)
        try JSONSerialization.data(withJSONObject: [
            "status": "PASS only when Swift assertions pass", "local_file": originalURL.lastPathComponent,
            "rendered_nodes": 5, "activations_before_after_zoom": activations, "pointerdown_reached_zoom_parent": 0,
            "initial_viewport_replies": 1, "stored_viewport_no_extra_reply": true, "fit_scale": fitted.scale,
            "fit_geometry": geometry ?? [:], "node_states": nodeProof ?? [:], "mac_theme_tokens": tokens,
            "hidden_reset_focus": "root", "unknown_id_ignored": true, "stale_unknown_version_ignored": true,
            "current_unknown_version_rejected": true, "network_fetch_blocked": networkBlocked == true,
            "outside_file_navigation_blocked": web.url == originalURL,
            "native_key_dispatch": "held", "voiceover": "held", "events": "synthetic DOM events in offscreen WKWebView"
        ], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("wk-host-proof.json"))
    }
}
