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
    guard canWrite, let draft = editor, conflict == nil else { return }
    busy = true
    editorError = nil
    defer { busy = false }
    do {
      var attachmentDraft = draft
      attachmentDraft.base = attachmentTask ?? draft.base
      let result = try await operation(client, attachmentDraft)
      guard profile == draft.base.profile_id, editor?.id == draft.id else { return }
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
      editorError = describe(error)
      handleAuthorization(error)
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
  func attachLink(_ text: String, label: String? = nil) async {
    guard let url = URL(string: text), ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
      url.host != nil, url.user == nil, url.password == nil
    else {
      editorError = "Use an HTTP or HTTPS link without credentials."
      return
    }
    await attachLocation(["kind": "link", "url": url.absoluteString], label: label)
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
