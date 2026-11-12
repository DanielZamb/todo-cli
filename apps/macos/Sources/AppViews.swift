import AppKit
import SwiftUI
import TodoAPI

struct RootView: View {
    @Bindable var model: TodoModel
    @Binding var compactMode: Bool
    @AppStorage("appearance") private var appearance = "System"

    var body: some View {
        Group {
            if let build = model.outdatedServerBuild {
                OutdatedServerView(model: model, serverBuild: build, compact: compactMode)
            } else if model.signedIn {
                TaskListView(model: model, compactMode: compactMode)
            } else {
                SignInView(model: model, compact: compactMode)
            }
        }
        .frame(
            minWidth: compactMode ? TaskWindowSizing.compactSize.width : 900,
            minHeight: compactMode ? TaskWindowSizing.compactSize.height : 640)
        .background(TaskWindowSizing(compact: compactMode))
        .background(ClientDiagnosticSurfaceView(monitor: model.clientDiagnosticsUI, surface: .main, mode: compactMode ? .compact : .full))
        .toolbar {
            ToolbarItem {
                Button {
                    model.clientDiagnosticsUI.performSync(.toggleCompact) { compactMode.toggle() }
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
    func compactBounds(_ id: String, when active: Bool = true) -> some View {
        background(GeometryReader { geometry in Color.clear.preference(key: CompactLayoutKey.self, value: active ? [id: geometry.frame(in: .global)] : [:]) })
    }
}

private struct TaskListClip: Shape {
    let top: CGFloat
    let bottom: CGFloat
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addRect(CGRect(x: rect.minX, y: rect.minY + top, width: rect.width, height: max(0, rect.height - top - bottom)))
        path.addRect(CGRect(x: rect.maxX - 16, y: rect.minY, width: 16, height: rect.height))
        return path
    }
}

private struct WholeTaskRows: ViewModifier {
    let enabled: Bool
    @State private var topInset: CGFloat = 0
    @State private var bottomInset: CGFloat = 0

    func body(content: Content) -> some View {
        content.compactBounds("task-viewport")
            .onPreferenceChange(CompactLayoutKey.self) { frames in
                guard enabled, let viewport = frames["task-viewport"] else { return }
                var top = viewport.minY
                var bottom = viewport.maxY
                for (key, row) in frames where key.hasPrefix("row-") {
                    if row.minY < viewport.minY && row.maxY > viewport.minY { top = max(top, row.maxY) }
                    if row.minY < viewport.maxY && row.maxY > viewport.maxY { bottom = min(bottom, row.minY) }
                }
                MainActor.assumeIsolated {
                    topInset = top - viewport.minY
                    bottomInset = viewport.maxY - max(top, bottom)
                }
            }
            .mask(TaskListClip(top: enabled ? topInset : 0, bottom: enabled ? bottomInset : 0))
            .contentShape(TaskListClip(top: enabled ? topInset : 0, bottom: enabled ? bottomInset : 0))
            .overlay {
                Color.clear.compactBounds("whole-task-viewport")
                    .padding(.top, enabled ? topInset : 0).padding(.bottom, enabled ? bottomInset : 0)
                    .allowsHitTesting(false)
            }
    }
}

struct TaskListView: View {
    @Bindable var model: TodoModel
    var compactMode = false
    var referenceDate: Date? = nil
    @FocusState private var searchFocused: Bool
    private var searchBinding: Binding<String> {
        Binding(get: { model.searchText }, set: { value in
            model.clientDiagnosticsUI.deferred(.search, predicate: { model.appliedSearchSnapshot?.appliedIdentity == model.requestedIdentity && !model.searchPending }) { model.setSearchText(value) }
        })
    }
    @State private var selection: String?
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
                let category: ClientDiagnosticAction
                switch value { case .project: category = .projectFilter; case .tag: category = .tagFilter; default: category = .viewSwitch }
                model.clientDiagnosticsUI.deferred(category, predicate: { model.appliedSearchSnapshot?.appliedIdentity == model.requestedIdentity && !model.searchPending }) {
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
                }
            })
    }
    var visibleTasks: [TaskSnapshot] {
        if let snapshot = model.appliedSearchSnapshot { return snapshot.rows }
        return (model.selectedView == "all" ? model.tasks : model.planning.map { $0.groups.flatMap(\.tasks) } ?? []).filter { task in
            (model.selectedProject == nil || task.project_id == model.selectedProject)
                && (model.selectedTag == nil || task.tags.contains(model.selectedTag ?? ""))
                && (model.taskFilters.isEmpty || (model.matchingTaskIDs?.contains(task.id) ?? true))
        }
    }
    var taskGroups: [PlanningResult.Group] {
        let tasks = visibleTasks
        if model.selectedView == "all" {
            if !model.taskFilters.order.isEmpty { return [.init(name: model.taskFilters.order == "topo" ? "Dependency order" : "Lightest first", tasks: tasks)] }
            return ["P1", "P2", "P3", "P4"].compactMap { priority in
                let rows = tasks.filter { $0.priority == priority }
                return model.searchActive && rows.isEmpty ? nil : .init(name: priority, tasks: rows)
            }
        }
        let visibleIDs = Set(tasks.map(\.id))
        if let snapshot = model.appliedSearchSnapshot { return snapshot.groups }
        return (model.planning?.groups ?? []).compactMap { group in
            let filtered = group.tasks.filter { visibleIDs.contains($0.id) }
            return filtered.isEmpty ? nil : .init(name: group.name, tasks: filtered)
        }
    }
    private var title: String {
        return model.selectedView == "all" ? "All tasks" : model.selectedView.capitalized
    }
    private var hasFilters: Bool { model.selectedProject != nil || model.selectedTag != nil || !model.taskFilters.isEmpty }
    private func clearFilters() {
        model.selectedProject = nil
        model.selectedTag = nil
        model.applyTaskFilters(.init(order: model.taskFilters.order))
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
        .sheet(item: Binding(get: { model.discovery.dialog }, set: { if $0 == nil { model.closeDiscovery() } })) { _ in
            DiscoveryView(model: model, compact: compactMode)
        }
        .sheet(item: $model.batchEdit) { _ in BatchEditView(model: model, compact: compactMode).interactiveDismissDisabled(model.busy) }
        .sheet(isPresented: $model.showingImport) { ImportView(model: model, compact: compactMode).interactiveDismissDisabled(model.busy) }
        .sheet(isPresented: $showingTaskFilters) {
            TaskFilterView(draft: model.taskFilters, compact: compactMode, planning: model.selectedView != "all", apply: { filters in
                model.clientDiagnosticsUI.deferred(filters.order != model.taskFilters.order ? .order : .applyFilters, predicate: { model.appliedSearchSnapshot?.appliedIdentity == model.requestedIdentity && !model.searchPending }) { model.applyTaskFilters(filters) }
            }, close: { showingTaskFilters = false })
        }
        .sheet(item: Binding(get: { model.dependencies.batch }, set: { model.dependencies.batch = $0 })) { _ in DependencyBatchView(model: model, compact: compactMode) }
        .sheet(isPresented: Binding(get: { model.dependencies.graph != nil }, set: { if !$0 { model.closeDependencyGraph() } })) {
            DependencyGraphView(model: model, compact: compactMode)
        }
        .sheet(item: Binding(get: { model.dependencies.picker }, set: { if $0 == nil { model.closeDependencyPicker() } })) { _ in
            DependencyPickerView(model: model, compact: compactMode)
        }
        .sheet(item: Binding(get: { model.dependencies.deletion }, set: { if $0 == nil { model.closeDependencyDelete() } })) { _ in
            DependencyDeleteView(model: model, compact: compactMode)
        }
        .sheet(item: $model.transferRequest) { request in TaskTransferPicker(model: model, request: request) }
        .alert(
            DraftNavigationPrompt.title(hasConflict: model.conflict != nil),
            isPresented: Binding(get: { model.pendingNavigation != nil && model.discovery.dialog == nil }, set: { if !$0 { model.dismissNavigationPrompt() } }),
            presenting: model.pendingNavigation
        ) { target in
            DraftNavigationActions(model: model, target: target)
        } message: { _ in
            DraftNavigationMessage(hasConflict: model.conflict != nil)
        }
        .onChange(of: model.editor?.id) { _, id in if let id { selection = id } }
        .onChange(of: model.profile) { _, _ in showingTaskFilters = false; selection = nil }
        .onChange(of: model.selectedView) { _, _ in showingTaskFilters = false; selection = nil }
        .background {
            Button("Find a task") { searchFocused = true }.keyboardShortcut("f", modifiers: .command).hidden()
            Button("Add dependency") { if let task = selectedTask ?? model.editor?.base { Task { await model.openDependencyPicker(task) } } }
                .keyboardShortcut("k", modifiers: [.command, .shift]).disabled(!model.canWrite || (selectedTask == nil && model.editor == nil)).hidden()
        }
        .onExitCommand { model.setSearchText("") }
    }

