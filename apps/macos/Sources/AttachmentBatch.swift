import Foundation
import SwiftUI
import TodoAPI

struct AttachmentBatchReport: Decodable, Sendable {
  struct Row: Decodable, Sendable {
    struct Failure: Decodable, Sendable { let code: String; let message: String }
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
    guard let draft = attachmentBatch, canWrite else { return }
    attachmentBatch?.loading = true
    attachmentBatch?.error = nil
    do {
      let values = try await client.tasks_period_list(path: .init(profile: draft.profile)).ok.body.json.map(TaskSnapshot.decode)
      guard attachmentBatch?.id == draft.id, profile == draft.profile else { return }
      attachmentBatch?.targets = values
      attachmentBatch?.selected.formIntersection(Set(values.map(\.id)))
      attachmentBatch?.report = nil
    } catch {
      guard attachmentBatch?.id == draft.id else { return }
      attachmentBatch?.error = describe(error)
      handleAuthorization(error)
    }
    if attachmentBatch?.id == draft.id { attachmentBatch?.loading = false }
  }
  func applyAttachmentBatch(dryRun: Bool) async {
    guard canWrite, let draft = attachmentBatch, !draft.loading, !draft.selected.isEmpty else { return }
    busy = true
    attachmentBatch?.error = nil
    defer { busy = false }
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
      guard attachmentBatch?.id == draft.id, profile == draft.profile else { return }
      attachmentBatch?.report = report
      if !dryRun {
        if let editor, draft.selected.contains(editor.id) {
          let latest = try TaskSnapshot.decode(try await client.tasks_period_show(path: .init(profile: draft.profile, task: editor.id)).ok.body.json)
          self.editor = self.editor?.acceptingAttachmentChange(latest)
        }
        await refreshAfterWrite("Attachments updated")
      }
    } catch {
      guard attachmentBatch?.id == draft.id else { return }
      attachmentBatch?.error = describe(error)
      handleAuthorization(error)
    }
  }
}

struct AttachmentBatchView: View {
  @Bindable var model: TodoModel
  var body: some View {
    if let draft = model.attachmentBatch {
      VStack(alignment: .leading, spacing: 8) {
        Text("Attach to Tasks").font(.headline)
        Text("Choose Tasks. Existing Attachments stay.").font(.caption).foregroundStyle(.secondary)
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
                    Text(row.error?.message ?? (row.outcome == "attached" ? draft.report?.dry_run == true ? "Ready to attach" : "Attached" : "Already attached"))
                      .font(.caption).foregroundStyle(row.error == nil ? AnyShapeStyle(.secondary) : AnyShapeStyle(TodoColors.color("destructive")))
                  }
                }
              }.toggleStyle(.checkbox).frame(minHeight: 56).disabled(model.busy)
              .accessibilityLabel("Select \(task.title)")
            }
          }.frame(maxWidth: .infinity, alignment: .leading)
        }.frame(minHeight: 56, maxHeight: 224)
        Divider()
        if let error = draft.error { Text(error).font(.caption).foregroundStyle(TodoColors.color("destructive")) }
        HStack(spacing: 8) {
          Button("Reload Tasks") { Task { await model.reloadAttachmentTargets() } }.disabled(model.busy || draft.loading)
          Spacer(minLength: 0)
          Button("Close") { model.attachmentBatch = nil }.disabled(model.busy)
          Button("Preview") { Task { await model.applyAttachmentBatch(dryRun: true) } }.disabled(model.busy || draft.loading || draft.selected.isEmpty || !model.canWrite)
        }.controlSize(.regular)
        Button("Attach to \(draft.selected.count) \(draft.selected.count == 1 ? "Task" : "Tasks")") { Task { await model.applyAttachmentBatch(dryRun: false) } }
          .buttonStyle(.borderedProminent).frame(maxWidth: .infinity, alignment: .trailing).controlSize(.large)
          .disabled(model.busy || draft.loading || draft.selected.isEmpty || !model.canWrite)
      }.padding(12).frame(minWidth: 340, idealWidth: 360, maxWidth: 480, minHeight: 340, idealHeight: 400, maxHeight: 426)
      .accessibilityIdentifier("attachment-batch")
    }
  }
}
