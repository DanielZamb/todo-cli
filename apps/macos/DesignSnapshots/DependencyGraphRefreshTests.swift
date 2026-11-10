import AppKit
import CryptoKit
import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import SwiftUI
import Testing
import TodoAPI
import WebKit
@testable import TodoState

private actor RefreshGraphTransport: ClientTransport {
    private struct DeletedOperation: Decodable {
        struct Event: Decodable { struct Identity: Decodable { let id: String }; let after: Identity }
        let event: Event
    }
    private let live = URLSessionTransport()
    private var parser = EventStreamDecoder()
    private var deletedTask: String?
    private var gate: CheckedContinuation<Void, Never>?
    private(set) var operation: String?
    private(set) var sequence: String?
    private(set) var response: String?
    var held: Bool { gate != nil }
    func arm(_ task: String) { deletedTask = task; operation = nil; sequence = nil; response = nil }
    func release() { gate?.resume(); gate = nil }
    private func observe(_ chunk: HTTPBody.ByteChunk) throws {
        for event in try parser.append(chunk) where event.name == "operation" {
            let value = try JSONDecoder().decode(CommittedOperation.self, from: Data(event.data.utf8))
            if value.event.kind == "TaskDeleted", let deletedTask {
                let deleted = try JSONDecoder().decode(DeletedOperation.self, from: Data(event.data.utf8))
                if deleted.event.after.id == deletedTask { operation = event.data; sequence = event.id }
            }
        }
    }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let result = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        if operationID == "changes.stream", let body = result.1 {
            let pair = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            let reader = Task {
                do {
                    for try await chunk in body { try observe(chunk); pair.continuation.yield(chunk) }
                    pair.continuation.finish()
                } catch { pair.continuation.finish(throwing: error) }
            }
            pair.continuation.onTermination = { _ in reader.cancel() }
            return (result.0, HTTPBody(pair.stream, length: .unknown))
        }
        if operationID == "tasks.graph", operation != nil, response == nil, let body = result.1 {
            let data = try await Data(collecting: body, upTo: 8_388_608)
            response = String(decoding: data, as: UTF8.self)
            await withCheckedContinuation { gate = $0 }
            return (result.0, HTTPBody(data))
        }
        return result
    }
}

@MainActor private final class RefreshGraphReplies: NSObject, WKScriptMessageHandler {
    let original: DependencyWebView.Coordinator
    var viewports = 0
    var request: Int?
    var nodes: Int?
    init(_ original: DependencyWebView.Coordinator) { self.original = original }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let body = message.body as? [String: Any], let type = body["type"] as? String {
            if type == "viewport" { viewports += 1 }
            if type == "rendered" { request = (body["identity"] as? [String: Any])?["request"] as? Int; nodes = body["node_count"] as? Int }
        }
        original.userContentController(controller, didReceive: message)
    }
}

