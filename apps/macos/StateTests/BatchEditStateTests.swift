import Foundation
import Testing
import TodoAPI
@testable import TodoState

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveBatchEditSelectPreviewApplyConflictAndReload() async throws {
  let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
  let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
  let client = todoClient(server: server, credential: session.credential)
  let first = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "CLI02 first"))).ok.body.json
  let second = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "CLI02 second"))).ok.body.json
  let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-cli02"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
  model.signedIn = true
  model.connection = .live
  await model.beginBatchEdit()
  #expect(model.batchEdit?.error == nil)
  model.batchEdit?.selected = [first.id, second.id]
  await model.applyBatchEdit(dryRun: true)
  #expect(model.batchEdit?.report?.items.map(\.outcome) == ["updated", "updated"])
  #expect(model.batchEdit?.report?.items.map(\.current_version) == [1, 1])
  #expect(try await client.tasks_period_show(path: .init(profile: "work", task: first.id)).ok.body.json.row_version == 1)
  let competing = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"changes":{"title":"CLI02 competing edit"}}"#.utf8))
  _ = try await client.tasks_period_edit(path: .init(profile: "work", task: second.id), body: .json(competing)).ok
  await model.applyBatchEdit(dryRun: false)
  #expect(model.batchEdit?.report?.items.map(\.outcome) == ["updated", "rejected"])
  #expect(model.batchEdit?.report?.items.map { $0.error?.code } == [nil, "occ_conflict"])
  #expect(model.batchEdit?.report?.items.map(\.current_version) == [2, 2])
  let savedFirst = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: "work", task: first.id)).ok.body.json)
  let savedSecond = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: "work", task: second.id)).ok.body.json)
  #expect(savedFirst.priority == "P1")
  #expect(savedFirst.row_version == 2)
  #expect(savedSecond.title == "CLI02 competing edit")
  #expect(savedSecond.priority == "P3")
  #expect(savedSecond.row_version == 2)
  await model.reloadBatchEditTargets()
  #expect(model.batchEdit?.selected == [first.id, second.id])
  #expect(model.batchEdit?.report == nil)
  model.batchEdit?.selected = [second.id]
  await model.applyBatchEdit(dryRun: true)
  #expect(model.batchEdit?.report?.items.map(\.current_version) == [2])
  await model.applyBatchEdit(dryRun: false)
  let reloaded = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: "work", task: second.id)).ok.body.json)
  #expect(reloaded.priority == "P1")
  #expect(reloaded.row_version == 3)
  model.batchEdit?.field = .due_at
  model.batchEdit?.value = "2026-02-30"
  #expect(model.batchEdit?.valid == false)
  model.batchEdit?.value = "2026-11-05"
  #expect(model.batchEdit?.valid == true)
  await model.reloadBatchEditTargets()
  await model.applyBatchEdit(dryRun: false)
  #expect(try await client.tasks_period_show(path: .init(profile: "work", task: second.id)).ok.body.json.row_version == 4)
  model.batchEdit?.value = ""
  await model.reloadBatchEditTargets()
  await model.applyBatchEdit(dryRun: false)
  let cleared = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: "work", task: second.id)).ok.body.json)
  #expect(cleared.row_version == 5)
  #expect(cleared.due_at == nil)
}
