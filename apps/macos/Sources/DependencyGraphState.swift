import Foundation
import TodoAPI

enum DependencyGraphSection: String, CaseIterable, Sendable {
    case shown, dependsOn = "depends-on", blocks, lightestNext = "lightest-next", startsAt = "starts-at", endsAt = "ends-at", ancestors, descendants
}
struct DependencyGraphRowID: Hashable, Sendable {
    let task: String
    let section: DependencyGraphSection
    var taskIdentifier: String { section == .shown ? "dependency-graph-task-\(task)" : "dependency-graph-related-\(section.rawValue)-\(task)" }
    var expandIdentifier: String { section == .shown ? "dependency-graph-expand-\(task)" : "dependency-graph-expand-related-\(section.rawValue)-\(task)" }
    var menuIdentifier: String { "dependency-graph-actions-\(section.rawValue)-\(task)" }
}

extension DependencyGraphReport.Node {
    var displayState: DependencyGraphRender.NodeState? {
        if task.status == "done" { return .done }
        if task.status == "cancelled" { return .cancelled }
        if blocked { return .blocked }
        if ready { return .ready }
        return nil
    }
}

enum DependencyViewportState {
    case automatic(DependencyViewport?)
    case manual(DependencyViewport)
}

struct DependencyGraphState {
    let profile: String
    var root: String
    var request = 0
    var report: DependencyGraphReport?
    var loading = false
    var operationFailure: DependencyNotice?
    var searchFailure: DependencyNotice?
    var failure: DependencyNotice? {
        get { operationFailure ?? searchFailure }
        set { operationFailure = newValue }
    }
    var renderedNodeCount: Int?
    var renderError: String?
    var deleted = false
    var viewportState: DependencyViewportState = .automatic(nil)
    var viewport: DependencyViewport? {
        get {
            switch viewportState {
            case .automatic(let value): value
            case .manual(let value): value
            }
        }
        set { viewportState = newValue.map(DependencyViewportState.manual) ?? .automatic(nil) }
    }
    var isViewportAutomatic: Bool {
        if case .automatic = viewportState { return true }
        return false
    }
    mutating func acceptAutomaticViewport(_ viewport: DependencyViewport) { viewportState = .automatic(viewport) }
    var selected: String?
    var focused: String?
    var expanded: Set<String> = []
    var overview = false
    var search = ""
    var matches: Set<String>?
    var listIDs: Set<String> { matches.map { $0.intersection(knownIDs) } ?? visibleIDs }
    var knownIDs: Set<String> { Set(report?.nodes.map { $0.task.id } ?? []) }
    var visibleIDs: Set<String> {
        guard let report else { return [] }
        if overview { return knownIDs }
        var result: Set<String> = [root]
        for edge in report.edges where edge.dependent_id == root || edge.blocker_id == root || expanded.contains(edge.dependent_id) || expanded.contains(edge.blocker_id) {
            result.insert(edge.blocker_id)
            result.insert(edge.dependent_id)
        }
        return result.intersection(knownIDs)
    }
    mutating func publish(_ report: DependencyGraphReport) {
        self.report = report
        let surviving = knownIDs
        selected = selected.flatMap { surviving.contains($0) ? $0 : nil } ?? (surviving.contains(root) ? root : nil)
        focused = focused.flatMap { surviving.contains($0) ? $0 : nil } ?? selected
        expanded.formIntersection(surviving)
        deleted = !surviving.contains(root)
        loading = false
        failure = nil
    }
}

extension TodoModel {
    func readDependencyGraph(root: String? = nil) async {
        guard signedIn, connection != .offline else { return }
        if let root {
            if dependencies.graph?.profile != profile || dependencies.graph?.root != root { dependencies.graph = .init(profile: profile, root: root, selected: root, focused: root) }
        }
        guard let graph = dependencies.graph else { return }
        let epoch = discovery.credentialEpoch
        dependencies.graphRequest += 1
        let request = dependencies.graphRequest
        dependencies.graph?.request = request
        dependencies.graph?.loading = true
        do {
            let wire = try await client.tasks_period_graph(path: .init(profile: graph.profile, task: graph.root)).ok.body.json
            let report = try decode(DependencyGraphReport.self, wire)
            guard signedIn && profile == graph.profile && isCurrentCredential(epoch), dependencies.graph?.request == request, dependencies.graph?.root == graph.root else { return }
            guard report.profile_id == graph.profile, report.task_id == graph.root else { throw DependencyGraphReply.ProtocolError.incompatible }
            dependencies.graph?.publish(report)
            if !graph.search.isEmpty { await searchDependencyGraph() }
        } catch {
            guard signedIn && profile == graph.profile && isCurrentCredential(epoch), dependencies.graph?.request == request, dependencies.graph?.root == graph.root else { return }
            let notice = dependencyNotice(error, context: .link)
            dependencies.graph?.failure = notice
            dependencies.graph?.loading = false
            if notice.failure?.code == "not_found" { dependencies.graph?.report = nil; dependencies.graph?.deleted = true }
            handleAuthorization(error, credentialEpoch: epoch)
        }
    }
    func closeDependencyGraph() { dependencies.graph = nil; dependencies.graphRequest += 1; dependencies.graphSearchRequest += 1 }
    func refreshDependencyReads(erased: Bool = false) async {
        let epoch = discovery.credentialEpoch
        let run = dependencies.generation
        if erased {
            dependencies.graph?.report = nil
            dependencies.graph?.matches = nil
            dependencies.picker?.linked = []
            dependencies.picker?.candidates = []
            dependencies.initial = []
            dependencies.firstOccurrenceInitial = []
            dependencies.deletion?.endpoints = []
            dependencies.deletion?.fingerprint = nil
            dependencies.deletion?.acceptedFromVersion = nil
        }
        if let picker = dependencies.picker, !picker.requiresReload, picker.pending.isEmpty {
            let notice = picker.operationFailure
            let warnings = picker.warnings
            await reloadDependencyPicker()
            if dependencies.picker?.id == picker.id {
                dependencies.picker?.failure = notice
                dependencies.picker?.warnings = warnings
            }
        }
        guard isCurrentCredential(epoch), dependencies.generation == run else { return }
        await readDependencyGraph()
    }
}

extension TodoModel {
    func searchDependencyGraph() async {
        guard signedIn, let graph = dependencies.graph else { return }
        dependencies.graphSearchRequest += 1
        let request = dependencies.graphSearchRequest
        let epoch = discovery.credentialEpoch
        if graph.search.isEmpty { dependencies.graph?.matches = nil; dependencies.graph?.searchFailure = nil; return }
        guard connection == .live else { return }
        do {
            let rows = try await client.tasks_period_list(path: .init(profile: graph.profile), query: .init(text: graph.search)).ok.body.json
            guard isCurrentCredential(epoch), profile == graph.profile, dependencies.graphSearchRequest == request, dependencies.graph?.root == graph.root, dependencies.graph?.request == graph.request, dependencies.graph?.search == graph.search else { return }
            dependencies.graph?.matches = Set(rows.map(\.id))
            dependencies.graph?.searchFailure = nil
        } catch {
            guard isCurrentCredential(epoch), profile == graph.profile, dependencies.graphSearchRequest == request, dependencies.graph?.root == graph.root, dependencies.graph?.search == graph.search else { return }
            dependencies.graph?.searchFailure = dependencyNotice(error, context: .search)
            handleAuthorization(error, credentialEpoch: epoch)
        }
    }
}