    private var expandedContent: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            taskContent
                .navigationTitle(title)
                .navigationSubtitle("\(model.profileName) · \(TaskCount.text(visibleTasks.count))")
                .searchable(text: searchBinding, placement: .toolbar, prompt: "Find a task")
                .searchFocused($searchFocused)
                .toolbar {
                    ToolbarItem {
                        if model.searchPending { ProgressView().controlSize(.small).accessibilityLabel("Searching") }
                    }
                    ToolbarItem {
                        Button("Edit Tasks…") { model.clientDiagnosticsUI.perform(.openBatch, surface: .batch) { await model.beginBatchEdit() } }.disabled(!model.canWrite).accessibilityIdentifier("batch-edit-tasks")
                    }
                    ToolbarItem {
                        Button("Import…") { model.clientDiagnosticsUI.performSync(.openImport, surface: .importPreview) { model.resetImport(); model.showingImport = true } }
                            .disabled(!model.canWrite).accessibilityIdentifier("import-tasks")
                    }
                    ToolbarItem {
                        Button {
                            model.clientDiagnosticsUI.performSync(.openQuickAdd, surface: .quickAdd) { model.quickAdd = true }
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
                        Button { model.clientDiagnosticsUI.performSync(.openQuickAdd, surface: .quickAdd) { model.quickAdd = true } } label: {
                            Label("Add task", systemImage: "plus")
                        }.labelStyle(.iconOnly).buttonStyle(.borderedProminent).controlSize(.large)
                            .frame(minWidth: 28, minHeight: 28).contentShape(Rectangle())
                            .disabled(!model.canWrite).accessibilityIdentifier("compact-new-task").compactBounds("add-task")
                    }
                }
            }.padding(.horizontal, 16).padding(.vertical, 8).compactBounds("header")
            Divider()
            // The Find field belongs to the list; while the editor is shown it would take the
            // editor's room (candidate 8 ruling 5). The search text is kept for Back to tasks.
            if model.editor == nil || model.quickAdd {
                searchField.padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 4)
            }
            if model.editor != nil, let result = model.transferResult {
                TaskTransferResultView(model: model, result: result)
                Divider()
            }
            if model.quickAdd {
                QuickAddView(model: model, floating: true, compact: true, referenceDate: referenceDate)
            } else if model.editor != nil {
                EditorView(model: model, compact: true)
            } else {
                taskContent
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .compactBounds("task-screen")
        .onExitCommand {
            if !model.searchText.isEmpty { model.setSearchText("") }
            else if !model.busy {
                if model.quickAdd { model.quickAdd = false } else { closeInspector() }
            }
        }
    }

    var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("Find a task", text: searchBinding).textFieldStyle(.plain).focused($searchFocused)
                .accessibilityIdentifier("compact-search")
            if model.searchPending { ProgressView().controlSize(.small).accessibilityLabel("Searching") }
            if !model.searchText.isEmpty {
                Button { model.setSearchText("") } label: { Image(systemName: "xmark.circle.fill") }
                    .buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel("Clear search")
            }
        }.padding(10).background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8)).compactBounds("search")
    }

    private var compactNavigation: some View {
        VStack(alignment: .leading, spacing: 4) {
            Menu {
                Picker("Profile", selection: Binding(get: { model.profile }, set: { requestProfile($0) })) {
                    ForEach(model.profiles) { Text($0.name).tag($0.id) }
                }
                Divider()
                DiscoveryActions(model: model)
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
        guard model.profileSwitchStarts(profile) else { return }
        model.clientDiagnosticsUI.perform(.profileSwitch, ready: { model.profileSwitchSettled(profile) }) { _ = await model.navigate(.profile(profile)) }
    }
    var sidebar: some View {
        VStack(spacing: 0) {
            Picker("Profile", selection: Binding(get: { model.profile }, set: { requestProfile($0) })) {
                ForEach(model.profiles) { Text($0.name).tag($0.id) }
            }.pickerStyle(.menu).labelsHidden().frame(maxWidth: .infinity, alignment: .leading)
                .padding(12).foregroundStyle(.primary).accessibilityIdentifier("profile-picker").disabled(model.busy)
            Menu("Discover Profiles") { DiscoveryActions(model: model) }.padding(.bottom, 8)
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
                if !compactMode {
                    Button("Add dependency", systemImage: "link") { if let task = selectedTask { Task { await model.openDependencyPicker(task) } } }
                        .disabled(!model.canWrite || selectedTask == nil).accessibilityIdentifier("dependency-add")
                }
                if model.selectedView == "all" {
                    Picker("Order", selection: Binding(get: { model.taskFilters.order }, set: { order in var filters = model.taskFilters; filters.order = order; model.applyTaskFilters(filters) })) {
                        Text("Priority").tag("")
                        Text("Dependency order").tag("topo").accessibilityIdentifier("task-order-topo")
                        Text("Lightest first").tag("lightest").accessibilityIdentifier("task-order-lightest")
                    }.pickerStyle(.menu).labelsHidden().accessibilityLabel("Order")
                }
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
            ForEach(model.dependencies.latestWarnings.indices, id: \.self) { DependencyNoticeView(model: model, notice: model.dependencies.latestWarnings[$0], warning: true).padding(.horizontal, 12) }
            taskFilters
            if let error = model.searchError {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(error.message).font(.caption).fixedSize(horizontal: false, vertical: true)
                        if let context = error.context {
                            Text(context).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 4)
                    if model.connection == .live && error.canRetry {
                        Button("Retry") { Task { await model.retrySearch() } }
                            .accessibilityIdentifier("retry-search").compactBounds("search-retry")
                    }
                }.padding(12).accessibilityIdentifier("search-error")
            }
            if model.appliedSearchSnapshot == nil, let message = model.taskLoadError {
                compactState("Could not load tasks.", action: "Retry") { Task { await model.retrySearch() } }
                    .help(message).accessibilityIdentifier("task-load-error").compactBounds("task-load-error")
            } else if compactMode && model.connection == .offline && model.appliedSearchSnapshot == nil {
                compactState("Your tasks are read only while offline.", action: "Reconnect") { model.connect() }
                    .accessibilityIdentifier("connection-status")
            } else {
            if let filterError = model.taskLoadError, model.appliedSearchSnapshot != nil {
                HStack {
                    Text(filterError).font(.caption)
                    Spacer()
                    Button("Retry") { Task { await model.retrySearch() } }
                }.padding(12)
            }
            if let message = model.message {
                MessageBanner(model: model, message: message, sequence: model.messageSequence, control: (model.messageKind ?? .general).bannerControl)
            }
            if model.loading && model.appliedSearchSnapshot == nil {
                ProgressView("Loading tasks…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if visibleTasks.isEmpty && model.searchActive {
                compactState("No matching tasks.", action: "Clear search") { model.setSearchText("") }
            } else if visibleTasks.isEmpty && (model.selectedView != "all" || hasFilters) {
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
                    compactState(model.searchText.isEmpty ? "No tasks yet." : "No matching tasks.", action: model.searchText.isEmpty ? "Add task" : "Clear search") {
                        if model.searchText.isEmpty { model.clientDiagnosticsUI.performSync(.openQuickAdd, surface: .quickAdd) { model.quickAdd = true } } else { model.setSearchText("") }
                    }
                } else { ContentUnavailableView {
                    Label(model.searchText.isEmpty ? "No tasks yet" : "No matching tasks", systemImage: "checkmark.circle")
                } description: {
                    Text(model.searchText.isEmpty ? "Add a task in \(model.profileName)." : "Try different words.")
                } actions: {
                    if model.searchText.isEmpty { Button("Add task") { model.clientDiagnosticsUI.performSync(.openQuickAdd, surface: .quickAdd) { model.quickAdd = true } }.disabled(!model.canWrite) }
                } }
            } else {
                List(selection: $selection) {
                    ForEach(taskGroups) { group in
                        if compactMode || model.selectedView == "all" {
                            if model.selectedView == "all" || taskGroups.count > 1 {
                                HStack {
                                    Text(group.name)
                                    Spacer()
                                    if model.selectedView == "all" { Text(TaskCount.text(group.tasks.count)).fontWeight(.regular) }
                                }.font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                    .accessibilityAddTraits(.isHeader)
                                    .frame(maxWidth: .infinity, alignment: .leading).compactBounds("section-label-\(group.id)")
                                    .padding(.top, 12).padding(.bottom, 8)
                                    .listRowInsets(compactMode ? EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4) : nil)
                                    .listRowSeparator(.hidden).selectionDisabled()
                            }
                            if group.tasks.isEmpty && !compactMode {
                                Text("No tasks").foregroundStyle(.secondary).selectionDisabled()
                            }
                            ForEach(group.tasks) { row($0, overdue: group.name == "Overdue") }
                        } else {
                            Section(group.name) {
                                ForEach(group.tasks) { row($0, overdue: group.name == "Overdue") }
                            }
                        }
                    }
                }.listStyle(.inset)
                    .opacity(model.searchStale && model.appliedSearchSnapshot != nil ? 0.55 : 1)
                    .environment(\.defaultMinListRowHeight, compactMode ? 4 : minimumRowHeight)
                    .modifier(WholeTaskRows(enabled: compactMode && model.selectedView == "all"))
                    .onChange(of: selection) { old, id in
                        if let id { model.clientDiagnosticsUI.selected(id) }
                        if let task = visibleTasks.first(where: { $0.id == id }), model.editor?.id != id {
                            Task {
                                await ClientDiagnosticContext.$actionID.withValue(model.clientDiagnosticsUI.selectionAction) {
                                    if !(await model.navigate(.edit(task))) { selection = model.editor?.id ?? old }
                                }
                            }
                        }
                    }
                    .onKeyPress(.return) { openSelection() }
                    .onKeyPress(.space) {
                        guard model.canWrite, let task = selectedTask else { return .ignored }
                        transition(task, action: task.status == "open" ? "complete" : "reopen")
                        return .handled
                    }
                    .onDeleteCommand { if model.canWrite, let task = selectedTask { Task { await model.openDependencyDelete(task) } } }
                if visibleTasks.isEmpty {
                    Button(hasFilters ? "Clear filters" : model.searchText.isEmpty ? "Add task" : "Clear search") {
                        if hasFilters { clearFilters() } else if model.searchText.isEmpty { model.clientDiagnosticsUI.performSync(.openQuickAdd, surface: .quickAdd) { model.quickAdd = true } } else { model.setSearchText("") }
                    }.buttonStyle(.borderedProminent).controlSize(.large).disabled(!model.canWrite && !hasFilters && model.searchText.isEmpty)
                        .frame(minHeight: 28).padding(12).compactBounds("state-action")
                }
            }
            }
            if model.connection != .live && !(compactMode && model.connection == .offline && model.appliedSearchSnapshot == nil) {
                HStack {
                    Label(
                        model.connection == .connecting ? "Reconnecting" : "Offline · Read only",
                        systemImage: model.connection == .connecting ? "arrow.trianglehead.2.clockwise" : "wifi.slash")
                    Spacer()
                    Button("Reconnect") { model.connect() }.buttonStyle(.plain)
                }.font(.caption).foregroundStyle(.secondary).padding(12).accessibilityIdentifier("connection-status").compactBounds("connection-status")
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
        model.clientDiagnosticsUI.performSync(.closeInspector) {
            model.editor = nil
            model.conflict = nil
        }
    }
    private func openSelection() -> KeyPress.Result {
        guard !model.busy, let task = selectedTask else { return .ignored }
        Task { await model.navigate(.edit(task)) }
        return .handled
    }
    private func sidebarRow(_ title: String, icon: String, count: Int, tint: Color = .primary) -> some View {
        Label(title, systemImage: icon).foregroundStyle(tint).badge(count == 0 ? nil : Text(String(count)).foregroundStyle(.secondary))
    }
    private func transition(_ task: TaskSnapshot, action: String) {
        let category: ClientDiagnosticAction = action == "complete" ? .complete : action == "cancel" ? .cancel : action == "reopen" ? .reopen : .taskTransition
        model.clientDiagnosticsUI.perform(category) { await model.transition(task, action: action) }
    }
    private func row(_ task: TaskSnapshot, overdue: Bool = false) -> some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            TaskRow(
                task: task, now: referenceDate ?? context.date, canWrite: model.canWrite, overdue: overdue, compact: compactMode,
                projectName: model.projects.first { $0.id == task.project_id }?.name,
                tagNames: task.tagNames(from: model.tags),
                searchActive: model.appliedSearchSnapshot?.appliedIdentity.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false,
                dependencyBadge: task.dependencyBadge(catalog: model.tasks),
                metadataOverride: model.dependencies.dropTarget == task.id ? model.dependencies.dropStatus : nil,
                complete: { transition(task, action: task.status == "open" ? "complete" : "reopen") }
            )
        }
        .background(ClientDiagnosticSurfaceView(monitor: model.clientDiagnosticsUI, task: task.id))
        .modifier(DependencyDragModifier(model: model, task: task))
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
                Button("Add dependency…") { Task { await model.openDependencyPicker(task) } }
                Divider()
                Button("Delete…", role: .destructive) { Task { await model.openDependencyDelete(task) } }
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
    var searchActive = false
    var dependencyBadge: String? = nil
    var showsCompletion = true
    var relation = false
    var showsMetadata = true
    var metadataOverride: DependencyDropStatus? = nil
    let complete: () -> Void
    private var presentation: TaskRowPresentation { TaskRowPresentation(task: task, tagNames: tagNames, now: now) }
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if showsCompletion { Button(action: complete) { Image(systemName: presentation.completionSymbol).font(.system(size: 16)).frame(width: 28, height: 28) }
                .buttonStyle(.plain).disabled(!canWrite).foregroundStyle(.secondary)
                .accessibilityLabel(task.status == "open" ? "Complete \(task.title)" : "Reopen \(task.title)")
                .accessibilityIdentifier("transition-\(task.id)").compactBounds("complete-\(task.id)") }
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(TaskSearchPresentation.highlighted(task.title, spans: searchActive ? task.search_matches ?? [] : [], field: .title)).lineLimit(1).strikethrough(presentation.isDone).foregroundStyle(
                        presentation.isDone ? .secondary : .primary).help(task.title).compactBounds("title-\(task.id)")
                    Spacer(minLength: 8)
                    if compact && !relation && ["cancelled", "snoozed"].contains(task.status) {
                        Text(task.status).font(.caption).foregroundStyle(.secondary).fixedSize()
                            .compactBounds("status-\(task.id)")
                    }
                    if !relation { JiraAttachmentMarker(task: task) }
                    if !relation, let priority = presentation.priority {
                        Label(priority, systemImage: "flag.fill").font(.caption.weight(.medium)).foregroundStyle(
                            TodoColors.color("priority-\(priority.dropFirst())"))
                    }
                }
                if !relation && searchActive, let excerpt = TaskSearchPresentation.descriptionExcerpt(task) {
                    Text(excerpt).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        .accessibilityIdentifier("search-excerpt-\(task.id)")
                }
                Group {
                if !showsMetadata { EmptyView() }
                else if compact || relation {
                    HStack(spacing: 6) { dependencyState; CompactRowMetadata(items: compactMetadata) }.compactBounds("metadata-\(task.id)")
                } else { HStack(spacing: 4) {
                    dependencyState
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
                }.compactBounds("metadata-\(task.id)")
                    .compactBounds("metadata-text-\(task.id)", when: hasMetadataText && metadataOverride == nil)
                    .opacity(metadataOverride == nil ? 1 : 0).accessibilityHidden(metadataOverride != nil)
                    .overlay(alignment: .leading) {
                        if hasMetadataLine, let metadataOverride { dropStatus(metadataOverride) }
                    }
            }.fixedSize(horizontal: false, vertical: true)
                .overlay(alignment: .topLeading) {
                    if !hasMetadataLine, let metadataOverride {
                        GeometryReader { geometry in
                            dropStatus(metadataOverride).fixedSize(horizontal: false, vertical: true).offset(y: geometry.size.height)
                        }
                    }
                }
        }.padding(.vertical, relation ? 4 : 8).frame(height: compact ? (relation ? (showsMetadata ? 48 : 24) : searchActive && TaskSearchPresentation.descriptionExcerpt(task) != nil ? 76 : 56) : nil)
            .overlay(alignment: .bottom) {
                if compact && showsMetadata { Divider().frame(height: 1).compactBounds("separator-\(task.id)").padding(.leading, 36) }
            }
            .contentShape(Rectangle()).opacity(presentation.isDone ? 0.7 : 1).compactBounds("row-\(task.id)")
    }
    @ViewBuilder private var dependencyState: some View {
        if let dependencyBadge { Text(dependencyBadge).font(.caption).foregroundStyle(task.blocked == true ? TodoColors.color("warning") : .secondary).fixedSize().accessibilityIdentifier("dependency-state-\(task.id)") }
    }
    private func dropStatus(_ status: DependencyDropStatus) -> some View {
        Text(status.text).font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
            .frame(maxWidth: .infinity, alignment: .leading).accessibilityValue(status.accessibilityValue).help(status.accessibilityValue)
            .accessibilityIdentifier("dependency-drop-status").compactBounds("dependency-drop-status")
    }
    private var hasMetadataLine: Bool {
        showsMetadata && (compact || relation || hasMetadataText)
    }
    private var hasMetadataText: Bool {
        guard showsMetadata else { return false }
        if dependencyBadge != nil { return true }
        if compact || relation { return !compactMetadata.isEmpty }
        return projectName != nil || !tagNames.isEmpty || presentation.due != nil || task.external_id != nil || presentation.scheduled != nil
    }
    private var compactMetadata: [CompactRowMetadata.Item] {
        if relation { return [.init(text: task.status.capitalized)] + (projectName.map { [.init(text: $0)] } ?? []) }
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
        Button("Edit Tasks…") { model.clientDiagnosticsUI.perform(.openBatch, surface: .batch) { await model.beginBatchEdit() } }.controlSize(.large).frame(minHeight: 28).disabled(!model.canWrite).accessibilityIdentifier("compact-batch-edit-tasks")
        Button("Import…") { model.clientDiagnosticsUI.performSync(.openImport, surface: .importPreview) { model.resetImport(); model.showingImport = true } }
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
    @State private var completions = QuickAddCompletionGate()
    var body: some View {
        content
            .onAppear { completions.renew() }
            .onDisappear { completions.renew() }
            .background(ClientDiagnosticSurfaceView(monitor: model.clientDiagnosticsUI, surface: .quickAdd))
            .defaultFocus($focused, true)
            .task(id: model.profile + "\u{0}" + model.newTitle) { await model.parseDraft() }
            .onExitCommand { if floating { model.quickAdd = false } else { dismiss() } }
            .preferredColorScheme(model.configuration.resolvedColorScheme(storedAppearance: appearance))
    }
    var content: some View {
        QuickAddContentAnchor(compact: compact, identity: model.newTitle + String(model.dependencies.initial.count) + (model.quickAddError ?? "")) { maximumRows in
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
                Text("Try: Pay rent tomorrow p1 #bills @\"Client Project\"")
                    .font(.caption).foregroundStyle(.secondary)
            }
            QuickAddMetadataRegion(maximumRows: maximumRows, dependencies: InitialDependencySelection(tasks: Binding(get: { model.dependencies.initial }, set: { model.dependencies.initial = $0 }), enabled: model.canWrite, add: { Task { await model.openInitialDependencyPicker() } })) {
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
            }
            if let error = model.parseError { Text(error).font(.caption).foregroundStyle(TodoColors.color("destructive")) }
            if !model.canWrite { Text("Reconnect to add. Your draft stays here.").foregroundStyle(.secondary) }
            if let error = model.quickAddError { ClientErrorNotice(model: model, text: error, position: .quickAdd) }
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
                    .compactBounds("quick-add-add")
            }.disabled(!model.canWrite || model.newTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .compactBounds("quick-add-actions")
        }.padding(compact ? 16 : 24).frame(minWidth: compact ? nil : 540, maxWidth: compact ? .infinity : 540)
            .coordinateSpace(name: "quick-add-chips")
            .disabled(model.busy)
            .compactBounds("quick-add-sheet")
        }
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
            .background(measure(field)).compactBounds("chip-" + field).preference(key: QuickAddChipLabels.self, value: [field: title])
    }

    private func measure(_ field: String) -> some View {
        GeometryReader { geometry in
            Color.clear.preference(key: QuickAddChipFrames.self, value: [field: geometry.frame(in: .named("quick-add-chips"))])
        }
    }
    private func add(edit: Bool) {
        let opening = completions.opening
        model.clientDiagnosticsUI.perform(floating ? .quickAdd : .sheetAdd) {
            if await model.create(openEditor: edit), completions.owns(opening) {
                if !floating { dismiss() }
                if edit { openWindow(id: "tasks") }
            }
        }
    }
}

