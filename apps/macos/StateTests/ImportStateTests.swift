import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

@Test func importFileFormatsAndPinnedVersions() throws {
    let document = try ImportDocument(data: Data(#"[{"external_id":"repo:a","title":"First","description":null},{"external_id":"repo:b","from_version":7}]"#.utf8), name: "sync.json")
    let report = try JSONDecoder().decode(ImportSummary.self, from: Data(#"{"generated_at":"2026-10-29T00:00:00Z","dry_run":true,"items":[{"external_id":"repo:a","outcome":"updated","task_id":"task-1","from_version":2,"changed_fields":["title"]},{"external_id":"repo:b","outcome":"created","task_id":null,"from_version":null,"changed_fields":["title"]}],"totals":{"created":1,"updated":1,"unchanged":0,"rejected":0}}"#.utf8))
    let pinned = try document.pinned(to: report)
    let objects = try JSONSerialization.jsonObject(with: JSONEncoder().encode(pinned)) as? NSArray
    #expect(objects == [["external_id":"repo:a", "title":"First", "description":NSNull(), "from_version":2, "task_id":"task-1"], ["external_id":"repo:b", "from_version":7, "task_id":NSNull()]] as NSArray)
    #expect(document.title(at: 0) == "First")
    let lines = try ImportDocument(data: Data("{\"external_id\":\"a\"}\n{\"external_id\":\"b\"}\n".utf8), name: "sync.ndjson")
    #expect(lines.items.count == 2)
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveImportPreviewApplyReloadAndConflict() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let model = TodoModel(configuration: .init(server: server, initialProfile: "zzz-c11-import", vaultService: "never-used-import"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    model.signedIn = true
    model.connection = .live
    model.loadImport(data: Data(#"[{"external_id":"swift-import:a","title":"Original"},{"external_id":"swift-import:b","title":"Same"}]"#.utf8), name: "initial.json")
    await model.previewImport()
    #expect(model.importReport?.totals == .init(created: 2, updated: 0, unchanged: 0, rejected: 0))
    let before = try await client.tasks_period_list(path: .init(profile: "zzz-c11-import")).ok.body.json.map(TaskSnapshot.decode)
    #expect(before.filter { $0.external_id?.hasPrefix("swift-import:") == true }.count == 0)
    await model.applyImport()
    #expect(model.importReport?.dry_run == false)
    #expect(model.importReport?.totals == .init(created: 2, updated: 0, unchanged: 0, rejected: 0))
    model.loadImport(data: Data(#"[{"external_id":"swift-import:a","title":"Updated"},{"external_id":"swift-import:b","title":"Same"},{"external_id":"swift-import:c","title":"Created"}]"#.utf8), name: "sync.json")
    await model.previewImport()
    #expect(model.importReport?.totals == .init(created: 1, updated: 1, unchanged: 1, rejected: 0))
    await model.applyImport()
    #expect(model.importReport?.totals == .init(created: 1, updated: 1, unchanged: 1, rejected: 0))
    let reload = TodoModel(configuration: model.configuration, clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    reload.signedIn = true
    reload.connection = .live
    reload.loadImport(data: Data(#"[{"external_id":"swift-import:a","title":"Updated"},{"external_id":"swift-import:b","title":"Same"},{"external_id":"swift-import:c","title":"Created"}]"#.utf8), name: "sync.json")
    await reload.previewImport()
    #expect(reload.importReport?.totals == .init(created: 0, updated: 0, unchanged: 3, rejected: 0))
    let durable = try await client.tasks_period_list(path: .init(profile: "zzz-c11-import")).ok.body.json.map(TaskSnapshot.decode)
    #expect(durable.filter { $0.external_id?.hasPrefix("swift-import:") == true }.map(\.title).sorted() == ["Created", "Same", "Updated"])
    let task = try #require(durable.first { $0.external_id == "swift-import:a" })
    reload.loadImport(data: Data(#"[{"external_id":"swift-import:a","title":"My draft"}]"#.utf8), name: "conflict.json")
    await reload.previewImport()
    _ = try await client.tasks_period_edit(path: .init(profile: "zzz-c11-import", task: task.id), body: .json(.init(from_version: task.row_version, changes: .init(title: "Concurrent edit"))))
    await reload.applyImport()
    #expect(reload.importReport?.totals == .init(created: 0, updated: 0, unchanged: 0, rejected: 1))
    #expect(reload.importReport?.items.first?.outcomeText == "Conflict")
    #expect(reload.importReport?.items.first?.error?.details?.current_version == 3)
    let final = try await client.tasks_period_show(path: .init(profile: "zzz-c11-import", task: task.id)).ok.body.json
    #expect(final.title == "Concurrent edit")
    if let receipt = ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"] {
        let path = URL(fileURLWithPath: receipt).deletingLastPathComponent().appendingPathComponent("import-http.json")
        try JSONEncoder().encode(reload.importReport).write(to: path)
    }
    reload.loadImport(data: Data(#"[{"external_id":"swift-import:a","title":"Concurrent edit"}]"#.utf8), name: "close-missing.json")
    reload.importCloseMissing = true
    await reload.previewImport()
    #expect(reload.importReport?.totals == .init(created: 0, updated: 2, unchanged: 1, rejected: 0))
    _ = try await client.tasks_period_edit(path: .init(profile: "zzz-c11-import", task: task.id), body: .json(.init(from_version: 3, changes: .init(title: "Changed after cancellation preview"))))
    await reload.applyImport()
    #expect(reload.importReport?.totals == .init(created: 0, updated: 0, unchanged: 0, rejected: 1))
    let preserved = try await client.tasks_period_list(path: .init(profile: "zzz-c11-import")).ok.body.json.map(TaskSnapshot.decode)
    #expect(preserved.filter { $0.external_id == "swift-import:b" || $0.external_id == "swift-import:c" }.map(\.status) == ["open", "open"])
    reload.loadImport(data: Data(#"[{"external_id":"swift-import:a","title":"Changed after cancellation preview"}]"#.utf8), name: "close-missing-retry.json")
    reload.importCloseMissing = true
    await reload.previewImport()
    #expect(reload.importReport?.totals == .init(created: 0, updated: 2, unchanged: 1, rejected: 0))
    await reload.applyImport()
    #expect(reload.importReport?.totals == .init(created: 0, updated: 2, unchanged: 1, rejected: 0))
    let closed = try await client.tasks_period_list(path: .init(profile: "zzz-c11-import")).ok.body.json.map(TaskSnapshot.decode)
    #expect(closed.filter { $0.external_id == "swift-import:a" }.map(\.status) == ["open"])
    #expect(closed.filter { $0.external_id == "swift-import:b" || $0.external_id == "swift-import:c" }.map(\.status) == ["cancelled", "cancelled"])
}

private actor DelayedImportTransport: ClientTransport {
    private var started = false
    private var waiting: CheckedContinuation<Void, Never>?
    private var pending: CheckedContinuation<Void, Never>?
    func waitForRequest() async {
        if started { return }
        await withCheckedContinuation { waiting = $0 }
    }
    func release() { pending?.resume(); pending = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        await withCheckedContinuation { continuation in
            pending = continuation
            started = true
            waiting?.resume()
            waiting = nil
        }
        let json = #"{"generated_at":"2026-10-29T00:00:00Z","dry_run":true,"items":[{"external_id":"repo:a","outcome":"created","task_id":null,"from_version":null,"changed_fields":["title"]}],"totals":{"created":1,"updated":0,"unchanged":0,"rejected":0}}"#
        return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(json))
    }
}

@Test @MainActor func obsoleteImportPreviewCannotAttachToAnotherFile() async throws {
    let transport = DelayedImportTransport()
    let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-headless"), clientFactory: { url, _ in Client(serverURL: url, transport: transport) })
    model.signedIn = true
    model.connection = .live
    model.loadImport(data: Data(#"[{"external_id":"repo:a","title":"First"}]"#.utf8), name: "a.json")
    let preview = Task { await model.previewImport() }
    await transport.waitForRequest()
    model.loadImport(data: Data(#"[{"external_id":"repo:b","title":"Second"}]"#.utf8), name: "b.json")
    await transport.release()
    await preview.value
    #expect(model.importDocument?.name == "b.json")
    #expect(model.importReport == nil)
    #expect(model.busy == false)
}
