import SwiftUI

struct InitialDependencySelection: View {
    @Binding var tasks: [TaskSnapshot]
    let enabled: Bool
    let add: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Depends on")
                Button("Add…", action: add).disabled(!enabled).accessibilityIdentifier("dependency-add")
            }.font(.caption).controlSize(.small).frame(minHeight: 24)
            if !tasks.isEmpty {
                QuickAddFlow {
                    ForEach(tasks) { task in
                        Button { tasks.removeAll { $0.id == task.id } } label: {
                            HStack(spacing: 6) { Text(task.title).lineLimit(1); Image(systemName: "xmark").font(.caption2) }
                        }.font(.caption).buttonStyle(.bordered).controlSize(.small).help(task.title)
                            .frame(height: 20).disabled(!enabled).accessibilityLabel("Remove Dependency \(task.title)")
                            .accessibilityIdentifier("dependency-initial-\(task.id)").compactBounds("dependency-initial-\(task.id)")
                    }
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct DependencyNoticeView: View {
    let model: TodoModel
    let notice: DependencyNotice
    var warning = false
    var body: some View {
        ClientErrorNotice(model: model, text: notice.message, position: .message, dependency: notice, dependencyWarning: warning)
    }
}

struct DependencyNoticeContent: View {
    let model: TodoModel
    let notice: DependencyNotice
    var warning = false
    var font: Font = .callout
    private var titles: [String] { notice.path.map { id in model.tasks.first { $0.id == id }?.title ?? id } }
    private var headline: String {
        let prefix = notice.attemptTitle.map { "Can't \(notice.attemptVerb) \($0). " } ?? ""
        let guidance = notice.followUp == nil ? notice.recovery.map { " \($0)." } ?? "" : ""
        return prefix + notice.message + guidance
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(headline).fixedSize(horizontal: false, vertical: true)
            if !titles.isEmpty {
                witness
            }
            ForEach(notice.tasks) { task in
                Button { Task { _ = await model.navigate(.edit(task)) } } label: {
                    Text("\(task.title) · \(task.status.capitalized)").multilineTextAlignment(.leading)
                }.buttonStyle(.link)
            }
            if let id = notice.followUp {
                Button("Create follow-up") { Task { await model.createDependencyFollowUp(id) } }.accessibilityIdentifier("dependency-follow-up")
            } else if let failure = notice.failure, failure.isTaskLookup {
                Button("Find Task by id") { Task { await model.findTaskAfterLookupError(failure) } }
            }
            if let detail = notice.detail { Text(detail).font(.caption).foregroundStyle(.secondary) }
        }.font(font).foregroundStyle(warning ? TodoColors.color("warning") : .primary)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(warning ? "dependency-warning" : "dependency-error")
    }
    private var witness: some View {
        let lines = min(3, titles.count)
        let height = CGFloat(lines * 16 + max(0, lines - 1) * 4)
        return ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(titles.enumerated()), id: \.offset) { index, title in
                    Text((index == 0 ? "" : "→ ") + title)
                        .font(.caption).lineLimit(1).truncationMode(.middle).help(title).textSelection(.enabled)
                        .frame(height: 16, alignment: .leading).compactBounds("dependency-loop-line-\(index)")
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.frame(height: height).compactBounds("dependency-loop")
            .accessibilityElement(children: .ignore).accessibilityLabel(titles.joined(separator: " blocks "))
    }
}

struct DependencyPickerView: View {
    @Bindable var model: TodoModel
    var compact = false
    @FocusState private var searchFocused: Bool
    @FocusState private var focusedCandidate: String?
    var body: some View {
        if let picker = model.dependencies.picker {
            VStack(alignment: .leading, spacing: 10) {
                Text(picker.direction.sentence(picker.root.title)).font(.headline).lineLimit(2)
                Picker("Direction", selection: Binding(get: { picker.direction }, set: { direction in Task { await model.setDependencyDirection(direction) } })) {
                    Text("Depends on").tag(DependencyDirection.dependsOn).accessibilityIdentifier("dependency-depends-on")
                    Text("Blocks").tag(DependencyDirection.blocks).disabled(picker.purpose != .edit).accessibilityIdentifier("dependency-blocks")
                }.pickerStyle(.segmented).accessibilityIdentifier("dependency-direction")
                TextField("Search Tasks in this Profile", text: Binding(get: { model.dependencies.picker?.text ?? "" }, set: { model.dependencies.picker?.text = $0 }))
                    .textFieldStyle(.roundedBorder).focused($searchFocused).accessibilityIdentifier("dependency-search")
                    .onChange(of: picker.text) { _, text in
                        Task {
                            do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                            guard model.dependencies.picker?.id == picker.id, model.dependencies.picker?.text == text else { return }
                            await model.searchDependencyCandidates()
                        }
                    }
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        if picker.loading { ProgressView("Loading Dependencies…") }
                        if let notice = picker.failure {
                            DependencyNoticeView(model: model, notice: notice)
                            if picker.requiresReload {
                                Button("Reload") { Task { await model.reloadDependencyPicker() } }.accessibilityIdentifier("dependency-reload")
                            }
                        }
                        ForEach(picker.warnings.indices, id: \.self) { DependencyNoticeView(model: model, notice: picker.warnings[$0], warning: true) }
                        if !model.canWrite { Text(model.connection == .offline ? "Offline · Read only" : "Dependencies are read only right now.").foregroundStyle(.secondary) }
                        ForEach(picker.rows) { task in
                            if picker.pending.contains(task.id) {
                                HStack(spacing: 8) {
                                    ProgressView().controlSize(.mini).frame(width: 14, height: 14)
                                    TaskRow(task: task, canWrite: false, compact: compact, projectName: model.projects.first { $0.id == task.project_id }?.name, tagNames: task.tagNames(from: model.tags), showsCompletion: false, relation: true, complete: {}).opacity(0.5)
                                }.accessibilityIdentifier("dependency-pending-\(task.id)").accessibilityLabel(task.title).accessibilityValue("Updating").focusable().focused($focusedCandidate, equals: task.id)
                            } else {
                            Toggle(isOn: Binding(get: { picker.checked(task.id) }, set: { _ in model.clientDiagnosticsUI.perform(.toggleDependency, surface: .dependencyPicker) { await model.toggleDependency(task) } })) {
                                VStack(alignment: .leading, spacing: 0) {
                                    TaskRow(task: task, canWrite: false, compact: compact, projectName: model.projects.first { $0.id == task.project_id }?.name, tagNames: task.tagNames(from: model.tags), showsCompletion: false, relation: true, complete: {})
                                }
                            }.toggleStyle(.checkbox)
                                .focused($focusedCandidate, equals: task.id)
                                .disabled(!model.canWrite || picker.loading || picker.requiresReload || picker.pending.contains(task.id) || model.dependencies.pendingDependents.contains(picker.direction == .dependsOn ? picker.root.id : task.id))
                                .accessibilityIdentifier("dependency-choice-\(task.id)")
                                .accessibilityValue(picker.pending.contains(task.id) ? "Pending" : picker.checked(task.id) ? "Checked" : "Unchecked")
                                .compactBounds("dependency-choice-\(task.id)")
                            }
                        }
                        if !picker.loading && picker.rows.isEmpty { Text("No matching Tasks").foregroundStyle(.secondary) }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.trailing, 4)
                }.compactBounds("dependency-body")
                if let feedback = picker.feedback { Text(feedback).font(.caption).foregroundStyle(.secondary) }
                HStack {
                    Text(picker.purpose == .edit ? "Changes save immediately." : picker.purpose == .firstOccurrence ? "Saved with the first Occurrence." : "Saved with the new Task.").font(.caption).foregroundStyle(.secondary)
                    if picker.purpose == .edit { Button("Batch…") { Task { await model.beginDependencyBatch() } }.disabled(!model.canWrite || !picker.pending.isEmpty) }
                    Spacer(minLength: 0)
                    Button("Close") { model.closeDependencyPicker() }.keyboardShortcut(.cancelAction).accessibilityIdentifier("dependency-picker-close")
                }.compactBounds("dependency-actions")
            }.padding(16).frame(width: compact ? 393 : 560, height: compact ? 426 : 600)
                .background(ClientDiagnosticSurfaceView(monitor: model.clientDiagnosticsUI, surface: .dependencyPicker))
                .accessibilityIdentifier("dependency-picker")
                .task { searchFocused = true }
                .onKeyPress(.downArrow) { moveCandidate(1, picker: picker) }
                .onKeyPress(.upArrow) { moveCandidate(-1, picker: picker) }
        }
    }
    private func moveCandidate(_ step: Int, picker: DependencyPicker) -> KeyPress.Result {
        let ids = picker.rows.map(\.id)
        guard !ids.isEmpty else { return .ignored }
        let next = focusedCandidate.flatMap { ids.firstIndex(of: $0) }.map { $0 + step } ?? (step > 0 ? 0 : ids.count - 1)
        if next < 0 { focusedCandidate = nil; searchFocused = true }
        else if next < ids.count { searchFocused = false; focusedCandidate = ids[next] }
        return .handled
    }
}

