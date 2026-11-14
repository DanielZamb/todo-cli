import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

private let recoveryTaskJSON = #"{"id":"a","profile_id":"work","entity_version":1,"row_version":1,"title":"Current result","description":null,"priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"source":"manual","occurrence":null,"created_at":"2026-11-10T00:00:00Z","updated_at":"2026-11-10T00:00:00Z","completed_at":null,"deleted_at":null}"#
private let recoveryBroadJSON = #"{"message":"Different agent search copy","code":"search_too_broad","exit_code":2,"exit_meaning":"validation or usage"}"#

private actor DependencySearchRecoveryTransport: ClientTransport {
    enum Reply { case broad, current }
    let replies: [Reply]
    let delayFirst: Bool
    private var gate: CheckedContinuation<Void, Never>?
    private(set) var searches = 0
    private(set) var mutations = 0
    var held: Bool { gate != nil }
    init(_ replies: [Reply], delayFirst: Bool = false) { self.replies = replies; self.delayFirst = delayFirst }
    func release() { gate?.resume(); gate = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if operationID == "tasks.depend" {
            mutations += 1
            if mutations == 2 {
                return (HTTPResponse(status: .conflict, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"_tag":"Conflict","exit_code":4,"exit_meaning":"Conflict","latest":null}"#))
            }
            guard let body else { throw URLError(.badServerResponse) }
            let data = try await Data(collecting: body, upTo: 65_536)
            let payload = try JSONDecoder().decode(Operations.tasks_period_depend.Input.Body.jsonPayload.self, from: data)
            let dependent = request.path?.split(separator: "/").dropLast().last.map(String.init) ?? "root"
            let error: [String: Any] = ["generated_at": "2026-11-10T00:00:00Z", "message": "Different agent mutation copy", "code": "dependency_cycle", "exit_code": 2, "exit_meaning": "validation or usage", "details": ["dependent_id": dependent, "blocker_id": payload.blocker_id, "path": [payload.blocker_id, dependent, payload.blocker_id]]]
            return (HTTPResponse(status: .unprocessableContent, headerFields: [.contentType: "application/json"]), HTTPBody(try JSONSerialization.data(withJSONObject: error)))
        }
        guard operationID == "tasks.list" else { throw URLError(.unsupportedURL) }
        let index = searches
        searches += 1
        if delayFirst && index == 0 { await withCheckedContinuation { gate = $0 } }
        switch replies.indices.contains(index) ? replies[index] : .current {
        case .broad: return (HTTPResponse(status: .unprocessableContent, headerFields: [.contentType: "application/json"]), HTTPBody(recoveryBroadJSON))
        case .current: return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody("[" + recoveryTaskJSON + "]"))
        }
    }
}

