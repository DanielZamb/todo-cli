import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
@testable import TodoState

private func taskJSON(version: Int = 1, profile: String = "work", title: String = "Base", occurrence: String = "null", deleted: Bool = false) -> String {
    #"{"id":"task-1","profile_id":"\#(profile)","entity_version":1,"row_version":\#(version),"title":"\#(title)","description":null,"priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"source":"manual","occurrence":\#(occurrence),"created_at":"2026-10-27T12:00:00Z","updated_at":"2026-10-27T12:00:00Z","completed_at":null,"deleted_at":\#(deleted ? "\"2026-10-27T12:00:00Z\"" : "null")}"#
}

private actor Transport: ClientTransport {
    struct Reply: Sendable { let operation: String; let status: Int; let json: String }
    var replies: [Reply]
    var calls: [String] = []
    var bodies: [String] = []
    init(_ replies: [Reply]) { self.replies = replies }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        calls.append(operationID)
        if let body { bodies.append(String(decoding: try await Data(collecting: body, upTo: 65_536), as: UTF8.self)) }
        guard !replies.isEmpty else { throw URLError(.cannotConnectToHost) }
        let reply = replies.removeFirst()
        #expect(operationID == reply.operation)
        return (HTTPResponse(status: .init(code: reply.status), headerFields: [.contentType: "application/json"]), HTTPBody(reply.json))
    }
}

@MainActor
private func fixture(_ transport: Transport, json: String = taskJSON()) throws -> TodoModel {
    let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-headless"), clientFactory: { url, credential in
        Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
    })
    model.signedIn = true
    model.connection = .live
    model.beginEditing(try JSONDecoder().decode(TaskSnapshot.self, from: Data(json.utf8)))
    return model
}

