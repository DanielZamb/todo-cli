import AppKit
import SwiftUI

struct RootView: View {
    @Bindable var model: TodoModel
    @Binding var compactMode: Bool
    @AppStorage("appearance") private var appearance = "System"

    var body: some View {
        Group {
            if model.signedIn {
                TaskListView(model: model, compactMode: compactMode)
            } else {
                SignInView(model: model, compact: compactMode)
            }
        }
        .frame(
            minWidth: compactMode ? TaskWindowSizing.compactSize.width : 900,
            minHeight: compactMode ? TaskWindowSizing.compactSize.height : 640)
        .background(TaskWindowSizing(compact: compactMode))
        .toolbar {
            ToolbarItem {
                Button {
                    compactMode.toggle()
                } label: {
                    Label(
                        compactMode ? "Expand window" : "Compact mode",
                        systemImage: compactMode ? "arrow.up.left.and.arrow.down.right" : "arrow.down.right.and.arrow.up.left")
                }
                .help(compactMode ? "Restore the full window" : "Collapse to a single column")
                .accessibilityIdentifier("compact-mode")
            }
        }
        .tint(TodoColors.color("primary"))
        .preferredColorScheme(model.configuration.resolvedColorScheme(storedAppearance: appearance))
    }
}

struct TaskWindowSizing: NSViewRepresentable {
    static let compactSize = NSSize(width: 393, height: 426)
    let compact: Bool

    func makeNSView(context: Context) -> WindowView { WindowView() }
    func updateNSView(_ view: WindowView, context: Context) {
        view.compact = compact
        view.scheduleResize()
    }

    final class WindowView: NSView {
        var compact = false
        private var appliedMode: Bool?
        private var expandedFrame: NSRect?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            scheduleResize()
        }

        func scheduleResize() {
            DispatchQueue.main.async { [weak self] in self?.resizeWindow() }
        }

        private func resizeWindow() {
            guard let window, appliedMode != compact else { return }
            let previousMode = appliedMode
            appliedMode = compact
            window.contentMinSize = compact ? TaskWindowSizing.compactSize : NSSize(width: 900, height: 640)
            if compact {
                if previousMode != nil { expandedFrame = window.frame }
                setContentSize(TaskWindowSizing.compactSize, on: window)
            } else if previousMode != nil {
                if let expandedFrame {
                    window.setFrame(expandedFrame, display: true)
                } else {
                    setContentSize(NSSize(width: 1100, height: 760), on: window)
                }
            }
        }

        private func setContentSize(_ size: NSSize, on window: NSWindow) {
            var frame = window.frame
            let newSize = window.frameRect(forContentRect: NSRect(origin: .zero, size: size)).size
            frame.origin.y += frame.height - newSize.height
            frame.size = newSize
            window.setFrame(frame, display: true)
        }
    }
}

struct SignInView: View {
    @Bindable var model: TodoModel
    var compact = false
    @State private var passphrase = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle").font(.system(size: 44)).foregroundStyle(TodoColors.color("primary"))
            Text("Sign in to Todo").font(.largeTitle.weight(.semibold))
            Text("Sign in with your owner passphrase.").foregroundStyle(.secondary)
            SecureField("Passphrase", text: $passphrase)
                .textFieldStyle(.roundedBorder).focused($focused)
                .disabled(model.busy)
                .accessibilityIdentifier("passphrase")
                .onSubmit { signIn() }
            if let error = model.message {
                Text(error).foregroundStyle(TodoColors.color("destructive")).accessibilityIdentifier("sign-in-error")
            }
            Button(model.busy ? "Connecting…" : "Sign in", action: signIn)
                .buttonStyle(.borderedProminent).controlSize(.large).disabled(passphrase.isEmpty || model.busy)
                .keyboardShortcut(.defaultAction).accessibilityIdentifier("sign-in")
            if model.canRestore {
                Button("Retry Session") { Task { await model.restore() } }
                    .disabled(model.busy).accessibilityIdentifier("retry-session")
            }
            Text("Server: \(model.configuration.serverAuthority)")
                .font(.caption).foregroundStyle(.tertiary)
        }.padding(compact ? 24 : 40).frame(maxWidth: compact ? .infinity : 500)
            .task { focused = true }
    }

    private func signIn() {
        guard !passphrase.isEmpty, !model.busy else { return }
        let secret = passphrase
        Task { if await model.signIn(secret) { passphrase = "" } }
    }
}

private enum SidebarDestination: Hashable {
    case view(String)
    case project(String)
    case tag(String)
}

struct CompactLayoutKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}
extension View {
    func compactBounds(_ id: String) -> some View {
        background(GeometryReader { geometry in Color.clear.preference(key: CompactLayoutKey.self, value: [id: geometry.frame(in: .global)]) })
    }
}

