import SwiftUI

struct InitialDependencySelection: View {
    @Binding var tasks: [TaskSnapshot]
    let enabled: Bool
    let add: () -> Void
    @Environment(\.quickAddHeaderIsRow) private var headerIsRow
    @Environment(\.quickAddDependenciesCut) private var cut
    /// "Depends on", or "Depends on 13 Tasks" when some chips are out of view (UI check, c10).
    static func heading(count: Int, cut: Bool) -> String {
        guard cut, count > 0 else { return "Depends on" }
        return "Depends on \(count) " + (count == 1 ? "Task" : "Tasks")
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(Self.heading(count: tasks.count, cut: cut)).accessibilityLabel(Self.heading(count: tasks.count, cut: cut)).compactBounds("dependency-heading")
                Button("Add…", action: add).disabled(!enabled).accessibilityIdentifier("dependency-add")
            }.font(.caption).controlSize(.small).frame(minHeight: 24)
                // In Compact Quick Add the line is a row of its own, so a cut after the parsed chips
                // still shows that Dependencies follow (Mac UI review 2, item 2).
                .background { if headerIsRow { QuickAddRegionRow() } }
            if !tasks.isEmpty {
                QuickAddFlow {
                    ForEach(tasks) { task in
                        Button { tasks.removeAll { $0.id == task.id } } label: {
                            HStack(spacing: 6) { Text(task.title).lineLimit(1); Image(systemName: "xmark").font(.caption2) }
                        }.font(.caption).buttonStyle(.bordered).controlSize(.small).help(task.title)
                            .frame(height: 20).disabled(!enabled).accessibilityLabel("Remove Dependency \(task.title)")
                            .accessibilityIdentifier("dependency-initial-\(task.id)").compactBounds("dependency-initial-\(task.id)")
                            .background(QuickAddRegionRow())
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
    /// The exit-code line ("error 2 - validation or usage"); the main window's banner leaves it out.
    var showsDetail = true
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
                Button("Create follow-up") { Task { await model.createDependencyFollowUp(id) } }.accessibilityIdentifier("dependency-follow-up").compactBounds("dependency-follow-up")
                if let failed = notice.followUpFailure {
                    Text(failed).font(.caption).foregroundStyle(TodoColors.color("destructive"))
                        .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("dependency-follow-up-error")
                }
            } else if let failure = notice.failure, failure.isTaskLookup {
                Button("Find Task by id") { Task { await model.findTaskAfterLookupError(failure) } }
            }
            if showsDetail, let detail = notice.detail { Text(detail).font(.caption).foregroundStyle(.secondary).compactBounds("dependency-detail") }
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

/// Presents the Dependency picker (candidate 11). Only the small presenter reads the picker's
/// state, so a picker change (a keystroke, a tick, new rows) no longer re-runs the body of the
/// window or sheet that presents it; measured, that body was about 190 ms of a 400-Task open.
struct DependencyPickerSheet: ViewModifier {
    let model: TodoModel
    let compact: Bool
    func body(content: Content) -> some View {
        content.background { DependencyPickerPresenter(model: model, compact: compact) }
    }
}

private struct DependencyPickerPresenter: View {
    @Bindable var model: TodoModel
    let compact: Bool
    var body: some View {
        Color.clear.sheet(item: Binding(get: { model.dependencies.picker.map { PickerIdentity(id: $0.id) } }, set: { if $0 == nil { model.closeDependencyPicker() } })) { _ in
            DependencyPickerView(model: model, compact: compact)
        }
    }
}

private struct PickerIdentity: Identifiable { let id: UUID }

struct DependencyPickerView: View {
    @Bindable var model: TodoModel
    var compact = false
    @FocusState private var searchFocused: Bool
    @FocusState private var focusedCandidate: String?
    /// A row the arrow keys are moving to: scrolled into view (and so built) before it takes focus.
    @State private var scrollTarget: String?
    /// Every row has this height (UI check: an honest scroll bar, no jumps while scrolling).
    static let rowHeight: CGFloat = 56
    var body: some View {
        if let picker = model.dependencies.picker {
            VStack(alignment: .leading, spacing: 10) {
                // The fixed top block (UI check): title, Direction, search, the count and any notice
                // stay above the list and never scroll.
                Text(picker.direction.sentence(picker.root.title)).font(.headline).lineLimit(2)
                Picker("Direction", selection: Binding(get: { picker.direction }, set: { direction in Task { await model.setDependencyDirection(direction) } })) {
                    Text("Depends on").tag(DependencyDirection.dependsOn).accessibilityIdentifier("dependency-depends-on")
                    Text("Blocks").tag(DependencyDirection.blocks).disabled(picker.purpose != .edit).accessibilityIdentifier("dependency-blocks")
                }.pickerStyle(.segmented).accessibilityIdentifier("dependency-direction")
                // How many Tasks the list holds: with rows built on demand the scroll bar is the only
                // other clue to its length (UI check). With search text, the matches. Under the
                // search field; in Compact at its trailing end, so two whole rows still show under a
                // long notice.
                let count = Text(picker.loading && picker.rowIDs.isEmpty ? " " : TaskCount.text(picker.rowIDs.count, capitalized: true))
                    .font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("dependency-count")
                let search = TextField("Search Tasks in this Profile", text: Binding(get: { model.dependencies.picker?.text ?? "" }, set: { model.dependencies.picker?.text = $0 }))
                    .textFieldStyle(.roundedBorder).focused($searchFocused).accessibilityIdentifier("dependency-search")
                    .onChange(of: picker.text) { _, text in
                        Task {
                            do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                            guard model.dependencies.picker?.id == picker.id, model.dependencies.picker?.text == text else { return }
                            await model.searchDependencyCandidates()
                        }
                    }
                if compact {
                    HStack(spacing: 8) { search; count.fixedSize() }
                } else {
                    VStack(alignment: .leading, spacing: 4) { search; count }
                }
                if picker.loading { ProgressView("Loading Dependencies…").controlSize(.small) }
                if let notice = picker.failure {
                    DependencyNoticeView(model: model, notice: notice)
                    if picker.requiresReload {
                        Button("Reload") { Task { await model.reloadDependencyPicker() } }.accessibilityIdentifier("dependency-reload")
                    }
                }
                ForEach(picker.warnings.indices, id: \.self) { DependencyNoticeView(model: model, notice: picker.warnings[$0], warning: true) }
                if !model.canWrite { Text(model.connection == .offline ? "Offline · Read only" : "Dependencies are read only right now.").foregroundStyle(.secondary) }
                ScrollViewReader { proxy in
                    // A native list (NSTableView-backed): only the rows in view are built, and each
                    // row reads only its own entries of the picker's row index.
                    List {
                        ForEach(picker.rowIDs, id: \.self) { id in
                            if let task = picker.tasksByID[id] {
                                // The Task row draws its own divider, as before the list; the list
                                // adds no inset or separator of its own.
                                row(task, picker: picker).id(id)
                                    .listRowInsets(EdgeInsets()).listRowSeparator(.hidden).listRowBackground(Color.clear)
                            }
                        }
                    }
                    .listStyle(.plain).scrollContentBackground(.hidden).contentMargins(.horizontal, 0, for: .scrollContent)
                    .environment(\.defaultMinListRowHeight, Self.rowHeight)
                    .overlay { if !picker.loading && picker.rowIDs.isEmpty { Text("No matching Tasks").foregroundStyle(.secondary) } }
                    .onChange(of: scrollTarget) { _, target in
                        guard let target else { return }
                        proxy.scrollTo(target)
                        // Focus after the scroll has built the row.
                        DispatchQueue.main.async { searchFocused = false; focusedCandidate = target; scrollTarget = nil }
                    }
                }.compactBounds("dependency-body")
                if let feedback = picker.feedback { Text(feedback).font(.caption).foregroundStyle(.secondary) }
                HStack {
                    Text(picker.purpose == .edit ? "Changes save immediately." : picker.purpose == .firstOccurrence ? "Saved with the first Occurrence." : "Saved with the new Task.").font(.caption).foregroundStyle(.secondary)
                    if picker.purpose == .edit { Button("Batch…") { Task { await model.beginDependencyBatch() } }.disabled(!model.canWrite || !picker.pending.isEmpty) }
                    Spacer(minLength: 0)
                    Button("Close") { model.closeDependencyPicker() }.keyboardShortcut(.cancelAction).accessibilityIdentifier("dependency-picker-close")
                }.compactBounds("dependency-actions")
            }.padding(16).frame(width: compact ? 393 : 560, height: compact ? 426 + model.compactExtraHeight : 600)
                .background(ClientDiagnosticSurfaceView(monitor: model.clientDiagnosticsUI, surface: .dependencyPicker))
                .accessibilityIdentifier("dependency-picker")
                .task { searchFocused = true }
                .onKeyPress(.downArrow) { moveCandidate(1, picker: picker) }
                .onKeyPress(.upArrow) { moveCandidate(-1, picker: picker) }
        }
    }
    /// One row: the checkbox and the Task, or the Task "Updating" while its link is pending. It
    /// reads only this row's Task, its checked and pending state, and the prepared names.
    @ViewBuilder private func row(_ task: TaskSnapshot, picker: DependencyPicker) -> some View {
        let projectName = task.project_id.flatMap { model.projectNameByID[$0] }
        let tagNames = model.tagNames(of: task)
        if picker.pending.contains(task.id) {
            HStack(spacing: 8) {
                ProgressView().controlSize(.mini).frame(width: 14, height: 14)
                TaskRow(task: task, canWrite: false, compact: compact, projectName: projectName, tagNames: tagNames, showsCompletion: false, relation: true, complete: {}).opacity(0.5)
            }.frame(height: Self.rowHeight, alignment: .leading)
                .accessibilityIdentifier("dependency-pending-\(task.id)").accessibilityLabel(task.title).accessibilityValue("Updating").focusable().focused($focusedCandidate, equals: task.id)
        } else {
            // The click acts on what this row showed when drawn: its checked state and the Version of
            // the Task the link changes (candidate 11 ruling).
            let drawn = TodoModel.DrawnPickerRow(checked: picker.checked(task.id), dependentVersion: picker.direction == .dependsOn ? picker.root.row_version : task.row_version)
            Toggle(isOn: Binding(get: { picker.checked(task.id) }, set: { _ in model.clientDiagnosticsUI.perform(.toggleDependency, surface: .dependencyPicker) { await model.toggleDependency(task, drawn: drawn) } })) {
                TaskRow(task: task, canWrite: false, compact: compact, projectName: projectName, tagNames: tagNames, showsCompletion: false, relation: true, complete: {})
            }.toggleStyle(.checkbox)
                .frame(height: Self.rowHeight, alignment: .leading)
                .focused($focusedCandidate, equals: task.id)
                .disabled(!model.canWrite || picker.loading || picker.requiresReload || picker.rootGone || picker.pending.contains(task.id) || model.dependencies.pendingDependents.contains(picker.direction == .dependsOn ? picker.root.id : task.id))
                .accessibilityIdentifier("dependency-choice-\(task.id)")
                .accessibilityValue(picker.pending.contains(task.id) ? "Pending" : picker.checked(task.id) ? "Checked" : "Unchecked")
                .compactBounds("dependency-choice-\(task.id)")
        }
    }
    /// Down from the search field moves into the rows; Up and Down walk them; Up from the first row
    /// returns to the search field. The next row is scrolled into view before it takes focus.
    private func moveCandidate(_ step: Int, picker: DependencyPicker) -> KeyPress.Result {
        switch Self.next(from: focusedCandidate, step: step, rowIDs: picker.rowIDs, rowIndex: picker.rowIndex) {
        case .ignored: return .ignored
        case .search: focusedCandidate = nil; searchFocused = true
        case .row(let id): scrollTarget = id
        case .stay: break
        }
        return .handled
    }
    enum ArrowTarget: Equatable { case row(String), search, stay, ignored }
    /// Where an arrow key goes from the focused row (nil: the search field), through the row index.
    static func next(from focused: String?, step: Int, rowIDs: [String], rowIndex: [String: Int]) -> ArrowTarget {
        guard !rowIDs.isEmpty else { return .ignored }
        let next = focused.flatMap { rowIndex[$0] }.map { $0 + step } ?? (step > 0 ? 0 : rowIDs.count - 1)
        if next < 0 { return .search }
        return next < rowIDs.count ? .row(rowIDs[next]) : .stay
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
                .frame(height: deletion.edges.isEmpty && !deletion.loading && deletion.failure == nil ? nil : compact ? 426 + model.compactExtraHeight : 600)
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
        // MAC-C1-S1-15: the message rule holds inside the surface too. A newer follow-up in the same
        // surface supersedes this one: then this one presents nothing (no clearing, no Quick Add).
        enum Owner { case picker(UUID, SurfaceMessages<DependencyPicker.MessageKind, DependencyNotice>.Ticket), report(SurfaceMessages<ImportMessageKind, String>.Ticket), main(SurfaceMessages<MessageKind, String>.Ticket) }
        let owner: Owner
        switch surface {
        // A follow-up commits nothing; its result is a navigation (Quick Add). So any newer
        // follow-up in this picker supersedes it, whatever its row (coordinator ruling,
        // 2026-11-12). Its failure still belongs to its row, so a link on that row ends it.
        case .dependencyPicker(let picker): owner = .picker(picker, dependencies.picker!.messages.begin(.followUp))
        case .importSheet: owner = .report(importMessages.begin(.followUp))
        default: owner = .main(beginMessage(.dependencyFollowUp))
        }
        let epoch = discovery.credentialEpoch
        let selectedProfile = profile
        do {
            let task = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: selectedProfile, task: id)).ok.body.json)
            guard isCurrentCredential(epoch), profile == selectedProfile else { return }
            guard surface.map(isShowing) ?? true else { return }
            let present: Bool
            switch owner {
            case .picker(let picker, let ticket): present = dependencies.picker?.id == picker && dependencies.picker?.messages.succeed(ticket) == true
            case .report(let ticket): present = importMessages.succeed(ticket)
            case .main(let ticket): present = succeedMessage(ticket)
            }
            guard present else { return }
            closeDependencyPicker()
            if !dependencies.initial.contains(where: { $0.id == task.id }) { dependencies.initial.append(task) }
            quickAdd = true
        } catch {
            authorize(error, epoch: epoch, profile: selectedProfile)
            guard isCurrentCredential(epoch), profile == selectedProfile else { return }
            guard surface.map(isShowing) ?? true else { return }
            // Shown where the person is looking: inside the sheet that offered the follow-up.
            // Say what failed and that it can be tried again; the picker keeps the notice that
            // offered the follow-up, with its button, and shows the failure with it (ruling 1).
            let failed = "Couldn't prepare the follow-up Task. " + describe(error) + " Try again."
            switch owner {
            case .picker(let picker, let ticket):
                guard dependencies.picker?.id == picker else { break }
                var notice = DependencyNotice(message: failed)
                if var offered = dependencies.picker?.operationFailure, offered.followUp != nil { offered.followUpFailure = failed; notice = offered }
                dependencies.picker?.messages.fail(notice, ticket, row: id)
            case .report(let ticket):
                let failureText = "Couldn't prepare the follow-up Task. " + describe(error, at: .importTasks) + " Try again."
                importMessages.fail(failureText, ticket)
            case .main(let ticket): if isNewestMessage(ticket) { publishMessage(describe(error), kind: .dependencyFollowUp, surface: surface) }
            }
        }
    }
}
