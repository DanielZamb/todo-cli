import Foundation
import Observation
import OpenAPIRuntime
import TodoAPI

struct DependencyGraphReport: Decodable {
    struct Node: Decodable {
        let mermaid_id: String
        let task: TaskSnapshot
        let in_degree: Int
        let out_degree: Int
        let ready: Bool
        let blocked: Bool
        let depth: Int
        let remaining_energy: RemainingEnergy
    }
    let profile_id: String
    let task_id: String
    let nodes: [Node]
    let edges: [DependencyEdge]
    let ancestors: [String]
    let descendants: [String]
    let lightest_next: [String]
    let sources: [String]
    let sinks: [String]
    let topological_order: [String]
    let shape: String
    let orientation: String?
    let mermaid: String
}

enum DependencyDirection: String, CaseIterable, Identifiable {
    case dependsOn = "Depends on", blocks = "Blocks"
    var id: String { rawValue }
    func sentence(_ title: String) -> String { "\(title) \(self == .dependsOn ? "depends on" : "blocks")…" }
}

enum DependencyPickerPurpose { case edit, initial, firstOccurrence }

struct DependencyPicker: Identifiable {
    let id = UUID()
    var reloadRequest = 0
    let profile: String
    var root: TaskSnapshot
    var direction: DependencyDirection
    var purpose = DependencyPickerPurpose.edit
    var text = ""
    var linked: [TaskSnapshot] = []
    var candidates: [TaskSnapshot] = []
    var loading = false
    var pending: Set<String> = []
    var operationFailure: DependencyNotice?
    var searchFailure: DependencyNotice?
    var failure: DependencyNotice? {
        get { operationFailure ?? searchFailure }
        set { operationFailure = newValue }
    }
    var warnings: [DependencyNotice] = []
    var feedback: String?
    var requiresReload = false
    var rows: [TaskSnapshot] { linked + candidates.filter { candidate in !linked.contains { $0.id == candidate.id } } }
    func checked(_ id: String) -> Bool { linked.contains { $0.id == id } }
}

struct DependencyDelete: Identifiable {
    let id = UUID()
    var request = 0
    let profile: String
    var task: TaskSnapshot
    var edges: [DependencyEdge] = []
    var endpoints: [TaskSnapshot] = []
    var fingerprint: String?
    var acceptedFromVersion: Int?
    var loading = true
    var pending = false
    var changed = false
    var failure: DependencyNotice?
    var reviewExitDetail: String?
    var action: String { edges.isEmpty ? "Delete Task" : "Delete Task and remove Dependencies" }
    var reviewMessage: String {
        if changed { return edges.isEmpty ? "This Task has no Dependencies now. Confirm again to delete it." : "Dependencies changed. Review the current list and confirm again." }
        return edges.isEmpty ? "Delete this Task?" : "Review these Dependencies before deleting this Task."
    }
}

@MainActor @Observable final class DependencyState {
    var dragSource: DependencyDragSource?
    var dropTarget: String?
    var dropStatus: String?
    var graphSearchRequest = 0
    var graphRequest = 0
    var graph: DependencyGraphState?
    var batch: DependencyBatchDraft?
    var picker: DependencyPicker?
    var deletion: DependencyDelete?
    var generation = 0
    var searchRequest = 0
    var pendingDependents: Set<String> = []
    var initial: [TaskSnapshot] = []
    var firstOccurrenceInitial: [TaskSnapshot] = []
    var latestWarnings: [DependencyNotice] = []
    func reset() {
        generation += 1
        searchRequest += 1
        graphSearchRequest += 1
        dragSource = nil
        dropTarget = nil
        dropStatus = nil
        graph = nil
        batch = nil
        picker = nil
        deletion = nil
        initial = []
        firstOccurrenceInitial = []
        latestWarnings = []
    }
}

extension TaskSnapshot {
    func dependencyBadge(catalog: [TaskSnapshot]) -> String? {
        guard ["open", "snoozed"].contains(status), let depends_on, !depends_on.isEmpty else { return nil }
        if ready == true { return "Ready" }
        guard blocked == true else { return nil }
        let unresolved = depends_on.filter { id in catalog.contains { $0.id == id && ["open", "snoozed"].contains($0.status) } }.count
        return "Blocked · \(unresolved)"
    }
}