@Test @MainActor func moveConflictPreservesDraftAndRetriesAtLatestVersion() async throws {
    let transport = Transport([
        .init(operation: "tasks.move", status: 409, json: #"{"_tag":"Conflict","latest":\#(taskJSON(version: 4, title: "Remote"))}"#),
        .init(operation: "tasks.move", status: 422, json: #"{"message":"series_move_not_supported"}"#)
    ])
    let model = try fixture(transport)
    model.editor?.title = "Local draft"
    await model.write(.move("personal"))
    #expect(model.editor?.title == "Local draft")
    #expect(model.conflict?.latest?.row_version == 4)
    #expect(model.busy == false)
    await model.resolveConflict()
    #expect(model.editor?.title == "Local draft")
    #expect(model.editor?.base.row_version == 4)
    #expect(model.editorError == "series_move_not_supported")
    let bodies = await transport.bodies
    #expect(try JSONSerialization.jsonObject(with: Data(bodies[0].utf8)) as? NSDictionary == ["from_version": 1, "destination_profile": "personal"] as NSDictionary)
    #expect(try JSONSerialization.jsonObject(with: Data(bodies[1].utf8)) as? NSDictionary == ["from_version": 4, "destination_profile": "personal"] as NSDictionary)
}

@Test @MainActor func revertAndSkipUseGeneratedClientAndKeepServerReasons() async throws {
    for (intent, operation, expected) in [
        (TaskWriteIntent.revert(42), "tasks.revert", ["from_version": 1, "seq": 42]),
        (.skipOccurrence, "tasks.skipOccurrence", ["from_version": 1])
    ] {
        let transport = Transport([.init(operation: operation, status: 422, json: #"{"message":"not_revertible_or_not_a_series"}"#)])
        let model = try fixture(transport)
        await model.write(intent)
        #expect(model.editor?.title == "Base")
        #expect(model.editorError == "not_revertible_or_not_a_series")
        #expect(model.busy == false)
        let bodies = await transport.bodies
        #expect(try JSONSerialization.jsonObject(with: Data(bodies[0].utf8)) as? NSDictionary == expected as NSDictionary)
    }
}

@Test @MainActor func unavailableConflictCannotRetry() async throws {
    let transport = Transport([.init(operation: "tasks.revert", status: 409, json: #"{"_tag":"Conflict","latest":null}"#)])
    let model = try fixture(transport)
    await model.write(.revert(7))
    await model.resolveConflict()
    #expect(model.editor?.base.row_version == 1)
    #expect(model.editorError == "Conflict: this Task is unavailable. Your draft is preserved.")
    #expect(await transport.calls == ["tasks.revert"])
}

@Test @MainActor func seriesConflictRequiresFieldChoiceAndPreservesExclusions() async throws {
    let recurrence = Recurrence(dtstart: TaskTime(kind: "date", date: "2026-10-28"), rrule: "FREQ=DAILY", exdate: [TaskTime(kind: "date", date: "2026-10-29")])
    let transport = Transport([
        .init(operation: "tasks.editSeries", status: 409, json: #"{"_tag":"Conflict","latest":\#(taskJSON(version: 3, title: "Remote"))}"#),
        .init(operation: "tasks.editSeries", status: 422, json: #"{"message":"invalid_recurrence"}"#)
    ])
    let model = try fixture(transport)
    model.editor?.title = "Local"
    await model.write(.editSeries(recurrence))
    await model.resolveConflict()
    #expect(await transport.calls == ["tasks.editSeries"])
    model.conflict?.choices["title"] = true
    await model.resolveConflict()
    let bodies = await transport.bodies
    #expect(try JSONSerialization.jsonObject(with: Data(bodies[1].utf8)) as? NSDictionary == ["from_version": 3, "changes": ["title": "Local"], "recurrence": ["dtstart": ["kind": "date", "date": "2026-10-28"], "rrule": "FREQ=DAILY", "exdate": [["kind": "date", "date": "2026-10-29"]]]] as NSDictionary)
    #expect(model.editorError == "invalid_recurrence")
    #expect(model.recurrenceDraft == Recurrence(dtstart: TaskTime(kind: "date", date: "2026-10-28"), rrule: "FREQ=DAILY", exdate: [TaskTime(kind: "date", date: "2026-10-29")]))
}

@Test @MainActor func createSeriesIncludesFullDraftAndDoesNotConvertOriginalTask() async throws {
    let transport = Transport([.init(operation: "tasks.createSeries", status: 422, json: #"{"message":"invalid_recurrence"}"#)])
    let model = try fixture(transport)
    model.editor?.title = "New Series"
    model.editor?.estimate = 25
    await model.saveSeries(.init(dtstart: TaskTime(kind: "date", date: "2026-10-28"), rrule: "FREQ=DAILY", exdate: []))
    let bodies = await transport.bodies
    #expect(try JSONSerialization.jsonObject(with: Data(bodies[0].utf8)) as? NSDictionary == ["task": ["title": "New Series", "priority": "P3", "description": NSNull(), "project_id": NSNull(), "tags": [], "due_at": NSNull(), "scheduled_at": NSNull(), "energy": NSNull(), "estimate_min": 25, "source": "manual"], "recurrence": ["dtstart": ["kind": "date", "date": "2026-10-28"], "rrule": "FREQ=DAILY", "exdate": []]] as NSDictionary)
    #expect(model.editor?.id == "task-1")
    #expect(model.editor?.title == "New Series")
}

@Test func presetsRoundTripAndUnknownRulesStayReadOnly() {
    for rule in ["FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "FREQ=WEEKLY;BYDAY=TU,FR", "FREQ=MONTHLY;BYMONTHDAY=31", "FREQ=MONTHLY;BYDAY=-1FR"] {
        #expect(RecurrenceDraft(rule: rule).rule == rule)
        #expect(RecurrenceDraft(rule: rule).valid)
    }
    #expect(RecurrenceDraft(rule: "FREQ=DAILY;INTERVAL=2").preset == .custom)
    var draft = RecurrenceDraft(rule: "FREQ=WEEKLY;BYDAY=MO")
    draft.days = []
    #expect(!draft.valid)
    #expect(Weekday.allCases.map(\.title) == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
}

@Test func quickAddShowsOnlyUnquotedPriorityTokens() {
    let parsed = ParsedTask(title: "Prepare", priority: "P3", tags: [])
    #expect(parsed.displayingTokens(in: "Prepare").priority == nil)
    #expect(parsed.displayingTokens(in: "Prepare 'p3'").priority == nil)
    #expect(parsed.displayingTokens(in: "Prepare \"p3\"").priority == nil)
    #expect(parsed.displayingTokens(in: "Prepare P3").priority == "P3")
    let quotedName = ParsedTask(title: "Ship", priority: "P3", tags: ["planning p1 work"])
    for input in [#"Ship #"planning p1 work""#, #"Ship @'Client p2 Work'"#, #"Ship #'planning p3 work'"#] {
        #expect(quotedName.displayingTokens(in: input).priority == nil)
    }
}

@Test @MainActor func acceptedRevertKeepsUnsavedFieldsAndDeletedTaskCloses() async throws {
    let transport = Transport([.init(operation: "tasks.revert", status: 200, json: taskJSON(version: 2, title: "Reverted"))])
    let model = try fixture(transport)
    model.editor?.description = "Local notes"
    await model.write(.revert(42))
    #expect(model.editor?.title == "Reverted")
    #expect(model.editor?.description == "Local notes")
    #expect(model.editor?.base.row_version == 2)
    #expect(model.conflict == nil)
    let deleting = Transport([.init(operation: "tasks.revert", status: 200, json: taskJSON(version: 2, deleted: true))])
    let deleted = try fixture(deleting)
    await deleted.write(.revert(1))
    #expect(deleted.editor == nil)
}

@Test @MainActor func offlineWritesNeverReachTransport() async throws {
    let transport = Transport([])
    let model = try fixture(transport)
    model.connection = .offline
    await model.write(.move("personal"))
    await model.write(.revert(1))
    await model.write(.skipOccurrence)
    await model.saveSeries(.init(dtstart: .init(kind: "date", date: "2026-10-28"), rrule: "FREQ=DAILY", exdate: []))
    #expect(await transport.calls == [])
    #expect(model.editor?.base.row_version == 1)
}

@Test func historyReconstructsSeriesThroughRevertAndIgnoresRejectedChanges() throws {
    let recurrence = #"{"dtstart":{"kind":"date","date":"2026-10-28"},"rrule":"FREQ=DAILY","exdate":[]}"#
    let daily = #"{"id":"series-1","profile_id":"work","recurrence":\#(recurrence)}"#
    let weekly = daily.replacingOccurrences(of: "FREQ=DAILY", with: "FREQ=WEEKLY;BYDAY=MO")
    let json = #"[{"seq":1,"outcome":"committed","event":{"kind":"TaskCreated","occurred_at":"2026-10-27T12:00:00Z","series":\#(daily)}},{"seq":3,"outcome":"rejected","reason":"conflict","event":{"kind":"TaskAttemptRejected","attempted_kind":"TaskEdited","occurred_at":"2026-10-27T12:00:00Z","series_after":\#(weekly)}},{"seq":2,"outcome":"committed","event":{"kind":"TaskReverted","occurred_at":"2026-10-27T12:00:00Z","series":[{"before":\#(daily),"after":\#(weekly)}],"tasks":[]}}]"#
    let entries = try JSONDecoder().decode([HistoryEntry].self, from: Data(json.utf8))
    let task = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON(occurrence: #"{"id":"occ-1","series_id":"series-1","date":"2026-10-28"}"#).utf8))
    #expect(HistoryEntry.series(for: task, entries: entries)?.recurrence.rrule == "FREQ=WEEKLY;BYDAY=MO")
    #expect(entries.map { $0.canRevert(in: entries) } == [false, false, true])
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveGeneratedWritesAgainstScratchServer() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let created = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "W06 original"))).ok.body.json
    let base = try TaskSnapshot.decode(created)
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    model.signedIn = true
    model.connection = .live
    model.beginEditing(base)
    model.editor?.title = "W06 Series"
    await model.saveSeries(.init(dtstart: .init(kind: "date", date: "2026-10-28"), rrule: "FREQ=DAILY", exdate: []))
    let seriesTask = try #require(model.editor?.base)
    #expect(seriesTask.id != base.id)
    #expect(seriesTask.title == "W06 Series")
    #expect(seriesTask.row_version == 1)
    await model.openSeries(presenting: false)
    #expect(model.series?.recurrence.summary == "Every day")
    #expect(model.showingSeries == false)
    await model.openSeries()
    #expect(model.series?.recurrence.rrule == "FREQ=DAILY")
    #expect(model.showingSeries)
    model.editor?.title = "W06 weekly"
    await model.saveSeries(.init(dtstart: .init(kind: "date", date: "2026-10-28"), rrule: "FREQ=WEEKLY;BYDAY=WE", exdate: []))
    #expect(model.editor?.base.row_version == 2)
    #expect(model.editor?.title == "W06 weekly")
    #expect(model.series?.recurrence.summary == "Every Wednesday")
    await model.write(.skipOccurrence)
    #expect(model.editor?.base.status == "cancelled")
    #expect(model.editor?.base.row_version == 3)
    await model.loadHistory()
    #expect(model.history.contains { $0.event.kind == "TaskEdited" && $0.outcome == "committed" })
    let latest = try #require(model.history.last { $0.outcome == "committed" })
    await model.write(.revert(latest.seq))
    #expect(model.editor?.base.row_version == 4)
    #expect(model.editor?.base.status == "open")
    model.beginEditing(base)
    await model.write(.move("personal"))
    #expect(model.profile == "work")
    #expect(model.editor == nil)
    #expect(model.transferResult?.task.row_version == 2)
    #expect(await model.openTransferredTask())
    #expect(model.profile == "personal")
    #expect(model.editor?.base.row_version == 2)
    #expect(model.editor?.base.profile_id == "personal")
    let moved = try await client.tasks_period_show(path: .init(profile: "personal", task: base.id)).ok.body.json
    #expect(try TaskSnapshot.decode(moved).title == "W06 original")
    model.editor = nil
    model.changeProfile("work")
    for _ in 0..<500 {
        if model.connection == .live { break }
        try await Task.sleep(for: .milliseconds(10))
    }
    #expect(model.canWrite)
    model.beginEditing(seriesTask)
    await model.write(.skipOccurrence)
    #expect(model.conflict != nil)
    #expect(model.editor?.base.row_version == 1)
    let purgeSeries = try await client.tasks_period_createSeries(path: .init(profile: "work"), body: .json(JSONDecoder().decode(Operations.tasks_period_createSeries.Input.Body.jsonPayload.self, from: Data(#"{"task":{"title":"W06 purge Series"},"recurrence":{"dtstart":{"kind":"date","date":"2026-10-28"},"rrule":"FREQ=DAILY","exdate":[]}}"#.utf8)))).ok.body.json
    let first = try TaskSnapshot.decode(purgeSeries)
    let transition = try JSONDecoder().decode(Operations.tasks_period_transition.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"action":"complete"}"#.utf8))
    _ = try await client.tasks_period_transition(path: .init(profile: "work", task: first.id), body: .json(transition)).ok.body.json
    let values = try await client.tasks_period_list(path: .init(profile: "work")).ok.body.json.map(TaskSnapshot.decode)
    let successor = try #require(values.first { $0.id != first.id && $0.seriesKey == first.seriesKey })
    _ = try await client.tasks_period_delete(path: .init(profile: "work", task: first.id), query: .init(from_version: "2")).ok.body.json
    let purge = Process()
    purge.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_PROVISIONER"]))
    purge.arguments = [try #require(ProcessInfo.processInfo.environment["TODO_W06_SCRATCH"]), "purge", first.id]
    purge.standardOutput = FileHandle.nullDevice
    purge.standardError = FileHandle.standardError
    try purge.run()
    purge.waitUntilExit()
    #expect(purge.terminationStatus == 0)
    model.beginEditing(successor)
    await model.openSeries()
    #expect(model.showingSeries)
    #expect(model.series?.id == first.seriesKey)
    #expect(model.series?.recurrence.rrule == "FREQ=DAILY")
    let data = try JSONSerialization.data(withJSONObject: ["seriesTask": seriesTask.id, "movedTask": base.id, "seriesVersion": 4, "movedVersion": 2, "appLaunched": false, "keychainAccessed": false], options: [.sortedKeys])
    let path = try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])
    try data.write(to: URL(fileURLWithPath: path))
}

@Test @MainActor func missingOccurrenceDefinitionNeverOffersCreation() async throws {
    let json = taskJSON(occurrence: #"{"id":"occ-1","series_id":"series-1","date":"2026-10-28"}"#)
    let transport = Transport([
        .init(operation: "tasks.list", status: 200, json: "[" + json + "]"),
        .init(operation: "reads.history", status: 200, json: "[]")
    ])
    let model = try fixture(transport, json: json)
    await model.openSeries()
    #expect(model.showingSeries == false)
    #expect(model.editorError == "The Series definition could not be recovered from History. Your Task and recurrence draft are preserved.")
    await model.saveSeries(.init(dtstart: .init(kind: "date", date: "2026-10-28"), rrule: "FREQ=DAILY", exdate: []))
    #expect(await transport.calls == ["tasks.list", "reads.history"])
}

@Test func redactedReplayRetainsSeriesAndGraphIdentifiers() throws {
    let json = #"[{"seq":1,"outcome":"committed","event":{"kind":"TaskHistoryRedacted","occurred_at":"2026-10-27T12:00:00Z","task_ids":["purged-first"],"replay":{"tasks":[],"series":[{"before":null,"after":{"id":"series-1","profile_id":"work","recurrence":{"dtstart":{"kind":"date","date":"2026-10-28"},"rrule":"FREQ=DAILY","exdate":[]}}}]}}}]"#
    let entries = try JSONDecoder().decode([HistoryEntry].self, from: Data(json.utf8))
    let task = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON(occurrence: #"{"id":"occ-2","series_id":"series-1","date":"2026-10-29"}"#).utf8))
    #expect(HistoryEntry.series(for: task, entries: entries)?.recurrence.rrule == "FREQ=DAILY")
    #expect(entries[0].event.redactedTaskIDs == ["purged-first"])
    #expect(entries[0].canRevert(in: entries) == false)
}

@Test func metadataNamesMapToTaskAndSeriesPayloadsAndMergeAsFields() throws {
    let base = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON().utf8))
    var draft = TaskDraft(base)
    draft.projectName = "Launch"
    draft.tagNames = ["focus", "ready"]
    let payload = try JSONSerialization.jsonObject(with: draft.changesData()) as? NSDictionary
    #expect(payload == ["from_version": 1, "changes": ["project_name": "Launch", "tags": [], "tag_names": ["focus", "ready"]]] as NSDictionary)
    let generated = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: draft.changesData())
    #expect(try JSONSerialization.jsonObject(with: JSONEncoder().encode(generated)) as? NSDictionary == payload)
    let latest = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON(version: 2).replacingOccurrences(of: #""project_id":null"#, with: #""project_id":"remote-project""#).replacingOccurrences(of: #""tags":[]"#, with: #""tags":["remote-tag"]"#).utf8))
    #expect(draft.overlaps(with: latest) == ["project_id", "tags"])
    #expect(draft.value("project_id") == "Launch")
    #expect(TaskDraft(latest).value("project_id", projects: ["remote-project": "Remote Project"]) == "Remote Project")
    #expect(TaskDraft(latest).value("tags", tags: ["remote-tag": "remote"]) == "remote")
    let mine = draft.merging(latest, choices: ["project_id": true, "tags": true])
    #expect(mine.projectName == "Launch")
    #expect(mine.tagNames == ["focus", "ready"])
    let theirs = draft.merging(latest, choices: ["project_id": false, "tags": false])
    #expect(theirs.project == "remote-project")
    #expect(theirs.projectName == nil)
    #expect(theirs.tagNames == [])
    let recurrence = Recurrence(dtstart: TaskTime(kind: "date", date: "2026-10-28"), rrule: "FREQ=DAILY", exdate: [])
    let series = try JSONDecoder().decode(Operations.tasks_period_createSeries.Input.Body.jsonPayload.self, from: draft.newSeriesData(recurrence))
    #expect(series.task.project_name == "Launch")
    #expect(series.task.tag_names == ["focus", "ready"])
    let editSeries = try JSONDecoder().decode(Operations.tasks_period_editSeries.Input.Body.jsonPayload.self, from: draft.seriesData(recurrence))
    #expect(editSeries.changes.project_name == "Launch")
    #expect(editSeries.changes.tag_names == ["focus", "ready"])
    draft.projectName = ""
    draft.tagNames = []
    let clear = try JSONSerialization.jsonObject(with: draft.changesData()) as? NSDictionary
    #expect(clear == ["from_version": 1, "changes": ["project_name": ""]] as NSDictionary)
}

@Test @MainActor func conflictDiscoveryLoadsNamesCreatedByAnotherClient() async throws {
    let transport = Transport([
        .init(operation: "reads.projects", status: 200, json: #"[{"id":"z","profile_id":"work","name":"Zulu","created_at":"2026-10-28T00:00:00Z","updated_at":"2026-10-28T00:00:00Z","open_task_count":1},{"id":"a","profile_id":"work","name":"alpha","created_at":"2026-10-28T00:00:00Z","updated_at":"2026-10-28T00:00:00Z","open_task_count":1}]"#),
        .init(operation: "reads.tags", status: 200, json: #"[{"id":"z-tag","profile_id":"work","name":"zulu","open_task_count":1},{"id":"a-tag","profile_id":"work","name":"alpha","open_task_count":1}]"#)
    ])
    let model = try fixture(transport)
    model.conflict = TaskConflict(latest: model.editor?.base)
    await model.refreshConflictDefinitions()
    #expect(model.editorError == nil)
    #expect(model.projects.map(\.name) == ["alpha", "Zulu"])
    #expect(model.tags.map(\.name) == ["alpha", "zulu"])
    #expect(model.editor?.title == "Base")
    #expect(model.conflict != nil)
    #expect(await transport.calls == ["reads.projects", "reads.tags"])
}

@Test func taskRowIncludesEveryTagInCaseInsensitiveNameOrder() throws {
    let task = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON().replacingOccurrences(of: #""tags":[]"#, with: #""tags":["z-tag","ready-tag","a-tag"]"#).utf8))
    let definitions = try JSONDecoder().decode([DiscoveryEntry].self, from: Data(#"[{"id":"ready-tag","name":"ready","open_task_count":1},{"id":"z-tag","name":"Zulu","open_task_count":1},{"id":"a-tag","name":"alpha","open_task_count":1}]"#.utf8))
    #expect(task.tagNames(from: definitions) == ["alpha", "ready", "Zulu"])
    #expect(task.tagNames(from: []) == ["a-tag", "ready-tag", "z-tag"])
}

@Test @MainActor func onlyNewTasksRequestTitleFocus() throws {
    let model = try fixture(Transport([]))
    let task = try #require(model.editor?.base)
    #expect(model.focusEditorTitle == false)
    model.beginEditing(task, focusTitle: true)
    #expect(model.focusEditorTitle == true)
    model.beginEditing(task)
    #expect(model.focusEditorTitle == false)
}

@Suite @MainActor struct ReviewRegressionTests {
    @Test(arguments: [false, true])
    func saveDuringConflictNeverWritesOrNavigates(hasLatest: Bool) async throws {
        let transport = Transport([])
        let model = try fixture(transport)
        let next = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON().replacingOccurrences(of: "task-1", with: "task-2").utf8))
        let latest = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON(version: 5, title: "Remote title").utf8))
        model.editor?.title = "Unsaved Conflict draft"
        model.conflict = TaskConflict(latest: hasLatest ? latest : nil, choices: ["title": true])
        #expect(model.canWrite == true)
        #expect(await model.navigate(.edit(next)) == false)
        #expect(await model.saveAndNavigate(.edit(next)) == false)
        #expect(model.editor?.id == "task-1")
        #expect(model.editor?.title == "Unsaved Conflict draft")
        #expect(model.editor?.base.row_version == 1)
        #expect(model.conflict != nil)
        #expect(model.conflict?.choices["title"] == true)
        guard case .edit(let pending) = model.pendingNavigation else { Issue.record("Missing pending row navigation"); return }
        #expect(pending.id == "task-2")
        #expect(await transport.calls == [])
    }
    @Test func dirtyRowNavigationRequiresDiscardConfirmation() async throws {
        let model = try fixture(Transport([]))
        model.editor?.title = "Unsaved local title"
        model.conflict = TaskConflict(latest: model.editor?.base, choices: ["title": true])
        let next = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON().replacingOccurrences(of: "task-1", with: "task-2").utf8))
        let accepted = await model.navigate(.edit(next))
        #expect(accepted == false)
        #expect(model.editor?.id == "task-1")
        #expect(model.editor?.title == "Unsaved local title")
        #expect(model.conflict?.choices["title"] == true)
        guard case .edit(let pending) = model.pendingNavigation else { Issue.record("Missing pending row navigation"); return }
        #expect(pending.id == "task-2")
        model.pendingNavigation = nil
        #expect(model.editor?.title == "Unsaved local title")
        await model.navigate(.edit(next))
        await model.discardAndNavigate(.edit(next))
        #expect(model.editor?.id == "task-2")
        #expect(model.editor?.title == "Base")
        #expect(model.conflict == nil)
        #expect(model.pendingNavigation == nil)
    }
    @Test func movingTheCurrentTaskReusesItsDraft() async throws {
        let transport = Transport([])
        let model = try fixture(transport)
        let task = try #require(model.editor?.base)
        model.editor?.title = "Unsaved move title"
        model.editor?.projectName = "Pending Project"
        model.editor?.tagNames = ["pending-tag"]
        #expect(await model.navigate(.move(task, to: "personal")) == false)
        #expect(model.editor?.title == "Unsaved move title")
        #expect(model.editor?.projectName == "Pending Project")
        #expect(model.editor?.tagNames == ["pending-tag"])
        #expect(await transport.calls == [])
        guard case .move(let pending, let destination) = model.pendingNavigation else { Issue.record("Missing pending Move"); return }
        #expect(pending.id == "task-1")
        #expect(destination == "personal")
        model.pendingNavigation = nil
        #expect(model.editor?.title == "Unsaved move title")
        let cleanTransport = Transport([.init(operation: "tasks.move", status: 422, json: #"{"message":"destination_rejected"}"#)])
        let clean = try fixture(cleanTransport)
        clean.showingHistory = true
        await clean.navigate(.move(try #require(clean.editor?.base), to: "personal"))
        #expect(clean.showingHistory == true)
        #expect(clean.editorError == "destination_rejected")
        #expect(await cleanTransport.calls == ["tasks.move"])
    }
    @Test func failedSaveDoesNotNavigateOrLoseDraft() async throws {
        let transport = Transport([.init(operation: "tasks.edit", status: 422, json: #"{"message":"invalid_title"}"#)])
        let model = try fixture(transport)
        let next = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON().replacingOccurrences(of: "task-1", with: "task-2").utf8))
        model.editor?.title = "Still unsaved"
        #expect(await model.navigate(.edit(next)) == false)
        #expect(await model.saveAndNavigate(.edit(next)) == false)
        #expect(model.editor?.id == "task-1")
        #expect(model.editor?.title == "Still unsaved")
        #expect(model.editorError == "invalid_title")
        #expect(await transport.calls == ["tasks.edit"])
    }
    @Test func profileSwitchPreservesTheDraftUntilDiscard() async throws {
        let model = try fixture(Transport([]))
        model.editor?.title = "Profile draft"
        #expect(await model.navigate(.profile("personal")) == false)
        #expect(model.profile == "work")
        #expect(model.editor?.title == "Profile draft")
        model.pendingNavigation = nil
        #expect(model.editor?.title == "Profile draft")
    }
    @Test func deletingAnotherRowKeepsTheInspectorDraft() async throws {
        let otherJSON = taskJSON(deleted: true).replacingOccurrences(of: "task-1", with: "task-2")
        let transport = Transport([.init(operation: "tasks.delete", status: 200, json: otherJSON)])
        let model = try fixture(transport)
        model.editor?.title = "Draft for another Task"
        model.conflict = TaskConflict(latest: model.editor?.base)
        await model.deleteTask(try JSONDecoder().decode(TaskSnapshot.self, from: Data(otherJSON.utf8)))
        #expect(model.editor?.id == "task-1")
        #expect(model.editor?.title == "Draft for another Task")
        #expect(model.conflict?.latest?.id == "task-1")
    }
    @Test func deletingTheOpenTaskClosesItWithNotice() async throws {
        let transport = Transport([.init(operation: "tasks.delete", status: 200, json: taskJSON(deleted: true))])
        let model = try fixture(transport)
        await model.deleteTask(try #require(model.editor?.base))
        #expect(model.editor == nil)
        #expect(model.conflict == nil)
        #expect(model.deletionNotice == "Task deleted")
    }
    @Test func deletingAnotherConflictingRowLeavesInspectorErrorsAlone() async throws {
        let otherJSON = taskJSON().replacingOccurrences(of: "task-1", with: "task-2")
        let transport = Transport([.init(operation: "tasks.delete", status: 409, json: #"{"_tag":"Conflict","latest":\#(otherJSON)}"#)])
        let model = try fixture(transport)
        model.editorError = "Existing editor warning"
        model.editor?.title = "Inspector draft"
        await model.deleteTask(try JSONDecoder().decode(TaskSnapshot.self, from: Data(otherJSON.utf8)))
        #expect(model.editor?.id == "task-1")
        #expect(model.editor?.title == "Inspector draft")
        #expect(model.editorError == "Existing editor warning")
        #expect(model.message == "The task changed before it could be deleted.")
        #expect(model.deletionNotice == nil)
    }
    @Test func addAndEditKeepsAnExistingDirtyDraftUntilNavigationChoice() async throws {
        let createdJSON = taskJSON(title: "Created Task").replacingOccurrences(of: "task-1", with: "task-2")
        let transport = Transport([
            .init(operation: "reads.quickAdd", status: 200, json: #"{"title":"Created Task","due_at":null,"scheduled_at":null,"priority":"P3","tags":[],"project":null}"#),
            .init(operation: "tasks.create", status: 200, json: createdJSON)
        ])
        let model = try fixture(transport)
        model.editor?.title = "Existing unsaved Task"
        model.newTitle = "Created Task"
        #expect(await model.create(openEditor: true) == true)
        #expect(model.editor?.id == "task-1")
        #expect(model.editor?.title == "Existing unsaved Task")
        guard case .edit(let created) = model.pendingNavigation else { Issue.record("Missing navigation to newly created Task"); return }
        #expect(created.id == "task-2")
        #expect(created.title == "Created Task")
    }
    @Test func menuBarAppearanceUsesStoredPreferenceAndKeepsOverride() {
        var configuration = ClientConfiguration(server: URL(string: "http://127.0.0.1:4310")!, initialProfile: "work", vaultService: "unused")
        #expect(configuration.resolvedColorScheme(storedAppearance: "Dark") == .dark)
        #expect(configuration.resolvedColorScheme(storedAppearance: "Light") == .light)
        #expect(configuration.resolvedColorScheme(storedAppearance: "System") == nil)
        configuration.appearance = "Light"
        #expect(configuration.resolvedColorScheme(storedAppearance: "Dark") == .light)
    }
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveNavigationSaveDiscardAndDelete() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let source = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "W07 source"))).ok.body.json)
    let destination = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "W07 destination task"))).ok.body.json)
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    model.signedIn = true
    model.connection = .live
    model.beginEditing(source)
    model.editor?.title = "W07 saved before selection"
    #expect(await model.navigate(.edit(destination)) == false)
    #expect(model.editor?.id == source.id)
    #expect(await model.saveAndNavigate(.edit(destination)) == true)
    #expect(model.editor?.id == destination.id)
    let saved = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: "work", task: source.id)).ok.body.json)
    #expect(saved.title == "W07 saved before selection")
    #expect(saved.row_version == 2)
    await model.navigate(.edit(saved))
    model.editor?.title = "W07 saved before Move"
    #expect(await model.navigate(.move(saved, to: "personal")) == false)
    #expect(await model.saveAndNavigate(.move(saved, to: "personal")) == true)
    #expect(model.profile == "work")
    #expect(model.editor == nil)
    #expect(model.transferResult?.task.row_version == 4)
    #expect(await model.openTransferredTask())
    #expect(model.profile == "personal")
    #expect(model.editor?.base.row_version == 4)
    #expect(model.editor?.title == "W07 saved before Move")
    model.editor?.title = "W07 discarded Profile draft"
    #expect(await model.navigate(.profile("work")) == false)
    model.pendingNavigation = nil
    #expect(model.profile == "personal")
    #expect(model.editor?.title == "W07 discarded Profile draft")
    await model.navigate(.profile("work"))
    await model.discardAndNavigate(.profile("work"))
    #expect(model.profile == "work")
    #expect(model.editor == nil)
    for _ in 0..<500 {
        if model.connection == .live { break }
        try await Task.sleep(for: .milliseconds(10))
    }
    #expect(model.connection == .live)
    let moved = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: "personal", task: source.id)).ok.body.json)
    #expect(moved.title == "W07 saved before Move")
    #expect(moved.row_version == 4)
    model.beginEditing(destination)
    model.editor?.title = "W07 keep this draft after another Delete"
    let other = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "W07 other deleted"))).ok.body.json)
    await model.deleteTask(other)
    #expect(model.editor?.id == destination.id)
    #expect(model.editor?.title == "W07 keep this draft after another Delete")
    #expect(model.deletionNotice == nil)
    await model.deleteTask(destination)
    #expect(model.editor == nil)
    #expect(model.deletionNotice == "Task deleted")
    let receipt = ["movedTask": source.id, "otherDeletedTask": other.id, "openDeletedTask": destination.id]
    let path = try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])
    try JSONSerialization.data(withJSONObject: receipt, options: [.sortedKeys]).write(to: URL(fileURLWithPath: path).deletingLastPathComponent().appendingPathComponent("navigation-http.json"))
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveMetadataQuickAddAndEditorSurviveReloadAndReachSecondClient() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    func clientModel() -> TodoModel {
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused.u01.metadata"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
        model.signedIn = true
        model.connection = .live
        return model
    }
    let model = clientModel()
    let observer = clientModel()
    observer.connect()
    defer {
        observer.signedIn = false
        observer.connect()
        model.signedIn = false
        model.connect()
    }
    var matrix: [[String: Any]] = []
    for (entry, project, tag) in [("window", "Window Project", "window focus"), ("menu bar", "Menu Project", "menu focus"), ("compact", "Compact Project", "compact focus")] {
        for existing in [false, true] {
            let title = "U01 \(entry) \(existing ? "existing" : "new")"
            model.newTitle = "\(title) #\"\(tag)\" #ready @\"\(project)\" p1"
            #expect(await model.create(openEditor: true))
            let task = try #require(model.editor?.base)
            #expect(task.title == title)
            #expect(task.priority == "P1")
            #expect(model.projects.first { $0.id == task.project_id }?.name == project)
            #expect(task.tagNames(from: model.tags) == [tag, "ready"].sorted())
            let reload = try await todoClient(server: server, credential: session.credential).tasks_period_show(path: .init(profile: "work", task: task.id)).ok.body.json
            #expect(try TaskSnapshot.decode(reload) == task)
            matrix.append(["entry": entry, "path": "quick-add", "names": existing ? "existing" : "new", "task": task.id, "project": project, "tags": [tag, "ready"].sorted(), "version": 1])
            let editorProject = "\(project) Editor"
            let editorTag = "\(tag) editor"
            model.editor?.addMetadata(.project, name: editorProject, projects: model.projects, tags: model.tags)
            model.editor?.addMetadata(.tag, name: editorTag, projects: model.projects, tags: model.tags)
            let edited = try #require(await model.save())
            #expect(edited.row_version == 2)
            #expect(model.projects.first { $0.id == edited.project_id }?.name == editorProject)
            #expect(edited.tagNames(from: model.tags) == [tag, editorTag, "ready"].sorted())
            let editorReload = try await todoClient(server: server, credential: session.credential).tasks_period_show(path: .init(profile: "work", task: edited.id)).ok.body.json
            #expect(try TaskSnapshot.decode(editorReload) == edited)
            matrix.append(["entry": entry, "path": "add-and-edit controls", "names": existing ? "existing" : "new", "task": edited.id, "project": editorProject, "tags": [tag, editorTag, "ready"].sorted(), "version": 2])
            model.editor = nil
        }
    }
    let base = try #require(model.tasks.first { $0.title == "U01 window new" })
    model.beginEditing(base)
    model.editor?.title = "Literal title @literal #821"
    model.editor?.addMetadata(.project, name: "Editor Project", projects: model.projects, tags: model.tags)
    model.editor?.addMetadata(.tag, name: "editor tag", projects: model.projects, tags: model.tags)
    model.editor?.addMetadata(.tag, name: "second tag", projects: model.projects, tags: model.tags)
    let newlyNamed = try #require(await model.save())
    #expect(newlyNamed.title == "Literal title @literal #821")
    #expect(newlyNamed.row_version == 3)
    #expect(model.projects.first { $0.id == newlyNamed.project_id }?.name == "Editor Project")
    #expect(newlyNamed.tagNames(from: model.tags) == ["editor tag", "ready", "second tag", "window focus", "window focus editor"])
    let newReload = try await todoClient(server: server, credential: session.credential).tasks_period_show(path: .init(profile: "work", task: newlyNamed.id)).ok.body.json
    #expect(try TaskSnapshot.decode(newReload) == newlyNamed)
    matrix.append(["entry": "editor", "path": "existing Task controls", "names": "new", "task": newlyNamed.id, "project": "Editor Project", "tags": ["editor tag", "ready", "second tag", "window focus", "window focus editor"], "version": 3])
    model.beginEditing(newlyNamed)
    model.editor?.addMetadata(.project, name: "Window Project", projects: model.projects, tags: model.tags)
    model.editor?.addMetadata(.tag, name: "menu focus", projects: model.projects, tags: model.tags)
    let saved = try #require(await model.save())
    #expect(saved.row_version == 4)
    #expect(model.projects.first { $0.id == saved.project_id }?.name == "Window Project")
    #expect(saved.tagNames(from: model.tags) == ["editor tag", "menu focus", "ready", "second tag", "window focus", "window focus editor"])
    matrix.append(["entry": "editor", "path": "existing Task controls", "names": "existing", "task": saved.id, "project": "Window Project", "tags": ["editor tag", "menu focus", "ready", "second tag", "window focus", "window focus editor"], "version": 4])
    for _ in 0..<100 {
        if observer.tasks.first(where: { $0.id == saved.id })?.row_version == 4 { break }
        try await Task.sleep(for: .milliseconds(50))
    }
    #expect(observer.tasks.first { $0.id == saved.id } == saved)
    #expect(observer.projects.first { $0.id == saved.project_id }?.name == "Window Project")
    #expect(observer.tasks.first { $0.id == saved.id }?.tagNames(from: observer.tags) == ["editor tag", "menu focus", "ready", "second tag", "window focus", "window focus editor"])
    let reloaded = try await todoClient(server: server, credential: session.credential).tasks_period_show(path: .init(profile: "work", task: saved.id)).ok.body.json
    #expect(try TaskSnapshot.decode(reloaded) == saved)
    let path = try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])
    try JSONSerialization.data(withJSONObject: ["matrix": matrix, "editedTask": saved.id, "project": "Window Project", "tags": ["editor tag", "menu focus", "ready", "second tag", "window focus", "window focus editor"], "version": 4], options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).deletingLastPathComponent().appendingPathComponent("metadata-http.json"))
}

@Test func editorMetadataActionsKeepTheirKindAndReuseExistingNames() throws {
    let base = try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON().utf8))
    let projects = [DiscoveryEntry(id: "existing-project", name: "Client Project", open_task_count: 1, inbox_task_count: nil)]
    let tags = [DiscoveryEntry(id: "existing-tag", name: "deep focus", open_task_count: 1, inbox_task_count: nil)]
    var draft = TaskDraft(base)
    draft.addMetadata(.project, name: "  New Project  ", projects: projects, tags: tags)
    draft.addMetadata(.tag, name: "  NEW TAG  ", projects: projects, tags: tags)
    #expect(draft.projectName == "New Project")
    #expect(draft.tagNames == ["new tag"])
    draft.addMetadata(.project, name: "Client Project", projects: projects, tags: tags)
    draft.addMetadata(.tag, name: "DEEP FOCUS", projects: projects, tags: tags)
    draft.addMetadata(.tag, name: "deep focus", projects: projects, tags: tags)
    #expect(draft.project == "existing-project")
    #expect(draft.projectName == nil)
    #expect(draft.tags == ["existing-tag"])
    #expect(draft.tagNames == ["new tag"])
}

