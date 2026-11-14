import AppKit
import HTTPTypes
import OpenAPIRuntime
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

private actor SearchRecoverySnapshotTransport: ClientTransport {
    let task: Data
    private(set) var calls = 0
    init(task: Data) { self.task = task }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        guard operationID == "tasks.list" else { throw URLError(.unsupportedURL) }
        calls += 1
        if calls == 1 {
            return (HTTPResponse(status: .unprocessableContent, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"message":"Different agent search copy","code":"search_too_broad","exit_code":2,"exit_meaning":"validation or usage"}"#))
        }
        return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(task))
    }
}

@MainActor private final class SearchRecoveryFrames { var frames: [String: CGRect] = [:] }

@MainActor struct DependencySearchRecoverySnapshots {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_SC1_ONLY"] == "1"))
    func captureSearchRecovery() async throws {
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"]))
        let files = try await Self.render(directory: directory)
        #expect(files.count == 8)
        try JSONSerialization.data(withJSONObject: ["files": files], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("manifest.json"))
    }
    static func render(directory: URL) async throws -> [String] {
        NSApplication.shared.setActivationPolicy(.prohibited)
        var files: [String] = []
        var receipts: [[String: Any]] = []
        for compact in [true, false] {
            for scheme in [ColorScheme.light, .dark] {
                let appearance = try #require(NSAppearance(named: scheme == .light ? .aqua : .darkAqua))
                NSApplication.shared.appearance = appearance
                for graph in [false, true] {
                    let base = DependencyGraphFixtures.model("large")
                    let candidate = try #require(base.tasks.first { $0.id == "g49" })
                    let transport = SearchRecoverySnapshotTransport(task: try JSONSerialization.data(withJSONObject: [DependencyFixtureCases.wire(candidate)]))
                    let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-sc1-snapshot"), clientFactory: { server, credential in
                        Client(serverURL: server, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
                    })
                    model.replaceCredential("synthetic-sc1"); model.signedIn = true; model.connection = .live
                    model.tasks = base.tasks; model.projects = base.projects
                    if graph {
                        model.dependencies.graph = base.dependencies.graph
                        model.dependencies.graph?.search = "broad"
                        await model.searchDependencyGraph()
                    } else {
                        model.dependencies.picker = .init(profile: "work", root: try #require(base.tasks.last), direction: .dependsOn, text: "broad")
                        await model.searchDependencyCandidates()
                    }
                    let before = graph ? model.dependencies.graph?.failure : model.dependencies.picker?.failure
                    #expect(before?.failure?.code == "search_too_broad")
                    #expect(before?.detail == "error 2 - validation or usage")
                    if graph { model.dependencies.graph?.search = "launch 49"; await model.searchDependencyGraph() }
                    else { model.dependencies.picker?.text = "launch 49"; await model.searchDependencyCandidates() }
                    #expect(graph ? model.dependencies.graph?.failure == nil : model.dependencies.picker?.failure == nil)
                    #expect(graph ? model.dependencies.graph?.matches == ["g49"] : model.dependencies.picker?.candidates.map(\.id) == ["g49"])
                    #expect(await transport.calls == 2)
                    let frames = SearchRecoveryFrames()
                    let width: CGFloat = compact ? 393 : 1024
                    let height: CGFloat = compact ? 426 : 720
                    let view = Group {
                        if graph { DependencyGraphView(model: model, compact: compact, initialDiagram: false) }
                        else { DependencyPickerView(model: model, compact: compact) }
                    }.onPreferenceChange(CompactLayoutKey.self) { value in MainActor.assumeIsolated { frames.frames = value } }
                        .frame(width: width, height: height).background(.background).environment(\.colorScheme, scheme).environment(\.controlActiveState, .key).tint(TodoColors.color("primary"))
                    let controller = NSHostingController(rootView: view)
                    let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
                    window.isReleasedWhenClosed = false; window.appearance = appearance; window.contentViewController = controller
                    let host = controller.view
                    host.frame = .init(x: 0, y: 0, width: width, height: height); host.layoutSubtreeIfNeeded()
                    if graph && !compact {
                        for _ in 0..<600 {
                            if model.dependencies.graph?.renderedNodeCount != nil || model.dependencies.graph?.renderError != nil { break }
                            try await Task.sleep(for: .milliseconds(10))
                        }
                        #expect(model.dependencies.graph?.renderedNodeCount != nil)
                        #expect(model.dependencies.graph?.renderError == nil)
                    }
                    try await Task.sleep(for: .milliseconds(120)); host.layoutSubtreeIfNeeded()
                    let actions = try #require(frames.frames[graph ? "dependency-graph-actions" : "dependency-actions"])
                    #expect(CGRect(x: 0, y: 0, width: width, height: height).contains(actions))
                    if !graph {
                        let candidateFrame = try #require(frames.frames["dependency-choice-g49"])
                        let body = try #require(frames.frames["dependency-body"])
                        #expect(body.contains(candidateFrame))
                    }
                    let file = "dag-sc1-\(compact ? "compact" : "full")-\(graph ? "graph" : "picker")-recovered-\(scheme == .light ? "light" : "dark").png"
                    try await DependencyGraphSnapshots.image(host: host, name: file).write(to: directory.appendingPathComponent(file))
                    files.append(file)
                    receipts.append(["client": "macos", "layout": compact ? "compact" : "full", "appearance": scheme == .light ? "light" : "dark", "state": graph ? "graph-search-recovered" : "picker-search-recovered", "png": file, "initial_error": before?.message ?? "", "initial_exit_pair": before?.detail ?? "", "current_query": "launch 49", "current_results": ["g49"], "search_notice_after_success": NSNull(), "transport": "controlled valid public 422 then 200 through compiled production TodoModel and generated client", "recovery_behavior_suite": "DependencySearchRecoveryTests", "geometry": frames.frames.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }, "identifiers": graph ? ["dependency-graph", "dependency-graph-search", "dependency-graph-list", "dependency-graph-close"] : ["dependency-picker", "dependency-search", "dependency-choice-g49", "dependency-picker-close"], "behavior_status": "pending", "behavior_receipt": NSNull()])
                    window.close()
                }
            }
        }
        let manifest = directory.appendingPathComponent("dag-capture-manifest.json")
        let existing = FileManager.default.fileExists(atPath: manifest.path) ? try JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as! [[String: Any]] : []
        try JSONSerialization.data(withJSONObject: existing + receipts, options: [.prettyPrinted, .sortedKeys]).write(to: manifest)
        return files
    }
}
