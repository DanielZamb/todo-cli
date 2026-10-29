import SwiftUI

struct EditorView: View {
    @Bindable var model: TodoModel
    @FocusState private var titleFocused: Bool
    @State private var newMetadata: MetadataKind? = nil
    var compact = false
    private let pickerWidth: CGFloat = 180

    var body: some View {
        if let transfer = model.writeIntent?.transfer, model.conflict != nil || model.editorError != nil {
            TaskTransferFeedbackView(model: model, kind: transfer.kind, destination: transfer.destination, latest: model.conflict?.latest)
        } else { editorContent }
    }

    private var editorContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !compact { HStack {
                if model.conflict != nil { Text("Resolve conflict").font(.headline) }
                Spacer()
                EditorTaskActions(model: model)
            }.padding(.horizontal, 20).padding(.top, 12) }
            if let draft = model.editor {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let conflict = model.conflict {
                            conflictView(draft: draft, conflict: conflict)
                        } else {
                            editorForm(draft: draft)
                        }
                        AttachmentsSection(model: model)
                        DisclosureGroup("History", isExpanded: $model.showingHistory) {
                            if let error = model.historyError { Text(error).foregroundStyle(TodoColors.color("destructive")) }
                            ScrollView {
                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(model.history.reversed()) { entry in
                                        VStack(alignment: .leading, spacing: 6) {
                                            HStack(alignment: .firstTextBaseline) {
                                                Text(entry.label).fontWeight(.semibold)
                                                Spacer()
                                                TimelineView(.periodic(from: .now, by: 60)) { context in
                                                    Text(entry.relativeTime(now: context.date)).foregroundStyle(Color.secondary)
                                                }.help(entry.localTime())
                                            }
                                            if entry.outcome == "rejected" { Text("Rejected attempt. " + entry.rejectionReason) }
                                            if entry.event.kind == "TaskHistoryRedacted" { Text("Content erased by Purge.") }
                                            ForEach(entry.fieldChanges, id: \.field) { change in
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(change.field).foregroundStyle(Color.secondary)
                                                    Text("\(change.before) → \(change.after)").textSelection(.enabled)
                                                }
                                            }
                                            if entry.canRevert(in: model.history) {
                                                Button("Revert") { Task { await model.write(.revert(entry.seq)) } }
                                                    .disabled(!model.canWrite || model.conflict != nil)
                                                    .accessibilityLabel("Revert \(entry.label.lowercased()) change")
                                            }
                                        }
                                        .font(.caption)
                                        .padding(8)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .foregroundStyle(entry.outcome == "rejected" ? Color.secondary : Color.primary)
                                        .background(
                                            entry.outcome == "rejected" ? Color(nsColor: .controlBackgroundColor) : .clear,
                                            in: RoundedRectangle(cornerRadius: 6))
                                    }
                                }
                            }.frame(maxHeight: 260)
                        }.onChange(of: model.showingHistory) { _, expanded in if expanded { Task { await model.loadHistory() } } }
                        if let error = model.editorError {
                            Text(error).foregroundStyle(TodoColors.color("destructive")).accessibilityIdentifier("editor-error")
                        }
                    }.frame(maxWidth: .infinity).padding(20)
                }
                Divider()
                HStack {
                    if model.busy {
                        ProgressView().controlSize(.small)
                        Text("Saving…").font(.caption)
                    }
                    Spacer()
                    Button("Close") {
                        model.editor = nil
                        model.conflict = nil
                    }.buttonStyle(.bordered).tint(nil as Color?).keyboardShortcut(.cancelAction).disabled(model.busy)
                    if let conflict = model.conflict {
                        Button(model.writeIntent == nil ? "Save resolution" : "Retry action") { Task { await model.resolveConflict() } }
                            .buttonStyle(.borderedProminent).accessibilityIdentifier("save-resolution")
                            .disabled(
                                !model.canWrite || conflict.latest == nil
                                    || ((model.writeIntent == nil || model.writeIntent?.mergesFields == true)
                                        && (conflict.latest.map { latest in
                                            draft.overlaps(with: latest).contains { conflict.choices[$0] == nil }
                                        } ?? true))
                            )
                    } else {
                        Button("Save changes") { Task { await model.save() } }
                            .buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                            .disabled(
                                !model.canWrite || draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    || draft.changedFields.isEmpty
                            )
                            .accessibilityIdentifier("save-task")
                    }
                }.controlSize(.large).padding(16)
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(.background)
            .task(id: model.editor?.id) {
                titleFocused = model.focusEditorTitle
            }
            .task(id: model.canWrite ? model.editor?.base : nil) {
                if model.editor?.base.occurrence != nil && !model.showingSeries && !model.seriesLoading {
                    await model.openSeries(presenting: false)
                }
            }
            .sheet(isPresented: $model.showingSeries) { SeriesView(model: model) }
            .sheet(item: $newMetadata) { kind in
                MetadataNameSheet(kind: kind, canWrite: model.canWrite) { name in
                    model.editor?.addMetadata(kind, name: name, projects: model.projects, tags: model.tags)
                }
            }
    }

    private func editorForm(draft: TaskDraft) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                TextField("Task title", text: binding(\.title, default: ""), axis: .vertical)
                    .font(.title2.weight(.semibold)).textFieldStyle(.plain).frame(maxWidth: .infinity, alignment: .leading)
                    .focused($titleFocused).accessibilityIdentifier("edit-title")
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Description").foregroundStyle(.secondary)
                TextEditor(text: binding(\.description, default: ""))
                    .scrollContentBackground(.hidden).padding(6).background(.background, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(.separator)).frame(height: 100).font(.body).accessibilityLabel(
                        "Description"
                    ).accessibilityIdentifier("edit-description")
                Text("Markdown").font(.caption).foregroundStyle(.tertiary).padding(.leading, 11)
            }
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 16) {
                GridRow {
                    fieldLabel("Due")
                    TimeField(title: "Due", value: binding(\.due, default: nil), showsLabel: false)
                }
                GridRow {
                    fieldLabel("Scheduled")
                    TimeField(title: "Scheduled", value: binding(\.scheduled, default: nil), showsLabel: false)
                }
                GridRow {
                    fieldLabel("Priority")
                    Picker("Priority", selection: binding(\.priority, default: "P3")) {
                        ForEach(["P1", "P2", "P3", "P4"], id: \.self) { Text($0).tag($0) }
                    }.labelsHidden().buttonSizing(.flexible).frame(width: pickerWidth, alignment: .leading).accessibilityIdentifier(
                        "edit-priority")
                }
                GridRow {
                    fieldLabel("Project")
                    Picker(
                        "Project",
                        selection: Binding<String?>(
                            get: { draft.projectName != nil ? "pending-project" : draft.project },
                            set: { value in
                                if value == "new-project" {
                                    newMetadata = .project
                                } else {
                                    model.editor?.project = value
                                    model.editor?.projectName = nil
                                }
                            })
                    ) {
                        Text("None").tag(String?.none)
                        ForEach(model.projects) { Text($0.name).tag(String?.some($0.id)) }
                        if let name = draft.projectName { Text(name).tag(String?.some("pending-project")) }
                        Divider()
                        Text("New Project…").tag(String?.some("new-project"))
                    }
                    .labelsHidden().buttonSizing(.flexible).frame(width: pickerWidth, alignment: .leading)
                }
                GridRow {
                    fieldLabel("Tags")
                    Menu {
                        ForEach(model.tags) { tag in
                            Button {
                                if model.editor?.tags.contains(tag.id) == true {
                                    model.editor?.tags.removeAll { $0 == tag.id }
                                } else {
                                    model.editor?.tags.append(tag.id)
                                }
                            } label: {
                                Label(tag.name, systemImage: draft.tags.contains(tag.id) ? "checkmark" : "number")
                            }
                        }
                        ForEach(draft.tagNames, id: \.self) { name in
                            Button {
                                model.editor?.tagNames.removeAll { $0 == name }
                            } label: {
                                Label(name, systemImage: "checkmark")
                            }
                        }
                        Divider()
                        Button("New Tag…") {
                            newMetadata = .tag
                        }
                    } label: {
                        Text(
                            draft.tags.isEmpty && draft.tagNames.isEmpty
                                ? "None"
                                : (model.tags.filter { draft.tags.contains($0.id) }.map(\.name) + draft.tagNames).joined(separator: ", ")
                        ).foregroundStyle(.primary)
                    }
                    .tint(nil as Color?).buttonSizing(.flexible).frame(width: pickerWidth, alignment: .leading)
                }
                GridRow {
                    fieldLabel("Recurrence")
                    HStack(spacing: 8) {
                        if let recurrence = model.recurrenceDraft ?? model.series?.recurrence {
                            Text(recurrence.summary).foregroundStyle(.primary)
                        } else if draft.base.occurrence != nil {
                            Text("Recurring Series").foregroundStyle(.primary)
                        }
                        Button(
                            model.seriesLoading
                                ? "Loading…"
                                : (model.recurrenceDraft != nil || draft.base.occurrence != nil || model.series != nil)
                                    ? "Edit…" : "Set recurrence…"
                        ) { Task { await model.openSeries() } }
                        .disabled(!model.canWrite || model.seriesLoading).accessibilityIdentifier("edit-recurrence")
                    }
                }
                GridRow {
                    fieldLabel("Energy")
                    Picker("Energy", selection: binding(\.energy, default: nil)) {
                        Text("None").tag(Int?.none)
                        ForEach(1...5, id: \.self) { Text(String($0)).tag(Int?.some($0)) }
                    }.labelsHidden().buttonSizing(.flexible).frame(width: pickerWidth, alignment: .leading)
                }
                GridRow {
                    fieldLabel("Estimate")
                    HStack(spacing: 6) {
                        TextField(
                            "None",
                            text: Binding(
                                get: { model.editor?.estimate.map(String.init) ?? "" },
                                set: { text in
                                    if text.isEmpty {
                                        model.editor?.estimate = nil
                                    } else if let value = Int(text), value > 0 {
                                        model.editor?.estimate = value
                                    }
                                })
                        ).frame(width: 70).accessibilityLabel("Estimate in minutes")
                        Text("min").foregroundStyle(.secondary)
                    }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.disabled(model.busy)
    }

    private func fieldLabel(_ title: String) -> some View {
        Text(title).frame(width: 74, alignment: .leading)
    }

    private func conflictView(draft: TaskDraft, conflict: TaskConflict) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Your change used an older Version. Your draft is preserved.").foregroundStyle(.secondary)
            if let latest = conflict.latest {
                Text("Changed elsewhere (Version \(String(latest.row_version)))").font(.subheadline.weight(.medium))
                let overlaps = model.writeIntent == nil || model.writeIntent?.mergesFields == true ? draft.overlaps(with: latest) : []
                if model.writeIntent != nil {
                    Text("Retry action uses the current Version. Unsaved task fields stay in your draft.")
                } else if overlaps.isEmpty {
                    Text("Your edited fields do not overlap. Save resolution to apply them to the current Version.")
                }
                ForEach(overlaps, id: \.self) { field in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(fieldTitle(field)).font(.headline)
                        Picker(
                            fieldTitle(field),
                            selection: Binding<ConflictChoice?>(
                                get: { model.conflict?.choices[field].map(ConflictChoice.init(keepsMine:)) },
                                set: { model.conflict?.choices[field] = $0?.keepsMine })
                        ) {
                            Text(ConflictChoice.mine.label(metadataValue(draft, field))).tag(ConflictChoice?.some(.mine))
                            Text(ConflictChoice.theirs.label(metadataValue(TaskDraft(latest), field))).tag(ConflictChoice?.some(.theirs))
                        }.pickerStyle(.radioGroup).labelsHidden().accessibilityIdentifier("conflict-\(field)")
                    }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(nsColor: .separatorColor)))
                }
                Text("Other edited fields keep your changes. Other current fields are preserved.").font(.caption).foregroundStyle(
                    .secondary)
            } else {
                Text("This task was deleted or is no longer available. Close the editor to return to your tasks.")
            }
        }.padding(.vertical, 8).accessibilityIdentifier("conflict-panel")
            .task(id: conflict.latest?.row_version) { await model.refreshConflictDefinitions() }
    }

    private func metadataValue(_ draft: TaskDraft, _ field: String) -> String {
        draft.value(
            field, projects: Dictionary(uniqueKeysWithValues: model.projects.map { ($0.id, $0.name) }),
            tags: Dictionary(uniqueKeysWithValues: model.tags.map { ($0.id, $0.name) }))
    }

    private func binding<Value>(_ keyPath: WritableKeyPath<TaskDraft, Value>, default fallback: Value) -> Binding<Value> {
        Binding(get: { model.editor?[keyPath: keyPath] ?? fallback }, set: { model.editor?[keyPath: keyPath] = $0 })
    }

    private func fieldTitle(_ field: String) -> String {
        [
            "title": "Title", "description": "Description", "priority": "Priority", "due_at": "Due", "scheduled_at": "Scheduled",
            "energy": "Energy", "estimate_min": "Estimate", "project_id": "Project", "tags": "Tags",
        ][field] ?? field
    }
}