extension TodoModel {
    func openDependencyPicker(_ task: TaskSnapshot, direction: DependencyDirection = .dependsOn) async {
        guard signedIn, task.profile_id == profile else { return }
        dependencies.generation += 1
        dependencies.picker = .init(profile: profile, root: task, direction: direction)
        await reloadDependencyPicker()
    }
    func closeDependencyPicker() {
        dependencies.generation += 1
        dependencies.searchRequest += 1
        dependencies.picker = nil
    }
    func setDependencyDirection(_ direction: DependencyDirection) async {
        guard dependencies.picker?.purpose == .edit || direction == .dependsOn else { return }
        guard dependencies.picker?.direction != direction else { return }
        dependencies.generation += 1
        dependencies.picker?.direction = direction
        dependencies.picker?.failure = nil
        await reloadDependencyPicker()
    }
    func reloadDependencyPicker() async {
        guard let picker = dependencies.picker else { return }
        guard connection == .live else { dependencies.picker?.loading = false; return }
        if picker.purpose != .edit { await searchDependencyCandidates(); return }
        dependencies.picker?.reloadRequest += 1
        guard let request = dependencies.picker?.reloadRequest else { return }
        let epoch = discovery.credentialEpoch
        let run = dependencies.generation
        let id = picker.id
        dependencies.picker?.loading = true
        do {
            let root = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: picker.profile, task: picker.root.id)).ok.body.json)
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.picker?.id == id, dependencies.picker?.reloadRequest == request else { return }
            let linkedIDs = picker.direction == .dependsOn ? root.depends_on ?? [] : root.blocks ?? []
            var linked: [TaskSnapshot] = []
            for taskID in linkedIDs { linked.append(try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: picker.profile, task: taskID)).ok.body.json)) }
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.picker?.id == id, dependencies.picker?.reloadRequest == request else { return }
            dependencies.picker?.root = root
            dependencies.picker?.linked = linked
            dependencies.picker?.requiresReload = false
            dependencies.picker?.failure = nil
            await searchDependencyCandidates()
        } catch {
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.picker?.id == id, dependencies.picker?.reloadRequest == request else { return }
            dependencies.picker?.failure = dependencyNotice(error, context: .link)
            dependencies.picker?.loading = false
            handleAuthorization(error, credentialEpoch: epoch)
        }
    }
    func searchDependencyCandidates() async {
        guard let picker = dependencies.picker else { return }
        dependencies.searchRequest += 1
        if picker.text.isEmpty { dependencies.picker?.searchFailure = nil }
        guard connection == .live else { dependencies.picker?.loading = false; return }
        let request = dependencies.searchRequest
        let epoch = discovery.credentialEpoch
        let run = dependencies.generation
        dependencies.picker?.loading = true
        do {
            let wire = try await client.tasks_period_list(path: .init(profile: picker.profile), query: .init(text: picker.text.isEmpty ? nil : picker.text)).ok.body.json
            let rows = try wire.map(TaskSnapshot.decode)
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.searchRequest == request, dependencies.picker?.id == picker.id, dependencies.picker?.text == picker.text else { return }
            dependencies.picker?.candidates = rows.filter { $0.id != picker.root.id }
            dependencies.picker?.searchFailure = nil
            dependencies.picker?.loading = false
        } catch {
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.searchRequest == request, dependencies.picker?.id == picker.id, dependencies.picker?.text == picker.text else { return }
            dependencies.picker?.loading = false
            dependencies.picker?.searchFailure = dependencyNotice(error, context: .search)
            handleAuthorization(error, credentialEpoch: epoch)
        }
    }
    func toggleDependency(_ candidate: TaskSnapshot) async {
        guard canWrite, let picker = dependencies.picker, !picker.requiresReload, !picker.loading, candidate.profile_id == picker.profile else { return }
        if picker.purpose != .edit {
            var selected = picker.linked
            if picker.checked(candidate.id) { selected.removeAll { $0.id == candidate.id } }
            else { selected.append(candidate) }
            if picker.purpose == .firstOccurrence { dependencies.firstOccurrenceInitial = selected }
            else { dependencies.initial = selected }
            dependencies.picker?.linked = selected
            return
        }
        let dependent = picker.direction == .dependsOn ? picker.root : candidate
        let blocker = picker.direction == .dependsOn ? candidate : picker.root
        guard !dependencies.pendingDependents.contains(dependent.id) else { return }
        let remove = picker.checked(candidate.id)
        let epoch = discovery.credentialEpoch
        let run = dependencies.generation
        dependencies.pendingDependents.insert(dependent.id)
        dependencies.picker?.pending.insert(candidate.id)
        dependencies.picker?.failure = nil
        dependencies.picker?.warnings = []
        defer {
            dependencies.pendingDependents.remove(dependent.id)
            if dependencies.picker?.id == picker.id { dependencies.picker?.pending.remove(candidate.id) }
        }
        do {
            let report: DependencyEdgeReport
            if remove {
                let response = try await client.tasks_period_undepend(path: .init(profile: picker.profile, task: dependent.id), body: .json(.init(blocker_id: blocker.id, from_version: dependent.row_version)))
                if case .conflict(let conflict) = response { throw try dependencyConflict(conflict.body.json) }
                report = try decode(DependencyEdgeReport.self, response.ok.body.json)
            } else {
                let response = try await client.tasks_period_depend(path: .init(profile: picker.profile, task: dependent.id), body: .json(.init(blocker_id: blocker.id, from_version: dependent.row_version)))
                if case .conflict(let conflict) = response { throw try dependencyConflict(conflict.body.json) }
                report = try decode(DependencyEdgeReport.self, response.ok.body.json)
            }
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.picker?.id == picker.id else { return }
            await reloadDependencyPicker()
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.picker?.id == picker.id else { return }
            dependencies.picker?.feedback = report.outcome == "unchanged" ? (remove ? "Already removed" : "Already linked") : (remove ? "Dependency removed" : "Dependency added")
            dependencies.picker?.warnings = report.warnings.map { $0.notice }
            if report.outcome != "unchanged" { await refreshAfterWrite("Dependencies updated") }
        } catch {
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.picker?.id == picker.id else { return }
            var notice = dependencyNotice(error, context: dependent.status == "done" ? .linkDone : .link)
            notice.attemptTitle = candidate.title
            notice.attemptVerb = remove ? "remove" : "add"
            dependencies.picker?.failure = notice
            dependencies.picker?.requiresReload = notice.failure?.code == "occ_conflict"
            handleAuthorization(error, credentialEpoch: epoch)
        }
    }
    func currentDependencyScope(profile expected: String, epoch: Int, run: Int) -> Bool {
        signedIn && profile == expected && isCurrentCredential(epoch) && dependencies.generation == run
    }
}

