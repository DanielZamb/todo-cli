import Foundation
import SwiftUI
import TodoAPI

enum BatchEditField: String, CaseIterable, Identifiable {
  case priority, project_name, tag_names, due_at, scheduled_at, energy, estimate_min, title, description
  var id: String { rawValue }
  var label: String {
    switch self {
    case .priority: "Priority"
    case .project_name: "Project"
    case .tag_names: "Tags"
    case .due_at: "Due date"
    case .scheduled_at: "Scheduled date"
    case .energy: "Energy"
    case .estimate_min: "Estimate in minutes"
    case .title: "Title"
    case .description: "Description"
    }
  }
}
struct BatchEditReport: Decodable, Sendable {
  struct Row: Decodable, Sendable {
    typealias Failure = ServerFailure
    let task_id: String
    let from_version: Int
    let current_version: Int?
    let outcome: String
    let error: Failure?
  }
  let dry_run: Bool
  let items: [Row]
}
struct BatchEditDraft: Identifiable {
  let id = UUID()
  let profile: String
  var targets: [TaskSnapshot] = []
  var selected: Set<String> = []
  var field = BatchEditField.priority
  var value = "P1"
  var loading = true
  var error: String?
  var report: BatchEditReport?
  var valid: Bool {
    switch field {
    case .priority: return ["P1", "P2", "P3", "P4"].contains(value)
    case .title: return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    case .energy: return value.isEmpty || (Int(value).map { (1...5).contains($0) } ?? false)
    case .estimate_min: return value.isEmpty || (Int(value).map { $0 > 0 } ?? false)
    case .due_at, .scheduled_at:
      if value.isEmpty { return true }
      let formatter = DateFormatter()
      formatter.locale = Locale(identifier: "en_US_POSIX")
      formatter.timeZone = TimeZone(secondsFromGMT: 0)
      formatter.dateFormat = "yyyy-MM-dd"
      formatter.isLenient = false
      return value.count == 10 && formatter.date(from: value).map { formatter.string(from: $0) == value } == true
    default: return true
    }
  }
  var change: [String: Any] {
    let result: Any
    switch field {
    case .tag_names: result = value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    case .due_at, .scheduled_at: result = value.isEmpty ? NSNull() : ["kind": "date", "date": value]
    case .energy, .estimate_min: result = Int(value).map { $0 as Any } ?? NSNull()
    case .description: result = value.isEmpty ? NSNull() : value
    default: result = value
    }
    return [field.rawValue: result]
  }
}
extension TodoModel {
  func beginBatchEdit() async {
    guard canWrite, !busy else { return }
    batchEdit = BatchEditDraft(profile: profile)
    await reloadBatchEditTargets()
  }
  func reloadBatchEditTargets() async {
    let credentialEpoch = discovery.credentialEpoch
    guard let draft = batchEdit, !busy else { return }
    batchEdit?.loading = true
    batchEdit?.report = nil
    batchEdit?.error = nil
    do {
      let values = try await client.tasks_period_list(path: .init(profile: draft.profile)).ok.body.json.map(TaskSnapshot.decode).sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
      guard isCurrentCredential(credentialEpoch), batchEdit?.id == draft.id, profile == draft.profile else { return }
      batchEdit?.targets = values
      batchEdit?.selected.formIntersection(Set(values.map(\.id)))
    } catch {
      guard isCurrentCredential(credentialEpoch), batchEdit?.id == draft.id else { return }
      batchEdit?.error = describe(error, at: .batchEdit)
      handleAuthorization(error, credentialEpoch: credentialEpoch)
    }
    if batchEdit?.id == draft.id { batchEdit?.loading = false }
  }
  func applyBatchEdit(dryRun: Bool) async {
    let credentialEpoch = discovery.credentialEpoch
    guard canWrite, !busy, let draft = batchEdit, !draft.loading, draft.valid, !draft.selected.isEmpty else { return }
    busy = true
    batchEdit?.error = nil
    defer { busy = false }
    do {
      let items: [[String: Any]] = draft.targets.filter { draft.selected.contains($0.id) }.map { ["task_id": $0.id, "from_version": $0.row_version] }
      let payload = try JSONDecoder().decode(Operations.tasks_period_batchEdit.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: ["items": items, "changes": draft.change, "dry_run": dryRun]))
      let response = try await client.tasks_period_batchEdit(path: .init(profile: draft.profile), body: .json(payload)).ok.body.json
      let report = try JSONDecoder().decode(BatchEditReport.self, from: JSONEncoder().encode(response))
      guard isCurrentCredential(credentialEpoch), batchEdit?.id == draft.id, profile == draft.profile else { return }
      batchEdit?.report = report
      if !dryRun { await refreshAfterWrite("Tasks updated") }
    } catch {
      guard isCurrentCredential(credentialEpoch), batchEdit?.id == draft.id else { return }
      batchEdit?.error = describe(error, at: .batchEdit)
      handleAuthorization(error, credentialEpoch: credentialEpoch)
    }
  }
}
struct BatchEditView: View {
  @Bindable var model: TodoModel
  var compact = true
  var body: some View {
    if let draft = model.batchEdit {
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text("Edit Tasks").font(.headline)
          Spacer()
          Button { model.batchEdit = nil } label: { Image(systemName: "xmark").frame(width: 28, height: 28) }.buttonStyle(.borderless).accessibilityLabel("Close").disabled(model.busy)
        }
        Text("Choose Tasks and one shared change.").font(.caption).foregroundStyle(.secondary)
        HStack(alignment: .top, spacing: 8) {
          VStack(alignment: .leading, spacing: 4) {
            Text("Field").font(.caption)
            Picker("Shared field", selection: Binding(get: { draft.field }, set: { model.batchEdit?.field = $0; model.batchEdit?.value = $0 == .priority ? "P1" : ""; model.batchEdit?.report = nil })) {
              ForEach(BatchEditField.allCases) { field in Text(field.label).tag(field) }
            }.labelsHidden().accessibilityLabel("Shared field")
          }
          VStack(alignment: .leading, spacing: 4) {
            Text(draft.field.label).font(.caption)
            if draft.field == .priority {
              Picker("Shared value", selection: value) { ForEach(["P1", "P2", "P3", "P4"], id: \.self) { Text($0).tag($0) } }.labelsHidden().accessibilityLabel("Shared value")
            } else {
              TextField(draft.field == .title ? "Required" : draft.field == .due_at || draft.field == .scheduled_at ? "YYYY-MM-DD" : draft.field == .tag_names ? "Comma-separated names" : "Empty clears", text: value).textFieldStyle(.roundedBorder).accessibilityLabel("Shared value")
            }
          }
        }.disabled(model.busy)
        Divider()
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 0) {
            if draft.loading { Text("Loading Tasks…").padding(.vertical, 16) }
            else if draft.targets.isEmpty { Text("No Tasks in this Profile.").padding(.vertical, 16) }
            ForEach(draft.targets) { task in
              let row = draft.report?.items.first { $0.task_id == task.id }
              Toggle(isOn: Binding(get: { draft.selected.contains(task.id) }, set: { selected in
                if selected { model.batchEdit?.selected.insert(task.id) } else { model.batchEdit?.selected.remove(task.id) }
                model.batchEdit?.report = nil
              })) {
                VStack(alignment: .leading, spacing: 4) {
                  Text(task.title).font(.callout).lineLimit(1).help(task.title)
                  if let failure = row?.error, failure.isTaskLookup {
                    ServerErrorNotice(model: model, failure: failure)
                  } else {
                    Text(row.map { row in row.error.map { error in error.code == "occ_conflict" ? "Conflict · Version \(row.current_version ?? 0). Reload Tasks." : error.humanMessage } ?? (draft.report?.dry_run == true ? "Ready · Version \(task.row_version)" : "Updated · Version \(row.current_version ?? 0)") } ?? "\(task.priority) · Version \(task.row_version)")
                      .font(.caption).foregroundStyle(row?.error == nil ? AnyShapeStyle(.secondary) : AnyShapeStyle(TodoColors.color("destructive")))
                  }
                }.frame(maxWidth: .infinity, alignment: .leading)
              }.toggleStyle(.checkbox).frame(minHeight: 56).disabled(model.busy || draft.loading).accessibilityLabel("Select \(task.title)").reportErrorBounds("row-" + task.id)
            }
          }.frame(maxWidth: .infinity, alignment: .leading)
        }.frame(height: compact ? 112 : 224).accessibilityLabel("Tasks to edit").reportErrorBounds("viewport")
        Divider()
        if let error = draft.error { ClientErrorNotice(model: model, text: error, position: .batchEdit) }
        HStack(spacing: 8) {
          if hasConflicts(draft) { reloadButton(draft).buttonStyle(.borderedProminent) }
          else { reloadButton(draft).buttonStyle(.bordered) }
          Spacer(minLength: 0)
          Button("Preview") { Task { await model.applyBatchEdit(dryRun: true) } }.disabled(disabled(draft))
          if hasConflicts(draft) { applyButton(draft).buttonStyle(.bordered) }
          else { applyButton(draft).buttonStyle(.borderedProminent) }
        }.controlSize(.large)
      }.padding(12).frame(minWidth: 340, idealWidth: 360, maxWidth: 480, minHeight: 340, idealHeight: compact ? 390 : 502, maxHeight: compact ? 402 : 600).accessibilityIdentifier("batch-edit")
    }
  }
  private func hasConflicts(_ draft: BatchEditDraft) -> Bool { draft.report?.items.contains { $0.error?.code == "occ_conflict" } ?? false }
  private func reloadButton(_ draft: BatchEditDraft) -> some View {
    Button(hasConflicts(draft) ? "Reload Tasks" : "Reload") { Task { await model.reloadBatchEditTargets() } }.accessibilityLabel("Reload Tasks").disabled(model.busy || draft.loading)
  }
  private func applyButton(_ draft: BatchEditDraft) -> some View {
    Button("Apply to \(draft.selected.count)") { Task { await model.applyBatchEdit(dryRun: false) } }.disabled(disabled(draft) || draft.report?.dry_run != true || !((draft.report?.items.contains { $0.outcome == "updated" }) ?? false))
  }
  private var value: Binding<String> { Binding(get: { model.batchEdit?.value ?? "" }, set: { model.batchEdit?.value = $0; model.batchEdit?.report = nil }) }
  private func disabled(_ draft: BatchEditDraft) -> Bool { model.busy || draft.loading || !model.canWrite || !draft.valid || draft.selected.isEmpty }
}