struct TaskListView: View {
    @Bindable var model: TodoModel
    var compactMode = false
    var referenceDate: Date? = nil
    @State private var search = ""
    @State private var selection: String?
    @State private var pendingDelete: TaskSnapshot?
    @State private var showingTaskFilters = false
    @Environment(\.defaultMinListRowHeight) private var minimumRowHeight
    private var destination: Binding<SidebarDestination?> {
        Binding(
            get: {
                if model.selectedView != "all" { return .view(model.selectedView) }
                if let project = model.selectedProject { return .project(project) }
                if let tag = model.selectedTag { return .tag(tag) }
                return .view(model.selectedView)
            },
            set: { value in
                guard !model.busy else { return }
                switch value {
                case .view(let name): model.selectView(name)
                case .project(let id):
                    model.selectView("all")
                    model.selectedProject = id
                case .tag(let id):
                    model.selectView("all")
                    model.selectedTag = id
                case nil: break
                }
            })
    }
    var visibleTasks: [TaskSnapshot] {
        (model.selectedView == "all" ? model.tasks : model.planning.map { $0.groups.flatMap(\.tasks) } ?? []).filter { task in
            (search.isEmpty || task.title.localizedCaseInsensitiveContains(search))
                && (model.selectedProject == nil || task.project_id == model.selectedProject)
                && (model.selectedTag == nil || task.tags.contains(model.selectedTag ?? ""))
                && (model.taskFilters.isEmpty || (model.matchingTaskIDs?.contains(task.id) ?? true))
        }
    }
    private var title: String {
        return model.selectedView == "all" ? "All tasks" : model.selectedView.capitalized
    }
    private var hasFilters: Bool { model.selectedProject != nil || model.selectedTag != nil || !model.taskFilters.isEmpty }
    private func clearFilters() {
        model.selectedProject = nil
        model.selectedTag = nil
        model.applyTaskFilters(.init())
    }
    private var selectedTask: TaskSnapshot? { visibleTasks.first { $0.id == selection } }
    private var inspectorPresented: Binding<Bool> {
        Binding(get: { model.editor != nil }, set: { if !$0 && !model.busy { closeInspector() } })
    }
    var body: some View {
        Group {
            if compactMode {
                compactContent
            } else {
                expandedContent
            }
        }
        .sheet(isPresented: $model.showingImport) { ImportView(model: model, compact: compactMode).interactiveDismissDisabled(model.busy) }
        .sheet(isPresented: $showingTaskFilters) {
            TaskFilterView(draft: model.taskFilters, compact: compactMode, apply: model.applyTaskFilters, close: { showingTaskFilters = false })
        }
        .confirmationDialog(
            "Delete this task?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            presenting: pendingDelete
        ) { task in
            Button("Delete task", role: .destructive) {
                Task { await model.deleteTask(task) }
                pendingDelete = nil
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: { task in
            Text(task.title)
        }
        .sheet(item: $model.transferRequest) { request in TaskTransferPicker(model: model, request: request) }
        .alert(
            DraftNavigationPrompt.title(hasConflict: model.conflict != nil),
            isPresented: Binding(get: { model.pendingNavigation != nil }, set: { if !$0 { model.pendingNavigation = nil } }),
            presenting: model.pendingNavigation
        ) { target in
            DraftNavigationActions(model: model, target: target)
        } message: { _ in
            DraftNavigationMessage(hasConflict: model.conflict != nil)
        }
        .onChange(of: model.editor?.id) { _, id in if let id { selection = id } }
        .onChange(of: model.profile) { _, _ in showingTaskFilters = false }
    }

    private var expandedContent: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            taskContent
                .navigationTitle(title)
                .navigationSubtitle("\(model.profileName) · \(TaskCount.text(visibleTasks.count))")
                .searchable(text: $search, prompt: "Find a task")
                .toolbar {
                    ToolbarItem {
                        Button("Import…") { model.resetImport(); model.showingImport = true }
                            .disabled(!model.canWrite).accessibilityIdentifier("import-tasks")
                    }
                    ToolbarItem {
                        Button {
                            model.quickAdd = true
                        } label: {
                            Label("Add task", systemImage: "plus").frame(width: 28, height: 28)
                        }
                        .disabled(!model.canWrite).accessibilityIdentifier("new-task")
                        .popover(isPresented: $model.quickAdd, arrowEdge: .top) { QuickAddView(model: model, floating: true) }
                    }
                }
                .onExitCommand { if !model.busy { closeInspector() } }
        }
        .inspector(isPresented: inspectorPresented) {
            Group {
                if model.editor != nil {
                    EditorView(model: model).inspectorColumnWidth(min: 340, ideal: 380, max: 480)
                }
            }
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button {
                        if model.editor != nil { closeInspector() } else { _ = openSelection() }
                    } label: {
                        Label("Inspector", systemImage: "sidebar.right")
                    }
                    .disabled(model.busy || (model.editor == nil && selectedTask == nil))
                    .help("Show or hide the task inspector")
                }
            }
        }
    }

    var compactContent: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                if model.editor != nil && !model.quickAdd {
                    Button { closeInspector() } label: {
                        Label("Back to tasks", systemImage: "chevron.left")
                    }.buttonStyle(.plain).frame(minHeight: 28).disabled(model.busy).accessibilityIdentifier("compact-back").compactBounds("back")
                    Spacer()
                    EditorTaskActions(model: model).compactBounds("editor-actions")
                } else {
                    compactNavigation
                    Spacer(minLength: 0)
                    if !model.quickAdd && !visibleTasks.isEmpty && model.connection != .offline && model.taskLoadError == nil {
                        Button { model.quickAdd = true } label: {
                            Label("Add task", systemImage: "plus")
                        }.labelStyle(.iconOnly).buttonStyle(.borderedProminent).controlSize(.large)
                            .frame(minWidth: 28, minHeight: 28).contentShape(Rectangle())
                            .disabled(!model.canWrite).accessibilityIdentifier("compact-new-task").compactBounds("add-task")
                    }
                }
            }.padding(.horizontal, 16).padding(.vertical, 8).compactBounds("header")
            Divider()
            if model.editor != nil, let result = model.transferResult {
                TaskTransferResultView(model: model, result: result)
                Divider()
            }
            if model.quickAdd {
                ScrollView { QuickAddView(model: model, floating: true, compact: true, referenceDate: referenceDate) }
            } else if model.editor != nil {
                EditorView(model: model, compact: true)
            } else {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Find a task", text: $search).textFieldStyle(.plain)
                        .accessibilityIdentifier("compact-search")
                    if !search.isEmpty {
                        Button { search = "" } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel("Clear search")
                    }
                }.padding(10).background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
                    .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 4)
                taskContent
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .onExitCommand {
            if !model.busy {
                if model.quickAdd { model.quickAdd = false } else { closeInspector() }
            }
        }
    }

    private var compactNavigation: some View {
        VStack(alignment: .leading, spacing: 4) {
            Menu {
                Picker("Profile", selection: Binding(get: { model.profile }, set: { requestProfile($0) })) {
                    ForEach(model.profiles) { Text($0.name).tag($0.id) }
                }
                Divider()
                CompactUtilityActions(model: model)
                Divider()
                Picker("View", selection: destination) {
                    ForEach(["All tasks", "Today", "Overdue", "Scheduled", "Inbox"], id: \.self) { name in
                        let key = name == "All tasks" ? "all" : name.lowercased()
                        Text("\(name) (\(model.viewCounts[key] ?? 0))").tag(SidebarDestination?.some(.view(key)))
                    }
                }.pickerStyle(.inline)
                if !model.projects.isEmpty {
                    Menu("Projects") {
                        ForEach(model.projects) { project in
                            Button(project.name) { destination.wrappedValue = .project(project.id) }
                        }
                    }
                }
                if !model.tags.isEmpty {
                    Menu("Tags") {
                        ForEach(model.tags) { tag in
                            Button(tag.name) { destination.wrappedValue = .tag(tag.id) }
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(title).font(.headline).lineLimit(1)
                    Image(systemName: "chevron.down").font(.caption2.weight(.semibold))
                }
            }.menuStyle(.borderlessButton).menuIndicator(.hidden).frame(minHeight: 28)
                .disabled(model.busy).accessibilityLabel("Navigate tasks").accessibilityIdentifier("compact-navigation").compactBounds("navigate")
            Text("\(model.profileName) · \(TaskCount.text(visibleTasks.count))")
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
    }
    private func requestProfile(_ profile: String) {
        Task { await model.navigate(.profile(profile)) }
    }
    var sidebar: some View {
        VStack(spacing: 0) {
            Picker("Profile", selection: Binding(get: { model.profile }, set: { requestProfile($0) })) {
                ForEach(model.profiles) { Text($0.name).tag($0.id) }
            }.pickerStyle(.menu).labelsHidden().frame(maxWidth: .infinity, alignment: .leading)
                .padding(12).foregroundStyle(.primary).accessibilityIdentifier("profile-picker").disabled(model.busy)
            List(selection: destination) {
                sidebarRow("All tasks", icon: "checklist", count: model.viewCounts["all"] ?? 0)
                    .tag(SidebarDestination.view("all")).accessibilityIdentifier("view-all")
                ForEach(
                    [("Today", "sun.max"), ("Overdue", "exclamationmark.circle"), ("Scheduled", "calendar"), ("Inbox", "tray")], id: \.0
                ) { title, icon in
                    sidebarRow(
                        title, icon: icon, count: model.viewCounts[title.lowercased()] ?? 0,
                        tint: title == "Overdue" && (model.viewCounts["overdue"] ?? 0) > 0 ? TodoColors.color("destructive") : .primary
                    )
                    .tag(SidebarDestination.view(title.lowercased())).accessibilityIdentifier("view-\(title.lowercased())")
                }
                if !model.projects.isEmpty {
                    Section("Projects") {
                        ForEach(model.projects) { project in
                            sidebarRow(project.name, icon: "folder", count: project.open_task_count).tag(
                                SidebarDestination.project(project.id))
                        }
                    }
                }
                if !model.tags.isEmpty {
                    Section("Tags") {
                        ForEach(model.tags) { tag in
                            sidebarRow(tag.name, icon: "number", count: tag.open_task_count).tag(SidebarDestination.tag(tag.id))
                        }
                    }
                }
            }.listStyle(.sidebar)
        }.navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 280)
    }
    var taskFilters: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Project").font(.caption).foregroundStyle(.secondary)
                    Picker("Filter by Project", selection: $model.selectedProject) {
                        Text("All Projects").tag(Optional<String>.none)
                        ForEach(model.projects) { Text($0.name).tag(Optional($0.id)) }
                    }.labelsHidden().accessibilityLabel("Filter by Project")
                        .accessibilityIdentifier("filter-project").compactBounds("filter-project")
                }.frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Tag").font(.caption).foregroundStyle(.secondary)
                    Picker("Filter by Tag", selection: $model.selectedTag) {
                        Text("All Tags").tag(Optional<String>.none)
                        ForEach(model.tags) { Text($0.name).tag(Optional($0.id)) }
                    }.labelsHidden().accessibilityLabel("Filter by Tag")
                        .accessibilityIdentifier("filter-tag").compactBounds("filter-tag")
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.pickerStyle(.menu).controlSize(.large)
            HStack {
                Button(model.taskFilters.isEmpty ? "Filters" : "Filters · \(model.taskFilters.count)") { showingTaskFilters = true }
                    .accessibilityLabel("More filters").accessibilityIdentifier("more-task-filters").compactBounds("more-task-filters")
            if hasFilters {
                Button("Clear filters", action: clearFilters)
                    .accessibilityIdentifier("clear-task-filters").compactBounds("clear-task-filters")
            }
            }
            if !model.taskFilters.isEmpty {
                Text(model.taskFilters.summary).font(.caption).foregroundStyle(.secondary)
                    .accessibilityIdentifier("active-task-filters")
            }
        }.padding(.horizontal, compactMode ? 12 : 20).padding(.vertical, 8)
            .accessibilityElement(children: .contain).accessibilityLabel("Task filters")
    }
    var taskContent: some View {
        VStack(spacing: 0) {
            if let result = model.transferResult { TaskTransferResultView(model: model, result: result) }
            taskFilters
            if compactMode && model.connection == .offline {
                compactState("Your tasks are read only while offline.", action: "Reconnect") { model.connect() }
                    .accessibilityIdentifier("connection-status")
            } else if compactMode, let message = model.taskLoadError {
                compactState("Could not load tasks.", action: "Retry") { model.connect() }.help(message)
            } else {
            if let message = model.message {
                HStack {
                    Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(TodoColors.color("destructive"))
                    Spacer()
                    Button("Retry") { model.connect() }
                }.padding()
            }
            if model.loading {
                ProgressView("Loading tasks…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if visibleTasks.isEmpty {
                if hasFilters {
                    if compactMode {
                        compactState("No matching tasks.", action: "Clear filters", perform: clearFilters)
                    } else {
                        ContentUnavailableView {
                            Label("No matching tasks", systemImage: "line.3.horizontal.decrease")
                        } description: {
                            Text("Try different filters or clear them.")
                        } actions: {
                            Button("Clear filters", action: clearFilters)
                        }
                    }
                } else if compactMode {
                    compactState(search.isEmpty ? "No tasks yet." : "No matching tasks.", action: search.isEmpty ? "Add task" : "Clear search") {
                        if search.isEmpty { model.quickAdd = true } else { search = "" }
                    }
                } else { ContentUnavailableView {
                    Label(search.isEmpty ? "No tasks yet" : "No matching tasks", systemImage: "checkmark.circle")
                } description: {
                    Text(search.isEmpty ? "Add a task in \(model.profileName)." : "Try another title.")
                } actions: {
                    if search.isEmpty { Button("Add task") { model.quickAdd = true }.disabled(!model.canWrite) }
                } }
            } else {
                List(selection: $selection) {
                    let visibleIDs = Set(visibleTasks.map(\.id))
                    if let planning = model.planning {
                        let groups = planning.groups.filter { group in group.tasks.contains { visibleIDs.contains($0.id) } }
                        ForEach(groups) { group in
                            let tasks = group.tasks.filter { visibleIDs.contains($0.id) }
                            if !tasks.isEmpty {
                                if compactMode {
                                    if groups.count > 1 {
                                        Text(group.name).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                            .accessibilityAddTraits(.isHeader)
                                            .frame(maxWidth: .infinity, alignment: .leading).compactBounds("section-label-\(group.id)")
                                            .padding(.top, 12).padding(.bottom, 8)
                                            .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
                                            .listRowSeparator(.hidden).selectionDisabled()
                                    }
                                    ForEach(tasks) { row($0, overdue: group.name == "Overdue") }
                                } else { Section(group.name) { ForEach(tasks) { row($0, overdue: group.name == "Overdue") } } }
                            }
                        }
                    } else {
                        ForEach(visibleTasks) { row($0) }
                    }
                }.listStyle(.inset)
                    .environment(\.defaultMinListRowHeight, compactMode ? 4 : minimumRowHeight)
                    .onChange(of: selection) { old, id in
                        if let task = visibleTasks.first(where: { $0.id == id }), model.editor?.id != id {
                            Task {
                                if !(await model.navigate(.edit(task))) { selection = model.editor?.id ?? old }
                            }
                        }
                    }
                    .onKeyPress(.return) { openSelection() }
                    .onKeyPress(.space) {
                        guard model.canWrite, let task = selectedTask else { return .ignored }
                        transition(task, action: task.status == "open" ? "complete" : "reopen")
                        return .handled
                    }
                    .onDeleteCommand { if model.canWrite { pendingDelete = selectedTask } }
            }
            }
            if model.connection != .live && !(compactMode && model.connection == .offline) {
                HStack {
                    Label(
                        model.connection == .connecting ? "Reconnecting" : "Offline · Read only",
                        systemImage: model.connection == .connecting ? "arrow.trianglehead.2.clockwise" : "wifi.slash")
                    Spacer()
                    Button("Reconnect") { model.connect() }.buttonStyle(.plain)
                }.font(.caption).foregroundStyle(.secondary).padding(12).accessibilityIdentifier("connection-status")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .overlay(alignment: .bottom) {
            if let notice = model.deletionNotice {
                Text(notice).padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule()).padding(16).accessibilityIdentifier("task-notice")
            }
        }
        .task(id: model.deletionNotice) {
            guard model.deletionNotice != nil else { return }
            defer { model.deletionNotice = nil }
            try? await Task.sleep(for: .seconds(3))
        }
    }
    private func compactState(_ message: String, action: String, perform: @escaping () -> Void) -> some View {
        VStack(spacing: 12) {
            Text(message).multilineTextAlignment(.center)
            Button(action, action: perform).buttonStyle(.borderedProminent).controlSize(.large).frame(minHeight: 28).compactBounds("state-action")
        }.padding(24).frame(maxWidth: .infinity, maxHeight: .infinity).compactBounds("state")
    }
    private func closeInspector() {
        model.editor = nil
        model.conflict = nil
    }
    private func openSelection() -> KeyPress.Result {
        guard !model.busy, let task = selectedTask else { return .ignored }
        Task { await model.navigate(.edit(task)) }
        return .handled
    }
    private func sidebarRow(_ title: String, icon: String, count: Int, tint: Color = .primary) -> some View {
        Label(title, systemImage: icon).foregroundStyle(tint).badge(count == 0 ? nil : Text(String(count)).foregroundStyle(.secondary))
    }
    private func transition(_ task: TaskSnapshot, action: String) { Task { await model.transition(task, action: action) } }
    private func row(_ task: TaskSnapshot, overdue: Bool = false) -> some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            TaskRow(
                task: task, now: referenceDate ?? context.date, canWrite: model.canWrite, overdue: overdue, compact: compactMode,
                projectName: model.projects.first { $0.id == task.project_id }?.name,
                tagNames: task.tagNames(from: model.tags),
                complete: { transition(task, action: task.status == "open" ? "complete" : "reopen") }
            )
        }
        .listRowInsets(compactMode ? EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4) : nil)
        .listRowSeparator(compactMode ? .hidden : .automatic)
        .tag(task.id)
        .accessibilityIdentifier("task-\(task.id)")
        .contextMenu {
            Group {
                Button(task.status == "open" ? "Complete" : "Reopen") {
                    transition(task, action: task.status == "open" ? "complete" : "reopen")
                }
                Button("Cancel task") { transition(task, action: "cancel") }.disabled(task.status != "open")
                TaskTransferActions(model: model, task: task)
                Divider()
                Button("Delete…", role: .destructive) { pendingDelete = task }
            }.disabled(!model.canWrite)
        }.disabled(model.busy)
    }
}