struct TimeField: View {
    let title: String
    @Binding var value: TaskTime?
    var showsLabel = true
    @State private var choosingDate = false

    private var date: Date {
        if value?.kind == "instant", let date = value?.instant { return date }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return value?.date.flatMap { formatter.date(from: $0) } ?? Date()
    }

    var body: some View {
        HStack {
            if showsLabel {
                Text(title)
                Spacer()
            }
            if value != nil {
                Button(value.map { RowDate.text($0, now: .now) } ?? "") { choosingDate = true }
                    .buttonStyle(.bordered).tint(nil as Color?)
                    .accessibilityIdentifier("date-\(title.lowercased())").help(value?.display ?? "")
                    .popover(isPresented: $choosingDate) {
                        DatePicker(
                            title, selection: Binding(get: { date }, set: { setDate($0) }),
                            displayedComponents: value?.kind == "instant" ? [.date, .hourAndMinute] : [.date]
                        )
                        .datePickerStyle(.graphical).labelsHidden().padding(16)
                        .environment(\.timeZone, value?.time_zone.flatMap(TimeZone.init(identifier:)) ?? .current)
                    }
                Button {
                    value = nil
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain).accessibilityLabel("Clear \(title.lowercased()) date")
                Menu(value?.kind == "instant" ? "At time" : "All day") {
                    Button("All day") { setDate(date, instant: false) }
                    Button("At time") { setDate(date, instant: true) }
                }.fixedSize().controlSize(.small).accessibilityLabel("\(title) date type")
            } else {
                Button("Set date") { setDate(Date(), instant: false) }.accessibilityLabel("Set \(title.lowercased()) date")
            }
        }
    }

