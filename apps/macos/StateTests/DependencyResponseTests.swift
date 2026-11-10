import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
@testable import TodoState

private func graphWire(title: String) -> String {
    let task = #"{"id":"a","profile_id":"work","entity_version":1,"row_version":1,"title":"\#(title)","description":null,"priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"source":"manual","occurrence":null,"created_at":"2026-11-10T00:00:00Z","updated_at":"2026-11-10T00:00:00Z","completed_at":null,"deleted_at":null}"#
    return #"{"generated_at":"2026-11-10T00:00:00Z","profile_id":"work","task_id":"a","ancestors":[],"descendants":[],"lightest_next":["a"],"nodes":[{"mermaid_id":"n0","task":\#(task),"in_degree":0,"out_degree":0,"ready":true,"blocked":false,"depth":0,"remaining_energy":{"energy":0,"unweighted":1}}],"edges":[],"sources":["a"],"sinks":["a"],"topological_order":["a"],"shape":"single","mermaid":"flowchart TD\nn0[Task]"}"#
}

private actor DependencyHeldTransport: ClientTransport {
    let oldUnauthorized: Bool
    private var gate: CheckedContinuation<Void, Never>?
    private var graphCalls = 0
    var headers: [String] = []
    var held: Bool { gate != nil }
    init(oldUnauthorized: Bool = false) { self.oldUnauthorized = oldUnauthorized }
    func release() { gate?.resume(); gate = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        guard operationID == "tasks.graph" else { throw URLError(.cannotConnectToHost) }
        graphCalls += 1
        let first = graphCalls == 1
        headers.append(request.headerFields[.authorization] ?? "")
        if first { await withCheckedContinuation { gate = $0 } }
        if first && oldUnauthorized {
            return (HTTPResponse(status: .unauthorized, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"message":"old unauthorized","code":"auth_required","exit_code":3,"exit_meaning":"not found or auth missing"}"#))
        }
        return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(graphWire(title: first ? "Old result" : "Current result")))
    }
}

@MainActor struct DependencyResponseTests {
    private func model(_ transport: DependencyHeldTransport) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-dependency-response"), clientFactory: { server, credential in
            Client(serverURL: server, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
        })
        model.signedIn = true
        model.connection = .live
        model.replaceCredential("old")
        return model
    }
    private func waitForHeld(_ transport: DependencyHeldTransport) async throws {
        for _ in 0..<1000 {
            if await transport.held { return }
            try await Task.sleep(for: .milliseconds(1))
        }
        Issue.record("The old graph request did not reach its held response")
    }
    @Test func staleSuccessAndUnauthorizedCannotPublishOrSignOutReplacementCredential() async throws {
        for unauthorized in [false, true] {
            let transport = DependencyHeldTransport(oldUnauthorized: unauthorized)
            let model = model(transport)
            let old = Task { await model.readDependencyGraph(root: "a") }
            try await waitForHeld(transport)
            model.replaceCredential("replacement")
            await model.readDependencyGraph(root: "a")
            #expect(model.dependencies.graph?.report?.nodes.first?.task.title == "Current result")
            await transport.release()
            await old.value
            #expect(model.signedIn)
            #expect(model.dependencies.graph?.report?.nodes.first?.task.title == "Current result")
            #expect(model.dependencies.graph?.failure == nil)
            #expect(await transport.headers == ["Bearer old", "Bearer replacement"])
        }
    }
    @Test func closeAndProfileNavigationInvalidateHeldGraphReads() async throws {
        for profileChange in [false, true] {
            let transport = DependencyHeldTransport()
            let model = model(transport)
            let old = Task { await model.readDependencyGraph(root: "a") }
            try await waitForHeld(transport)
            if profileChange { model.changeProfile("personal") } else { model.closeDependencyGraph() }
            await transport.release()
            await old.value
            #expect(model.dependencies.graph == nil)
            #expect(model.profile == (profileChange ? "personal" : "work"))
            model.signedIn = false
            model.connect()
        }
    }
    @Test func graphReportKeepsAuthoritativeShapeRootSetsAndViewportWhenDataChanges() throws {
        let wire = try JSONDecoder().decode(Operations.tasks_period_graph.Output.Ok.Body.jsonPayload.self, from: Data(graphWire(title: "Ready root").utf8))
        let report = try JSONDecoder().decode(DependencyGraphReport.self, from: JSONEncoder().encode(wire))
        var graph = DependencyGraphState(profile: "work", root: "a", viewportState: .manual(.init(x: 9, y: -4, scale: 2)), selected: "vanished", focused: "vanished", expanded: ["a", "vanished"])
        graph.publish(report)
        #expect(graph.report?.shape == "single")
        #expect(graph.report?.lightest_next == ["a"])
        #expect(graph.report?.ancestors == [])
        #expect(graph.report?.descendants == [])
        #expect(graph.viewport == .init(x: 9, y: -4, scale: 2))
        #expect(graph.selected == "a")
        #expect(graph.focused == "a")
        #expect(graph.expanded == ["a"])
        #expect(graph.visibleIDs == ["a"])
    }
}