@MainActor struct DependencyGraphRefreshTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_GRAPH_REFRESH_BINARIES"] != nil))
    func realSSEHeldGraphReadKeepsTheHostingFrameAndAutomaticViewport() async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"]))
        let repository = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../..").standardizedFileURL
        let binaries = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_GRAPH_REFRESH_BINARIES"]))))
        try #require(binaries["head"] == ProcessInfo.processInfo.environment["TODO_GRAPH_REFRESH_HEAD"])
        for key in ["cli", "server", "seed"] {
            let binary = URL(fileURLWithPath: try #require(binaries[key])).standardizedFileURL
            try #require(binary.path.hasPrefix(repository.appendingPathComponent(".scratch/bin").path + "/"))
            let digest = SHA256.hash(data: try Data(contentsOf: binary)).map { String(format: "%02x", $0) }.joined()
            try #require(digest == binaries[key + "_sha256"])
        }
        let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-graph-refresh-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: false)
        let server = Process()
        var started = false
        defer {
            if started { if server.isRunning { server.terminate() }; server.waitUntilExit() }
            try? FileManager.default.removeItem(at: scratch)
            let cleanup = ["serverStopped": !server.isRunning, "scratchRemoved": !FileManager.default.fileExists(atPath: scratch.path)]
            try? JSONSerialization.data(withJSONObject: cleanup, options: [.sortedKeys]).write(to: directory.appendingPathComponent("wk-refresh-cleanup.json"))
        }
        var environment = ProcessInfo.processInfo.environment
        environment["HOME"] = scratch.appendingPathComponent("home").path
        environment["TODO_DB"] = scratch.appendingPathComponent("scratch.db").path
        environment["TODO_PORT"] = "0"
        func run(_ executable: String, _ arguments: [String], log: String) throws {
            let destination = directory.appendingPathComponent(log)
            FileManager.default.createFile(atPath: destination.path, contents: nil)
            let output = try FileHandle(forWritingTo: destination)
            defer { try? output.close() }
            let process = Process(); process.executableURL = URL(fileURLWithPath: executable); process.arguments = arguments
            process.environment = environment; process.standardOutput = output; process.standardError = output
            try process.run(); process.waitUntilExit()
            if process.terminationStatus == 3 && executable == "/bin/sh" {
                try JSONSerialization.data(withJSONObject: ["exit": 3, "command": [executable] + arguments]).write(to: directory.appendingPathComponent("disk-stop.json"))
            }
            try #require(process.terminationStatus == 0)
        }
        try run("/bin/sh", [repository.appendingPathComponent("scripts/disk-guard.sh").path], log: "seed-guard.log")
        try run(try #require(binaries["seed"]), [scratch.path, "diagnostics"], log: "seed.log")
        try run("/bin/sh", [repository.appendingPathComponent("scripts/disk-guard.sh").path], log: "server-guard.log")
        let serverLog = directory.appendingPathComponent("server.log")
        FileManager.default.createFile(atPath: serverLog.path, contents: nil)
        let output = try FileHandle(forWritingTo: serverLog)
        defer { try? output.close() }
        server.executableURL = URL(fileURLWithPath: try #require(binaries["server"])); server.environment = environment
        server.standardOutput = output; server.standardError = output
        try server.run(); started = true
        try JSONSerialization.data(withJSONObject: ["pid": server.processIdentifier, "scratch": scratch.path, "build": binaries["head"] ?? ""], options: [.sortedKeys]).write(to: directory.appendingPathComponent("server.json"))
        var address: URL?
        for _ in 0..<600 {
            try #require(server.isRunning)
            let text = try String(contentsOf: serverLog, encoding: .utf8)
            if let range = text.range(of: #"http://127\.0\.0\.1:\d+"#, options: .regularExpression) { address = URL(string: String(text[range])); break }
            try await Task.sleep(for: .milliseconds(100))
        }
        let url = try #require(address)
        let (healthData, _) = try await URLSession.shared.data(from: url.appendingPathComponent("health"))
        let health = try JSONDecoder().decode([String: String].self, from: healthData)
        try #require(health["service"] == "todo-server" && health["build"] == binaries["head"])
        try #require(binaries["version"]?.contains("contract=" + (health["contract"] ?? "missing")) == true)
        try healthData.write(to: directory.appendingPathComponent("health.json"))
        let session = try await todoClient(server: url, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: url, credential: session.credential)
        var cases: [[String: Any]] = []
        for compact in [true, false] {
            func create(_ title: String) async throws -> TaskSnapshot { try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: title))).ok.body.json) }
            let root = try await create("Stable graph root")
            let kept = try await create("Surviving blocker")
            let removed = try await create("Deleted neighbour")
            _ = try await api.tasks_period_depend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: kept.id, from_version: 1))).ok.body.json
            _ = try await api.tasks_period_depend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: removed.id, from_version: 2))).ok.body.json
            let history = try await api.reads_period_history(path: .init(profile: "work", task: root.id)).ok.body.json
            let events = try JSONDecoder().decode([HistoryEntry].self, from: JSONEncoder().encode(history))
            let watermark = try #require(events.map(\.seq).max())
            let transport = RefreshGraphTransport()
            let model = TodoModel(configuration: .init(server: url, initialProfile: "work", vaultService: "unused-graph-refresh"), clientFactory: { server, credential in Client(serverURL: server, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) })
            model.replaceCredential(session.credential); model.signedIn = true; model.connect()
            defer { model.signedIn = false; model.connect(); Task { await transport.release() } }
            var census: (() async throws -> [String: Any])?
            func wait(_ stage: String, _ predicate: () async throws -> Bool) async throws {
                let progress: [String: Any] = ["compact": compact, "stage": stage, "connection": String(describing: model.connection), "main_loading": model.loading, "graph_loading": model.dependencies.graph?.loading == true, "graph_nodes": model.dependencies.graph?.report?.nodes.count ?? -1, "render_error": model.dependencies.graph?.renderError ?? "", "sse": await transport.operation ?? ""]
                try JSONSerialization.data(withJSONObject: progress, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("progress.json"))
                for _ in 0..<2000 { if try await predicate() { return }; try await Task.sleep(for: .milliseconds(10)) }
                if let census { try JSONSerialization.data(withJSONObject: try await census(), options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("observer-timeout-census.json")) }
                throw NSError(domain: "GraphRefreshProof", code: 1, userInfo: [NSLocalizedDescriptionKey: "Timed out waiting for " + stage])
            }
            try await wait("SSE ready") { model.connection == .live && !model.loading }
            try await wait("setup History watermark") { (model.lastSequence.flatMap(Int64.init) ?? -1) >= watermark }
            await model.readDependencyGraph(root: root.id)
            model.dependencies.graph?.expanded = [root.id]
            let width: CGFloat = compact ? 393 : 1000, height: CGFloat = compact ? 426 : 680
            let controller = NSHostingController(rootView: DependencyGraphView(model: model, compact: compact, initialDiagram: true).frame(width: width, height: height))
            let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false; window.contentViewController = controller
            defer { window.contentViewController = nil; window.close() }
            let host = controller.view; host.frame = .init(x: 0, y: 0, width: width, height: height); host.layoutSubtreeIfNeeded()
            try await wait("WK created") { !DependencyGraphSnapshots.webViews(host).isEmpty }
            let web = try #require(DependencyGraphSnapshots.webViews(host).first)
            let replies = RefreshGraphReplies(try #require(web.navigationDelegate as? DependencyWebView.Coordinator))
            web.configuration.userContentController.removeScriptMessageHandler(forName: "todoGraph")
            web.configuration.userContentController.add(replies, name: "todoGraph")
            defer { web.configuration.userContentController.removeScriptMessageHandler(forName: "todoGraph") }
            func javascript(_ script: String) async throws -> Any? { try await web.callAsyncJavaScript(script, arguments: [:], in: nil, contentWorld: .page) }
            census = {
                let viewport = model.dependencies.graph?.viewport
                let matrix = try await javascript("const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.graph-content')).transform);return [m.e,m.f,m.a];") as? [Double] ?? []
                return ["bridge_viewports": replies.viewports, "bridge_request": replies.request ?? -1, "bridge_nodes": replies.nodes ?? -1, "model_request": model.dependencies.graph?.request ?? -1, "coordinator_request": replies.original.render?.identity.request ?? -1, "viewport": viewport.map { [$0.x, $0.y, $0.scale] } ?? [], "dom_viewport": matrix, "render_error": model.dependencies.graph?.renderError ?? ""]
            }
            try await wait("initial WK fit") { model.dependencies.graph?.viewport != nil && model.dependencies.graph?.loading == false && replies.request == model.dependencies.graph?.request }
            let initialReplies = replies.viewports
            let fitted = try #require(model.dependencies.graph?.viewport)
            if let census { try JSONSerialization.data(withJSONObject: try await census(), options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("observer-before-census.json")) }
            let immediate = try await javascript("const matrix=()=>{const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.graph-content')).transform);return [m.e,m.f,m.a];};const before=matrix();const event=new WheelEvent('wheel',{deltaY:-1,bubbles:true,cancelable:true});document.getElementById('graph').dispatchEvent(event);return {before,after:matrix(),prevented:event.defaultPrevented};")
            try JSONSerialization.data(withJSONObject: immediate ?? [:], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("observer-immediate-census.json"))
            try await wait("observer manual zoom") { model.dependencies.graph?.viewport?.scale != fitted.scale }
            try #require(replies.viewports == initialReplies + 1)
            model.dependencies.graph?.viewport = nil
            try await wait("observer automatic reset") {
                guard model.dependencies.graph?.isViewportAutomatic == true else { return false }
                return replies.viewports == initialReplies + 2
            }
            let beforeViewport = try #require(model.dependencies.graph?.viewport)
            let selected = model.dependencies.graph?.selected, focused = model.dependencies.graph?.focused, expanded = model.dependencies.graph?.expanded
            var phases: [[String: Any]] = []
            func record(_ phase: String) async throws -> CGRect {
                host.layoutSubtreeIfNeeded()
                try await wait("rendered " + phase) { replies.request == model.dependencies.graph?.request && replies.nodes == model.dependencies.graph?.visibleIDs.count }
                let frame = web.convert(web.bounds, to: host)
                let viewport = try #require(model.dependencies.graph?.viewport)
                let matrix = try #require(try await javascript("const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.graph-content')).transform);return [m.e,m.f,m.a];") as? [Double])
                #expect(abs(matrix[0] - beforeViewport.x) < 0.001 && abs(matrix[1] - beforeViewport.y) < 0.001 && abs(matrix[2] - beforeViewport.scale) < 0.001)
                phases.append(["phase": phase, "frame": [frame.minX, frame.minY, frame.width, frame.height], "reply_count": replies.viewports, "viewport": [viewport.x, viewport.y, viewport.scale], "dom_viewport": matrix, "loading": model.dependencies.graph?.loading == true, "same_web_view": DependencyGraphSnapshots.webViews(host).first === web])
                let image = try await DependencyGraphSnapshots.image(host: host)
                try image.write(to: directory.appendingPathComponent("refresh-\(compact ? "compact" : "full")-\(phase).png"))
                return frame
            }
            let before = try await record("before")
            await transport.arm(removed.id)
            let preview = try await api.tasks_period_delete(path: .init(profile: "work", task: removed.id), query: .init(from_version: "1", with_dependencies: ._true, dry_run: ._true)).ok.body.json
            _ = try await api.tasks_period_delete(path: .init(profile: "work", task: removed.id), query: .init(from_version: "1", with_dependencies: ._true, dependency_fingerprint: try #require(preview.dependency_fingerprint))).ok.body.json
            try await wait("SSE-triggered held graph read") { await transport.held }
            try #require(model.dependencies.graph?.loading == true)
            let during = try await record("held")
            await transport.release()
            try await wait("published graph and SSE cursor") {
                guard model.dependencies.graph?.loading == false, model.dependencies.graph?.knownIDs.contains(removed.id) == false else { return false }
                return model.lastSequence == (await transport.sequence)
            }
            let after = try await record("after")
            cases.append(["compact": compact, "phases": phases, "setup_sequence": watermark, "initial_replies": initialReplies, "operation": await transport.operation ?? "", "sequence": await transport.sequence ?? "", "graph_response": await transport.response ?? "", "positive_control_replies": 2])
            try JSONSerialization.data(withJSONObject: ["cases": cases, "backend_build": binaries["head"] ?? ""], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("wk-refresh-proof.json"))
            #expect(before == during && during == after)
            #expect(phases.allSatisfy { $0["reply_count"] as? Int == initialReplies + 2 })
            #expect(model.dependencies.graph?.viewport == beforeViewport)
            #expect(model.dependencies.graph?.selected == selected)
            #expect(model.dependencies.graph?.focused == focused)
            #expect(model.dependencies.graph?.expanded == expanded)
            #expect(!window.isVisible)
        }
    }
}
