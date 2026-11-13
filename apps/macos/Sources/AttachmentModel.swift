import Foundation
import TodoAPI
import UniformTypeIdentifiers

/// What an Attachment input belonged to when the person dropped, chose or pasted it (MAC-C1-S1-24):
/// the credential epoch and the editor opening, with its Task and Profile. An input that resumes
/// after an await may start a write only while all of them are still current.
struct AttachmentInputOrigin: Equatable {
  let credentialEpoch: Int
  let opening: UUID
  let taskID: String
  let profile: String
}

extension TodoModel {
  /// The origin of an input starting now in the open editor, or nil when no editor is open.
  func attachmentInputOrigin() -> AttachmentInputOrigin? {
    editor.map { AttachmentInputOrigin(credentialEpoch: discovery.credentialEpoch, opening: $0.opening, taskID: $0.id, profile: profile) }
  }
  /// The one check for every Attachment input that resumes after an await (drop, open panel,
  /// paste): a file dropped under one Session is never written under another, and never reports
  /// into a later opening.
  func isCurrentAttachmentInput(_ origin: AttachmentInputOrigin) -> Bool {
    isCurrentEpoch(origin.credentialEpoch) && editor?.opening == origin.opening && editor?.id == origin.taskID && profile == origin.profile
  }
  static let attachmentImageTypes: [UTType] = [.png, .jpeg, .gif, .webP]

