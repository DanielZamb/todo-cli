import Foundation
import Testing
import TodoAPI
@testable import TodoState

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_F13_SNAPSHOTS"] == "1")) @MainActor
func snapshotListCreateConfirmationRestoreAndReloadAgainstScratchServer() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-snapshots"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    model.signedIn = true
    model.connect()
    defer { model.signedIn = false; model.connect() }
    for _ in 0..<600 where model.connection != .live { try await Task.sleep(for: .milliseconds(100)) }
    #expect(model.connection == .live)
    let original = try await client.tasks_period_list(path: .init(profile: "work")).ok.body.json.count
    #expect(original == 0)
    await model.loadSnapshots()
    let count = model.ownerSnapshots.count
    await model.createSnapshot()
    #expect(model.ownerSnapshots.count == count + 1)
    let target = try #require(model.ownerSnapshots.first { $0.reason == "manual" })
    #expect(target.task_counts.first { $0.profile == "work" }?.count == original)
    _ = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "F13 later Swift Task", project_name: "Later Project", tag_names: ["later"]))).ok
    for _ in 0..<600 where model.tasks.count != original + 1 { try await Task.sleep(for: .milliseconds(100)) }
    #expect(model.tasks.count == 1)
    await model.previewSnapshotRestore(target)
    let report = try #require(model.snapshotRestore)
    let change = try #require(report.task_counts.first { $0.profile == "work" })
    #expect(change.before == 1)
    #expect(change.after == 0)
    #expect(model.snapshotRestoreTarget?.id == target.id)
    #expect(try await client.tasks_period_list(path: .init(profile: "work")).ok.body.json.count == original + 1)
    let reloads = model.restoreReloadCount
    let laterTask = try #require(model.tasks.first { $0.title == "F13 later Swift Task" })
    model.pendingNavigation = .edit(laterTask)
    model.transferRequest = .init(kind: .copy, task: laterTask)
    model.transferResult = .init(kind: .copy, task: laterTask, profileName: "Personal")
    model.profileDeletion = .init(name: "Work", count: 1)
    model.profileDeletionError = "Old refusal"
    model.selectedProject = try #require(laterTask.project_id)
    model.selectedTag = try #require(laterTask.tags.first)
    model.loadImport(data: Data(#"[{"external_id":"f13:stale-preview","title":"Stale import"}]"#.utf8), name: "stale-import.json")
    model.showingImport = true
    model.importCloseMissing = true
    await model.previewImport()
    #expect(model.importReport?.totals.created == 1)
    model.importError = "Old import error"
    await model.confirmSnapshotRestore()
    for _ in 0..<600 where model.restoreReloadCount == reloads || model.tasks.count != original { try await Task.sleep(for: .milliseconds(100)) }
    #expect(model.restoreReloadCount == reloads + 1)
    #expect(model.tasks.count == 0)
    #expect(!model.tasks.contains { $0.title == "F13 later Swift Task" })
    #expect(model.snapshotRestore == nil)
    #expect(model.pendingNavigation == nil)
    #expect(model.importDocument == nil)
    #expect(model.importReport == nil)
    #expect(model.importError == nil)
    #expect(model.importCloseMissing == false)
    #expect(model.showingImport == false)
    #expect(model.transferRequest == nil)
    #expect(model.transferResult == nil)
    #expect(model.profileDeletion == nil)
    #expect(model.profileDeletionError == nil)
    #expect(model.selectedProject == nil)
    #expect(model.selectedTag == nil)
    #expect(model.restoreGeneration != "initial")
    #expect(try await client.tasks_period_list(path: .init(profile: "work")).ok.body.json.count == original)
    _ = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "F13 Swift after reload"))).ok
    for _ in 0..<600 where !model.tasks.contains(where: { $0.title == "F13 Swift after reload" }) { try await Task.sleep(for: .milliseconds(100)) }
    #expect(model.tasks.count == 1)
    #expect(model.tasks.contains { $0.title == "F13 Swift after reload" })
    model.changeProfile("personal")
    for _ in 0..<600 where model.connection != .live { try await Task.sleep(for: .milliseconds(100)) }
    #expect(model.connection == .live)
    #expect(model.resumeSequence == "3")
    #expect(model.lastSequence == "3")
    #expect(model.tasks.count == 0)
    model.changeProfile("work")
    for _ in 0..<600 where model.connection != .live || model.tasks.count != 1 { try await Task.sleep(for: .milliseconds(100)) }
    #expect(model.connection == .live)
    #expect(model.resumeSequence == "4")
    #expect(model.tasks.map(\.title) == ["F13 Swift after reload"])
    let restarted = TodoModel(configuration: .init(server: server, initialProfile: "personal", vaultService: "never-used-snapshots"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
    restarted.signedIn = true
    restarted.connect()
    defer { restarted.signedIn = false; restarted.connect() }
    for _ in 0..<600 where restarted.connection != .live { try await Task.sleep(for: .milliseconds(100)) }
    #expect(restarted.connection == .live)
    #expect(restarted.restoreGeneration == model.restoreGeneration)
    #expect(restarted.resumeSequence == "3")
    #expect(restarted.tasks.count == 0)
    let receipt = try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])
    try JSONSerialization.data(withJSONObject: ["initialTasks": original, "afterCreate": original + 1, "afterRestore": original, "reloads": model.restoreReloadCount - reloads, "afterReloadWrite": original + 1], options: [.sortedKeys]).write(to: URL(fileURLWithPath: receipt).deletingLastPathComponent().appendingPathComponent("snapshots-http.json"))
}