@Test func generatedMetadataContractPreservesMultiWordNamesAndNullProject() throws {
    let json = #"{"from_version":2,"changes":{"project_id":null,"project_name":"Client Project","tags":[],"tag_names":["deep focus","ready"]}}"#
    let value = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(json.utf8))
    let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? NSDictionary
    #expect(encoded == ["from_version": 2, "changes": ["project_id": NSNull(), "project_name": "Client Project", "tags": [], "tag_names": ["deep focus", "ready"]]] as NSDictionary)
}

@Test @MainActor func copyConflictPreservesDraftAndUsesCurrentVersion() async throws {
    let transport = Transport([
        .init(operation: "tasks.copy", status: 409, json: #"{"_tag":"Conflict","latest":\#(taskJSON(version: 4, title: "Remote"))}"#),
        .init(operation: "tasks.copy", status: 422, json: #"{"message":"destination_rejected"}"#)
    ])
    let model = try fixture(transport)
    model.editor?.title = "Copy local draft"
    await model.write(.copy("personal"))
    #expect(model.editor?.title == "Copy local draft")
    #expect(model.conflict?.latest?.row_version == 4)
    await model.resolveConflict()
    #expect(model.editor?.title == "Copy local draft")
    #expect(model.editorError == "destination_rejected")
    let bodies = await transport.bodies
    #expect(try JSONSerialization.jsonObject(with: Data(bodies[0].utf8)) as? NSDictionary == ["from_version": 1, "destination_profile": "personal"] as NSDictionary)
    #expect(try JSONSerialization.jsonObject(with: Data(bodies[1].utf8)) as? NSDictionary == ["from_version": 4, "destination_profile": "personal"] as NSDictionary)
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveCopyKeepsSourceAndOtherTasks() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let other = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "C10 unrelated Swift Task"))).ok.body.json)
    var sourcePayload = Operations.tasks_period_create.Input.Body.jsonPayload(title: "C10 Swift copy", project_name: "C10 Project", tag_names: ["c10-tag"])
    sourcePayload.external_id = "c11:copy-source"
    let sourceWire = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(sourcePayload)).ok.body.json
    let source = try TaskSnapshot.decode(sourceWire)
    let completed = try await TaskSnapshot.decode(client.tasks_period_transition(path: .init(profile: "work", task: source.id), body: .json(.init(from_version: 1, action: .complete))).ok.body.json)
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    model.signedIn = true; model.connection = .live
    model.beginEditing(completed)
    await model.write(.copy("personal"))
    #expect(model.editorError == nil)
    #expect(model.profile == "work")
    #expect(model.editor?.id == source.id)
    let copied = try #require(model.transferResult?.task)
    #expect(copied.id != source.id)
    #expect(copied.profile_id == "personal")
    #expect(copied.status == "done")
    #expect(copied.external_id == nil)
    #expect(completed.external_id == "c11:copy-source")
    let copiedWire = try await client.tasks_period_show(path: .init(profile: "personal", task: copied.id)).ok.body.json
    #expect(copiedWire.created_at == sourceWire.created_at)
    #expect(copied.row_version == 1)
    let sourceAfter = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: "work", task: source.id)).ok.body.json)
    let otherAfter = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: "work", task: other.id)).ok.body.json)
    #expect(sourceAfter == completed)
    #expect(otherAfter == other)
    let history = try await client.reads_period_history(path: .init(profile: "personal", task: copied.id)).ok.body.json
    let entries = try JSONDecoder().decode([HistoryEntry].self, from: JSONEncoder().encode(history))
    #expect(entries.first?.label == "Copied from Work / \(source.id)")
    func waitForReload() async throws {
        for _ in 0..<500 {
            if model.connection == .live && !model.loading { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        Issue.record("Profile did not reload")
    }
    try await waitForReload()
    #expect(model.tasks.first { $0.id == source.id } == completed)
    #expect(model.tasks.first { $0.id == other.id } == other)
    #expect(await model.openTransferredTask())
    try await waitForReload()
    #expect(model.profile == "personal")
    #expect(model.tasks.first { $0.id == copied.id }?.title == "C10 Swift copy")
    #expect(model.projects.first { $0.id == copied.project_id }?.name == "C10 Project")
    #expect(copied.tagNames(from: model.tags) == ["c10-tag"])
    model.editor = nil; model.changeProfile("work")
    try await waitForReload()
    #expect(model.tasks.first { $0.id == source.id } == completed)
    #expect(model.tasks.first { $0.id == other.id } == other)
    model.beginEditing(completed)
    await model.write(.move("personal"))
    #expect(model.editorError == nil)
    try await waitForReload()
    #expect(model.profile == "work")
    #expect(model.editor == nil)
    #expect(model.tasks.contains { $0.id == source.id } == false)
    #expect(model.transferResult?.message == "Task moved to Personal")
    #expect(await model.openTransferredTask())
    try await waitForReload()
    #expect(model.profile == "personal")
    #expect(model.tasks.first { $0.id == source.id }?.title == "C10 Swift copy")
    #expect(model.tasks.first { $0.id == source.id }?.status == "done")
    #expect(model.tasks.first { $0.id == source.id }?.row_version == 3)
    #expect(model.tasks.first { $0.id == source.id }?.project_id == copied.project_id)
    #expect(model.tasks.first { $0.id == source.id }?.tags == copied.tags)
    model.editor = nil; model.changeProfile("work")
    try await waitForReload()
    #expect(model.tasks.contains { $0.id == source.id } == false)
    #expect(model.tasks.first { $0.id == other.id } == other)
    if let receipt = ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"] {
        let output = URL(fileURLWithPath: receipt).deletingLastPathComponent().appendingPathComponent("c10-transfer-http.json")
        try JSONSerialization.data(withJSONObject: ["moved": source.id, "copied": copied.id, "other": other.id], options: [.prettyPrinted, .sortedKeys]).write(to: output)
    }
    model.editor = nil
    model.changeProfile("personal")
    try await waitForReload()
    model.signedIn = false
}

