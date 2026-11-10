import SwiftUI

struct DependencyGraphRowIdentities: PreferenceKey {
    static let defaultValue: [DependencyGraphRowID] = []
    static func reduce(value: inout [DependencyGraphRowID], nextValue: () -> [DependencyGraphRowID]) { value += nextValue() }
}

struct DependencyGraphView: View {
    @Bindable var model: TodoModel
    var compact: Bool
    @State private var diagram: Bool
    @State private var detailsExpanded: Bool
    @State private var shownExpanded: Bool
    @FocusState private var focused: DependencyGraphRowID?
    init(model: TodoModel, compact: Bool = false, initialDiagram: Bool? = nil, initialDetails: Bool = false, initialShown: Bool = false) {
        self.model = model
        self.compact = compact
        _diagram = State(initialValue: initialDiagram ?? !compact)
        _detailsExpanded = State(initialValue: initialDetails)
        _shownExpanded = State(initialValue: initialShown)
    }
    private var showsDiagram: Bool { (!compact || diagram) && model.dependencies.graph?.renderError == nil }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Dependencies").font(.headline)
            if let graph = model.dependencies.graph {
                if let report = graph.report {
                    Text(report.nodes.first { $0.task.id == graph.root }?.task.title ?? graph.root)
                        .font(.subheadline.weight(.semibold)).lineLimit(2).help(report.nodes.first { $0.task.id == graph.root }?.task.title ?? graph.root)
                    if compact {
                        Picker("View", selection: $diagram) {
                            Text("List").tag(false).accessibilityIdentifier("dependency-graph-list-mode")
                            Text("Diagram").tag(true).accessibilityIdentifier("dependency-graph-diagram")
                        }.pickerStyle(.segmented).compactBounds("dependency-graph-view-toggle")
                    }
                    HStack(spacing: 8) {
                        if graph.overview || displayedIDs(graph).count < report.nodes.count {
                        Button(graph.overview ? "Show nearby Tasks" : "Show all \(TaskCount.text(report.nodes.count, capitalized: true))") { model.dependencies.graph?.overview.toggle() }
                            .accessibilityIdentifier("dependency-graph-overview").compactBounds("dependency-graph-overview")
                        }
                        Text("\(displayedIDs(graph).count) of \(TaskCount.text(report.nodes.count, capitalized: true)) shown").foregroundStyle(.secondary)
                    }.font(.caption)
                    if report.nodes.count > 10 {
                        TextField("Search these Tasks", text: Binding(get: { model.dependencies.graph?.search ?? "" }, set: { model.dependencies.graph?.search = $0 }))
                            .textFieldStyle(.roundedBorder).accessibilityIdentifier("dependency-graph-search")
                            .onChange(of: graph.search) { _, text in
                                Task {
                                    do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                                    guard model.dependencies.graph?.root == graph.root, model.dependencies.graph?.request == graph.request, model.dependencies.graph?.search == text else { return }
                                    await model.searchDependencyGraph()
                                }
                            }
                    }
                    HStack(alignment: .top, spacing: 16) {
                        if showsDiagram && !compact { diagramFrame.frame(maxWidth: .infinity, maxHeight: .infinity) }
                        ScrollView {
                            VStack(alignment: .leading, spacing: 12) {
                                if let error = graph.renderError {
                                    ClientErrorNotice(model: model, text: error, position: .message, dependency: .init(message: "Couldn't draw the diagram. The list below is complete."), retry: retry)
                                }
                                if let failure = graph.failure { DependencyNoticeView(model: model, notice: failure) }
                                if showsDiagram && compact { diagramFrame.frame(height: 180) }
                                if let root = report.nodes.first(where: { $0.task.id == graph.root }) {
                                    related("Depends on", section: .dependsOn, ids: report.edges.filter { $0.dependent_id == graph.root }.map(\.blocker_id), report: report)
                                    related("Blocks", section: .blocks, ids: report.edges.filter { $0.blocker_id == graph.root }.map(\.dependent_id), report: report)
                                    related("Lightest next", section: .lightestNext, ids: report.lightest_next, report: report)
                                    Text(energySummary(root.remaining_energy)).font(.callout)
                                    details(root, report: report)
                                }
                                if compact || graph.renderError != nil {
                                    shownTasks(graph, report: report)
                                } else {
                                    DisclosureGroup("Tasks in diagram · \(displayedIDs(graph).count)", isExpanded: $shownExpanded) { shownTasks(graph, report: report) }
                                        .font(.caption).accessibilityIdentifier("dependency-graph-shown")
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading).padding(.trailing, 4)
                        }.frame(width: showsDiagram && !compact ? 320 : nil)
                            .accessibilityIdentifier("dependency-graph-list").compactBounds("dependency-graph-scroll")
                    }
                } else {
                    if graph.loading { ProgressView("Loading Dependencies…") }
                    if let failure = graph.failure { DependencyNoticeView(model: model, notice: failure); Button("Retry", action: retry).disabled(model.connection != .live) }
                    if graph.deleted { Text("Task deleted. Its Dependencies are no longer available.") }
                    Spacer(minLength: 0)
                }
                HStack {
                    if model.connection != .live { Text("Offline · Read only").font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                    Button("Close") { model.closeDependencyGraph() }.keyboardShortcut(.cancelAction).accessibilityIdentifier("dependency-graph-close")
                }.compactBounds("dependency-graph-actions")
            }
        }.padding(16).frame(width: compact ? 393 : 1000, height: compact ? 426 : 680)
            .accessibilityIdentifier("dependency-graph")
            .task { focused = model.dependencies.graph?.focused.map { .init(task: $0, section: .shown) } }
            .onChange(of: focused) { _, row in if let row { model.dependencies.graph?.focused = row.task } }
            .onChange(of: model.dependencies.graph?.report?.nodes.count) { before, count in if compact && before == nil && (count ?? 0) > 50 { diagram = false } }
            .sheet(item: Binding(get: { model.dependencies.picker }, set: { if $0 == nil { model.closeDependencyPicker() } })) { _ in DependencyPickerView(model: model, compact: compact) }
    }
    private func shownTasks(_ graph: DependencyGraphState, report: DependencyGraphReport) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if compact || graph.renderError != nil { Text("\(TaskCount.text(displayedIDs(graph).count, capitalized: true)) shown").font(.subheadline.weight(.semibold)) }
            if report.nodes.count > 50 { Text("Use the list to explore a Task at a time.").font(.caption).foregroundStyle(.secondary) }
            ForEach(report.topological_order.filter(displayedIDs(graph).contains), id: \.self) { id in
                if let node = report.nodes.first(where: { $0.task.id == id }) { taskRow(node.task) }
            }
        }
    }
    private var diagramFrame: some View {
        VStack(spacing: 0) {
            DependencyWebView(model: model)
            HStack {
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    Button { zoom(1 / 1.15) } label: { Label("Zoom out", systemImage: "minus.magnifyingglass") }
                    Button { zoom(1.15) } label: { Label("Zoom in", systemImage: "plus.magnifyingglass") }
                    Button {
                        model.dependencies.graph?.viewport = nil
                        focused = (model.dependencies.graph?.focused ?? model.dependencies.graph?.root).map { .init(task: $0, section: .shown) }
                    } label: { Label("Reset diagram", systemImage: "arrow.counterclockwise") }
                        .accessibilityIdentifier("dependency-graph-reset")
                }.labelStyle(.iconOnly).buttonStyle(.bordered).padding(6).compactBounds("dependency-graph-tools")
            }
        }.background(TodoColors.color("background")).clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(TodoColors.color("border")))
            .compactBounds("dependency-graph-frame")
    }
    private func displayedIDs(_ graph: DependencyGraphState) -> Set<String> { graph.renderError == nil ? graph.listIDs : graph.knownIDs }
    private func retry() {
        model.dependencies.graph?.renderError = nil
        Task { await model.readDependencyGraph() }
    }
    private func zoom(_ factor: Double) {
        guard let viewport = model.dependencies.graph?.viewport else { return }
        model.dependencies.graph?.viewport = .init(x: viewport.x, y: viewport.y, scale: min(4, max(0.1, viewport.scale * factor)))
    }
    private func activate(_ task: TaskSnapshot) {
        model.dependencies.graph?.selected = task.id
        Task { if await model.navigate(.edit(task)) { model.closeDependencyGraph() } }
    }
    private func details(_ node: DependencyGraphReport.Node, report: DependencyGraphReport) -> some View {
        DisclosureGroup("Graph details", isExpanded: $detailsExpanded) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Shape: \(report.shape == "dag" ? "DAG" : report.shape.capitalized)")
                if let orientation = report.orientation { Text("Direction: \(orientation.capitalized)") }
                Text("Depth: \(node.depth)")
                Text("\(TaskCount.text(node.in_degree, singular: "Dependency", plural: "Dependencies")) · Blocks \(TaskCount.text(node.out_degree, capitalized: true))")
                related("Starts at", section: .startsAt, ids: report.sources, report: report, counted: false)
                related("Ends at", section: .endsAt, ids: report.sinks, report: report, counted: false)
                related("Tasks before this one", section: .ancestors, ids: report.ancestors, report: report, counted: false)
                related("Tasks after this one", section: .descendants, ids: report.descendants, report: report, counted: false)
                Button("Copy as Mermaid") { model.copyTaskID(report.mermaid) }.accessibilityIdentifier("dependency-graph-copy-mermaid")
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.font(.caption).accessibilityIdentifier("dependency-graph-details")
    }
    private func energySummary(_ energy: RemainingEnergy) -> String {
        "Energy left: \(energy.energy)" + (energy.unweighted == 0 ? "" : " · \(TaskCount.text(energy.unweighted, capitalized: true)) without Energy")
    }
    private func related(_ title: String, section: DependencyGraphSection, ids: [String], report: DependencyGraphReport, counted: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title + (counted ? " · \(ids.count)" : "")).font(.subheadline.weight(.semibold))
            if ids.isEmpty { Text("None").font(.caption).foregroundStyle(.secondary) }
            ForEach(ids, id: \.self) { id in
                if let task = report.nodes.first(where: { $0.task.id == id })?.task { taskRow(task, section: section) }
                else { Text(id).font(.caption).textSelection(.enabled) }
            }
        }
    }
    private func taskRow(_ task: TaskSnapshot, section: DependencyGraphSection = .shown) -> some View {
        let row = DependencyGraphRowID(task: task.id, section: section)
        return HStack(alignment: .top, spacing: 4) {
            Button { activate(task) } label: {
                TaskRow(task: task, canWrite: false, compact: compact, projectName: model.projects.first { $0.id == task.project_id }?.name, tagNames: task.tagNames(from: model.tags), showsCompletion: false, relation: true, complete: {})
                    .foregroundStyle(TodoColors.color("foreground"))
            }.buttonStyle(.plain).focused($focused, equals: .init(task: task.id, section: section))
                .accessibilityIdentifier(row.taskIdentifier).contextMenu { taskMenu(task, section: section) }
            Menu { taskMenu(task, section: section) } label: { Image(systemName: "ellipsis").accessibilityLabel("Actions for \(task.title)") }
                .menuStyle(.borderlessButton).fixedSize().accessibilityIdentifier(row.menuIdentifier)
        }.preference(key: DependencyGraphRowIdentities.self, value: [row])
    }
    @ViewBuilder private func taskMenu(_ task: TaskSnapshot, section: DependencyGraphSection) -> some View {
        Button("Show this Task's Dependencies") { Task { await model.readDependencyGraph(root: task.id) } }
        Button("Add dependency…") { Task { await model.openDependencyPicker(task) } }.disabled(!model.canWrite)
        if showsDiagram { Button("Expand in diagram") { model.dependencies.graph?.expanded.insert(task.id) }.accessibilityIdentifier(DependencyGraphRowID(task: task.id, section: section).expandIdentifier) }
    }
}