struct TaskRow: View {
    let task: TaskSnapshot
    var now = Date()
    let canWrite: Bool
    var overdue = false
    var compact = false
    let projectName: String?
    let tagNames: [String]
    let complete: () -> Void
    private var presentation: TaskRowPresentation { TaskRowPresentation(task: task, tagNames: tagNames, now: now) }
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Button(action: complete) { Image(systemName: presentation.completionSymbol).font(.system(size: 16)).frame(width: 28, height: 28) }
                .buttonStyle(.plain).disabled(!canWrite).foregroundStyle(.secondary)
                .accessibilityLabel(task.status == "open" ? "Complete \(task.title)" : "Reopen \(task.title)")
                .accessibilityIdentifier("transition-\(task.id)").compactBounds("complete-\(task.id)")
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(task.title).lineLimit(1).strikethrough(presentation.isDone).foregroundStyle(
                        presentation.isDone ? .secondary : .primary)
                    Spacer(minLength: 8)
                    if compact && ["cancelled", "snoozed"].contains(task.status) {
                        Text(task.status).font(.caption).foregroundStyle(.secondary).fixedSize()
                            .compactBounds("status-\(task.id)")
                    }
                    JiraAttachmentMarker(task: task)
                    if let priority = presentation.priority {
                        Label(priority, systemImage: "flag.fill").font(.caption.weight(.medium)).foregroundStyle(
                            TodoColors.color("priority-\(priority.dropFirst())"))
                    }
                }
                if compact {
                    CompactRowMetadata(items: compactMetadata).compactBounds("metadata-\(task.id)")
                } else { HStack(spacing: 4) {
                    if let projectName { Label(projectName, systemImage: "folder").help(projectName) }
                    if projectName != nil && !tagNames.isEmpty { Text("·") }
                    ForEach(compact ? Array(presentation.tags.prefix(1)) : presentation.tags, id: \.self) { name in
                        Text("#\(name)").padding(.horizontal, 4).padding(.vertical, 1).background(.quaternary.opacity(0.5), in: Capsule()).help(name)
                    }
                    if compact && presentation.tags.count > 1 {
                        Text("+\(presentation.tags.count - 1)").help(presentation.tags.joined(separator: ", "))
                    }
                    if let due = presentation.due {
                        if projectName != nil || !tagNames.isEmpty { Text("·") }
                        Label(due, systemImage: "calendar").foregroundStyle(overdue ? TodoColors.color("destructive") : .secondary).help(
                            "Due \(due)")
                    }
                    if let externalID = task.external_id { Text(externalID).font(.caption2).foregroundStyle(.tertiary).lineLimit(1).frame(maxWidth: compact ? 100 : 180, alignment: .leading).help(externalID) }
                    if let scheduled = presentation.scheduled {
                        if projectName != nil || !tagNames.isEmpty || presentation.due != nil { Text("·") }
                        Label(scheduled, systemImage: "calendar").help("Scheduled \(scheduled)")
                    }
                }.font(.caption).foregroundStyle(.secondary).lineLimit(1) }
            }.fixedSize(horizontal: false, vertical: true)
        }.padding(.vertical, 8).frame(height: compact ? 56 : nil)
            .overlay(alignment: .bottom) {
                if compact { Divider().frame(height: 1).compactBounds("separator-\(task.id)").padding(.leading, 36) }
            }
            .contentShape(Rectangle()).opacity(presentation.isDone ? 0.7 : 1).compactBounds("row-\(task.id)")
    }
    private var compactMetadata: [CompactRowMetadata.Item] {
        var items: [CompactRowMetadata.Item] = []
        if let date = presentation.compactDate { items.append(.init(text: date, overdue: overdue && presentation.due != nil)) }
        if let projectName { items.append(.init(text: projectName)) }
        items += presentation.tags.map { .init(text: "#" + $0) }
        return items
    }
}