/// The main window's message banner. Connection messages keep one button, Reconnect; every other
/// kind has a trailing Dismiss button, because a reconnect would not clear it. The message reads as
/// one accessibility element and is announced when it appears. No time limit for errors.
struct MessageBanner: View {
    let model: TodoModel
    let message: String
    let sequence: Int
    let control: TodoModel.MessageBannerControl
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            if model.lookupError(at: .message, text: message) != nil {
                // Keeps its own elements, so "Find Task by id" stays reachable.
                ClientErrorNotice(model: model, text: message, position: .message)
            } else {
                Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(TodoColors.color("destructive"))
                    .accessibilityElement(children: .combine).accessibilityLabel(spoken)
            }
            Spacer()
            switch control {
            case .reconnect:
                Button("Reconnect") { model.connect() }.accessibilityIdentifier("message-reconnect")
            case .dismiss:
                Button { model.dismissMessage(sequence) } label: {
                    Image(systemName: "xmark").frame(minWidth: 28, minHeight: 28).contentShape(Rectangle())
                }
                    .buttonStyle(.borderless).foregroundStyle(.secondary).help("Dismiss").accessibilityLabel("Dismiss message").accessibilityIdentifier("message-dismiss")
            }
        }.padding()
            .onAppear { announce() }
            .onChange(of: sequence) { _, _ in announce() }
    }
    /// Connection messages describe a state ("… The live view is reconnecting."); the others are errors.
    private var spoken: String { control == .dismiss ? "Error. " + message : message }
    /// Once per message: the banner reappearing with the same message announces nothing.
    private func announce() { if model.takeAnnouncement(sequence) { AccessibilityNotification.Announcement(spoken).post() } }
}

