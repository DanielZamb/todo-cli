import Foundation
import AppKit
import SwiftUI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

private actor DiscoveryWithoutSSE: ClientTransport {
    private let live = URLSessionTransport()
    private(set) var lookupRequests = 0
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if operationID == "reads.lookup" { lookupRequests += 1 }
        if operationID == "changes.stream" {
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "text/event-stream"]), HTTPBody(AsyncThrowingStream<HTTPBody.ByteChunk, any Error> { _ in }, length: .unknown))
        }
        return try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
    }
}

@MainActor struct DiscoveryReportStateTests {
    private func cli(_ arguments: [String], input: String? = nil) throws -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_F10_CLI"]))
        process.arguments = arguments
        process.environment = ProcessInfo.processInfo.environment
        process.standardOutput = Pipe(); process.standardError = Pipe()
        let pipe = Pipe(); process.standardInput = pipe
        try process.run()
        if let input { try pipe.fileHandleForWriting.write(contentsOf: Data(input.utf8)) }
        try pipe.fileHandleForWriting.close()
        process.waitUntilExit()
        return process.terminationStatus
    }
    private func wait(_ predicate: () -> Bool) async throws {
        for _ in 0..<6000 {
            if predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw URLError(.timedOut)
    }
    private func environment(_ profile: String) async throws -> (TodoModel, Client, DiscoveryWithoutSSE) {
        #expect(try cli(["init", "--profile", profile, "--format", "json"]) == 0)
        #expect(try cli(["login", "--profile", profile, "--format", "json", "--password-stdin"], input: "scratch verification passphrase\n") == 0)
        let url = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: url, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let transport = DiscoveryWithoutSSE()
        let model = TodoModel(configuration: .init(server: url, initialProfile: profile, vaultService: "unused-reports-\(UUID())"), clientFactory: { url, _ in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) })
        model.signedIn = true; model.connection = .live
        model.selectedView = "all"
        return (model, todoClient(server: url, credential: credential), transport)
    }
    private func record(_ name: String, _ object: [String: Any]) throws {
        let base = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent()
        try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]).write(to: base.appendingPathComponent(name))
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func sameProfileShowRefreshesAllTasksWithoutNavigationChangeOrSSE() async throws {
        let (model, client, _) = try await environment("zzz-d-current-show")
        #expect(await model.retrySearch() == .applied)
        #expect(model.selectedView == "all")
        #expect(model.selectedProject == nil && model.selectedTag == nil)
        #expect(model.viewCounts["all"] == 0)
        let task = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: model.profile), body: .json(.init(title: "D current Profile explicit reveal"))).ok.body.json)
        await model.openDiscovery(.lookup)
        model.editDiscoveryPrefix(task.id)
        await model.requestDiscovery()
        let match = try #require(model.discovery.appliedSnapshot?.matches.first)
        #expect(await model.showDiscoveryMatch(match))
        try await wait { model.searchPhase == .showing && !model.loading && model.appliedSearchSnapshot?.appliedIdentity.filters.prefix == task.id }
        #expect(model.profile == "zzz-d-current-show")
        #expect(model.selectedView == "all")
        #expect(model.viewCounts["all"] == 1)
        #expect(model.tasks.map(\.id) == [task.id])
        #expect(model.appliedSearchSnapshot?.rows.map(\.id) == [task.id])
        #expect(TaskListView(model: model, compactMode: true).visibleTasks.map(\.id) == [task.id])
        #expect(model.searchStale == false)
        #expect(model.searchPending == false)
        #expect(model.editor?.id == task.id)
        model.signedIn = false; model.connect()
        try record("discovery-current-profile-http.json", ["beforeCount": 0, "afterCount": 1, "fullIdApplied": true, "rowVisible": true, "applyingCleared": true, "sseSuppressed": true])
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func removedSelectedTasksProduceStructuredBatchRowsAndImportConflict() async throws {
        let (model, client, transport) = try await environment("zzz-d-report-rows")
        let profile = model.profile
        let batch = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: "D removed batch target"))).ok.body.json)
        await model.beginBatchEdit()
        model.batchEdit?.selected = [batch.id]
        #expect(try cli(["rm", batch.id, "--profile", profile, "--expected-version", "1", "--format", "json"]) == 0)
        await model.applyBatchEdit(dryRun: true)
        let batchFailure = try #require(model.batchEdit?.report?.items.first?.error)
        #expect(batchFailure.primaryMessage == "Task not found in zzz-d-report-rows.")
        #expect(batchFailure.exitDetail == "error 3 - not found or auth missing")
        #expect(batchFailure.details?.task_id == batch.id)
        #expect(batchFailure.details?.profile?.id == profile)
        let beforeFind = await transport.lookupRequests
        await model.findTaskAfterLookupError(batchFailure)
        #expect(model.batchEdit == nil)
        #expect(model.discovery.prefix == batch.id)
        #expect(model.discovery.phase == .editing)
        #expect(await transport.lookupRequests == beforeFind)
        model.closeDiscovery()

        let attachment = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: "D removed Attachment target"))).ok.body.json)
        let reference = AttachmentSnapshot(id: "reference", location: .link(URL(string: "https://example.com/report")!), added_at: "2026-11-09T00:00:00Z")
        await model.beginAttachmentBatch(reference)
        model.attachmentBatch?.selected = [attachment.id]
        #expect(try cli(["rm", attachment.id, "--profile", profile, "--expected-version", "1", "--format", "json"]) == 0)
        await model.applyAttachmentBatch(dryRun: true)
        let attachmentFailure = try #require(model.attachmentBatch?.report?.items.first?.error)
        #expect(attachmentFailure.primaryMessage == "Task not found in zzz-d-report-rows.")
        #expect(attachmentFailure.exitDetail == "error 3 - not found or auth missing")
        #expect(attachmentFailure.details?.task_id == attachment.id)
        let beforeAttachmentFind = await transport.lookupRequests
        await model.findTaskAfterLookupError(attachmentFailure)
        #expect(model.attachmentBatch == nil)
        #expect(model.discovery.prefix == attachment.id)
        #expect(await transport.lookupRequests == beforeAttachmentFind)
        model.closeDiscovery()

        var importPayload = Operations.tasks_period_create.Input.Body.jsonPayload(title: "D removed import target")
        importPayload.external_id = "d:import-removed"
        let imported = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: profile), body: .json(importPayload)).ok.body.json)
        let input = try JSONSerialization.data(withJSONObject: [["external_id": "d:import-removed", "task_id": imported.id, "from_version": 1, "title": "Keep imported draft"]])
        model.loadImport(data: input, name: "removed.json")
        #expect(try cli(["rm", imported.id, "--profile", profile, "--expected-version", "1", "--format", "json"]) == 0)
        await model.previewImport()
        let deletedFailure = try #require(model.importReport?.items.first?.error)
        #expect(deletedFailure.code == "task_deleted")
        #expect(deletedFailure.message == "This Task is deleted. Restore it before importing changes.")
        #expect(deletedFailure.exitDetail == "error 2 - validation or usage")
        #expect(deletedFailure.details?.current_version == 2)
        #expect(try cli(["rm", imported.id, "--profile", profile, "--expected-version", "2", "--force", "--format", "json"]) == 0)
        await model.previewImport()
        let purgedFailure = try #require(model.importReport?.items.first?.error)
        #expect(purgedFailure.code == "occ_conflict")
        #expect(purgedFailure.message == "Task changed since preview. Preview again and apply the current Version.")
        #expect(purgedFailure.exitDetail == "error 4 - Conflict")
        #expect(model.importDocument?.title(at: 0) == "Keep imported draft")
        let literal = #"{"code":"not_found","message":"Run todo lookup --prefix aa. HTTP: GET /tasks/lookup?prefix=aa.","exit_code":3,"exit_meaning":"not found or auth missing","details":{"profile":{"id":"zzz-d-report-rows","name":"zzz-d-report-rows"},"task_id":"aa","recovery":"agent-only recovery","extra":"preserved"}}"#
        let fixture = try JSONDecoder().decode(ServerFailure.self, from: Data(literal.utf8))
        #expect(fixture.humanMessage == "Task not found in zzz-d-report-rows.\nerror 3 - not found or auth missing")
        let details = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(fixture.details)) as? [String: Any])
        #expect(details["recovery"] as? String == "agent-only recovery")
        #expect(details["extra"] as? String == "preserved")
        model.showingImport = true
        let beforeImportFind = await transport.lookupRequests
        await model.findTaskAfterLookupError(fixture)
        #expect(model.showingImport == false)
        #expect(model.discovery.prefix == "aa")
        #expect(await transport.lookupRequests == beforeImportFind)
        #expect(model.importDocument?.title(at: 0) == "Keep imported draft")
        model.closeDiscovery()
        let genericBatch = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: "D generic batch conflict"))).ok.body.json)
        await model.beginBatchEdit()
        model.batchEdit?.selected = [genericBatch.id]
        _ = try await client.tasks_period_edit(path: .init(profile: profile, task: genericBatch.id), body: .json(.init(from_version: 1, changes: .init(title: "Changed batch target")))).ok.body.json
        await model.applyBatchEdit(dryRun: true)
        let batchConflict = try #require(model.batchEdit?.report?.items.first?.error)
        #expect(batchConflict.code == "occ_conflict")
        #expect(batchConflict.message == "Conflict. Reload Tasks, preview and apply with the current Version.")
        #expect(batchConflict.exitDetail == "error 4 - Conflict")
        #expect(model.batchEdit?.report?.items.first?.current_version == 2)
        model.batchEdit = nil
        let genericAttachment = try await TaskSnapshot.decode(client.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: "D generic Attachment conflict"))).ok.body.json)
        await model.beginAttachmentBatch(reference)
        model.attachmentBatch?.selected = [genericAttachment.id]
        _ = try await client.tasks_period_edit(path: .init(profile: profile, task: genericAttachment.id), body: .json(.init(from_version: 1, changes: .init(title: "Changed Attachment target")))).ok.body.json
        await model.applyAttachmentBatch(dryRun: true)
        let attachmentConflict = try #require(model.attachmentBatch?.report?.items.first?.error)
        #expect(attachmentConflict.code == "occ_conflict")
        #expect(attachmentConflict.message == "Task changed. Read its current Version and retry.")
        #expect(attachmentConflict.exitDetail == "error 4 - Conflict")
        #expect(model.attachmentBatch?.report?.items.first?.current_version == 2)
        model.attachmentBatch = nil
        try record("discovery-report-rows-http.json", ["batch": "not_found", "attachment": "not_found", "deletedImport": "task_deleted", "purgedImport": "occ_conflict", "importNotFoundNotice": "typed UI fixture", "findRequests": 0, "detailsPreserved": true, "deletedImportExit": "error 2 - validation or usage", "purgedImportExit": "error 4 - Conflict", "batchConflictExit": "error 4 - Conflict", "attachmentConflictExit": "error 4 - Conflict"])
    }
}