struct CompactRowMetadata: View {
    struct Item { let text: String; var overdue = false }
    let items: [Item]
    var body: some View {
        ViewThatFits(in: .horizontal) {
            ForEach((0...items.count).reversed(), id: \.self) { count in
                HStack(spacing: 8) {
                    ForEach(Array(items.prefix(count).enumerated()), id: \.offset) { _, item in
                        Text(item.text).foregroundStyle(item.overdue ? TodoColors.color("destructive") : .secondary).fixedSize()
                    }
                    if count < items.count { Text("+\(items.count - count)").fixedSize() }
                }.fixedSize()
            }
        }.font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 16, alignment: .leading)
            .help(items.map(\.text).joined(separator: " · "))
            .accessibilityLabel(items.map(\.text).joined(separator: " · "))
    }
}

struct CompactUtilityActions: View {
    @Bindable var model: TodoModel
    var body: some View {
        Button("Import…") { model.resetImport(); model.showingImport = true }
            .controlSize(.large).frame(minHeight: 28).disabled(!model.canWrite).accessibilityIdentifier("compact-import-tasks")
        SettingsLink { Text("Settings…").frame(minHeight: 28) }.controlSize(.large)
    }
}

struct QuickAddView: View {
    @Bindable var model: TodoModel
    @AppStorage("appearance") private var appearance = "System"
    let floating: Bool
    var compact = false
    var referenceDate: Date? = nil
    @FocusState private var focused: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        content
            .defaultFocus($focused, true)
            .task(id: model.profile + "\u{0}" + model.newTitle) { await model.parseDraft() }
            .onExitCommand { if floating { model.quickAdd = false } else { dismiss() } }
            .preferredColorScheme(model.configuration.resolvedColorScheme(storedAppearance: appearance))
    }
    var content: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("New task").font(.headline)
                Spacer()
                Text(model.profileName).foregroundStyle(.secondary)
                if floating {
                    Button {
                        model.quickAdd = false
                    } label: {
                        Image(systemName: "xmark").frame(minWidth: 28, minHeight: 28).contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityLabel("Close quick add").background(measure("control:close"))
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                TextField("Task title", text: $model.newTitle)
                    .font(.title3).textFieldStyle(.roundedBorder).focused($focused)
                    .frame(minHeight: 32)
                    .accessibilityIdentifier("new-title")
                    .onSubmit { add(edit: false) }
                Text("Try: tomorrow p1 #tag @\"Client Project\"")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let parsed = model.parsedTask?.displayingTokens(in: model.parsedInput).removing(model.removedQuickAddFields) {
                VStack(alignment: .leading, spacing: 8) {
                    if compact {
                        QuickAddFlow {
                            metadataChips(parsed)
                            dateChips(parsed)
                        }
                    } else {
                        HStack(spacing: 8) { metadataChips(parsed) }
                        dateChips(parsed)
                    }
                }
            }
            if let error = model.parseError { Text(error).font(.caption).foregroundStyle(TodoColors.color("destructive")) }
            if !model.canWrite { Text("Reconnect to add. Your draft stays here.").foregroundStyle(.secondary) }
            if let error = model.quickAddError { Text(error).foregroundStyle(TodoColors.color("destructive")) }
            HStack {
                Spacer()
                if compact {
                    Menu {
                        Button("Add and edit") { add(edit: true) }.keyboardShortcut(.return, modifiers: .command)
                    } label: { Image(systemName: "ellipsis").frame(minWidth: 28, minHeight: 28) }
                        .menuStyle(.button).buttonStyle(.bordered).controlSize(.large).fixedSize()
                        .menuIndicator(.hidden).frame(minWidth: 28, minHeight: 28).contentShape(Rectangle())
                        .accessibilityLabel("More add options").background(measure("control:menu"))
                } else {
                    Button("Add and edit") { add(edit: true) }.buttonStyle(.bordered).tint(nil as Color?).keyboardShortcut(
                        .return, modifiers: .command)
                }
                Button { add(edit: false) } label: {
                    Text(model.busy ? "Adding…" : "Add task").frame(minHeight: 28)
                }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction).accessibilityIdentifier("add-task")
                    .background(measure("control:add"))
            }.disabled(!model.canWrite || model.newTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }.padding(compact ? 16 : 24).frame(minWidth: compact ? nil : 540, maxWidth: compact ? .infinity : 540)
            .coordinateSpace(name: "quick-add-chips")
            .disabled(model.busy)
    }

    @ViewBuilder private func metadataChips(_ parsed: ParsedTask) -> some View {
        if let priority = parsed.priority { chip(priority, symbol: "flag", field: "priority") }
        if let project = parsed.project { chip(project, symbol: "folder", field: "project") }
        ForEach(parsed.tags, id: \.self) { chip($0, symbol: "number", field: "tag:\($0)") }
    }

    @ViewBuilder private func dateChips(_ parsed: ParsedTask) -> some View {
        if let due = parsed.due_at { chip("Due \(RowDate.text(due, now: referenceDate ?? .now))", symbol: "calendar", field: "due") }
        if let scheduled = parsed.scheduled_at {
            chip("Scheduled \(RowDate.text(scheduled, now: referenceDate ?? .now))", symbol: "calendar.badge.clock", field: "scheduled")
        }
    }

    private func chip(_ title: String, symbol: String, field: String) -> some View {
        Button {
            model.removedQuickAddFields.insert(field)
        } label: {
            HStack(spacing: 8) {
                Label(title, systemImage: symbol)
                Image(systemName: "xmark").font(.caption2)
            }.frame(minHeight: 28).contentShape(Rectangle())
        }.lineLimit(1).buttonStyle(.bordered).tint(nil as Color?).controlSize(.small).help(title).accessibilityLabel("Clear \(title)")
            .background(measure(field)).preference(key: QuickAddChipLabels.self, value: [field: title])
    }

    private func measure(_ field: String) -> some View {
        GeometryReader { geometry in
            Color.clear.preference(key: QuickAddChipFrames.self, value: [field: geometry.frame(in: .named("quick-add-chips"))])
        }
    }
    private func add(edit: Bool) {
        Task {
            if await model.create(openEditor: edit) {
                if !floating { dismiss() }
                if edit { openWindow(id: "tasks") }
            }
        }
    }
}