    private func setDate(_ date: Date) { setDate(date, instant: value?.kind == "instant") }
    private func setDate(_ date: Date, instant: Bool) {
        if instant {
            value = TaskTime(
                kind: "instant", utc: ISO8601DateFormatter().string(from: date), time_zone: value?.time_zone ?? TimeZone.current.identifier)
        } else {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = value?.time_zone.flatMap(TimeZone.init(identifier:)) ?? .current
            formatter.dateFormat = "yyyy-MM-dd"
            value = TaskTime(kind: "date", date: formatter.string(from: date))
        }
    }
}

struct MetadataNameSheet: View {
    let kind: MetadataKind
    let canWrite: Bool
    var initialName = ""
    let add: (String) -> Void
    @State private var name = ""
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("New \(kind.rawValue)").font(.headline)
            TextField("Name", text: $name).textFieldStyle(.roundedBorder).focused($focused)
                .accessibilityIdentifier("new-metadata-name")
            Text("Created when you save this task.").font(.caption).foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Add") {
                    add(name.trimmingCharacters(in: .whitespacesAndNewlines))
                    dismiss()
                }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                    .disabled(!canWrite || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("add-metadata-name")
            }
        }.padding(24).frame(idealWidth: 340).fixedSize(horizontal: false, vertical: true)
            .onAppear { name = initialName; focused = true }
    }
}