@MainActor private final class DiscoveryReportFrames { var frames: [String: CGRect] = [:] }

@Test @MainActor func mixedReportRowsKeepCardsContainedAndReachFinalRow() async throws {
    NSApplication.shared.setActivationPolicy(.prohibited)
    var receipts: [[String: Any]] = []
    for surface in ["import", "batch", "attachment"] {
        for compact in [true, false] {
            for dark in [false, true] {
                let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-report-geometry"))
                model.signedIn = true; model.connection = .live
                let ids = ["ordinary-before", "aa", "bb", "ordinary-after"]
                let tasks = ids.map { TaskSnapshot(id: $0, profile_id: "work", row_version: 1, title: $0, description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil) }
                func failure(_ index: Int) -> ServerFailure? {
                    guard index == 1 || index == 2 else { return nil }
                    return .init(message: "Agent-only recovery", code: "not_found", exitCode: 3, exitMeaning: "not found or auth missing", details: .init(profile: .init(id: "work", name: "Work"), taskID: ids[index]))
                }
                let width: CGFloat = compact ? 393 : surface == "import" ? 720 : 480
                let height: CGFloat = compact ? 426 : surface == "import" ? 620 : 600
                let content: AnyView
                if surface == "import" {
                    model.loadImport(data: try JSONSerialization.data(withJSONObject: ids.map { ["external_id": $0, "title": $0] }), name: "Typed UI fixture; live import returns Conflict")
                    model.importReport = .init(generated_at: "2026-11-09T00:00:00Z", dry_run: true, items: ids.indices.map { .init(external_id: ids[$0], outcome: failure($0) == nil ? "updated" : "rejected", task_id: ids[$0], from_version: 1, changed_fields: [], error: failure($0)) }, totals: .init(created: 0, updated: 2, unchanged: 0, rejected: 2))
                    content = AnyView(ImportView(model: model, compact: compact))
                } else if surface == "batch" {
                    model.batchEdit = BatchEditDraft(profile: "work")
                    model.batchEdit?.targets = tasks; model.batchEdit?.selected = Set(ids); model.batchEdit?.loading = false
                    model.batchEdit?.report = .init(dry_run: true, items: ids.indices.map { .init(task_id: ids[$0], from_version: 1, current_version: 1, outcome: failure($0) == nil ? "updated" : "rejected", error: failure($0)) })
                    content = AnyView(BatchEditView(model: model, compact: compact))
                } else {
                    model.attachmentBatch = .init(profile: "work", reference: .init(id: "reference", location: .link(URL(string: "https://example.com/report")!), added_at: "2026-11-09T00:00:00Z"))
                    model.attachmentBatch?.targets = tasks; model.attachmentBatch?.selected = Set(ids); model.attachmentBatch?.loading = false
                    model.attachmentBatch?.report = .init(dry_run: true, items: ids.indices.map { .init(task_id: ids[$0], outcome: failure($0) == nil ? "attached" : "rejected", current_version: 1, error: failure($0)) })
                    content = AnyView(AttachmentBatchView(model: model))
                }
                let frames = DiscoveryReportFrames()
                let view = content.onPreferenceChange(ReportErrorLayoutFrames.self) { value in MainActor.assumeIsolated { frames.frames = value } }.environment(\.colorScheme, dark ? .dark : .light).frame(width: width, height: height)
                let controller = NSHostingController(rootView: view)
                let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
                window.isReleasedWhenClosed = false
                window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
                window.contentViewController = controller
                controller.view.frame = .init(x: 0, y: 0, width: width, height: height)
                controller.view.layoutSubtreeIfNeeded()
                try await Task.sleep(for: .milliseconds(100))
                func scrollViews(_ view: NSView) -> [NSScrollView] { (view as? NSScrollView).map { [$0] } ?? view.subviews.flatMap(scrollViews) }
                let scroller = try #require(scrollViews(controller.view).max { ($0.documentView?.frame.height ?? 0) < ($1.documentView?.frame.height ?? 0) })
                let document = try #require(scroller.documentView)
                var pairs: Set<Int> = []
                var cards: Set<String> = []
                for fraction in [CGFloat(0), 0.25, 0.5, 0.75, 1] {
                    let maximum = max(0, document.frame.height - scroller.contentView.bounds.height)
                    scroller.contentView.scroll(to: .init(x: 0, y: document.isFlipped ? maximum * fraction : maximum * (1 - fraction)))
                    scroller.reflectScrolledClipView(scroller.contentView)
                    controller.view.layoutSubtreeIfNeeded()
                    try await Task.sleep(for: .milliseconds(60))
                    for index in 0..<3 {
                        if let first = frames.frames["row-" + ids[index]], let next = frames.frames["row-" + ids[index + 1]] {
                            #expect(first.maxY <= next.minY + 0.5)
                            pairs.insert(index)
                        }
                    }
                    for id in ["aa", "bb"] {
                        if let card = frames.frames["card-" + id], let row = frames.frames["row-" + id] {
                            #expect(card.minY >= row.minY - 0.5 && card.maxY <= row.maxY + 0.5)
                            #expect(card.minX >= row.minX - 0.5 && card.maxX <= row.maxX + 0.5)
                            if surface == "import" { #expect(row.height >= 90) }
                            cards.insert(id)
                        }
                    }
                }
                #expect(pairs.sorted() == [0, 1, 2])
                if surface == "import" && compact {
                    #expect(cards.sorted() == [])
                    for id in ids { #expect(try #require(frames.frames["row-" + id]).height == 56) }
                } else { #expect(cards.sorted() == ["aa", "bb"]) }
                let last = try #require(frames.frames["row-ordinary-after"])
                let viewport = try #require(frames.frames["viewport"])
                #expect(last.minY >= viewport.minY - 0.5 && last.maxY <= viewport.maxY + 0.5)
                receipts.append(["surface": surface, "compact": compact, "dark": dark, "adjacentPairs": pairs.sorted(), "containedCards": cards.sorted(), "finalRowVisible": true])
                window.close()
            }
        }
    }
    #expect(receipts.count == 12)
    if let base = ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"] {
        try JSONSerialization.data(withJSONObject: receipts, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: base).deletingLastPathComponent().appendingPathComponent("discovery-report-geometry.json"))
    }
}
