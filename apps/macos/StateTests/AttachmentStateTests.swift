import Foundation
import Testing
import TodoAPI

@testable import TodoState

@Test func attachmentOpenDecisionRefusesExecutablesBundlesAndSymlinks() throws {
  let root = FileManager.default.temporaryDirectory.appendingPathComponent(
    "todo-f11-open-\(UUID())")
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: root) }
  func reference(_ path: URL) -> AttachmentSnapshot {
    .init(id: "attachment", location: .file(path.path), added_at: "2026-10-29T00:00:00Z")
  }
  let safe = root.appendingPathComponent("draft.md")
  try Data("Jira draft".utf8).write(to: safe)
  #expect(AttachmentOpening.allowedURL(reference(safe)) == safe.resolvingSymlinksInPath())
  let executable = root.appendingPathComponent("run")
  try Data("#!/bin/sh\necho forbidden\n".utf8).write(to: executable)
  try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: executable.path)
  let alias = root.appendingPathComponent("alias.md")
  try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: executable)
  let bundle = root.appendingPathComponent("Unsafe.app")
  try FileManager.default.createDirectory(at: bundle, withIntermediateDirectories: true)
  let bundled = bundle.appendingPathComponent("notes.md")
  try Data("Bundle content".utf8).write(to: bundled)
  for path in [executable, alias, bundled] {
    #expect(AttachmentOpening.allowedURL(reference(path)) == nil)
  }
  let link = AttachmentSnapshot(
    id: "link", location: .link(try #require(URL(string: "https://example.com/issue/42"))),
    label: "jira", added_at: "2026-10-29T00:00:00Z")
  #expect(AttachmentOpening.allowedURL(link)?.absoluteString == "https://example.com/issue/42")
}

