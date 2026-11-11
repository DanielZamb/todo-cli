import Foundation
import SwiftUI
import TodoAPI

struct AttachmentBatchReport: Decodable, Sendable {
  struct Row: Decodable, Sendable {
    typealias Failure = ServerFailure
    let task_id: String?
    let outcome: String
    let current_version: Int?
    let error: Failure?
  }
  let dry_run: Bool
  let items: [Row]
}
struct AttachmentBatchDraft: Identifiable {
  let id = UUID()
  let profile: String
  let reference: AttachmentSnapshot
  var label: String
  init(profile: String, reference: AttachmentSnapshot) { self.profile = profile; self.reference = reference; self.label = reference.label ?? "" }
  var targets: [TaskSnapshot] = []
  var selected: Set<String> = []
  var loading = true
  var error: String?
  var report: AttachmentBatchReport?
}

extension TodoModel {
  func beginAttachmentBatch(_ attachment: AttachmentSnapshot) async {
    guard canWrite, !attachment.isImage else { return }
    attachmentBatch = AttachmentBatchDraft(profile: profile, reference: attachment)
    await reloadAttachmentTargets()
  }
  func reloadAttachmentTargets() async {
    let credentialEpoch = discovery.credentialEpoch
    guard let draft = attachmentBatch, canWrite else { return }
    attachmentBatch?.loading = true
    attachmentBatch?.error = nil
    do {
      let values = try await client.tasks_period_list(path: .init(profile: draft.profile)).ok.body.json.map(TaskSnapshot.decode)
      guard isCurrentCredential(credentialEpoch), attachmentBatch?.id == draft.id, profile == draft.profile else { return }
      attachmentBatch?.targets = values
      attachmentBatch?.selected.formIntersection(Set(values.map(\.id)))
      attachmentBatch?.report = nil
    } catch {
      guard isCurrentCredential(credentialEpoch), attachmentBatch?.id == draft.id else { return }
      attachmentBatch?.error = describe(error, at: .attachmentBatch)
      handleAuthorization(error, credentialEpoch: credentialEpoch)
    }
    if isCurrentCredential(credentialEpoch), attachmentBatch?.id == draft.id { attachmentBatch?.loading = false }
  }
  func applyAttachmentBatch(dryRun: Bool) async {
    let credentialEpoch = discovery.credentialEpoch
    guard canWrite, let draft = attachmentBatch, !draft.loading, !draft.selected.isEmpty else { return }
    let client = self.client
    busy = true
    attachmentBatch?.error = nil
    defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
    do {
      let encoded = try JSONEncoder().encode(draft.reference)
      var reference = try JSONDecoder().decode([String: String].self, from: encoded)
      reference.removeValue(forKey: "id")
      reference.removeValue(forKey: "added_at")
      reference.removeValue(forKey: "label")
      let label = draft.label.trimmingCharacters(in: .whitespacesAndNewlines)
      if !label.isEmpty { reference["label"] = label }
      let items: [[String: Any]] = draft.targets.filter { draft.selected.contains($0.id) }.map { ["task_id": $0.id, "from_version": $0.row_version, "attachments": [reference]] }
      let payload = try JSONDecoder().decode(Operations.tasks_period_attachMany.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: ["items": items, "dry_run": dryRun]))
      let value = try await client.tasks_period_attachMany(path: .init(profile: draft.profile), body: .json(payload)).ok.body.json
      let report = try JSONDecoder().decode(AttachmentBatchReport.self, from: JSONEncoder().encode(value))
      guard isCurrentCredential(credentialEpoch), attachmentBatch?.id == draft.id, profile == draft.profile else { return }
      attachmentBatch?.report = report
      if !dryRun {
        if let editor, draft.selected.contains(editor.id) {
          let wire = try await client.tasks_period_show(path: .init(profile: draft.profile, task: editor.id)).ok.body.json
          guard isCurrentCredential(credentialEpoch), attachmentBatch?.id == draft.id, profile == draft.profile, self.editor?.id == editor.id else { return }
          let latest = try TaskSnapshot.decode(wire)
          self.editor = self.editor?.acceptingAttachmentChange(latest)
        }
        await refreshAfterWrite("Attachments updated")
      }
    } catch {
      guard isCurrentCredential(credentialEpoch), attachmentBatch?.id == draft.id else { return }
      attachmentBatch?.error = describe(error, at: .attachmentBatch)
      handleAuthorization(error, credentialEpoch: credentialEpoch)
    }
  }
}

