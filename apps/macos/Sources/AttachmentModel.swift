import Foundation
import TodoAPI

extension TodoModel {
  var attachmentTask: TaskSnapshot? {
    guard let base = editor?.base else { return nil }
    return tasks.first { $0.id == base.id && $0.profile_id == base.profile_id } ?? base
  }
  enum AttachmentResult {
    case accepted(TaskSnapshot)
    case conflict(TaskSnapshot?)
  }

  private func changeAttachment(_ operation: (Client, TaskDraft) async throws -> AttachmentResult)
    async
  {
    let credentialEpoch = discovery.credentialEpoch
    guard canWrite, let draft = editor, conflict == nil else { return }
    busy = true
    editorError = nil
    defer { busy = false }
    do {
      var attachmentDraft = draft
      attachmentDraft.base = attachmentTask ?? draft.base
      let result = try await operation(client, attachmentDraft)
      guard isCurrentCredential(credentialEpoch), profile == draft.base.profile_id, editor?.id == draft.id else { return }
      switch result {
      case .accepted(let task):
        editor = editor?.acceptingAttachmentChange(task)
        await refreshAfterWrite("Attachment updated")
      case .conflict(let latest):
        if let latest { editor = editor?.acceptingAttachmentChange(latest) }
        await refreshAfterWrite("Task changed")
        editorError = "Task changed. Your draft is preserved. Retry the Attachment action."
      }
    } catch {
      guard isCurrentCredential(credentialEpoch) else { return }
      editorError = describe(error, at: .editor)
      handleAuthorization(error, credentialEpoch: credentialEpoch)
    }
  }

