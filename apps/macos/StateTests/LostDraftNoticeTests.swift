import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

/// The closes that cannot ask (UI seat on b968f31a): a draft they lose is named where the person
/// lands. The Profile was deleted: a second sentence on its notice. A Snapshot reload: its own
/// notice. (A Session end: CredentialDraftTests, with MAC-C11-S1-12.) On b968f31a nothing named a
/// lost draft.
private actor CatalogTransport: ClientTransport {
    var streams: [AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation] = []
    var profiles = #"[{"id":"work","name":"Work","created_at":"2026-10-27T00:00:00Z","updated_at":"2026-10-27T00:00:00Z","open_task_count":1,"inbox_task_count":1,"visible_task_count":1,"projects":[]}]"#
    func setProfiles(_ json: String) { profiles = json }
    func event(_ name: String, _ data: String) { streams.last?.yield(Array("event: \(name)\ndata: \(data)\n\n".utf8)[...]) }
    var streamCount: Int { streams.count }
    func stop() { streams.forEach { $0.finish() } }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        switch operationID {
        case "changes.stream":
            let pair = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            streams.append(pair.continuation)
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "text/event-stream", .cacheControl: "no-store"]), HTTPBody(pair.stream, length: .unknown))
        case "reads.profiles": return json(profiles)
        case "reads.view": return json(#"{"name":"today","now":"2026-11-14T12:00:00Z","groups":[]}"#)
        case "reads.projects", "reads.tags", "tasks.list", "snapshots.list": return json("[]")
        default: throw URLError(.notConnectedToInternet)
        }
    }
    private func json(_ value: String) -> (HTTPResponse, HTTPBody?) { (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(value)) }
}

@MainActor @Suite(.serialized) struct LostDraftNoticeTests {
    private func model(_ transport: CatalogTransport) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1/lost-draft-\(UUID())")!, initialProfile: "work", vaultService: "unused-lost-draft-\(UUID())"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) },
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("ses_synthetic-lost-draft"); model.selectedView = "all"; model.signedIn = true; model.connection = .live
        model.profiles = [.init(id: "work", name: "Work", open_task_count: 1, inbox_task_count: 1)]
        return model
    }
    private let task = TaskSnapshot(id: "t1", profile_id: "work", row_version: 1, title: "Ship the launch notes", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    private func until(_ what: String, _ condition: () async -> Bool) async throws {
        for _ in 0..<1000 { if await condition() { return }; try await Task.sleep(for: .milliseconds(5)) }
        Issue.record("timed out: \(what)"); throw CancellationError()
    }

    @Test(arguments: [false, true])
    func aDeletedProfileNamesTheLostDraft(unsaved: Bool) async throws {
        let transport = CatalogTransport()
        await transport.setProfiles(#"[{"id":"personal","name":"Personal","created_at":"2026-10-29T00:00:00Z","updated_at":"2026-10-29T00:00:00Z","open_task_count":0,"inbox_task_count":0,"visible_task_count":0}]"#)
        let model = model(transport)
        defer { model.signedIn = false }
        model.beginEditing(task)
        if unsaved { model.editor?.title = "Ship the launch notes today" }
        try await model.leaveDeletedProfile(named: "Work")
        #expect(model.editor == nil)
        #expect(model.deletionNotice == "\u{201C}Work\u{201D} was deleted. Switched to Personal." + (unsaved ? " Unsaved changes to \u{201C}Ship the launch notes\u{201D} were lost." : ""))
    }

    @Test(arguments: [false, true])
    func aSnapshotReloadNamesTheLostDraft(unsaved: Bool) async throws {
        let transport = CatalogTransport()
        let model = model(transport)
        defer { model.signedIn = false; model.connect(); Task { await transport.stop() } }
        model.connect()
        try await until("the stream opens") { await transport.streamCount == 1 }
        await transport.event("ready", "{}")
        try await until("live") { model.connection == .live && !model.loading }
        model.beginEditing(task)
        if unsaved { model.editor?.title = "Ship the launch notes today" }
        let reloads = model.restoreReloadCount
        await transport.event("reload", #"{"generation":"lost-draft-reload","seq":7}"#)
        try await until("the reload") { model.restoreReloadCount > reloads || model.editor == nil }
        try await until("the reload reset the editor") { model.editor == nil }
        #expect(model.deletionNotice == (unsaved ? "Unsaved changes to \u{201C}Ship the launch notes\u{201D} were lost when the Snapshot was restored." : nil))
    }
}
