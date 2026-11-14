import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

private func retirementTaskJSON(_ title: String) -> String {
    return #"{"id":"retirement-task","profile_id":"work","entity_version":1,"row_version":1,"title":"\#(title)","description":null,"priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"source":"manual","occurrence":null,"created_at":"2026-10-27T12:00:00Z","updated_at":"2026-10-27T12:00:00Z","completed_at":null,"deleted_at":null}"#
}
private func retirementTask(_ title: String) throws -> TaskSnapshot {
    try JSONDecoder().decode(TaskSnapshot.self, from: Data(retirementTaskJSON(title).utf8))
}

private actor RetirementReply: ClientTransport {
    let operation: String
    let status: Int
    let json: String
    let precedingReply: (operation: String, json: String)?
    let hold: Bool
    private var release: CheckedContinuation<Void, Never>?
    private var started = false
    private(set) var calls: [String] = []
    init(operation: String, status: Int, json: String, precedingReply: (operation: String, json: String)? = nil, hold: Bool = true) {
        self.operation = operation; self.status = status; self.json = json; self.precedingReply = precedingReply; self.hold = hold
    }
    func waitForRequest() async throws {
        for _ in 0..<500 {
            if started { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw URLError(.timedOut)
    }
    func finish() { release?.resume(); release = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        calls.append(operationID)
        if calls.count == 1, let precedingReply {
            #expect(operationID == precedingReply.operation)
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(precedingReply.json))
        }
        guard calls.count == (precedingReply == nil ? 1 : 2) || !hold else { throw URLError(.cancelled) }
        #expect(operationID == operation)
        if hold { await withCheckedContinuation { release = $0; started = true } }
        return (HTTPResponse(status: .init(code: status), headerFields: [.contentType: "application/json"]), HTTPBody(json))
    }
}

@MainActor @Suite(.serialized) struct RetiredCredentialPublicationTests {
    @Test func oldWriteRepliesCannotChangeTheNewEditorOrReleaseItsBusyState() async throws {
        for action in ["save", "transition", "copy"] {
            for status in [200, 409] {
                let old = try retirementTask("Old Task")
                let taskJSON = retirementTaskJSON("Old Task")
                let json = status == 200 ? taskJSON : #"{"_tag":"Conflict","exit_code":4,"exit_meaning":"Conflict","latest":\#(taskJSON)}"#
                let operation = action == "save" ? "tasks.edit" : action == "transition" ? "tasks.transition" : "tasks.copy"
                let transport = RetirementReply(operation: operation, status: status, json: json)
                let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-retired-publication"), clientFactory: { url, _ in Client(serverURL: url, transport: transport) }, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
                model.replaceCredential("ses_old_synthetic"); model.signedIn = true; model.connection = .live; model.beginEditing(old)
                let pending = Task {
                    switch action {
                    case "save": _ = await model.save()
                    case "transition": await model.transition(old, action: "complete")
                    default: await model.write(.copy("personal"))
                    }
                }
                try await transport.waitForRequest()
                model.replaceCredential("ses_new_synthetic"); model.signedIn = true; model.connection = .live
                model.beginEditing(try retirementTask("New Session draft"))
                model.message = "New Session message"; model.editorError = "New Session error"; model.busy = true
                await transport.finish(); await pending.value
                #expect(model.editor?.title == "New Session draft")
                #expect(model.message == "New Session message")
                #expect(model.editorError == "New Session error")
                #expect(model.busy)
                #expect(model.conflict == nil && model.transferResult == nil)
                #expect(await transport.calls == [operation])
                model.signedIn = false; model.replaceCredential("")
            }
        }
    }

    @Test func oldContractRepliesCannotChangeTheNewScope() async throws {
        for contract in [TodoContract.id, "old-contract"] {
            let transport = RetirementReply(operation: "system.health", status: 200, json: #"{"service":"todo-server","contract":"\#(contract)","build":"old-build"}"#)
            let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-retired-contract"), clientFactory: { url, _ in Client(serverURL: url, transport: transport) }, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
            model.replaceCredential("ses_old_synthetic")
            let pending = Task { () -> Bool in
                do { _ = try await model.checkServerContract(); return false }
                catch { return error is CancellationError }
            }
            try await transport.waitForRequest()
            model.replaceCredential("ses_new_synthetic"); model.outdatedServerBuild = "new-build"; model.connection = .live; model.loading = true
            await transport.finish()
            #expect(await pending.value)
            #expect(model.outdatedServerBuild == "new-build" && model.connection == .live && model.loading)
            model.replaceCredential("")
        }
    }

    @Test func attachmentBatchReadbackCannotReplaceTheNewEditor() async throws {
        let old = try retirementTask("Old Task")
        let transport = RetirementReply(operation: "tasks.show", status: 200, json: retirementTaskJSON("Old Task"), precedingReply: ("tasks.attachMany", #"{"generated_at":"2026-11-11T00:00:00Z","dry_run":false,"items":[{"task_id":"retirement-task","from_version":1,"outcome":"attached","current_version":2,"attached":1}],"totals":{"attached":1,"unchanged":0,"rejected":0}}"#))
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-retired-attachment"), clientFactory: { url, _ in Client(serverURL: url, transport: transport) }, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("ses_old_synthetic"); model.signedIn = true; model.connection = .live; model.beginEditing(old)
        let reference = AttachmentSnapshot(id: "synthetic-link", location: .link(URL(string: "https://example.test/control")!), added_at: "2026-11-11T00:00:00Z")
        var batch = AttachmentBatchDraft(profile: "work", reference: reference)
        batch.targets = [old]; batch.selected = [old.id]; batch.loading = false
        model.attachmentBatch = batch
        let pending = Task { await model.applyAttachmentBatch(dryRun: false) }
        try await transport.waitForRequest()
        model.replaceCredential("ses_new_synthetic"); model.signedIn = true; model.connection = .live
        model.beginEditing(try retirementTask("New Session draft")); model.busy = true
        await transport.finish(); await pending.value
        #expect(model.editor?.title == "New Session draft" && model.busy)
        #expect(await transport.calls == ["tasks.attachMany", "tasks.show"])
        model.signedIn = false; model.replaceCredential("")
    }

    @Test func retiredDebounceMakesNoRequestUsingTheNewCredential() async throws {
        let transport = RetirementReply(operation: "reads.quickAdd", status: 200, json: #"{"title":"Current draft","priority":"P3","tags":[]}"#, hold: false)
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-retired-parse"), clientFactory: { url, _ in Client(serverURL: url, transport: transport) }, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("ses_old_synthetic"); model.signedIn = true; model.newTitle = "Old draft"
        let pending = Task { await model.parseDraft() }
        for _ in 0..<3 { await Task.yield() }
        model.replaceCredential("ses_new_synthetic"); model.signedIn = true; model.newTitle = "Current draft"
        await pending.value
        #expect(await transport.calls == [])
        #expect(model.parsedTask == nil && model.parseError == nil)
        await model.parseDraft()
        #expect(model.parsedInput == "Current draft" && model.parsedTask?.title == "Current draft")
        #expect(await transport.calls == ["reads.quickAdd"])
        model.signedIn = false; model.replaceCredential("")
    }
}