@Test @MainActor func acceptedCopyStaysInSourceProfile() async throws {
    let copied = taskJSON(profile: "personal", title: "Base").replacingOccurrences(of: "task-1", with: "copied-1")
    let transport = Transport([.init(operation: "tasks.copy", status: 200, json: copied)])
    let model = try fixture(transport)
    await model.write(.copy("personal"))
    #expect(model.profile == "work")
    #expect(model.editor?.id == "task-1")
    #expect(model.transferResult?.task.id == "copied-1")
    #expect(model.transferResult?.message == "Task copied to personal")
    #expect(await model.openTransferredTask())
    #expect(model.profile == "personal")
    #expect(model.editor?.id == "copied-1")
}

@Test @MainActor func acceptedMoveStaysInSourceProfileAndReturnsToList() async throws {
    let transport = Transport([.init(operation: "tasks.move", status: 200, json: taskJSON(version: 2, profile: "personal"))])
    let model = try fixture(transport)
    await model.write(.move("personal"))
    #expect(model.profile == "work")
    #expect(model.editor == nil)
}

@Test @MainActor func cancellingTransferConflictPreservesSourceDraft() async throws {
    let transport = Transport([.init(operation: "tasks.copy", status: 409, json: #"{"_tag":"Conflict","latest":\#(taskJSON(version: 4, title: "Remote"))}"#)])
    let model = try fixture(transport)
    model.editor?.title = "Local source draft"
    await model.write(.copy("personal"))
    #expect(model.editorError == nil)
    model.cancelTransferConflict()
    #expect(model.conflict == nil)
    #expect(model.writeIntent == nil)
    #expect(model.editor?.title == "Local source draft")
    #expect(model.profile == "work")
    #expect(await transport.calls == ["tasks.copy"])
}

@Test @MainActor func externalIdMoveValidationKeepsFocusedTransferAndDraft() async throws {
    let message = "\"Personal\" already has a Task with external id \"repo:move\". Choose another Profile."
    let body = try JSONSerialization.data(withJSONObject:["message":message])
    let transport = Transport([.init(operation:"tasks.move",status:422,json:String(decoding:body,as:UTF8.self))])
    let model = try fixture(transport)
    model.editor?.title = "Keep my local draft"
    await model.write(.move("personal"))
    #expect(model.editorError == message)
    #expect(model.writeIntent?.transfer?.kind == .move)
    #expect(model.conflict == nil)
    #expect(model.editor?.title == "Keep my local draft")
    #expect(model.editor?.base.row_version == 1)
    model.chooseAnotherTransferProfile()
    #expect(model.transferRequest?.kind == .move)
    #expect(model.transferRequest?.task.id == model.editor?.id)
    #expect(model.writeIntent == nil)
    #expect(model.editorError == nil)
    #expect(model.editor?.title == "Keep my local draft")
}


@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveExternalIdMoveRejectionPreservesBothProfiles() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    var payload = Operations.tasks_period_create.Input.Body.jsonPayload(title: "C11 move source")
    payload.external_id = "c11:move-clash"
    let source = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: "work"), body: .json(payload)).ok.body.json)
    payload.title = "C11 keep target"
    let target = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: "personal"), body: .json(payload)).ok.body.json)
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-c11-transfer"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    model.signedIn = true; model.connection = .live
    model.beginEditing(source)
    model.editor?.title = "Keep the unsaved source draft"
    await model.write(.move("personal"))
    #expect(model.editorError == "\"Personal\" already has a Task with external id \"c11:move-clash\". Choose another Profile.")
    #expect(model.writeIntent?.transfer?.kind == .move)
    #expect(model.conflict == nil)
    #expect(model.editor?.title == "Keep the unsaved source draft")
    let sourceAfter = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: "work", task: source.id)).ok.body.json)
    let targetAfter = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: "personal", task: target.id)).ok.body.json)
    #expect(sourceAfter == source)
    #expect(targetAfter == target)
    let history = try await client.reads_period_history(path: .init(profile: "work", task: source.id)).ok.body.json
    let entries = try JSONDecoder().decode([HistoryEntry].self, from: JSONEncoder().encode(history))
    #expect(entries.filter { $0.reason == "external_id_conflict" }.count == 1)
    model.chooseAnotherTransferProfile()
    #expect(model.transferRequest?.kind == .move)
    #expect(model.transferRequest?.task == source)
    #expect(model.editor?.title == "Keep the unsaved source draft")
    #expect(model.editorError == nil)
    model.transferRequest = nil
    model.writeIntent = .move("personal")
    model.cancelTransferConflict()
    #expect(model.writeIntent == nil)
    #expect(model.editor?.title == "Keep the unsaved source draft")
}

