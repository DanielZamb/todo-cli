import XCTest
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
#if SWIFT_PACKAGE
@testable import TodoState
#endif

final class GeneratedContractTests: XCTestCase {
    func testDiagnosticsReadPreservesNullableMetadata() async throws {
        let fixture = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("API/Fixtures/diagnostics.json")
        let data = try Data(contentsOf: fixture)
        try roundTrip(Operations.diagnostics_period_snapshot.Output.Ok.Body.jsonPayload.self, String(decoding: data, as: UTF8.self))
        let client = Client(serverURL: URL(string: "http://127.0.0.1:1")!, transport: DiagnosticsTransport(data: data))
        let response = try await client.diagnostics_period_snapshot().ok
        XCTAssertEqual(response.headers.cache_hyphen_control, .no_hyphen_store)
        XCTAssertEqual(try response.body.json.storage.tables.first?.count, 0)
        XCTAssertEqual(try response.body.json.poll_interval_ms, 1000)
        XCTAssertEqual(try response.body.json.storage.external_id_tasks, 0)
        XCTAssertEqual(try response.body.json.storage.attachments, 0)
        XCTAssertEqual(try response.body.json.storage.attachment_store_bytes, 0)
    }

    func testSnapshotRestoreContractPreservesDryRunAndProfileCounts() throws {
        try roundTrip(Operations.snapshots_period_restore.Input.Body.jsonPayload.self, #"{"dry_run":true}"#)
        try roundTrip(Operations.snapshots_period_create.Input.Body.jsonPayload.self, #"{"reason":"before import"}"#)
        try roundTrip(Operations.snapshots_period_restore.Output.Ok.Body.jsonPayload.self,
                      #"{"id":"11111111-1111-1111-1111-111111111111","dry_run":true,"seq_before":9,"seq_after":4,"seq_delta":-5,"task_counts":[{"profile":"work","name":"Work","before":2,"after":1}],"safety_snapshot":null,"generation":"initial"}"#)
    }

    func testAttachmentCommandsPreserveGeneratedPayloads() throws {
      try roundTrip(Operations.tasks_period_labelAttachment.Input.Body.jsonPayload.self, #"{"from_version":7,"attachment_id":"attachment-1","label":"jira"}"#)
      try roundTrip(Operations.tasks_period_labelAttachment.Input.Body.jsonPayload.self, #"{"from_version":8,"attachment_id":"attachment-1","label":null}"#)
        try roundTrip(Operations.tasks_period_attach.Input.Body.jsonPayload.self, #"{"from_version":3,"location":{"kind":"file","path":"/tmp/jira-draft.md"},"label":"jira"}"#)
        try roundTrip(Operations.tasks_period_detach.Input.Body.jsonPayload.self, #"{"from_version":4,"attachment_id":"attachment-1"}"#)
        try roundTrip(Operations.tasks_period_uploadAttachment.Input.Body.jsonPayload.self, #"{"from_version":5,"mime_type":"image/png","data":"iVBORw0KGgo=","label":"jira"}"#)
    }
    func testImportContractPreservesExternalIdsNullsVersionsAndReport() throws {
        try roundTrip(Operations.tasks_period_importTasks.Input.Body.jsonPayload.self,
          #"{"file_name":"repository-sync.json","items":[{"external_id":"repo:a","title":"Imported","description":null,"project_name":null,"tag_names":null,"from_version":null}],"dry_run":true,"close_missing":true,"close_missing_candidates":[{"external_id":"repo:missing","task_id":"task-2","from_version":3}]}"#)
        try roundTrip(Operations.tasks_period_importTasks.Output.Ok.Body.jsonPayload.self,
          #"{"generated_at":"2026-10-29T00:00:00Z","dry_run":false,"items":[{"external_id":"repo:a","outcome":"rejected","task_id":"task-1","from_version":1,"changed_fields":[],"error":{"code":"occ_conflict","message":"Preview again.","details":{"current_version":2}}}],"totals":{"created":0,"updated":0,"unchanged":0,"rejected":1}}"#)
    }


    func testMoveAndCopyPayloadsSurviveGeneratedCoding() throws {
        let json = #"{"from_version":7,"destination_profile":"personal"}"#
        try roundTrip(Operations.tasks_period_move.Input.Body.jsonPayload.self, json)
        try roundTrip(Operations.tasks_period_copy.Input.Body.jsonPayload.self, json)
        let task = #"{"id":"copied-1","profile_id":"personal","entity_version":1,"row_version":1,"title":"Copied","description":null,"project_id":null,"priority":"P3","scheduled_at":null,"due_at":null,"energy":null,"estimate_min":null,"source":"manual","tags":[],"status":"done","occurrence":null,"created_at":"2020-01-01T00:00:00Z","updated_at":"2026-10-29T00:00:00Z","completed_at":"2020-01-02T00:00:00Z","deleted_at":null}"#
        try roundTrip(Operations.tasks_period_copy.Output.Ok.Body.jsonPayload.self, task)
    }
    func testGeneratedStreamSendsResumeHeader() async throws {
        let client = Client(serverURL: URL(string: "http://127.0.0.1:4310")!, transport: ResumeTransport())
        _ = try await client.changes_period_stream(path: .init(profile: "work"), headers: .init(last_hyphen_event_hyphen_id: "42", x_hyphen_todo_hyphen_client: .swiftui, x_hyphen_todo_hyphen_generation: "restore-generation")).ok
    }
    func testEveryCreateFieldSurvivesGeneratedCoding() throws {
        let json = #"{"title":"All fields","description":"Notes","project_id":null,"priority":"P2","scheduled_at":{"kind":"date","date":"2026-10-27"},"due_at":{"kind":"instant","utc":"2026-10-27T15:00:00Z","time_zone":"America/Bogota"},"energy":4,"estimate_min":25,"source":"manual","tags":["tag-1"]}"#
        try roundTrip(Operations.tasks_period_create.Input.Body.jsonPayload.self, json)
    }

    func testEditDistinguishesOmittedAndExplicitNullFields() throws {
        try roundTrip(Operations.tasks_period_edit.Input.Body.jsonPayload.self,
                      #"{"from_version":7,"changes":{"title":"Only title"}}"#)
        try roundTrip(Operations.tasks_period_edit.Input.Body.jsonPayload.self,
                      #"{"from_version":7,"changes":{"description":null,"project_id":null,"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null}}"#)
        try roundTrip(Operations.tasks_period_edit.Input.Body.jsonPayload.self,
                      #"{"from_version":7,"changes":{"title":"Edited","description":"Notes","project_id":"project-1","priority":"P1","scheduled_at":{"kind":"instant","utc":"2026-10-27T12:00:00Z","time_zone":"America/Bogota"},"due_at":{"kind":"date","date":"2026-10-28"},"energy":2,"estimate_min":45,"tags":["tag-1"]}}"#)
    }

    func testProjectAndTagNamesSurviveGeneratedCoding() throws {
        try roundTrip(Operations.tasks_period_create.Input.Body.jsonPayload.self,
                      #"{"title":"Names","project_name":"Launch","tag_names":["Focus","ready"]}"#)
        try roundTrip(Operations.tasks_period_edit.Input.Body.jsonPayload.self,
                      #"{"from_version":2,"changes":{"project_name":"","tag_names":[]}}"#)
        try roundTrip(Operations.tasks_period_createSeries.Input.Body.jsonPayload.self,
                      #"{"task":{"title":"Series","project_name":"Launch","tag_names":["focus"]},"recurrence":{"dtstart":{"kind":"date","date":"2026-10-28"},"rrule":"FREQ=DAILY","exdate":[]}}"#)
        try roundTrip(Operations.tasks_period_editSeries.Input.Body.jsonPayload.self,
                      #"{"from_version":2,"changes":{"project_name":"Launch","tag_names":["focus"]},"recurrence":{"dtstart":{"kind":"date","date":"2026-10-28"},"rrule":"FREQ=DAILY","exdate":[]}}"#)
    }

    func testMultiWordNamesAndNullProjectSurviveGeneratedCoding() throws {
        try roundTrip(Operations.tasks_period_create.Input.Body.jsonPayload.self,
                      #"{"title":"Names","project_name":"Client Project","tag_names":["deep focus","ready"]}"#)
        try roundTrip(Operations.tasks_period_edit.Input.Body.jsonPayload.self,
                      #"{"from_version":2,"changes":{"project_id":null,"project_name":"Client Project","tags":[],"tag_names":["deep focus","ready"]}}"#)
    }

    func testResponseAndNestedNullableOccurrenceSurviveGeneratedCoding() throws {
        let json = #"{"id":"task-1","profile_id":"work","entity_version":1,"row_version":7,"title":"Nested fields","description":null,"project_id":null,"priority":"P3","scheduled_at":null,"due_at":{"kind":"date","date":"2026-10-28"},"energy":null,"estimate_min":null,"source":"manual","tags":[],"status":"open","occurrence":{"id":"occ-1","series_id":"series-1","date":"2026-10-27","time":null},"created_at":"2026-10-27T00:00:00Z","updated_at":"2026-10-27T00:00:00Z","completed_at":null,"deleted_at":null}"#
        try roundTrip(Operations.tasks_period_create.Output.Ok.Body.jsonPayload.self, json)
        try roundTrip(Operations.tasks_period_edit.Output.Ok.Body.jsonPayload.self, json)
        try roundTrip(Operations.tasks_period_show.Output.Ok.Body.jsonPayload.self, json)
    }

    func testGeneratedClientPreservesNullableFieldsOverScratchHTTP() async throws {
        let url: URL
        if let address = ProcessInfo.processInfo.environment["TODO_W06_SERVER"], let server = URL(string: address) {
            url = server
        } else {
#if SWIFT_PACKAGE
            throw XCTSkip("Requires the compiled scratch server")
#else
            guard ProcessInfo.processInfo.environment["TODO_VERIFY_NATIVE_UI"] == "1" else { throw XCTSkip("Requires a compiled scratch server") }
            let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            let config = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: root.appendingPathComponent("DerivedData/verification.json")))
            url = try XCTUnwrap(URL(string: try XCTUnwrap(config["server"])))
#endif
        }
        let anonymous = todoClient(server: url, credential: "")
        let session = try await anonymous.signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let client = todoClient(server: url, credential: session.credential)
        let create = Data(#"{"title":"Generated nullable HTTP","description":"Keep these notes","project_id":null,"priority":"P2","scheduled_at":{"kind":"instant","utc":"2099-10-27T12:00:00Z","time_zone":"America/Bogota"},"due_at":{"kind":"date","date":"2099-10-28"},"energy":4,"estimate_min":25,"source":"manual","tags":[]}"#.utf8)
        let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: create)
        let created = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(payload)).ok.body.json
        let createdFields = try fields(created)
        for (key, expected) in try fields(payload) { XCTAssertEqual(createdFields[key] as? NSObject, expected as? NSObject, key) }
        let editData = try JSONSerialization.data(withJSONObject: ["from_version": created.row_version, "changes": ["title": "Omitted fields preserved"]])
        let edit = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: editData)
        let edited = try await client.tasks_period_edit(path: .init(profile: "work", task: created.id), body: .json(edit)).ok.body.json
        let editedFields = try fields(edited)
        XCTAssertEqual(editedFields["title"] as? String, "Omitted fields preserved")
        XCTAssertEqual(editedFields["description"] as? String, "Keep these notes")
        XCTAssertEqual(editedFields["energy"] as? Int, 4)
        XCTAssertEqual(editedFields["estimate_min"] as? Int, 25)
        XCTAssertEqual((editedFields["scheduled_at"] as? [String: String])?["utc"], "2099-10-27T12:00:00Z")
        let clearData = try JSONSerialization.data(withJSONObject: ["from_version": edited.row_version, "changes": ["description": NSNull(), "project_id": NSNull(), "due_at": NSNull(), "scheduled_at": NSNull(), "energy": NSNull(), "estimate_min": NSNull()]])
        let clear = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: clearData)
        let cleared = try await client.tasks_period_edit(path: .init(profile: "work", task: created.id), body: .json(clear)).ok.body.json
        let clearedFields = try fields(cleared)
        for key in ["description", "project_id", "due_at", "scheduled_at", "energy", "estimate_min"] { XCTAssertTrue(clearedFields[key] is NSNull, key) }
        XCTAssertEqual(clearedFields["row_version"] as? Int, 3)
        XCTAssertEqual(clearedFields["title"] as? String, "Omitted fields preserved")
    }

    func testEveryHistoryEventKindSurvivesGeneratedCoding() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let fixture = ProcessInfo.processInfo.environment["TODO_UNION_FIXTURE"].map { URL(fileURLWithPath: $0) } ?? root.appendingPathComponent("API/Fixtures/all-event-kinds.json")
        let data = try Data(contentsOf: fixture)
        let entries = try JSONDecoder().decode(Operations.reads_period_history.Output.Ok.Body.jsonPayload.self, from: data)
        let encoded = try JSONEncoder().encode(entries)
        let expected = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [NSDictionary])
        XCTAssertEqual(try JSONSerialization.jsonObject(with: encoded) as? NSArray, expected as NSArray)
        let kinds = Set(expected.compactMap { ($0["event"] as? NSDictionary)?["kind"] as? String })
        XCTAssertEqual(kinds, ["AuthAttemptRejected", "AuthChanged", "DatabaseRestored", "ReminderFired", "ProfileDeleted", "ProfileDeletionRejected", "TaskAttemptRejected", "TaskCancelled", "TaskCompleted", "TaskCreated", "TaskDeleted", "TaskEdited", "TaskHistoryRedacted", "TaskMovedIn", "TaskMovedOut", "TaskPurged", "TaskReopened", "TaskReverted"])
        XCTAssertTrue(expected.contains { ($0["event"] as? NSDictionary)?["original_kind"] as? String == "TaskPurged" })
        XCTAssertTrue(expected.contains { $0["outcome"] as? String == "rejected" })
    }

    func testProfileDeletionRequestAndReportSurviveGeneratedCoding() throws {
        try roundTrip(Operations.reads_period_deleteProfile.Input.Body.jsonPayload.self,
                      #"{"with_tasks":true,"dry_run":false}"#)
        try roundTrip(Operations.reads_period_deleteProfile.Output.Ok.Body.jsonPayload.self,
                      #"{"generated_at":"2026-10-29T00:00:00Z","profile":{"id":"work","name":"Work","created_at":"2026-10-27T00:00:00Z","updated_at":"2026-10-27T00:00:00Z"},"dry_run":false,"tasks_affected":2,"sessions_revoked":0,"access_tokens_revoked":1}"#)
    }

    func testMoveIdentityErrorPreservesMachineReadableDetails() throws {
        try roundTrip(Components.Schemas.InvalidTaskEncoded.self,
                      #"{"_tag":"InvalidTask","message":"\"Personal\" already has a Task with external id \"repo:move\". Choose another Profile.","details":{"external_id":"repo:move","profile_id":"personal"}}"#)
    }

    private func fields<Value: Encodable>(_ value: Value) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any])
    }

    private func roundTrip<Value: Codable>(_ type: Value.Type, _ json: String) throws {
        let expected = Data(json.utf8)
        let value = try JSONDecoder().decode(type, from: expected)
        let actual = try JSONEncoder().encode(value)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: actual) as? NSDictionary,
                       try JSONSerialization.jsonObject(with: expected) as? NSDictionary)
    }
}

private struct ResumeTransport: ClientTransport {
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        XCTAssertEqual(request.path, "/profiles/work/events")
        XCTAssertEqual(request.headerFields[.init("X-Todo-Client")!], "swiftui")
        XCTAssertEqual(request.headerFields[.init("Last-Event-ID")!], "42")
        XCTAssertEqual(request.headerFields[.init("X-Todo-Generation")!], "restore-generation")
        return (HTTPResponse(status: .ok, headerFields: [.contentType: "text/event-stream", .cacheControl: "no-store"]), HTTPBody("event: ready\ndata: null\n\n"))
    }
}

private struct DiagnosticsTransport: ClientTransport {
    let data: Data
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        XCTAssertEqual(operationID, "diagnostics.snapshot")
        XCTAssertEqual(request.path, "/diagnostics")
        return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json", .cacheControl: "no-store"]), HTTPBody(data))
    }
}