struct DependencyEdgeReport: Decodable {
    let outcome: String
    let to_version: Int
    let warnings: [DependencyWarning]
}
struct DependencyWarning: Decodable {
    let code: String
    let count: Int?
    let path: [String]?
    var notice: DependencyNotice {
        .init(message: code == "many_dependencies" ? DependencyNotice.countAdvice(count ?? 0) : "This Dependency is already implied by the path below. The Dependency was kept.", path: path ?? [])
    }
}

extension TodoModel {
    func openInitialDependencyPicker(firstOccurrence: Bool = false) async {
        guard canWrite else { return }
        dependencies.generation += 1
        let title = firstOccurrence ? editor?.title ?? "First Occurrence" : newTitle.isEmpty ? "New Task" : newTitle
        let draftTask = TaskSnapshot(id: "", profile_id: profile, row_version: 1, title: title, description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
        dependencies.picker = .init(profile: profile, root: draftTask, direction: .dependsOn, purpose: firstOccurrence ? .firstOccurrence : .initial, linked: firstOccurrence ? dependencies.firstOccurrenceInitial : dependencies.initial)
        await searchDependencyCandidates()
    }
}

extension TodoModel {
    func dependenciesWentOffline() {
        dependencies.searchRequest += 1
        dependencies.graphSearchRequest += 1
        dependencies.picker?.loading = false
    }
}