extension DependencyResponseTests {
    @Test func repeatedTaskRowsHaveStableUniqueSectionIdentityAndKeepTheFullTaskID() {
        let sections = DependencyGraphSection.allCases
        #expect(sections.map(\.rawValue) == ["shown", "depends-on", "blocks", "lightest-next", "starts-at", "ends-at", "ancestors", "descendants"])
        let rows = sections.map { DependencyGraphRowID(task: "full-task-id", section: $0) }
        #expect(rows.map(\.taskIdentifier) == ["dependency-graph-task-full-task-id", "dependency-graph-related-depends-on-full-task-id", "dependency-graph-related-blocks-full-task-id", "dependency-graph-related-lightest-next-full-task-id", "dependency-graph-related-starts-at-full-task-id", "dependency-graph-related-ends-at-full-task-id", "dependency-graph-related-ancestors-full-task-id", "dependency-graph-related-descendants-full-task-id"])
        #expect(rows.map(\.menuIdentifier) == sections.map { "dependency-graph-actions-\($0.rawValue)-full-task-id" })
        #expect(rows.first?.expandIdentifier == "dependency-graph-expand-full-task-id")
        #expect(rows[1].expandIdentifier == "dependency-graph-expand-related-depends-on-full-task-id")
        #expect(Set(rows).count == 8)
        #expect(Set(rows.map(\.taskIdentifier)).count == 8)
        #expect(rows.allSatisfy { $0.task == "full-task-id" })
    }
}

extension DependencyResponseTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func liveDependencySSEPreservesViewportDraftAndSurvivingFocus() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        let blocker = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "DAG SSE blocker"))).ok.body.json)
        let root = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "DAG SSE root"))).ok.body.json)
        let value = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-graph-sse"))
        value.replaceCredential(session.credential)
        value.signedIn = true
        value.connect()
        defer { value.signedIn = false; value.connect() }
        func wait(_ predicate: () -> Bool) async throws {
            for _ in 0..<2000 { if predicate() { return }; try await Task.sleep(for: .milliseconds(10)) }
            Issue.record("The production dependency SSE state did not settle")
        }
        try await wait { value.connection == .live }
        await value.readDependencyGraph(root: root.id)
        value.beginEditing(root)
        value.editor?.title = "Keep the unsaved graph draft"
        value.dependencies.graph?.viewport = .init(x: 17, y: -9, scale: 1.2)
        value.dependencies.graph?.expanded = [root.id]
        _ = try await api.tasks_period_depend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: blocker.id, from_version: 1))).ok.body.json
        try await wait { value.dependencies.graph?.report?.edges.count == 1 }
        #expect(value.dependencies.graph?.report?.nodes.first { $0.task.id == root.id }?.blocked == true)
        #expect(value.dependencies.graph?.viewport == .init(x: 17, y: -9, scale: 1.2))
        #expect(value.dependencies.graph?.selected == root.id)
        #expect(value.dependencies.graph?.focused == root.id)
        #expect(value.editor?.title == "Keep the unsaved graph draft")
        #expect(value.editor?.base.row_version == 1)
        let complete = try JSONDecoder().decode(Operations.tasks_period_transition.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"action":"complete"}"#.utf8))
        _ = try await api.tasks_period_transition(path: .init(profile: "work", task: blocker.id), body: .json(complete)).ok.body.json
        try await wait { value.dependencies.graph?.report?.lightest_next == [root.id] }
        let finishRoot = try JSONDecoder().decode(Operations.tasks_period_transition.Input.Body.jsonPayload.self, from: Data(#"{"from_version":2,"action":"complete"}"#.utf8))
        _ = try await api.tasks_period_transition(path: .init(profile: "work", task: root.id), body: .json(finishRoot)).ok.body.json
        try await wait { value.dependencies.graph?.report?.nodes.first { $0.task.id == root.id }?.task.status == "done" }
        #expect(value.dependencies.graph?.report?.lightest_next.isEmpty == true)
        value.dependencies.graph?.selected = blocker.id
        value.dependencies.graph?.focused = blocker.id
        value.dependencies.graph?.expanded.insert(blocker.id)
        _ = try await api.tasks_period_undepend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: blocker.id, from_version: 3))).ok.body.json
        try await wait { value.dependencies.graph?.report?.nodes.count == 1 }
        #expect(value.dependencies.graph?.selected == root.id)
        #expect(value.dependencies.graph?.focused == root.id)
        #expect(value.dependencies.graph?.expanded == [root.id])
        #expect(value.dependencies.graph?.viewport == .init(x: 17, y: -9, scale: 1.2))
        #expect(value.editor?.base.row_version == 1)
        let fresh = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: root.id)).ok.body.json)
        value.beginEditing(fresh)
        await value.loadHistory()
        let removal = try #require(value.history.first { $0.event.kind == "DependencyRemoved" })
        #expect(removal.label == "Dependency removed")
        #expect(removal.canRevert(in: value.history))
        await value.write(.revert(removal.seq))
        let reverted = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: root.id)).ok.body.json)
        #expect(reverted.row_version == 5)
        #expect(reverted.depends_on == [blocker.id])
        await value.loadHistory()
        let event = try #require(value.history.first { $0.event.kind == "TaskReverted" })
        #expect(event.event.dependencyDelta?.lines(profile: "work").map(\.prefix) == ["Added"])
        #expect(event.event.dependencyDelta?.lines(profile: "work").map { $0.edge.blocker_id } == [blocker.id])
        let receipt = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent().appendingPathComponent("dependency-graph-sse.json")
        try JSONSerialization.data(withJSONObject: ["stream_live": value.connection == .live, "root": root.id, "removed_selection_fallback": value.dependencies.graph?.selected == root.id, "viewport": ["x": 17, "y": -9, "scale": 1.2], "draft_preserved_across_sse_version": 1, "reverted_version": 5, "ready_root_included": true, "terminal_next_empty": true], options: [.prettyPrinted, .sortedKeys]).write(to: receipt)
    }
}
