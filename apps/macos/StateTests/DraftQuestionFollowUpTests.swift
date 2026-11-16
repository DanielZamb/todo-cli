import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

/// The draft question's follow-ups from the correctness seat's review of b968f31a:
/// - sign-out asks (Save signs out only after the save succeeds; Discard signs out with no other
///   request first; Cancel stays signed in with the editor as it was; a refused save keeps it);
/// - MAC-C11-S1-13: after Discard, a status change sends the Version the model holds now;
/// - MAC-C11-S1-14: a forced leave of a deleted Profile ends the question with the editor;
/// - a status change while another question is up keeps the open question and says so.
private actor Server: ClientTransport {
    private(set) var writes: [String] = []
    private(set) var bodies: [String] = []
    var refuseEdit = false
    func refuseTheEdit() { refuseEdit = true }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if request.method != .get {
            writes.append(operationID)
            if let body { bodies.append(String(decoding: try await Data(collecting: body, upTo: 65_536), as: UTF8.self)) }
        }
        switch operationID {
        case "credentials.signOut": return (HTTPResponse(status: .noContent), nil)
        case "tasks.edit" where refuseEdit: return json(#"{"message":"invalid_title"}"#, status: 422)
        case "tasks.edit", "tasks.transition": return json(#"{"id":"t1","profile_id":"work","entity_version":1,"row_version":3,"title":"Edited","description":null,"priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"source":"manual","occurrence":null,"created_at":"2026-10-27T12:00:00Z","updated_at":"2026-10-27T12:00:00Z","completed_at":null,"deleted_at":null}"#)
        case "reads.profiles": return json(#"[{"id":"personal","name":"Personal","created_at":"2026-10-29T00:00:00Z","updated_at":"2026-10-29T00:00:00Z","open_task_count":0,"inbox_task_count":0,"visible_task_count":0}]"#)
        default: throw URLError(.notConnectedToInternet)
        }
    }
    private func json(_ value: String, status: Int = 200) -> (HTTPResponse, HTTPBody?) { (HTTPResponse(status: .init(code: status), headerFields: [.contentType: "application/json"]), HTTPBody(value)) }
}

@MainActor @Suite struct DraftQuestionFollowUpTests {
    private func task(version: Int = 1) -> TaskSnapshot {
        TaskSnapshot(id: "t1", profile_id: "work", row_version: version, title: "Ship the launch notes", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }
    private func model(_ server: Server, unsaved: Bool = true) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-question-follow-up-\(UUID())"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: server, middlewares: [BearerMiddleware(credential: credential)]) },
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("synthetic-question"); model.signedIn = true; model.connection = .live
        model.tasks = [task()]
        model.beginEditing(task())
        if unsaved { model.editor?.title = "Edited" }
        return model
    }

    @Test func signOutWithUnsavedChangesAsksFirst() async throws {
        let server = Server()
        let model = model(server)
        await model.signOut()
        guard case .signOut? = model.pendingNavigation else { Issue.record("no question: \(String(describing: model.pendingNavigation))"); return }
        #expect(model.signedIn)
        #expect(await server.writes.isEmpty)
        #expect(DraftNavigationPrompt.title(model) == "Save changes to \u{201C}Ship the launch notes\u{201D} before signing out?")
        #expect(DraftNavigationMessage.text(hasConflict: false, target: .signOut) == "Save your changes, discard them, or cancel to stay signed in.")
    }

    @Test func cancelStaysSignedInWithTheEditorAsItWas() async throws {
        let server = Server()
        let model = model(server)
        await model.signOut()
        model.cancelNavigation()
        #expect(model.signedIn)
        #expect(model.editor?.title == "Edited")
        #expect(await server.writes.isEmpty)
    }

    @Test func discardSignsOutWithNoOtherRequestFirst() async throws {
        let server = Server()
        let model = model(server)
        await model.signOut()
        let target = try #require(model.pendingNavigation)
        #expect(await model.discardAndNavigate(target))
        #expect(!model.signedIn)
        #expect(model.editor == nil)
        #expect(await server.writes == ["credentials.signOut"])
    }

    @Test func saveSignsOutOnlyAfterTheSaveSucceeds() async throws {
        let server = Server()
        let model = model(server)
        await model.signOut()
        let target = try #require(model.pendingNavigation)
        _ = await model.saveAndNavigate(target)
        #expect(await server.writes == ["tasks.edit", "credentials.signOut"])
        #expect(!model.signedIn)
    }

    @Test func aRefusedSaveKeepsThePersonSignedIn() async throws {
        let server = Server()
        await server.refuseTheEdit()
        let model = model(server)
        await model.signOut()
        let target = try #require(model.pendingNavigation)
        #expect(await model.saveAndNavigate(target) == false)
        #expect(await server.writes == ["tasks.edit"])
        #expect(model.signedIn)
        #expect(model.editor?.title == "Edited")
        #expect(model.editorError == "invalid_title")
    }

    @Test func aCleanSignOutDoesNotAsk() async throws {
        let server = Server()
        let model = model(server, unsaved: false)
        await model.signOut()
        #expect(model.pendingNavigation == nil)
        #expect(!model.signedIn)
        #expect(await server.writes == ["credentials.signOut"])
    }

    /// MAC-C11-S1-13: the stream brings Version 2 while the question is up; Discard then completes
    /// with Version 2, not the click's Version 1.
    @Test func afterDiscardAStatusChangeSendsTheVersionHeldNow() async throws {
        let server = Server()
        let model = model(server)
        await model.transition(task(), action: "complete")
        let target = try #require(model.pendingNavigation)
        model.tasks = [task(version: 2)] // the stream's newer Version
        #expect(await model.discardAndNavigate(target))
        let body = try #require(await server.bodies.last)
        let sent = try #require(try JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any])
        #expect(sent["from_version"] as? Int == 2)
        #expect(await server.writes == ["tasks.transition"])
    }

    /// MAC-C11-S1-14.
    @Test func aForcedLeaveEndsTheQuestionWithTheEditor() async throws {
        let model = model(Server())
        #expect(model.closeEditor() == false)
        try #require(model.pendingNavigation != nil)
        try await model.leaveDeletedProfile(named: "Work")
        #expect(model.editor == nil)
        #expect(model.pendingNavigation == nil)
    }

    @Test func aStatusChangeWhileAnotherQuestionIsUpSaysSo() async throws {
        let server = Server()
        let model = model(server)
        #expect(model.closeEditor() == false)
        await model.transition(task(), action: "complete")
        guard case .close? = model.pendingNavigation else { Issue.record("the open question was replaced: \(String(describing: model.pendingNavigation))"); return }
        #expect(model.deletionNotice == "Answer the question about \u{201C}Ship the launch notes\u{201D} first.")
        #expect(await server.writes.isEmpty)
    }
}