@Test func generatedAttachmentPayloadsPreserveEveryField() throws {
  func roundTrip<T: Codable>(_ type: T.Type, _ json: String) throws {
    let input = Data(json.utf8)
    let value = try JSONDecoder().decode(type, from: input)
    let output = try JSONEncoder().encode(value)
    #expect(
      try JSONSerialization.jsonObject(with: output) as? NSDictionary
        == JSONSerialization.jsonObject(with: input) as? NSDictionary)
  }
  try roundTrip(
    Operations.tasks_period_attach.Input.Body.jsonPayload.self,
    #"{"from_version":3,"location":{"kind":"file","path":"/tmp/jira-draft.md"},"label":"jira"}"#)
  try roundTrip(
    Operations.tasks_period_attach.Input.Body.jsonPayload.self,
    #"{"from_version":4,"location":{"kind":"link","url":"https://example.com/issue/42"}}"#)
  try roundTrip(
    Operations.tasks_period_detach.Input.Body.jsonPayload.self,
    #"{"from_version":5,"attachment_id":"attachment-1"}"#)
  try roundTrip(
    Operations.tasks_period_uploadAttachment.Input.Body.jsonPayload.self,
    #"{"from_version":6,"mime_type":"image/png","data":"iVBORw0KGgo=","label":"jira"}"#)
  try roundTrip(Operations.tasks_period_labelAttachment.Input.Body.jsonPayload.self, #"{"from_version":7,"attachment_id":"attachment-1","label":"jira"}"#)
  try roundTrip(Operations.tasks_period_labelAttachment.Input.Body.jsonPayload.self, #"{"from_version":8,"attachment_id":"attachment-1","label":null}"#)
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveAttachmentsUseProductionModelAndSurviveReload() async throws {
  let server = try #require(
    ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
  let session = try await todoClient(server: server, credential: "").signIn_period_signIn(
    body: .json(.init(passphrase: "scratch verification passphrase"))
  ).ok.body.json
  let client = todoClient(server: server, credential: session.credential)
  let created = try await client.tasks_period_create(
    path: .init(profile: "work"), body: .json(.init(title: "F11 Swift attachments"))
  ).ok.body.json
  let base = try TaskSnapshot.decode(created)
  let model = TodoModel(
    configuration: .init(
      server: server, initialProfile: "work", vaultService: "never-used-attachments"),
    clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
  model.signedIn = true
  model.connection = .live
  model.beginEditing(base)
  model.editor?.title = "Keep this unsaved draft"
  let scratch = URL(
    fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_SCRATCH"]))
  let draft = scratch.appendingPathComponent("jira-draft.md")
  try Data("Swift Jira draft".utf8).write(to: draft)
  await model.attachPath(draft.path, label: "jira")
  #expect(model.editorError == nil)
  #expect(model.editor?.base.row_version == 2)
  #expect(model.editor?.title == "Keep this unsaved draft")
  #expect(model.editor?.base.jiraAttachment?.path == draft.path)
  #expect(model.editor?.base.jiraAttachment?.exists == true)
  await model.attachLink("https://example.com/issue/42")
  #expect(model.editor?.base.row_version == 3)
  let png = try #require(
    Data(
      base64Encoded:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg=="
    ))
  await model.uploadImage(png, mimeType: "image/png")
  #expect(model.editorError == nil)
  #expect(model.editor?.base.row_version == 4)
  let image = try #require(model.editor?.base.attachments?.last)
  #expect(image.isImage)
  #expect(image.exists == true)
  #expect(try Data(contentsOf: image.url) == png)
  let attached = try #require(model.editor?.base.attachments?.first)
  await model.detachAttachment(attached)
  #expect(model.editor?.base.row_version == 5)
  #expect(model.editor?.base.attachments?.count == 2)
  let entries = try await client.reads_period_history(path: .init(profile: "work", task: base.id))
    .ok.body.json
  let history = try JSONDecoder().decode([HistoryEntry].self, from: JSONEncoder().encode(entries))
  let removal = try #require(history.last { $0.event.kind == "AttachmentRemoved" })
  #expect(removal.label == "Attachment removed")
  #expect(removal.canRevert(in: history))
  await model.write(.revert(removal.seq))
  #expect(model.editor?.base.row_version == 6)
  #expect(model.editor?.base.attachments?.count == 3)
  try FileManager.default.removeItem(at: draft)
  await model.reloadAttachments()
  let durable = try #require(model.tasks.first { $0.id == base.id })
  #expect(durable.row_version == 6)
  #expect(durable.jiraAttachment?.exists == false)
  #expect(durable.attachments?.count == 3)
  model.beginEditing(durable)
  #expect(model.editor?.base.jiraAttachment?.label == "jira")
  #expect(model.editor?.base.attachments?.last?.exists == true)
  let receipt: [String: Any] = [
    "id": base.id, "version": 6, "attachments": 3, "jira": true, "missingFile": true,
    "imageExists": true, "reloaded": true,
  ]
  if let directory = ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"].map({
    URL(fileURLWithPath: $0).deletingLastPathComponent()
  }) {
    try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
      .write(to: directory.appendingPathComponent("attachments-http.json"))
  }
}

@Test func attachmentAcceptanceKeepsConflictVersionAndUnsavedText() {
  func task(_ title: String, version: Int) -> TaskSnapshot {
    TaskSnapshot(
      id: "conflict-task", profile_id: "work", row_version: version, title: title, description: nil,
      priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil,
      scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil,
      legacy_series_detached: nil, deleted_at: nil)
  }
  var draft = TaskDraft(task("Original title", version: 1))
  draft.title = "My unsaved title"
  var accepted = task("Remote title", version: 3)
  accepted.attachments = [
    .init(
      id: "attachment-1", location: .file("/tmp/draft.md"), label: "jira",
      added_at: "2026-10-29T00:00:00Z")
  ]
  let preserved = draft.acceptingAttachmentChange(accepted)
  #expect(preserved.base.row_version == 1)
  #expect(preserved.base.title == "Original title")
  #expect(preserved.title == "My unsaved title")
  #expect(preserved.base.jiraAttachment?.path == "/tmp/draft.md")
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveAttachmentDoesNotSilentlyAcceptAnOverlappingTextEdit() async throws {
  let server = try #require(
    ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
  let session = try await todoClient(server: server, credential: "").signIn_period_signIn(
    body: .json(.init(passphrase: "scratch verification passphrase"))
  ).ok.body.json
  let client = todoClient(server: server, credential: session.credential)
  let created = try await client.tasks_period_create(
    path: .init(profile: "work"), body: .json(.init(title: "F11 attachment conflict"))
  ).ok.body.json
  let base = try TaskSnapshot.decode(created)
  let model = TodoModel(
    configuration: .init(
      server: server, initialProfile: "work", vaultService: "never-used-attachment-conflict"),
    clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
  model.signedIn = true
  model.connection = .live
  model.beginEditing(base)
  model.editor?.title = "My unsaved title"
  let edit = try JSONDecoder().decode(
    Operations.tasks_period_edit.Input.Body.jsonPayload.self,
    from: Data(#"{"from_version":1,"changes":{"title":"Remote title"}}"#.utf8))
  _ = try await client.tasks_period_edit(
    path: .init(profile: "work", task: base.id), body: .json(edit)
  ).ok.body.json
  await model.reloadAttachments()
  #expect(model.attachmentTask?.row_version == 2)
  await model.attachLink("https://example.com/issue/43")
  #expect(model.editor?.title == "My unsaved title")
  #expect(model.editor?.base.row_version == 1)
  #expect(model.tasks.first { $0.id == base.id }?.row_version == 3)
  _ = await model.save()
  #expect(model.conflict?.latest?.title == "Remote title")
  #expect(model.conflict?.latest?.row_version == 3)
  #expect(model.editor?.title == "My unsaved title")
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveAttachmentLabelsKeepIdentityAndRevert() async throws {
  let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
  let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
  let client = todoClient(server: server, credential: session.credential)
  let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: Data(#"{"title":"F11 label editing","project_name":"Client Project","tag_names":["planning","review"]}"#.utf8))
  let base = try TaskSnapshot.decode(try await client.tasks_period_create(path: .init(profile: "work"), body: .json(payload)).ok.body.json)
  #expect(base.project_id != nil)
  #expect(base.tags.count == 2)
  let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-labels"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
  model.signedIn = true; model.connection = .live; model.beginEditing(base)
  await model.attachPath("/tmp/f11-missing-label-draft.md")
  let attachment = try #require(model.attachmentTask?.attachments?.first)
  #expect(attachment.title == "f11-missing-label-draft.md")
  await model.labelAttachment(attachment, label: "jira")
  #expect(model.attachmentTask?.jiraAttachment?.id == attachment.id)
  #expect(model.attachmentTask?.jiraAttachment?.title == "f11-missing-label-draft.md")
  await model.labelAttachment(attachment, label: nil)
  #expect(model.attachmentTask?.jiraAttachment == nil)
  let entries = try await client.reads_period_history(path: .init(profile: "work", task: base.id)).ok.body.json
  let history = try JSONDecoder().decode([HistoryEntry].self, from: JSONEncoder().encode(entries))
  let cleared = try #require(history.last { $0.event.kind == "TaskEdited" })
  await model.write(.revert(cleared.seq))
  await model.reloadAttachments()
  let durable = try #require(model.tasks.first { $0.id == base.id })
  #expect(durable.row_version == 5)
  #expect(durable.jiraAttachment?.id == attachment.id)
  #expect(durable.jiraAttachment?.path == "/tmp/f11-missing-label-draft.md")
  #expect(durable.jiraAttachment?.exists == false)
  #expect(durable.jiraAttachment?.added_at == attachment.added_at)
  #expect(durable.project_id == base.project_id)
  #expect(durable.tags == base.tags)
  model.beginEditing(durable)
  let png = try #require(Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg=="))
  await model.uploadImage(png, mimeType: "image/png", name: "sketch.png")
  let sourceImage = try #require(model.attachmentTask?.attachments?.last)
  #expect(sourceImage.byte_size == 67)
  #expect(sourceImage.secondaryText == "Copied image · 67 bytes")
  await model.write(.copy("personal"))
  let copy = try #require(model.transferResult?.task)
  let copiedImage = try #require(copy.attachments?.last)
  #expect(model.profile == "work")
  #expect(copiedImage.id != sourceImage.id)
  #expect(copiedImage.path != sourceImage.path)
  #expect(copiedImage.title == "sketch.png")
  let response = try await client.tasks_period_attachmentImage(path: .init(profile: "personal", task: copy.id, attachment: copiedImage.id)).ok.body.json
  #expect(response.data == png.base64EncodedString())
}

@Test func attachmentURIDecodingKeepsOpaqueLinksWithoutOpeningThem() throws {
  for uri in ["t3-thread://v2/host/thread", "mailto:owner@example.com", "urn:todo:task", "javascript:alert(1)"] {
    let data = try JSONSerialization.data(withJSONObject: ["id": "uri", "kind": "link", "url": uri, "added_at": "2026-11-03T00:00:00Z"])
    let value = try JSONDecoder().decode(AttachmentSnapshot.self, from: data)
    #expect(value.displayPath == uri)
    #expect(!value.title.isEmpty)
    #expect(AttachmentOpening.allowedURL(value) == nil)
  }
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveCLI01URIAndImportAdoptionSurviveReload() async throws {
  let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
  let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
  let client = todoClient(server: server, credential: session.credential)
  let created = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "CLI01 Swift original"))).ok.body.json
  let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-cli01"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
  model.signedIn = true
  model.connection = .live
  model.beginEditing(try TaskSnapshot.decode(created))
  await model.attachLink("t3-thread://v2/swift/thread")
  #expect(model.editorError == nil)
  #expect(model.editor?.base.row_version == 2)
  #expect(model.editor?.base.attachments?.first?.displayPath == "t3-thread://v2/swift/thread")
  let item: [String: Any] = ["external_id": "cli01:swift:adopt", "task_id": created.id, "from_version": 1, "title": "CLI01 Swift adopted", "attachments": [["kind": "link", "url": "mailto:swift@example.com"]]]
  model.loadImport(data: try JSONSerialization.data(withJSONObject: [item]), name: "adopt.json")
  await model.previewImport()
  #expect(model.importReport?.items.first?.error?.code == "occ_conflict")
  #expect(model.importReport?.items.first?.error?.message.contains("no external id yet") == true)
  var current = item
  current["from_version"] = 2
  model.loadImport(data: try JSONSerialization.data(withJSONObject: [current]), name: "adopt.json")
  await model.previewImport()
  #expect(model.importReport?.totals == .init(created: 0, updated: 1, unchanged: 0, rejected: 0))
  await model.applyImport()
  #expect(model.importReport?.totals == .init(created: 0, updated: 1, unchanged: 0, rejected: 0))
  let reload = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: "work", task: created.id)).ok.body.json)
  #expect(reload.title == "CLI01 Swift adopted")
  #expect(reload.external_id == "cli01:swift:adopt")
  #expect(reload.row_version == 4)
  #expect(reload.attachments?.map(\.displayPath) == ["t3-thread://v2/swift/thread", "mailto:swift@example.com"])
  let batchTask = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "CLI01 Swift batch"))).ok.body.json
  model.beginEditing(try TaskSnapshot.decode(batchTask))
  let scratch = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_SCRATCH"]))
  let first = scratch.appendingPathComponent("cli01-first.md")
  let second = scratch.appendingPathComponent("cli01-second.md")
  try Data("First".utf8).write(to: first)
  try Data("Second".utf8).write(to: second)
  await model.attachPaths([first.path, scratch.appendingPathComponent("cli01-missing.md").path])
  #expect(model.editorError != nil)
  #expect(model.editor?.base.row_version == 1)
  await model.attachPaths([first.path, second.path])
  #expect(model.editorError == nil)
  #expect(model.editor?.base.row_version == 3)
  await model.attachPaths([first.path, second.path])
  #expect(model.editor?.base.row_version == 3)
  let batchReload = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: "work", task: batchTask.id)).ok.body.json)
  #expect(batchReload.attachments?.map(\.displayPath) == [first.path, second.path])
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil)) @MainActor
func liveAttachmentBatchSelectPreviewApplyConflictAndReload() async throws {
  let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
  let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
  let client = todoClient(server: server, credential: session.credential)
  let first = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "CLI01 native first"))).ok.body.json
  let second = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "CLI01 native second"))).ok.body.json
  let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-cli01-batch"), clientFactory: { _, _ in todoClient(server: server, credential: session.credential) })
  model.signedIn = true
  model.connection = .live
  let reference = AttachmentSnapshot(id: "reference", location: .link(try #require(URL(string: "t3-thread://v2/swift/batch"))), label: "thread", added_at: "2026-11-03T00:00:00Z")
  model.beginEditing(try TaskSnapshot.decode(first))
  model.editor?.title = "Preserve the unsaved draft"
  await model.beginAttachmentBatch(reference)
  #expect(model.attachmentBatch?.error == nil)
  model.attachmentBatch?.selected = [first.id, second.id]
  await model.applyAttachmentBatch(dryRun: true)
  #expect(model.attachmentBatch?.report?.items.map(\.outcome) == ["attached", "attached"])
  #expect(try await client.tasks_period_show(path: .init(profile: "work", task: first.id)).ok.body.json.row_version == 1)
  await model.applyAttachmentBatch(dryRun: false)
  #expect(model.attachmentBatch?.report?.items.map(\.outcome) == ["attached", "attached"])
  let saved = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: "work", task: first.id)).ok.body.json)
  #expect(saved.row_version == 2)
  #expect(model.editor?.base.row_version == 2)
  #expect(model.editor?.title == "Preserve the unsaved draft")
  #expect(saved.attachments?.map(\.displayPath) == ["t3-thread://v2/swift/batch"])
  await model.applyAttachmentBatch(dryRun: false)
  #expect(model.attachmentBatch?.report?.items.map { $0.error?.code } == ["occ_conflict", "occ_conflict"])
  await model.reloadAttachmentTargets()
  await model.applyAttachmentBatch(dryRun: true)
  #expect(model.attachmentBatch?.report?.items.map(\.outcome) == ["unchanged", "unchanged"])
  let scratch = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_SCRATCH"]))
  let file = scratch.appendingPathComponent("cli01-shared.md")
  try Data("Shared file".utf8).write(to: file)
  await model.beginAttachmentBatch(AttachmentSnapshot(id: "file", location: .file(file.path), added_at: "2026-11-03T00:00:00Z"))
  model.attachmentBatch?.selected = [first.id, second.id]
  await model.applyAttachmentBatch(dryRun: false)
  #expect(model.attachmentBatch?.report?.items.map(\.outcome) == ["attached", "attached"])
  let fileReload = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: "work", task: second.id)).ok.body.json)
  #expect(fileReload.row_version == 3)
  #expect(fileReload.attachments?.last?.path == file.path)
}