struct DependencyDeleteView: View {
    @Bindable var model: TodoModel
    var compact = false
    var body: some View {
        if let deletion = model.dependencies.deletion {
            VStack(alignment: .leading, spacing: 10) {
                Text("Delete Task").font(.headline)
                Text(deletion.task.title).lineLimit(2)
                VStack(alignment: .leading, spacing: 4) {
                    Text(deletion.reviewMessage).fixedSize(horizontal: false, vertical: true)
                    if deletion.changed, let detail = deletion.reviewExitDetail {
                        Text(detail).font(.caption).foregroundStyle(.secondary)
                    }
                }.accessibilityIdentifier(deletion.changed ? "dependency-delete-changed" : "dependency-delete-review")
                if !deletion.edges.isEmpty || deletion.loading || deletion.failure != nil {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12, pinnedViews: [.sectionHeaders]) {
                        if deletion.loading { ProgressView("Loading Dependencies…") }
                        if let failure = deletion.failure {
                            DependencyNoticeView(model: model, notice: failure)
                            Button("Reload") { Task { await model.reloadDependencyDelete(changed: true) } }.disabled(deletion.pending || model.connection != .live).accessibilityIdentifier("dependency-reload")
                        }
                        incidentSection("Depends on", ids: deletion.edges.filter { $0.dependent_id == deletion.task.id }.map(\.blocker_id), deletion: deletion, identifier: "dependency-delete-depends-on")
                        incidentSection("Blocks", ids: deletion.edges.filter { $0.blocker_id == deletion.task.id }.map(\.dependent_id), deletion: deletion, identifier: "dependency-delete-blocks")
                        if !model.canWrite { Text("Offline or read only. Reconnect before deleting.").foregroundStyle(.secondary) }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.compactBounds("dependency-body")
                }
                Group {
                    if deletion.edges.isEmpty { HStack { Spacer(); cancel; confirm(deletion) } }
                    else { VStack(spacing: 8) { cancel.frame(maxWidth: .infinity); confirm(deletion).frame(maxWidth: .infinity) }.buttonStyle(.bordered) }
                }.compactBounds("dependency-actions")
            }.padding(16).frame(width: compact ? 393 : 560)
                .frame(height: deletion.edges.isEmpty && !deletion.loading && deletion.failure == nil ? nil : compact ? 426 : 600)
                .accessibilityIdentifier("dependency-delete-dialog").compactBounds("dependency-delete-sheet")
        }
    }
    @ViewBuilder private func incidentSection(_ title: String, ids: [String], deletion: DependencyDelete, identifier: String) -> some View {
            if !ids.isEmpty {
                Section {
                ForEach(ids, id: \.self) { id in
                    if let task = deletion.endpoints.first(where: { $0.id == id }) {
                        TaskRow(task: task, canWrite: false, compact: compact, projectName: model.projects.first { $0.id == task.project_id }?.name, tagNames: task.tagNames(from: model.tags), showsCompletion: false, relation: true, complete: {})
                    } else { Text(id).textSelection(.enabled) }
                }
                } header: {
                    Text("\(title) · \(ids.count)").font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6).background(.background)
                }.accessibilityIdentifier(identifier)
            }
    }
    private var cancel: some View {
        Button(role: .cancel) { model.closeDependencyDelete() } label: {
            Text("Cancel").frame(maxWidth: model.dependencies.deletion?.edges.isEmpty == false ? .infinity : nil)
        }
            .keyboardShortcut(.cancelAction).keyboardShortcut(.defaultAction).disabled(model.dependencies.deletion?.pending == true).accessibilityIdentifier("dependency-delete-cancel")
    }
    private func confirm(_ deletion: DependencyDelete) -> some View {
        Button(role: .destructive) { model.clientDiagnosticsUI.perform(.delete) { await model.confirmDependencyDelete() } } label: {
            Text(deletion.pending ? "Deleting…" : deletion.action).foregroundStyle(Color(nsColor: .systemRed)).frame(maxWidth: deletion.edges.isEmpty ? nil : .infinity)
        }
            .tint(Color(nsColor: .systemRed)).foregroundStyle(Color(nsColor: .systemRed)).disabled(!model.canWrite || deletion.loading || deletion.pending || deletion.fingerprint == nil || deletion.acceptedFromVersion == nil)
            .accessibilityIdentifier("dependency-delete-confirm")
    }
}

extension TodoModel {
    func createDependencyFollowUp(_ id: String) async {
        guard signedIn else { return }
        // The follow-up is offered by a Dependency picker or an Import report. Its result belongs to
        // that instance: once it has closed, the read raises no message, closes nothing and opens nothing.
        let surface: MessageSurface? = dependencies.picker.map { .dependencyPicker($0.id) } ?? (showingImport ? .importSheet(importInstance) : nil)
        let epoch = discovery.credentialEpoch
        let selectedProfile = profile
        let mark = messageMark
        do {
            let task = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: selectedProfile, task: id)).ok.body.json)
            guard isCurrentCredential(epoch), profile == selectedProfile else { return }
            guard surface.map(isShowing) ?? true else { return }
            clearMessage([.dependencyFollowUp], since: mark)
            closeDependencyPicker()
            if !dependencies.initial.contains(where: { $0.id == task.id }) { dependencies.initial.append(task) }
            quickAdd = true
        } catch {
            authorize(error, epoch: epoch, profile: selectedProfile)
            guard isCurrentCredential(epoch), profile == selectedProfile else { return }
            guard surface.map(isShowing) ?? true else { return }
            publishMessage(describe(error), kind: .dependencyFollowUp, surface: surface)
        }
    }
}