@MainActor struct DependencySearchRecoveryTests {
    private func model(_ transport: DependencySearchRecoveryTransport) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-sc1-recovery"), clientFactory: { server, credential in
            Client(serverURL: server, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
        })
        model.replaceCredential("synthetic-sc1"); model.signedIn = true; model.connection = .live
        return model
    }
    private func task(_ id: String = "a") throws -> TaskSnapshot {
        try JSONDecoder().decode(TaskSnapshot.self, from: Data(recoveryTaskJSON.replacingOccurrences(of: #""id":"a""#, with: #""id":"\#(id)""#).utf8))
    }
    @Test func successfulAndClearedPickerQueriesRemoveOnlyTheirSearchNoticeInBothDirections() async throws {
        for direction in DependencyDirection.allCases {
            let transport = DependencySearchRecoveryTransport([.broad, .current, .broad])
            let model = model(transport)
            let linked = try task("linked")
            model.dependencies.picker = .init(profile: "work", root: try task("root"), direction: direction, text: "broad", linked: [linked])
            await model.searchDependencyCandidates()
            #expect(model.dependencies.picker?.failure?.message == "This search is too broad. Narrow the words or add more of the Task title.")
            #expect(model.dependencies.picker?.failure?.detail == "error 2 - validation or usage")
            model.dependencies.picker?.text = "current"
            await model.searchDependencyCandidates()
            #expect(model.dependencies.picker?.failure == nil)
            #expect(model.dependencies.picker?.candidates.map(\.id) == ["a"])
            #expect(model.dependencies.picker?.checked("linked") == true)
            model.dependencies.picker?.text = "broad"
            await model.searchDependencyCandidates()
            #expect(model.dependencies.picker?.failure?.failure?.code == "search_too_broad")
            model.connection = .offline
            model.dependencies.picker?.text = ""
            await model.searchDependencyCandidates()
            #expect(model.dependencies.picker?.failure == nil)
            #expect(await transport.searches == 3)
            #expect(model.dependencies.picker?.checked("linked") == true)
        }
    }
    @Test func pickerMutationRefusalConflictAndBatchReportSurviveSearchSuccessAndClear() async throws {
        for direction in DependencyDirection.allCases {
            let transport = DependencySearchRecoveryTransport([.broad, .current, .current, .broad, .current])
            let model = model(transport)
            let root = try task("root")
            model.dependencies.picker = .init(profile: "work", root: root, direction: direction, text: "broad")
            await model.toggleDependency(try task())
            #expect(await transport.mutations == 1)
            #expect(model.dependencies.picker?.failure?.message == "This Dependency would create a loop.")
            await model.searchDependencyCandidates()
            #expect(model.dependencies.picker?.failure?.failure?.code == "dependency_cycle")
            #expect(model.dependencies.picker?.failure?.attemptTitle == "Current result")
            #expect(model.dependencies.picker?.failure?.path == (direction == .dependsOn ? ["a", "root", "a"] : ["root", "a", "root"]))
            model.dependencies.picker?.text = "current"
            await model.searchDependencyCandidates()
            #expect(model.dependencies.picker?.failure?.message == "This Dependency would create a loop.")
            #expect(model.dependencies.picker?.failure?.detail == "error 2 - validation or usage")
            #expect(model.dependencies.picker?.failure?.attemptTitle == "Current result")
            model.dependencies.picker?.text = ""
            await model.searchDependencyCandidates()
            #expect(model.dependencies.picker?.failure?.message == "This Dependency would create a loop.")
            await model.toggleDependency(try task())
            #expect(await transport.mutations == 2)
            #expect(model.dependencies.picker?.requiresReload == true)
            model.dependencies.batch = .init(profile: "work", root: root, direction: direction, loading: false, report: .init(dry_run: true, results: [.init(index: 0, result: nil, error: .init(message: "Batch agent copy", code: "occ_conflict", exitCode: 4, exitMeaning: "Conflict"), exit_code: 4)]))
            let batch = model.dependencies.batch?.id
            for query in ["broad", "current", ""] {
                model.dependencies.picker?.text = query
                await model.searchDependencyCandidates()
                #expect(model.dependencies.picker?.failure?.message == "The Tasks changed since this list loaded.")
                #expect(model.dependencies.picker?.failure?.detail == "error 4 - Conflict")
                #expect(model.dependencies.picker?.requiresReload == true)
                #expect(model.dependencies.batch?.id == batch)
                #expect(model.dependencies.batch?.report?.results.first?.error?.code == "occ_conflict")
                #expect(model.dependencies.batch?.report?.requiresReload == true)
            }
        }
    }
    @Test func graphSuccessAndClearReplaceSearchNoticeWithoutClearingOperationNoticeOrBatchReport() async throws {
        let transport = DependencySearchRecoveryTransport([.broad, .current, .broad, .broad, .current])
        let model = model(transport)
        model.dependencies.graph = .init(profile: "work", root: "a", search: "broad")
        await model.searchDependencyGraph()
        #expect(model.dependencies.graph?.failure?.message == "This search is too broad. Narrow the words or add more of the Task title.")
        model.dependencies.graph?.search = "current"
        await model.searchDependencyGraph()
        #expect(model.dependencies.graph?.matches == ["a"])
        #expect(model.dependencies.graph?.failure == nil)
        model.dependencies.graph?.search = "broad"
        await model.searchDependencyGraph()
        model.connection = .offline
        model.dependencies.graph?.search = ""
        await model.searchDependencyGraph()
        #expect(model.dependencies.graph?.matches == nil)
        #expect(model.dependencies.graph?.failure == nil)
        #expect(await transport.searches == 3)
        model.connection = .live
        model.dependencies.graph?.failure = .init(message: "Keep the graph read refusal", detail: "error 4 - Conflict")
        model.dependencies.batch = .init(profile: "work", root: try task(), direction: .dependsOn, loading: false, report: .init(dry_run: true, results: [.init(index: 0, result: nil, error: .init(message: "Batch agent copy", code: "occ_conflict", exitCode: 4, exitMeaning: "Conflict"), exit_code: 4)]))
        for query in ["broad", "current", ""] {
            model.dependencies.graph?.search = query
            await model.searchDependencyGraph()
            #expect(model.dependencies.graph?.failure?.message == "Keep the graph read refusal")
            #expect(model.dependencies.batch?.report?.requiresReload == true)
        }
    }
    @Test func delayedOlderSearchErrorCannotReplaceSuccessOrAClearedQuery() async throws {
        for graph in [false, true] {
            for clear in [false, true] {
                let transport = DependencySearchRecoveryTransport([.broad, .current], delayFirst: true)
                let model = model(transport)
                if graph { model.dependencies.graph = .init(profile: "work", root: "a", search: "old") }
                else { model.dependencies.picker = .init(profile: "work", root: try task("root"), direction: .dependsOn, text: "old") }
                let old = Task { if graph { await model.searchDependencyGraph() } else { await model.searchDependencyCandidates() } }
                for _ in 0..<1000 { if await transport.held { break }; try await Task.sleep(for: .milliseconds(1)) }
                #expect(await transport.held)
                if clear { model.connection = .offline }
                if graph { model.dependencies.graph?.search = clear ? "" : "current"; await model.searchDependencyGraph() }
                else { model.dependencies.picker?.text = clear ? "" : "current"; await model.searchDependencyCandidates() }
                await transport.release(); await old.value
                #expect(graph ? model.dependencies.graph?.failure == nil : model.dependencies.picker?.failure == nil)
                if !clear { #expect(graph ? model.dependencies.graph?.matches == ["a"] : model.dependencies.picker?.candidates.map(\.id) == ["a"]) }
            }
        }
    }
    @Test func refreshingDependenciesDoesNotPromoteAnOldSearchErrorToAnOperationRefusal() async throws {
        let transport = DependencySearchRecoveryTransport([.broad, .current])
        let model = model(transport)
        model.dependencies.picker = .init(profile: "work", root: try task("root"), direction: .dependsOn, purpose: .initial, text: "broad")
        await model.searchDependencyCandidates()
        #expect(model.dependencies.picker?.failure?.failure?.code == "search_too_broad")
        await model.refreshDependencyReads()
        #expect(model.dependencies.picker?.failure == nil)
        #expect(model.dependencies.picker?.candidates.map(\.id) == ["a"])
    }
}