struct TaskTransferPicker: View {
    @Bindable var model: TodoModel
    let request: TaskTransferRequest
    @State private var destination = ""
    private var profiles: [DiscoveryEntry] { model.profiles.filter { $0.id != request.task.profile_id } }
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(request.kind.title).font(.headline)
            Text(request.task.title).lineLimit(2)
            Text(request.kind == .copy ? "Create a copy in another Profile. The source stays unchanged. Project and Tags are matched by name. An Occurrence becomes a plain Task." : "Move this task to another Profile. Project and Tags are matched by name. An Occurrence becomes a plain Task.")
                .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            if profiles.isEmpty { Text("Create another Profile before moving or copying a task.").foregroundStyle(.secondary) }
            Picker("Destination Profile", selection: $destination) {
                Text("Choose a Profile").tag("")
                ForEach(profiles) { Text($0.name).tag($0.id) }
            }.accessibilityIdentifier("transfer-destination-profile")
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { model.transferRequest = nil }
                Button(request.kind.action) {
                    model.transferRequest = nil
                    Task {
                        if request.kind == .move { await model.navigate(.move(request.task, to: destination)) }
                        else { await model.navigate(.copy(request.task, to: destination)) }
                    }
                }.buttonStyle(.borderedProminent).disabled(!model.canWrite || destination.isEmpty)
                    .keyboardShortcut(.defaultAction).accessibilityIdentifier("confirm-task-transfer")
            }
        }.padding(24).frame(maxWidth: 420).onAppear { destination = profiles.first?.id ?? "" }
    }
}