struct QuickAddChipFrames: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, next in next })
    }
}

struct QuickAddChipLabels: PreferenceKey {
    static let defaultValue: [String: String] = [:]
    static func reduce(value: inout [String: String], nextValue: () -> [String: String]) {
        value.merge(nextValue(), uniquingKeysWith: { _, next in next })
    }
}

struct QuickAddFlow: Layout {
    private let spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrangement(width: proposal.width, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangement(width: bounds.width, subviews: subviews)
        for (subview, item) in zip(subviews, result.items) {
            subview.place(at: CGPoint(x: bounds.minX + item.origin.x, y: bounds.minY + item.origin.y),
                anchor: .topLeading, proposal: ProposedViewSize(item.size))
        }
    }

    private func arrangement(width: CGFloat?, subviews: Subviews) -> (size: CGSize, items: [CGRect]) {
        let available = max(0, width ?? .infinity)
        var items: [CGRect] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0
        for subview in subviews {
            let ideal = subview.sizeThatFits(.unspecified)
            let size = subview.sizeThatFits(ProposedViewSize(width: min(ideal.width, available), height: nil))
            if x > 0 && x + size.width > available {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            items.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            usedWidth = max(usedWidth, x + size.width)
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
        return (CGSize(width: width ?? usedWidth, height: y + rowHeight), items)
    }
}

extension ClientConfiguration {
    var colorScheme: ColorScheme? {
        Self.colorScheme(for: appearance)
    }
    func resolvedColorScheme(storedAppearance: String) -> ColorScheme? { colorScheme ?? Self.colorScheme(for: storedAppearance) }
    static func colorScheme(for appearance: String?) -> ColorScheme? {
        switch appearance {
        case "Light": .light
        case "Dark": .dark
        default: nil
        }
    }
}

struct DraftNavigationActions: View {
    @Bindable var model: TodoModel
    let target: TodoModel.EditorNavigation
    var saveFirst = true
    var body: some View {
        if saveFirst { save }
        Button("Discard", role: .destructive) { Task { await model.discardAndNavigate(target) } }
            .tint(TodoColors.color("destructive")).disabled(model.busy).accessibilityIdentifier("discard-before-navigation")
        Button("Cancel", role: .cancel) { model.pendingNavigation = nil }
            .tint(nil as Color?).accessibilityIdentifier("cancel-navigation")
        if !saveFirst { save }
    }
    @ViewBuilder private var save: some View {
        if model.conflict == nil {
            Button("Save") { Task { await model.saveAndNavigate(target) } }
                .buttonStyle(.borderedProminent)
                .disabled(
                    !model.canWrite || model.editor?.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
                )
                .keyboardShortcut(.defaultAction).accessibilityIdentifier("save-before-navigation")
        }
    }
}

struct DraftNavigationMessage: View {
    let hasConflict: Bool
    var body: some View {
        Text(
            hasConflict
                ? "Resolve the Conflict in the inspector before saving. Discard changes to continue without them, or cancel to keep editing."
                : "Save your changes, discard them, or cancel to keep editing this task.")
    }
}

struct DraftNavigationPrompt: View {
    static func title(hasConflict: Bool) -> String { hasConflict ? "Resolve the Conflict first" : "Save changes before continuing?" }
    @Bindable var model: TodoModel
    let target: TodoModel.EditorNavigation
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(Self.title(hasConflict: model.conflict != nil)).font(.headline)
            DraftNavigationMessage(hasConflict: model.conflict != nil).foregroundStyle(.secondary)
            HStack {
                Spacer()
                DraftNavigationActions(model: model, target: target, saveFirst: false)
            }.buttonStyle(.bordered)
        }.padding(24).frame(width: 520)
    }
}