  /// A drop or a pasted provider (S1-24). Each provider's data arrives after an await; a file or
  /// image is written only while the origin is current, and the caption reports only into it.
  func receiveDroppedAttachments(_ providers: [NSItemProvider], origin: AttachmentInputOrigin, ticket: SurfaceMessages<AttachmentInputKind, String>.Ticket) async {
    var failed = false
    for provider in providers {
      do {
        guard isCurrentAttachmentInput(origin) else { return }
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
          let data = try await Self.providerData(provider, type: UTType.fileURL.identifier)
          guard isCurrentAttachmentInput(origin), let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
          await receiveDroppedFile(url, origin: origin, ticket: ticket)
        } else if let type = Self.attachmentImageTypes.first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }), let mime = type.preferredMIMEType {
          let data = try await Self.providerData(provider, type: type.identifier)
          await uploadImage(data, mimeType: mime, label: nil, origin: origin)
        }
      } catch {
        failed = true
        guard isCurrentAttachmentInput(origin) else { return }
        attachmentInputMessages.fail("Could not read the dropped file. Try Add file.", ticket)
      }
    }
    if !failed, isCurrentAttachmentInput(origin) { attachmentInputMessages.succeed(ticket) }
  }
  private func receiveDroppedFile(_ url: URL, origin: AttachmentInputOrigin, ticket: SurfaceMessages<AttachmentInputKind, String>.Ticket) async {
    if let type = UTType(filenameExtension: url.pathExtension), Self.attachmentImageTypes.contains(type), let mime = type.preferredMIMEType {
      guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 20 * 1024 * 1024, let data = try? Data(contentsOf: url) else {
        if isCurrentAttachmentInput(origin) { attachmentInputMessages.fail("Images must be 20 MiB or smaller.", ticket) }
        return
      }
      await uploadImage(data, mimeType: mime, name: url.lastPathComponent, origin: origin)
    } else {
      await attachPath(url.path, label: nil, origin: origin)
    }
  }
  static func providerData(_ provider: NSItemProvider, type: String) async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadDataRepresentation(forTypeIdentifier: type) { data, error in
        if let data { continuation.resume(returning: data) } else { continuation.resume(throwing: error ?? CocoaError(.fileReadUnknown)) }
      }
    }
  }

  var attachmentTask: TaskSnapshot? {
    guard let base = editor?.base else { return nil }
    return tasks.first { $0.id == base.id && $0.profile_id == base.profile_id } ?? base
  }
  enum AttachmentResult {
    case accepted(TaskSnapshot)
    case conflict(TaskSnapshot?)
    /// The write committed, but a secondary read after it failed: its read-back still runs (S1-19).
    case committed(Error)
  }

  private func changeAttachment(origin: AttachmentInputOrigin? = nil, _ operation: (Client, TaskDraft) async throws -> AttachmentResult)
    async
  {
    // An input that resumed after an await starts nothing unless what it belonged to is current;
    // its write then runs under the epoch it was made under (S1-24).
    if let origin, !isCurrentAttachmentInput(origin) { return }
    let credentialEpoch = origin?.credentialEpoch ?? discovery.credentialEpoch
    guard canWrite, let draft = editor, conflict == nil else { return }
    busy = true
    let attachmentTicket = editorMessages.beginClean(.attachment)
    defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
    do {
      var attachmentDraft = draft
      attachmentDraft.base = attachmentTask ?? draft.base
      let result = try await operation(client, attachmentDraft)
      // A committed write's secondary error is authorized first, before cancellation or a scope
      // change can end the handling (S1-23: S1-20's rule on S1-19's path).
      if case .committed(let readError) = result { authorize(readError, epoch: credentialEpoch, profile: draft.base.profile_id) }
      guard isCurrentCredential(credentialEpoch), profile == draft.base.profile_id else { return }
      // Once this editor has closed, an accepted Attachment change still reaches the list and nothing is shown.
      if case .committed = result {
        // Its secondary read failed after the commit: the read-back, which also brings the open
        // editor the committed Attachments (S1-19).
        await refreshAfterWrite("Attachment updated", owner: .surface(.editor(draft.opening), .init(attachmentTicket)))
        guard isCurrentCredential(credentialEpoch), profile == draft.base.profile_id else { return }
        if editor?.opening == draft.opening, let fresh = tasks.first(where: { $0.id == draft.id && $0.profile_id == draft.base.profile_id }) {
          editor = editor?.acceptingAttachmentChange(fresh)
        }
        return
      }
      guard editor?.opening == draft.opening else { if case .accepted = result { await refreshAfterWrite("Attachment updated", owner: .surface(.editor(draft.opening), .init(attachmentTicket))) }; return }
      switch result {
      case .accepted(let task):
        editor = editor?.acceptingAttachmentChange(task)
        await refreshAfterWrite("Attachment updated", owner: .surface(.editor(draft.opening), .init(attachmentTicket)))
      case .committed:
        break
      case .conflict(let latest):
        if let latest { editor = editor?.acceptingAttachmentChange(latest) }
        await refreshAfterWrite("Task changed", owner: .surface(.editor(draft.opening), .init(attachmentTicket)))
        guard isCurrentCredential(credentialEpoch), profile == draft.base.profile_id, editor?.opening == draft.opening else { return }
        editorMessages.fail("Task changed. Your draft is preserved. Retry the Attachment action.", attachmentTicket)
      }
    } catch {
      authorize(error, epoch: credentialEpoch, profile: draft.base.profile_id)
      guard isCurrentCredential(credentialEpoch) else { return }
      // A committed change whose reply could not be read still reads the catalog back (S1-19).
      if committedBeforeFailure(error), profile == draft.base.profile_id {
        await refreshAfterWrite("Attachment updated", owner: .surface(.editor(draft.opening), .init(attachmentTicket)))
        guard isCurrentCredential(credentialEpoch) else { return }
      }
      // A closed editor shows nothing; its error would otherwise reach whatever editor opens next.
      guard profile == draft.base.profile_id, editor?.opening == draft.opening else { return }
      editorMessages.fail(describe(error, at: .editor), attachmentTicket)
    }
  }

  func attachPath(_ path: String, label: String? = nil, origin: AttachmentInputOrigin? = nil) async {
    await attachLocation(origin: origin,
      [
        "kind": ["png", "jpg", "jpeg", "gif", "webp"].contains(
          URL(fileURLWithPath: path).pathExtension.lowercased()) ? "image" : "file",
        "path": URL(fileURLWithPath: path).standardizedFileURL.path,
      ], label: label)
  }
  func attachPaths(_ paths: [String], label: String? = nil, origin: AttachmentInputOrigin? = nil) async {
    notePersonActed() // a write the person started (MAC-C1-S1-32)
    guard !paths.isEmpty else { return }
    await changeAttachment(origin: origin) { client, draft in
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
      let conflicted = report.items.first?.error?.code == "occ_conflict"
      // The secondary read: if it fails, a conflict committed nothing (the error goes to the
      // ordinary failure path), but an accepted batch did, and its read-back must still run (S1-19).
      let latest: TaskSnapshot
      do { latest = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: draft.base.profile_id, task: draft.id)).ok.body.json) }
      catch { if conflicted { throw error }; return .committed(error) }
      if conflicted { return .conflict(latest) }
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
  private func attachLocation(origin: AttachmentInputOrigin? = nil, _ location: [String: String], label: String?) async {
    notePersonActed() // a write the person started (MAC-C1-S1-32)
    await changeAttachment(origin: origin) { client, draft in
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
  func uploadImage(_ data: Data, mimeType: String, name: String? = nil, label: String? = nil, origin: AttachmentInputOrigin? = nil) async {
    notePersonActed() // a write the person started (MAC-C1-S1-32)
    if let origin, !isCurrentAttachmentInput(origin) { return }
    guard data.count <= 20 * 1024 * 1024 else {
      editorError = "Images must be 20 MiB or smaller."
      return
    }
    await changeAttachment(origin: origin) { client, draft in
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
    notePersonActed() // a write the person started (MAC-C1-S1-32)
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
    notePersonActed() // a write the person started (MAC-C1-S1-32)
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