/// The view side of quick-add's instance rule. The menu-bar window has no model instance, so its
/// view keeps an opening token, renewed whenever it appears or disappears: a create that outlives
/// the view that started it (closed, or closed and reopened) cannot dismiss or open windows for it.
@MainActor final class QuickAddCompletionGate {
    private(set) var opening = UUID()
    func renew() { opening = UUID() }
    func owns(_ token: UUID) -> Bool { token == opening }
}

struct QuickAddMetadataRegion<Content: View>: View {
    let maximumRows: Int
    let dependencies: InitialDependencySelection
    let content: Content
    @State private var parsedHeight: CGFloat = 0
    @State private var dependencyHeight: CGFloat = 24
    @State private var contentHeight: CGFloat = 0
    @State private var chipRowHeight: CGFloat = 0
    init(maximumRows: Int, dependencies: InitialDependencySelection, @ViewBuilder content: () -> Content) {
        self.maximumRows = maximumRows
        self.dependencies = dependencies
        self.content = content()
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                dependencies.background(GeometryReader { geometry in Color.clear.preference(key: QuickAddDependencyHeight.self, value: geometry.size.height) })
                content.background(GeometryReader { geometry in Color.clear.preference(key: QuickAddParsedMetadataHeight.self, value: geometry.size.height) })
            }.frame(maxWidth: .infinity, alignment: .leading)
                .background(GeometryReader { geometry in Color.clear.preference(key: QuickAddRegionContentHeight.self, value: geometry.size.height) })
        }.frame(height: visibleHeight).scrollIndicators(.visible).compactBounds("quick-add-metadata")
            .onPreferenceChange(QuickAddRegionContentHeight.self) { contentHeight = $0 }
            .onPreferenceChange(QuickAddChipFrames.self) { frames in
                chipRowHeight = frames.filter { !$0.key.hasPrefix("control:") }.values.map(\.height).max() ?? 0
            }
            .preference(key: QuickAddAddedMetadataHeight.self, value: Optional(visibleHeight - max(24, parsedHeight)))
            .onPreferenceChange(QuickAddParsedMetadataHeight.self) { parsedHeight = $0 }
            .onPreferenceChange(QuickAddDependencyHeight.self) { dependencyHeight = $0 }
    }
    /// The Dependency block, then up to `maximumRows` whole rows of chips at their measured height
    /// (about 34 pt, not the 20 pt the old cap assumed), so the region never ends partway into a
    /// row; more content scrolls, with visible scroll bars. The two blocks are stacked, so the
    /// height is their sum, not the larger of the two.
    private var visibleHeight: CGFloat {
        let row = chipRowHeight > 0 ? chipRowHeight : 34
        let cap = max(24, dependencyHeight) + 8 + CGFloat(maximumRows) * row + CGFloat(max(0, maximumRows - 1)) * 8
        let content = max(contentHeight, 24)
        return min(content, cap)
    }
}

