import AppKit
import SwiftUI
import Testing
import WebKit
@testable import TodoState

@MainActor private final class ViewportResizeReplies {
    var count = 0
}

@MainActor struct DependencyViewportResizeTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_GRAPH_RESIZE_EVIDENCE"] != nil))
    func automaticFitFollowsTheFrameAndManualZoomSurvives() async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let relative = try #require(ProcessInfo.processInfo.environment["TODO_GRAPH_RESIZE_EVIDENCE"])
        try #require(!relative.hasPrefix("/"))
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../..").standardizedFileURL
        let directory = root.appendingPathComponent(relative)
        let model = DependencyGraphSnapshots.fixture()
        let replies = ViewportResizeReplies()
        let view = DependencyWebView(model: model, onReply: { reply in
            if case .viewport = reply.event { replies.count += 1 }
        }).frame(maxWidth: .infinity, maxHeight: .infinity)
        let controller = NSHostingController(rootView: view)
        let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: 285, height: 286), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = controller
        let host = controller.view
        host.autoresizingMask = [.width, .height]
        host.frame = .init(x: 0, y: 0, width: 285, height: 286)
        host.layoutSubtreeIfNeeded()
        defer { window.close() }
        func waitFor(_ predicate: () -> Bool) async throws {
            for _ in 0..<600 {
                if predicate() { return }
                try await Task.sleep(for: .milliseconds(10))
            }
        }
        try await waitFor { replies.count > 0 || model.dependencies.graph?.renderError != nil }
        #expect(model.dependencies.graph?.renderError == nil)
        let web = try #require(DependencyGraphSnapshots.webViews(host).first)
        var phases: [[String: Any]] = []
        func javascript(_ script: String) async throws -> Any? {
            try await web.callAsyncJavaScript(script, arguments: [:], in: nil, contentWorld: .page)
        }
        func record(_ name: String) async throws -> [String: Any] {
            let geometry = try #require(try await javascript("const frame=document.getElementById('graph').getBoundingClientRect();const boxes=[...document.querySelectorAll('.pele-node:not(.graph-hidden),.pele-edge:not(.graph-hidden)')].map(n=>n.getBoundingClientRect());const left=Math.min(...boxes.map(b=>b.left)),right=Math.max(...boxes.map(b=>b.right)),top=Math.min(...boxes.map(b=>b.top)),bottom=Math.max(...boxes.map(b=>b.bottom));return {width:frame.width,height:frame.height,dx:(left+right-frame.left-frame.right)/2,dy:(top+bottom-frame.top-frame.bottom)/2,inside:left>=frame.left-1&&right<=frame.right+1&&top>=frame.top-1&&bottom<=frame.bottom+1};") as? [String: Any])
            phases.append(["phase": name, "viewport_replies": replies.count, "geometry": geometry, "same_web_view": DependencyGraphSnapshots.webViews(host).first === web])
            try JSONSerialization.data(withJSONObject: ["phases": phases, "native_app": false, "keychain": false], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("wk-resize-proof.json"))
            return geometry
        }
        func expectCentred(_ geometry: [String: Any]) {
            #expect(abs(geometry["dx"] as? Double ?? 999) < 1)
            #expect(abs(geometry["dy"] as? Double ?? 999) < 1)
            #expect(geometry["inside"] as? Bool == true)
        }
        func resize(_ width: CGFloat, _ height: CGFloat) {
            window.setContentSize(.init(width: width, height: height))
            host.setFrameSize(.init(width: width, height: height))
            host.layoutSubtreeIfNeeded()
        }
        expectCentred(try await record("initial-automatic"))
        try #require(replies.count == 1)
        resize(570, 467)
        resize(571, 467)
        resize(572, 467)
        try await waitFor { replies.count >= 2 }
        #expect(web.bounds.width == 572 && web.bounds.height == 467)
        expectCentred(try await record("automatic-expanded"))
        try #require(replies.count == 2)
        resize(285, 286)
        try await waitFor { replies.count >= 3 }
        expectCentred(try await record("automatic-compact"))
        try #require(replies.count == 3)
        let fitted = try #require(model.dependencies.graph?.viewport)
        _ = try await javascript("document.getElementById('graph').dispatchEvent(new WheelEvent('wheel',{deltaY:-1,bubbles:true,cancelable:true}));")
        try await waitFor { model.dependencies.graph?.viewport?.scale != fitted.scale }
        let manual = try #require(model.dependencies.graph?.viewport)
        #expect(manual.scale > fitted.scale)
        try #require(replies.count == 4)
        resize(572, 467)
        for _ in 0..<600 {
            let width = try await javascript("return document.getElementById('graph').getBoundingClientRect().width;") as? Double
            if width == 572 { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        let manualGeometry = try await record("manual-expanded")
        #expect(manualGeometry["width"] as? Double == 572)
        #expect(replies.count == 4)
        #expect(model.dependencies.graph?.viewport == manual)
        let transform = try await javascript("const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.graph-content')).transform);return {x:m.e,y:m.f,scale:m.a};") as? [String: Double]
        #expect(abs((transform?["x"] ?? 999) - manual.x) < 0.001)
        #expect(abs((transform?["y"] ?? 999) - manual.y) < 0.001)
        #expect(abs((transform?["scale"] ?? 999) - manual.scale) < 0.001)
        model.dependencies.graph?.viewport = nil
        try await waitFor { replies.count >= 5 }
        expectCentred(try await record("reset-expanded"))
        try #require(replies.count == 5)
        resize(640, 400)
        try await waitFor { replies.count >= 6 }
        expectCentred(try await record("automatic-window-resize"))
        #expect(replies.count == 6)
    }
}
