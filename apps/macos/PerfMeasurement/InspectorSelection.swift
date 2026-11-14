import AppKit
import Foundation
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

@MainActor struct MacPerformanceMeasurement {
    @Test func session() async throws {
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["MAC_PERF_SERVER"].flatMap(URL.init(string:)))
        let output = try #require(env["MAC_PERF_OUTPUT"])
        NSApplication.shared.setActivationPolicy(.prohibited)
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let recorder = ClientDiagnosticsRecorder(journalDirectory: URL(fileURLWithPath: env["HOME"]!).appendingPathComponent("selection-journal"))
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-inspector-selection"), clientDiagnostics: recorder)
        model.replaceCredential(credential); model.signedIn = true; model.selectedView = "all"
        await model.refreshAfterWrite("Selection measurement setup")
        model.connection = .live
        try #require(model.tasks.count == 178 && model.canWrite)
        let tasks = Array(model.tasks.filter { $0.description?.count == 1260 && !($0.attachments ?? []).isEmpty && $0.occurrence == nil }.prefix(2))
        try #require(tasks.count == 2)
        try #require(tasks[0].description != tasks[1].description, "selection must change the native description text")
        let controller = NSHostingController(rootView: RootView(model: model, compactMode: .constant(false)).frame(width: 1280, height: 820))
        let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: 1280, height: 820), styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentViewController = controller
        defer { model.signedIn = false; model.connect(); model.clientDiagnosticsUI.stop(); window.contentViewController = nil; window.close() }
        func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
        controller.view.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(50))
        func control(_ path: String) async throws -> Data { try await URLSession.shared.data(from: server.appending(path: "__perf/" + path)).0 }
        _ = try await control("start/inspector-selection")
        let sampler = ClientCpuSampler()
        var rows: [[String: Any]] = []
        for index in 0..<12 {
            let task = tasks[index % 2]
            PerfSelectionTrace.reset()
            NotificationCenter.default.post(name: Notification.Name("MacPerfSelectTask"), object: task.id)
            let deadline = ProcessInfo.processInfo.systemUptime + 10
            var matched = false
            while ProcessInfo.processInfo.systemUptime < deadline {
                controller.view.layoutSubtreeIfNeeded()
                if model.editor?.id == task.id {
                    let views = descendants(controller.view)
                    let marker = views.compactMap { $0 as? ClientDiagnosticNativeView }.first { $0.surface == .inspector && $0.identity == task.id }
                    let description = views.compactMap { $0 as? NSTextView }.first { $0.string == task.description }
                    if let marker, description != nil {
                        var ancestor: NSView? = marker
                        var settled = true
                        while let view = ancestor { if view.needsLayout { settled = false }; ancestor = view.superview }
                        if settled { matched = true; break }
                    }
                }
                try await Task.sleep(for: .milliseconds(1))
            }
            let finished = ProcessInfo.processInfo.systemUptime * 1000
            let finishedCpu = sampler.read()
            try #require(matched, "matching editor text and settled root layout did not arrive")
            let callback = try #require(PerfSelectionTrace.callback)
            let publication = try #require(PerfSelectionTrace.publication)
            try #require(PerfSelectionTrace.callbacks == 1)
            try #require(!window.isVisible && window.attachedSheet == nil)
            let delta = finishedCpu.since(try #require(PerfSelectionTrace.cpu))
            rows.append(["cold": index == 0, "description_characters": 1260, "callback_to_layout_ms": finished - callback, "callback_to_publication_ms": publication - callback, "publication_to_layout_ms": finished - publication, "main_cpu_ms": delta.mainThreadCpuMS.map { $0 as Any } ?? NSNull(), "process_cpu_ms": delta.processCpuMS.map { $0 as Any } ?? NSNull(), "host_load_1m": ClientCpuSampler.hostLoad1m().map { $0 as Any } ?? NSNull(), "callbacks": PerfSelectionTrace.callbacks, "list_bodies": PerfSelectionTrace.listBodies, "row_bodies": PerfSelectionTrace.rowBodies, "matching_results": 1])
        }
        let counts = try #require(JSONSerialization.jsonObject(with: await control("end/inspector-selection")) as? [String: Any])
        let requests = try #require(counts["requests"] as? [[String: Any]])
        let operations = try #require(counts["operationEvents"] as? [Any])
        try #require(requests.isEmpty && operations.isEmpty)
        let canonical = try JSONDecoder().decode([TaskSnapshot].self, from: await control("catalog/work"))
        try #require(model.tasks == canonical && model.appliedSearchSnapshot?.rows == canonical)
        let result: [String: Any] = ["errors": 0, "requests": requests.count, "operations": operations.count, "canonical_rows": canonical.count, "tasks": model.tasks.count, "selections": rows.count, "samples": rows, "physical_input": false, "physical_presentation": false, "window_ordered": window.isVisible]
        try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: output))
        recorder.clear(); await recorder.flush()
    }
}
