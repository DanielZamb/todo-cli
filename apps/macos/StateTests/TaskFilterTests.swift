import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

@testable import TodoState

private actor FilterReadTransport: ClientTransport {
    private let live = URLSessionTransport()
    private var unavailable = false
    func goOffline() { unavailable = true }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if unavailable { throw URLError(.notConnectedToInternet) }
        return try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
    }
}

@MainActor
struct TaskFilterTests {
    private func task(_ id: String, project: String?, tags: [String]) -> TaskSnapshot {
        TaskSnapshot(
            id: id, profile_id: "work", row_version: 1, title: id, description: nil,
            priority: "P3", source: "manual", status: "open", project_id: project, tags: tags,
            due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil,
            legacy_series_detached: true, deleted_at: nil)
    }

    @Test func projectAndTagIntersectInsideTheSelectedView() {
        let model = TodoModel(configuration: .init(
            server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-filter-proof"))
        let match = task("Launch revenue", project: "launch", tags: ["revenue", "review"])
        let dated = task("Dated revenue", project: "launch", tags: ["revenue"])
        let otherProject = task("Operations revenue", project: "ops", tags: ["revenue"])
        let otherTag = task("Launch compliance", project: "launch", tags: ["compliance"])
        let plain = task("No metadata", project: nil, tags: [])
        model.tasks = [match, dated, otherProject, otherTag, plain]
        model.selectedView = "all"
        model.selectedProject = "launch"
        model.selectedTag = "revenue"
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Launch revenue", "Dated revenue"])
        model.selectedView = "inbox"
        model.planning = PlanningResult(name: "inbox", groups: [.init(name: "Inbox", tasks: [match, otherProject, otherTag, plain])])
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Launch revenue"])
        model.selectedProject = nil
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Launch revenue", "Operations revenue"])
        model.selectedProject = "launch"
        model.selectedTag = "compliance"
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Launch compliance"])
        model.selectedTag = "unknown"
        #expect(TaskListView(model: model).visibleTasks.isEmpty)
        model.selectedProject = nil
        model.selectedTag = nil
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Launch revenue", "Operations revenue", "Launch compliance", "No metadata"])
    }

    @Test func filterSummaryAndEstimateValidation() {
        let filters = TaskListFilters(status: "open", priority: "P1", due: "none", scheduled: "2030-11-02", attachment: "enterprise", energy: "3", estimate: "45")
        #expect(filters.count == 7)
        #expect(filters.summary == "Open · P1 · No due date · Scheduled 2030-11-02 · Attachment: enterprise · Energy 3 · 45 min")
        #expect(filters.query.energy?.rawValue == "3")
        #expect(filters.query.estimate == "45")
        for estimate in ["0", "-1", "1.5", "five"] { #expect(!TaskListFilters(estimate: estimate).isValid) }
        #expect(TaskListFilters(estimate: "none").isValid)
        #expect(TaskListFilters(estimate: "99999999999999999999999999999999999999").isValid)
        #expect(TaskListFilters(estimate: "99999999999999999999999999999999999999").query.estimate == "99999999999999999999999999999999999999")
    }

    @Test func clearingFiltersIgnoresAnOldCachedMask() {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-clear-filter-proof"))
        model.selectedView = "all"
        model.tasks = [task("Cached Task", project: nil, tags: [])]
        model.taskFilters = .init(status: "closed")
        model.matchingTaskIDs = []
        #expect(TaskListView(model: model).visibleTasks.isEmpty)
        model.taskFilters = .init()
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Cached Task"])
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func filtersUseTheGeneratedQueryAgainstScratchHTTP() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let client = todoClient(server: server, credential: session.credential)
        var created: [TaskSnapshot] = []
        for json in [
            #"{"title":"Native filter revenue","project_name":"Native filter Project","tag_names":["revenue"],"priority":"P1","energy":3,"estimate_min":45}"#,
            #"{"title":"Native filter dated","project_name":"Native filter Project","tag_names":["revenue"],"priority":"P2","energy":2,"estimate_min":30,"due_at":{"kind":"date","date":"2030-11-01"}}"#,
        ] {
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: Data(json.utf8))
            created.append(try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: "work"), body: .json(payload)).ok.body.json))
        }
        for (title, action) in [("Native filter done", "complete"), ("Native filter cancelled", "cancel")] {
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: Data(#"{"title":"\#(title)","project_name":"Native filter Project","tag_names":["revenue"]}"#.utf8))
            let task = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: "work"), body: .json(payload)).ok.body.json)
            let transition = try JSONDecoder().decode(Operations.tasks_period_transition.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"action":"\#(action)"}"#.utf8))
            created.append(try await TaskSnapshot.decode(client.tasks_period_transition(path: .init(profile: "work", task: task.id), body: .json(transition)).ok.body.json))
        }
        let primary = try #require(created.first)
        let attachment = try JSONDecoder().decode(Operations.tasks_period_attach.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"location":{"kind":"link","url":"https://example.test/enterprise/contract"},"label":"Enterprise agreement"}"#.utf8))
        _ = try await client.tasks_period_attach(path: .init(profile: "work", task: primary.id), body: .json(attachment)).ok
        let transport = FilterReadTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-filter-http"), clientFactory: { url, _ in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: session.credential)]) })
        model.selectedView = "all"
        model.selectedProject = primary.project_id
        model.selectedTag = primary.tags.first
        func waitForFilters() async throws {
            for _ in 0..<500 {
                if !model.loading { return }
                try await Task.sleep(for: .milliseconds(20))
            }
            Issue.record("Filter refresh timed out")
        }
        model.applyTaskFilters(.init(status: "open", priority: "P1", attachment: "ENTERPRISE", energy: "3", estimate: "45"))
        try await waitForFilters()
        #expect(model.matchingTaskIDs == Set([primary.id]))
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Native filter revenue"])
        model.applyTaskFilters(.init(due: "2030-11-01"))
        try await waitForFilters()
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Native filter dated"])
        model.applyTaskFilters(.init(status: "closed"))
        try await waitForFilters()
        #expect(TaskListView(model: model).visibleTasks.map(\.title).sorted() == ["Native filter cancelled", "Native filter done"])
        model.applyTaskFilters(.init(status: "open"))
        try await waitForFilters()
        #expect(TaskListView(model: model).visibleTasks.map(\.title).sorted() == ["Native filter dated", "Native filter revenue"])
        model.applyTaskFilters(.init())
        try await waitForFilters()
        #expect(model.matchingTaskIDs == nil)
        #expect(TaskListView(model: model).visibleTasks.map(\.title).sorted() == ["Native filter cancelled", "Native filter dated", "Native filter done", "Native filter revenue"])
        model.applyTaskFilters(.init(status: "open"))
        try await waitForFilters()
        #expect(model.taskFilters.status == "open")
        await transport.goOffline()
        model.applyTaskFilters(.init(status: "closed"))
        #expect(model.taskFilters.status == "open")
        try await waitForFilters()
        #expect(model.taskFilters.status == "open")
        #expect(model.taskLoadError == "Could not apply filters. Your previous filters are still active.")
        #expect(TaskListView(model: model).visibleTasks.map(\.title).sorted() == ["Native filter dated", "Native filter revenue"])
        model.applyTaskFilters(.init())
        #expect(TaskListView(model: model).visibleTasks.map(\.title).sorted() == ["Native filter cancelled", "Native filter dated", "Native filter done", "Native filter revenue"])
        for original in created {
            let latest = try await client.tasks_period_show(path: .init(profile: "work", task: original.id)).ok.body.json
            _ = try await client.tasks_period_delete(path: .init(profile: "work", task: original.id), query: .init(from_version: String(latest.row_version))).ok
        }
    }
}