@Test @MainActor func profileDeletionRequiresExplicitTaskStepAndKeepsRefusal() async throws {
    let transport = Transport([.init(operation: "reads.deleteProfile", status: 422, json: #"{"generated_at":"2026-10-29T00:00:00Z","code":"profile_not_empty","message":"Profile has 1 visible Task; use --with-tasks","details":{"visible_task_count":1}}"#)])
    let model = try fixture(transport)
    model.editor = nil
    model.profiles = [DiscoveryEntry(id: "work", name: "Work", open_task_count: 1, inbox_task_count: 1, visible_task_count: 1), DiscoveryEntry(id: "personal", name: "Personal", open_task_count: 0, inbox_task_count: 0, visible_task_count: 0)]
    model.beginProfileDeletion()
    #expect(model.profileDeletion?.name == "Work")
    #expect(model.profileDeletion?.count == 1)
    #expect(model.profileDeletion?.deleteTasks == false)
    await model.deleteProfile()
    #expect(model.profileDeletionError == "\"Work\" has 1 Task. Delete it too, or move it to another Profile first.")
    #expect(model.profile == "work")
    #expect(model.busy == false)
    let bodies = await transport.bodies
    #expect(try JSONSerialization.jsonObject(with: Data(bodies[0].utf8)) as? NSDictionary == ["with_tasks": false, "dry_run": false] as NSDictionary)
    model.profileDeletion?.deleteTasks = true
    #expect(model.profileDeletion?.title == "Delete \"Work\" and its Task?")
    #expect(model.profileDeletion?.actionTitle == "Delete Profile and Task")
}

@Test @MainActor func disappearedProfileSwitchesAndClearsUnavailableEditor() async throws {
    let transport = Transport([.init(operation: "reads.profiles", status: 200, json: #"[{"id":"personal","name":"Personal","created_at":"2026-10-29T00:00:00Z","updated_at":"2026-10-29T00:00:00Z","open_task_count":0,"inbox_task_count":0,"visible_task_count":0}]"#)])
    let model = try fixture(transport)
    model.signedIn = false
    model.profileDeletion = ProfileDeletionPrompt(name: "Work", count: 1)
    try await model.leaveDeletedProfile(named: "Work")
    #expect(model.profile == "personal")
    #expect(model.editor == nil)
    #expect(model.tasks.isEmpty)
    #expect(model.profiles.map(\.id) == ["personal"])
    #expect(model.profileDeletion == nil)
    #expect(model.deletionNotice == "\"Work\" was deleted. Switched to Personal.")
    #expect(model.message == nil)
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_F10_CLI"] != nil)) @MainActor
func profileDeletionAgainstCompiledScratchServerAndReload() async throws {
    let environment = ProcessInfo.processInfo.environment
    let server = try #require(environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let binary = try #require(environment["TODO_F10_CLI"])
    func cli(_ arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binary)
        process.arguments = arguments
        process.environment = environment
        process.standardOutput = Pipe()
        process.standardError = Pipe()
        try process.run()
        process.waitUntilExit()
        #expect(process.terminationStatus == 0)
    }
    for name in ["f10-empty", "f10-tasks", "f10-external"] { try cli(["init", "--profile", name]) }
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let task = try await client.tasks_period_create(path: .init(profile: "f10-tasks"), body: .json(.init(title: "F10 recover from Snapshot"))).ok.body.json
    func model(_ profile: String) -> TodoModel {
        let value = TodoModel(configuration: .init(server: server, initialProfile: profile, vaultService: "f10-never-used"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
        value.signedIn = true
        value.connection = .live
        return value
    }
    func discover(_ value: TodoModel) async throws {
        let values = try await client.reads_period_profiles().ok.body.json
        value.profiles = try JSONDecoder().decode([DiscoveryEntry].self, from: JSONEncoder().encode(values))
    }
    func wait(_ condition: () -> Bool) async throws {
        for _ in 0..<500 { if condition() { return }; try await Task.sleep(for: .milliseconds(20)) }
        #expect(condition())
    }
    let empty = model("f10-empty")
    try await discover(empty)
    empty.beginProfileDeletion()
    #expect(empty.profileDeletion?.count == 0)
    await empty.deleteProfile()
    #expect(empty.profileDeletionError == nil)
    #expect(empty.profile != "f10-empty")
    #expect(!empty.profiles.contains { $0.id == "f10-empty" })
    empty.signedIn = false
    empty.changeProfile("personal")

    let populated = model("f10-tasks")
    try await discover(populated)
    populated.beginProfileDeletion()
    #expect(populated.profileDeletion?.count == 1)
    await populated.deleteProfile()
    #expect(populated.profile == "f10-tasks")
    #expect(populated.profileDeletionError == "\"f10-tasks\" has 1 Task. Delete it too, or move it to another Profile first.")
    let stillVisible = try await client.tasks_period_list(path: .init(profile: "f10-tasks")).ok.body.json
    #expect(stillVisible.map(\.id) == [task.id])
    populated.profileDeletion?.deleteTasks = true
    await populated.deleteProfile()
    #expect(populated.profile != "f10-tasks")
    #expect(!populated.profiles.contains { $0.id == "f10-tasks" })
    populated.signedIn = false
    populated.changeProfile("personal")

    let watching = model("f10-external")
    watching.connect()
    try await wait { watching.connection == .live && watching.profiles.contains { $0.id == "f10-external" } }
    watching.beginProfileDeletion()
    #expect(watching.profileDeletion?.count == 0)
    _ = try await client.reads_period_deleteProfile(path: .init(profile: "f10-external"), body: .json(.init(with_tasks: false, dry_run: false))).ok.body.json
    try await wait { watching.profile != "f10-external" && watching.connection == .live }
    #expect(watching.profileDeletion == nil)
    #expect(watching.deletionNotice == "\"f10-external\" was deleted. Switched to Personal.")
    #expect(watching.signedIn)
    #expect(!watching.profiles.contains { $0.id == "f10-external" })
    watching.signedIn = false
    watching.changeProfile("personal")

    let reloaded = model("f10-external")
    reloaded.connect()
    try await wait { reloaded.profile != "f10-external" && reloaded.connection == .live }
    #expect(!reloaded.profiles.contains { $0.id == "f10-empty" || $0.id == "f10-tasks" || $0.id == "f10-external" })
    #expect(reloaded.signedIn)
    let receipt: [String: Any] = ["emptyDeleted": true, "refusedNonEmpty": true, "deletedWithTasks": true, "sseSwitch": true, "reload": true, "deletedTask": task.id, "deletedProfiles": ["f10-empty", "f10-tasks", "f10-external"]]
    let path = try #require(environment["TODO_W06_RECEIPT"]).replacingOccurrences(of: "http-receipt.json", with: "profile-deletion-http.json")
    try JSONSerialization.data(withJSONObject: receipt, options: .prettyPrinted).write(to: URL(fileURLWithPath: path))
    reloaded.signedIn = false
    reloaded.changeProfile("personal")
}

private actor HeldProfileDiscovery: ClientTransport {
    private var response: CheckedContinuation<Void, Never>?
    private var ready: CheckedContinuation<Void, Never>?
    private var requested = false
    func waitUntilRequested() async {
        if requested { return }
        await withCheckedContinuation { ready = $0 }
    }
    func release() { response?.resume(); response = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        #expect(operationID == "reads.profiles")
        await withCheckedContinuation { response = $0; requested = true; ready?.resume(); ready = nil }
        return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(#"[{"id":"personal","name":"Personal","created_at":"2026-10-29T00:00:00Z","updated_at":"2026-10-29T00:00:00Z","open_task_count":0,"inbox_task_count":0,"visible_task_count":0}]"#))
    }
}

@Test @MainActor func staleProfileDeletionDiscoveryCannotOverrideNewSelectionOrEditor() async throws {
    for scenario in ["switch", "roundtrip", "cancel"] {
        let transport = HeldProfileDiscovery()
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-headless"), clientFactory: { url, _ in
            Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: "")])
        })
        let pending = Task { try await model.leaveDeletedProfile() }
        await transport.waitUntilRequested()
        if scenario == "cancel" { pending.cancel() } else {
            model.changeProfile("other")
            if scenario == "roundtrip" { model.changeProfile("work") }
        }
        model.beginEditing(try JSONDecoder().decode(TaskSnapshot.self, from: Data(taskJSON(title: "Keep this draft").utf8)))
        await transport.release()
        try await pending.value
        #expect(model.profile == (scenario == "switch" ? "other" : "work"))
        #expect(model.editor?.title == "Keep this draft")
        #expect(model.deletionNotice == nil)
        #expect(model.profiles.isEmpty)
    }
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func compactFormattingSurvivesModelSaveAndReload() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let created = try TaskSnapshot.decode(await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "U02 Compact formatting"))).ok.body.json)
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    model.signedIn = true
    model.connection = .live
    model.beginEditing(created)
    model.editor?.due = TaskTime(kind: "instant", utc: "2026-10-28T14:00:00Z", time_zone: "America/Bogota")
    model.editor?.scheduled = TaskTime(kind: "date", date: "2026-10-29")
    await model.save()
    #expect(model.editor?.id == nil)
    let reloaded = try TaskSnapshot.decode(await client.tasks_period_show(path: .init(profile: "work", task: created.id)).ok.body.json)
    model.beginEditing(reloaded)
    let accepted = try #require(model.editor?.base)
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/Bogota")!
    let row = TaskRowPresentation(task: accepted, tagNames: [], now: ISO8601DateFormatter().date(from: "2026-10-28T15:00:00Z")!, locale: Locale(identifier: "en_US"), calendar: calendar)
    #expect(row.due == "Today 9:00\u{202F}AM")
    #expect(row.scheduled == "Tomorrow")
    #expect(TaskCount.text([accepted].count) == "1 task")
    #expect(accepted.title == "U02 Compact formatting")
    #expect(accepted.row_version == 2)
    try JSONSerialization.data(withJSONObject: ["version": accepted.row_version, "due": row.due ?? "", "scheduled": row.scheduled ?? "", "count": TaskCount.text(1)], options: [.sortedKeys]).write(to: URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent().appendingPathComponent("u02-formatting-http.json"))
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func compactActionErrorRetainsLoadedTasksAfterRefresh() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let created = try TaskSnapshot.decode(await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "U02 action error"))).ok.body.json)
    _ = try await client.tasks_period_transition(path: .init(profile: "work", task: created.id), body: .json(.init(from_version: created.row_version, action: .cancel))).ok.body.json
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    model.signedIn = true
    model.connection = .live
    model.selectedView = "all"
    await model.transition(created, action: "complete")
    let notice = "The Task changed. Close and reopen it before trying that action again."
    #expect(model.message == notice)
    #expect(model.taskLoadError == nil)
    #expect(model.tasks.first { $0.id == created.id }?.row_version == 2)
    model.selectView("all")
    let deadline = Date().addingTimeInterval(10)
    while model.loading && Date() < deadline { try await Task.sleep(for: .milliseconds(20)) }
    #expect(model.loading == false)
    #expect(model.message == notice)
    #expect(model.taskLoadError == nil)
    #expect(model.tasks.first { $0.id == created.id }?.status == "cancelled")
    let reloaded = try TaskSnapshot.decode(await client.tasks_period_show(path: .init(profile: "work", task: created.id)).ok.body.json)
    #expect(reloaded.row_version == 2)
    #expect(reloaded.status == "cancelled")
    try JSONSerialization.data(withJSONObject: ["version": reloaded.row_version, "status": reloaded.status, "notice": model.message ?? "", "loadError": model.taskLoadError ?? "", "loaded": model.tasks.contains { $0.id == created.id }], options: [.sortedKeys]).write(to: URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent().appendingPathComponent("u02-action-error-http.json"))
}