struct QuickAddContentAnchor<Content: View>: View {
    let compact: Bool
    let identity: String
    @ViewBuilder let content: (Int) -> Content
    @State private var addedHeight: CGFloat = 0
    @State private var maximumRows = 2
    var body: some View {
        content(maximumRows)
            .background(GeometryReader { geometry in Color.clear.preference(key: QuickAddContentHeight.self, value: geometry.size.height) })
            .offset(y: -addedHeight / 2)
            .onPreferenceChange(QuickAddAddedMetadataHeight.self) { addedHeight = $0 ?? 0 }
            .onPreferenceChange(QuickAddContentHeight.self) { height in
                if compact && height + addedHeight > 426 { maximumRows = 1 }
            }
            .onChange(of: identity) { _, _ in maximumRows = 2 }
    }
}
struct QuickAddAddedMetadataHeight: PreferenceKey {
    static let defaultValue: CGFloat? = nil
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) { if let next = nextValue() { value = next } }
}
struct QuickAddDependencyHeight: PreferenceKey {
    static let defaultValue: CGFloat = 24
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
struct QuickAddContentHeight: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
struct QuickAddRegionContentHeight: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
struct QuickAddParsedMetadataHeight: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
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
        Button("Discard", role: .destructive) { Task { [target] in await model.discardAndNavigate(target) } }
            .tint(TodoColors.color("destructive")).disabled(model.busy).accessibilityIdentifier("discard-before-navigation")
        Button("Cancel", role: .cancel) { model.cancelNavigation() }
            .tint(nil as Color?).accessibilityIdentifier("cancel-navigation")
        if !saveFirst { save }
    }
    @ViewBuilder private var save: some View {
        if model.conflict == nil {
            Button("Save") { Task { [target] in await model.saveAndNavigate(target) } }
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

struct OutdatedServerView: View {
    let model: TodoModel
    let serverBuild: String
    var compact = false
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 12 : 16) {
            Label("Todo server is out of date", systemImage: "arrow.triangle.2.circlepath")
                .font(compact ? .title2.bold() : .title.bold())
                .accessibilityAddTraits(.isHeader)
            Text("Update the server to continue using Tasks.")
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                GridRow { Text("Server build").foregroundStyle(.secondary); Text(serverBuild).textSelection(.enabled) }
                GridRow { Text("App build").foregroundStyle(.secondary); Text(ServerIdentity.appBuild).textSelection(.enabled) }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Open Settings → Update server, or run:")
                    .fixedSize(horizontal: false, vertical: true)
                Text(verbatim: "scripts/upgrade-local.sh")
                    .font(.body.monospaced())
                    .lineLimit(1)
                    .fixedSize()
                    .textSelection(.enabled)
            }
            HStack {
                Button("Settings") { openSettings() }.buttonStyle(.borderedProminent)
                Button("Check again") { Task { await model.reconnectAfterUpdate() } }
            }.controlSize(.large)
        }
        .padding(compact ? 20 : 32)
        .frame(maxWidth: 480, maxHeight: .infinity, alignment: .center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Todo server is out of date")
        .accessibilityIdentifier("outdated-server")
    }
}