  func attachPath(_ path: String, label: String? = nil) async {
    await attachLocation(
      [
        "kind": ["png", "jpg", "jpeg", "gif", "webp"].contains(
          URL(fileURLWithPath: path).pathExtension.lowercased()) ? "image" : "file",
        "path": URL(fileURLWithPath: path).standardizedFileURL.path,
      ], label: label)
  }
  func attachPaths(_ paths: [String], label: String? = nil) async {
    guard !paths.isEmpty else { return }
    await changeAttachment { client, draft in
      let attachments = paths.map { path -> [String: String] in
        var value = ["kind": ["png", "jpg", "jpeg", "gif", "webp"].contains(URL(fileURLWithPath: path).pathExtension.lowercased()) ? "image" : "file", "path": URL(fileURLWithPath: path).standardizedFileURL.path]
        if let label, !label.isEmpty { value["label"] = label }
        return value
      }
      let value: [String: Any] = ["items": [["task_id": draft.id, "from_version": draft.base.row_version, "attachments": attachments]]]
      let payload = try JSONDecoder().decode(Operations.tasks_period_attachMany.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: value))
      let response = try await client.tasks_period_attachMany(path: .init(profile: draft.base.profile_id), body: .json(payload)).ok.body.json
      let report = try JSONDecoder().decode(AttachmentBatchResponse.self, from: JSONEncoder().encode(response))
      if let row = report.items.first, row.outcome == "rejected", row.error?.code != "occ_conflict" {
        throw row.error ?? ServerFailure(message: "Attachments were rejected.")
      }
      let latest = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: draft.base.profile_id, task: draft.id)).ok.body.json)
      if report.items.first?.error?.code == "occ_conflict" { return .conflict(latest) }
      return .accepted(latest)
    }
  }
  func attachLink(_ text: String, label: String? = nil) async {
    guard let url = URL(string: text), url.scheme != nil,
      !text.contains(where: { $0.isWhitespace || $0.asciiValue.map { $0 < 32 || $0 == 127 } == true }),
      !["https", "http"].contains(url.scheme?.lowercased() ?? "") ||
        url.host != nil
    else {
      editorError = "Use an absolute URI. HTTP(S) links need a host."
      return
    }
    await attachLocation(["kind": "link", "url": text], label: label)
  }
  private func attachLocation(_ location: [String: String], label: String?) async {
    await changeAttachment { client, draft in
      var value: [String: Any] = ["from_version": draft.base.row_version, "location": location]
      if let label, !label.isEmpty { value["label"] = label }
      let payload = try JSONDecoder().decode(
        Operations.tasks_period_attach.Input.Body.jsonPayload.self,
        from: JSONSerialization.data(withJSONObject: value))
      let response = try await client.tasks_period_attach(
        path: .init(profile: draft.base.profile_id, task: draft.id), body: .json(payload))
      if case .conflict(let value) = response {
        return .conflict(
          try JSONDecoder().decode(
            AttachmentConflict.self, from: JSONEncoder().encode(value.body.json)
          ).latest)
      }
      return .accepted(try TaskSnapshot.decode(response.ok.body.json))
    }
  }
  func uploadImage(_ data: Data, mimeType: String, name: String? = nil, label: String? = nil) async {
    guard data.count <= 20 * 1024 * 1024 else {
      editorError = "Images must be 20 MiB or smaller."
      return
    }
    await changeAttachment { client, draft in
      var value: [String: Any] = [
        "from_version": draft.base.row_version, "mime_type": mimeType,
        "data": data.base64EncodedString(), "name": name ?? "Image.png",
      ]
      if let label, !label.isEmpty { value["label"] = label }
      let payload = try JSONDecoder().decode(
        Operations.tasks_period_uploadAttachment.Input.Body.jsonPayload.self,
        from: JSONSerialization.data(withJSONObject: value))
      let response = try await client.tasks_period_uploadAttachment(
        path: .init(profile: draft.base.profile_id, task: draft.id), body: .json(payload))
      if case .conflict(let value) = response {
        return .conflict(
          try JSONDecoder().decode(
            AttachmentConflict.self, from: JSONEncoder().encode(value.body.json)
          ).latest)
      }
      return .accepted(try TaskSnapshot.decode(response.ok.body.json))
    }
  }
  func detachAttachment(_ attachment: AttachmentSnapshot) async {
    await changeAttachment { client, draft in
      let response = try await client.tasks_period_detach(
        path: .init(profile: draft.base.profile_id, task: draft.id),
        body: .json(.init(from_version: draft.base.row_version, attachment_id: attachment.id)))
      if case .conflict(let value) = response {
        return .conflict(
          try JSONDecoder().decode(
            AttachmentConflict.self, from: JSONEncoder().encode(value.body.json)
          ).latest)
      }
      return .accepted(try TaskSnapshot.decode(response.ok.body.json))
    }
  }
  func labelAttachment(_ attachment: AttachmentSnapshot, label: String?) async {
    await changeAttachment { client, draft in
      let value: [String: Any] = ["from_version": draft.base.row_version, "attachment_id": attachment.id, "label": label.map { $0 as Any } ?? NSNull()]
      let payload = try JSONDecoder().decode(Operations.tasks_period_labelAttachment.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: value))
      let response = try await client.tasks_period_labelAttachment(path: .init(profile: draft.base.profile_id, task: draft.id), body: .json(payload))
      if case .conflict(let value) = response { return .conflict(try JSONDecoder().decode(AttachmentConflict.self, from: JSONEncoder().encode(value.body.json)).latest) }
      return .accepted(try TaskSnapshot.decode(response.ok.body.json))
    }
  }
  func reloadAttachments() async { await refreshAfterWrite("Attachments reloaded") }
}
private struct AttachmentConflict: Decodable { let latest: TaskSnapshot? }

extension TaskDraft {
  func acceptingAttachmentChange(_ task: TaskSnapshot) -> Self {
    guard overlaps(with: task).isEmpty else {
      var preserved = self
      preserved.base.attachments = task.attachments
      return preserved
    }
    return merging(task, choices: [:])
  }
}

private struct AttachmentBatchResponse: Decodable {
  struct Row: Decodable {
    typealias Failure = ServerFailure
    let outcome: String
    let error: Failure?
  }
  let items: [Row]
}