struct TaskTransferActions: View {
    @Bindable var model: TodoModel
    let task: TaskSnapshot
    var body: some View {
        Button("Move to Profile") { model.transferRequest = .init(kind: .move, task: task) }
        Button("Copy to Profile") { model.transferRequest = .init(kind: .copy, task: task) }
    }
}

enum TransferFeedbackRegion: Hashable { case message, primary, cancel }
struct TransferFeedbackFrames: PreferenceKey {
    static let defaultValue: [TransferFeedbackRegion: CGRect] = [:]
    static func reduce(value: inout [TransferFeedbackRegion: CGRect], nextValue: () -> [TransferFeedbackRegion: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, next in next }) }
}
private extension View {
    func transferFeedbackFrame(_ region: TransferFeedbackRegion) -> some View {
        background(GeometryReader { geometry in Color.clear.preference(key: TransferFeedbackFrames.self, value: [region: geometry.frame(in: .global)]) })
    }
}

struct TaskTransferFeedbackView: View {
    @Bindable var model: TodoModel
    let kind: TaskTransferRequest.Kind
    let destination: String
    let latest: TaskSnapshot?
    private var profileName: String { model.profiles.first { $0.id == destination }?.name ?? destination }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let error = model.editorError {
                Text(kind == .copy ? "Copy rejected" : "Move rejected").font(.headline)
                Text(error).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).transferFeedbackFrame(.message)
                HStack {
                    Spacer()
                    Button(role: .cancel) { model.cancelTransferConflict() } label: { Text("Cancel").frame(minHeight: 28) }
                        .disabled(model.busy).transferFeedbackFrame(.cancel)
                    Button { model.chooseAnotherTransferProfile() } label: { Text("Choose Another Profile").frame(minHeight: 28) }
                        .buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction).disabled(!model.canWrite)
                        .accessibilityIdentifier("choose-another-transfer-profile").transferFeedbackFrame(.primary)
                }
            } else {
            Text("This Task changed").font(.headline)
            if let latest {
                Text("It was edited elsewhere and is now Version \(String(latest.row_version)). \(kind == .copy ? "Copy" : "Move") the latest Version to \(profileName)?")
                    .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            } else { Text("This Task is no longer available.").foregroundStyle(.secondary) }
            Spacer()
            HStack {
                Spacer()
                Button(role: .cancel) { model.cancelTransferConflict() } label: { Text("Cancel").frame(minHeight: 28) }.disabled(model.busy)
                Button { Task { await model.resolveConflict() } } label: { Text(kind == .copy ? "Copy latest" : "Move latest").frame(minHeight: 28) }
                    .buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                    .disabled(!model.canWrite || latest == nil).accessibilityIdentifier("confirm-latest-transfer")
            }
            }
        }.padding(16).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).background(.background)
    }
}

struct TaskTransferResultView: View {
    @Bindable var model: TodoModel
    let result: TaskTransferResult
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Label(result.message, systemImage: "checkmark.circle").foregroundStyle(TodoColors.color("success"))
                Button(result.openTitle) { Task { await model.openTransferredTask() } }.buttonStyle(.borderless).disabled(model.busy)
            }
            Spacer(minLength: 0)
            Button { model.transferResult = nil } label: { Image(systemName: "xmark") }
                .buttonStyle(.borderless).accessibilityLabel("Dismiss transfer result")
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier("task-transfer-result")
    }
}

struct EditorTaskActions: View {
    @Bindable var model: TodoModel
    @State private var confirmDelete = false
    var body: some View {
                Menu {
                    if let task = model.editor?.base {
                        Button("Complete task") { Task { await model.transition(task, action: "complete") } }.disabled(
                            task.status != "open")
                        Button("Cancel task") { Task { await model.transition(task, action: "cancel") } }.disabled(task.status != "open")
                        if ["done", "cancelled"].contains(task.status) {
                            Button("Reopen task") { Task { await model.transition(task, action: "reopen") } }
                        }
                        Divider()
                        TaskTransferActions(model: model, task: task)
                        Button("Delete task", role: .destructive) { confirmDelete = true }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }.menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().disabled(!model.canWrite || model.conflict != nil)
                    .accessibilityLabel("Task actions")
            .frame(minWidth: 28, minHeight: 28)
            .confirmationDialog("Delete this task?", isPresented: $confirmDelete) {
                if let task = model.editor?.base {
                    Button("Delete task", role: .destructive) { Task { await model.deleteTask(task) } }
                }
            }

    }
}