struct AttachmentBatchView: View {
  @Bindable var model: TodoModel
  var body: some View {
    if let draft = model.attachmentBatch {
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text("Attach to Tasks").font(.headline)
          Spacer()
          Button { model.attachmentBatch = nil } label: { Image(systemName: "xmark").font(.caption).frame(width: 28, height: 28) }
            .buttonStyle(.borderless).accessibilityLabel("Close").disabled(model.busy)
        }
        Text(draft.reference.displayPath).font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle).textSelection(.enabled)
        HStack {
          Text("Label").font(.caption)
          TextField("Optional", text: Binding(get: { model.attachmentBatch?.label ?? "" }, set: { model.attachmentBatch?.label = $0; model.attachmentBatch?.report = nil })).disabled(model.busy)
            .textFieldStyle(.roundedBorder).accessibilityLabel("Attachment label for selected Tasks")
        }
        Divider()
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 0) {
            if draft.loading { Text("Loading Tasks…").padding(.vertical, 16) }
            else if draft.targets.isEmpty { Text("No Tasks in this Profile.").padding(.vertical, 16) }
            ForEach(draft.targets) { task in
              let row = draft.report?.items.first { $0.task_id == task.id }
              Toggle(isOn: Binding(get: { model.attachmentBatch?.selected.contains(task.id) == true }, set: { selected in
                if selected { model.attachmentBatch?.selected.insert(task.id) } else { model.attachmentBatch?.selected.remove(task.id) }
                model.attachmentBatch?.report = nil
              })) {
                VStack(alignment: .leading, spacing: 4) {
                  Text(task.title).font(.callout).lineLimit(2)
                  if let row {
                    if let failure = row.error { ServerErrorNotice(model: model, failure: failure, currentVersion: row.current_version) }
                    else { Text(row.outcome == "attached" ? draft.report?.dry_run == true ? "Ready to attach" : "Attached" : "Already attached").font(.caption).foregroundStyle(.secondary) }
                  }
                }
              }.toggleStyle(.checkbox).frame(minHeight: 56).disabled(model.busy)
              .accessibilityLabel("Select \(task.title)").reportErrorBounds("row-" + task.id).batchBounds("batch-row-\(task.id)")
            }
          }.frame(maxWidth: .infinity, alignment: .leading)
        }.frame(height: 224).reportErrorBounds("viewport").batchBounds("batch-viewport")
        Divider()
        if let error = draft.error { ClientErrorNotice(model: model, text: error, position: .attachmentBatch) }
        HStack(spacing: 8) {
          Button("Reload") { Task { await model.reloadAttachmentTargets() } }.disabled(model.busy || draft.loading).accessibilityLabel("Reload Tasks")
          Spacer(minLength: 0)
          Button("Preview") { Task { await model.applyAttachmentBatch(dryRun: true) } }.disabled(model.busy || draft.loading || draft.selected.isEmpty || !model.canWrite)
          Button("Attach to \(draft.selected.count) \(draft.selected.count == 1 ? "Task" : "Tasks")") { Task { await model.applyAttachmentBatch(dryRun: false) } }
            .buttonStyle(.borderedProminent).disabled(model.busy || draft.loading || draft.selected.isEmpty || !model.canWrite)
        }.controlSize(.large).batchBounds("batch-footer")
      }.padding(12).frame(minWidth: 340, idealWidth: 360, maxWidth: 480, minHeight: 340, idealHeight: 400, maxHeight: 426)
      .accessibilityIdentifier("attachment-batch")
    }
  }
}

private extension View {
  func batchBounds(_ id: String) -> some View {
    background(GeometryReader { geometry in
      Color.clear.preference(key: AttachmentLayoutKey.self, value: [id: geometry.frame(in: .global)])
    })
  }
}