@Test func generatedSnapshotRestoreCodingKeepsLiteralReportAndDryRun() throws {
    let json = #"{"id":"11111111-1111-1111-1111-111111111111","dry_run":true,"seq_before":9,"seq_after":4,"seq_delta":-5,"task_counts":[{"profile":"work","name":"Work","before":2,"after":1}],"safety_snapshot":null,"generation":"initial"}"#
    let wire = try JSONDecoder().decode(Operations.snapshots_period_restore.Output.Ok.Body.jsonPayload.self, from: Data(json.utf8))
    let report = try JSONDecoder().decode(SnapshotRestorePreview.self, from: JSONEncoder().encode(wire))
    #expect(report.seq_delta == -5)
    #expect(report.task_counts.map(\.before) == [2])
    #expect(report.task_counts.map(\.after) == [1])
    #expect(report.dry_run == true)
    let request = try JSONDecoder().decode(Operations.snapshots_period_restore.Input.Body.jsonPayload.self, from: Data(#"{"dry_run":false}"#.utf8))
    #expect(try JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? NSDictionary == ["dry_run": false] as NSDictionary)
}

@Test func snapshotHumanReasonsAndTaskPluralization() {
    #expect(["manual", "daily", "pre-restore", "pre-migration", "pre-purge", "before Profile delete personal", "before import Tasks.csv", "before a planning session"].map(SnapshotPresentation.reason) == ["Manual", "Daily", "Before restore", "Before update", "Before Purge", "Before deleting Profile \"Personal\"", "Before import of Tasks.csv", "Before a planning session"])
    #expect([0, 1, 2].map(SnapshotPresentation.tasks) == ["0 Tasks", "1 Task", "2 Tasks"])
    #expect(["work", "Personal", "own-work"].map(SnapshotPresentation.profileName) == ["Work", "Personal", "Own-work"])
}

@Test func snapshotReloadResetsAndScopesReminderReceipts() {
    var receipts = ReminderReceiptState()
    let previous = receipts.identifier(server: "local", profile: "work", seq: 999)
    receipts.lastReceipt = "Reminder sequence 999: Obsolete Task"
    receipts.lastTest = NotificationTestResult(checkedAt: .now, delivered: true)
    receipts.reset(to: "restored")
    #expect(receipts.lastReceipt == "Not tested yet")
    #expect(receipts.lastTest == nil)
    #expect(receipts.identifier(server: "local", profile: "work", seq: 7) == "todo.local.work.restored.7")
    #expect(previous.hasPrefix(receipts.prefix(server: "local", profile: "work")) == false)
    #expect("todo.local.work.restored.7".hasPrefix(receipts.prefix(server: "local", profile: "work")))
}

@Test func snapshotHistoryIncludesEveryEventKindWithoutAnyOfRecursion() throws {
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    let data = try Data(contentsOf: root.appendingPathComponent("API/Fixtures/all-event-kinds.json"))
    let wire = try JSONDecoder().decode(Operations.reads_period_history.Output.Ok.Body.jsonPayload.self, from: data)
    let encoded = try JSONEncoder().encode(wire)
    #expect(try JSONSerialization.jsonObject(with: encoded) as? NSArray == JSONSerialization.jsonObject(with: data) as? NSArray)
    let history = try JSONDecoder().decode([HistoryEntry].self, from: encoded)
    #expect(Set(history.map { $0.event.kind }) == ["AuthAttemptRejected", "AuthChanged", "DatabaseRestored", "ProfileDeleted", "ProfileDeletionRejected", "ReminderFired", "TaskAttemptRejected", "TaskCancelled", "TaskCompleted", "TaskCreated", "TaskDeleted", "TaskEdited", "TaskHistoryRedacted", "TaskMovedIn", "TaskMovedOut", "TaskPurged", "TaskReopened", "TaskReverted"])
}
