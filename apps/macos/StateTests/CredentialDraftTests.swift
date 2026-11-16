import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

/// MAC-C11-S1-12 (the S1-24 class): nothing typed under one credential is ever saved under another.
/// A credential change (a Session end, a sign-out, another sign-in) ends the editor and its draft
/// question, and an answer to a question asked under the old credential does nothing. A Session end
/// names the lost draft on the sign-in screen. On b968f31a the editor and the question survived, and
/// Save wrote the draft under the new credential (the correctness seat's probe F2).
private actor Recorder: ClientTransport {
    private(set) var writes: [String] = [] // "operation credential"
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let bearer = request.headerFields[.authorization] ?? "-"
        if request.method != .get { writes.append("\(operationID) \(bearer)") }
        switch operationID {
        case "tasks.edit", "tasks.transition":
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"id":"t1","profile_id":"work","entity_version":1,"row_version":2,"title":"Edited","description":null,"priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"source":"manual","occurrence":null,"created_at":"2026-10-27T12:00:00Z","updated_at":"2026-10-27T12:00:00Z","completed_at":null,"deleted_at":null}"#))
        default: throw URLError(.notConnectedToInternet)
        }
    }
}

@MainActor @Suite struct CredentialDraftTests {
    private let task = TaskSnapshot(id: "t1", profile_id: "work", row_version: 1, title: "Ship the launch notes", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    private func model(_ transport: Recorder) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-credential-draft-\(UUID())"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) },
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("first-credential"); model.signedIn = true; model.connection = .live
        model.beginEditing(task)
        model.editor?.title = "Edited"
        return model
    }
    /// Another credential signs in (the seat's F2: a sign-in with a second credential).
    private func signInAgain(_ model: TodoModel) {
        model.replaceCredential("second-credential"); model.signedIn = true; model.connection = .live
    }

    @Test func aSessionEndEndsTheEditorAndNamesTheLostDraft() async throws {
        let transport = Recorder()
        let model = model(transport)
        model.handleAuthorization(RequestFailure(status: 401, message: "unauthorized", code: "unauthorized"), credentialEpoch: model.discovery.credentialEpoch)
        #expect(!model.signedIn)
        #expect(model.editor == nil)
        #expect(model.pendingNavigation == nil)
        #expect(model.message == "Your Session ended. Unsaved changes to \u{201C}Ship the launch notes\u{201D} were lost. Sign in again.")
        signInAgain(model)
        #expect(model.editor == nil)
        #expect(await model.saveAndNavigate(.close(.person)) == false)
        #expect(await transport.writes.isEmpty)
    }

    @Test func aCleanSessionEndSaysOnlyThatItEnded() async throws {
        let model = model(Recorder())
        model.editor?.title = "Ship the launch notes"
        try #require(!model.hasUnsavedEditor)
        model.handleAuthorization(RequestFailure(status: 401, message: "unauthorized", code: "unauthorized"), credentialEpoch: model.discovery.credentialEpoch)
        #expect(model.message == "Your Session ended. Sign in again.")
    }

    /// The seat's F2: the question is up; the credential is replaced and another signs in; Save
    /// then wrote the draft under the second credential.
    @Test func aCredentialChangeEndsTheQuestionAndAnOldAnswerDoesNothing() async throws {
        let transport = Recorder()
        let model = model(transport)
        #expect(model.closeEditor() == false)
        let target = try #require(model.pendingNavigation)
        model.replaceCredential(""); model.signedIn = false
        #expect(model.pendingNavigation == nil)
        #expect(model.editor == nil)
        signInAgain(model)
        #expect(await model.saveAndNavigate(target) == false)
        #expect(await model.discardAndNavigate(target) == false)
        let writes = await transport.writes
        #expect(writes.isEmpty, "\(writes)")
    }

    /// A status change asked under one credential is not sent under another.
    @Test func aStatusChangeAskedBeforeACredentialChangeIsNeverSent() async throws {
        let transport = Recorder()
        let model = model(transport)
        await model.transition(task, action: "complete")
        let target = try #require(model.pendingNavigation)
        model.replaceCredential(""); model.signedIn = false
        signInAgain(model)
        #expect(await model.discardAndNavigate(target) == false)
        #expect(await model.saveAndNavigate(target) == false)
        let writes = await transport.writes
        #expect(writes.isEmpty, "\(writes)")
    }

    /// The same credential throughout: the answer still works (no regression of Q13).
    @Test func underTheSameCredentialTheAnswerStillWorks() async throws {
        let transport = Recorder()
        let model = model(transport)
        await model.transition(task, action: "complete")
        let target = try #require(model.pendingNavigation)
        #expect(await model.discardAndNavigate(target))
        #expect(await transport.writes == ["tasks.transition Bearer first-credential"])
    }
}
