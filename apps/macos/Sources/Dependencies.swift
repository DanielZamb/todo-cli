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
    enum MessageKind: Hashable { case reload, link, followUp }
    /// This picker instance's messages under the one message rule (SurfaceMessages). The search
    /// notice is separate: it belongs to the search request generation, which already supersedes.
    var messages = SurfaceMessages<MessageKind, DependencyNotice>()
    var operationFailure: DependencyNotice? { messages.value }
    var searchFailure: DependencyNotice?
    var failure: DependencyNotice? {
        get { operationFailure ?? searchFailure }
        set { if let newValue { messages.publish(newValue, kind: .link) } else { messages.end() } }
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
    enum MessageKind: Hashable { case reload, delete }
    /// This confirmation's notice under the one message rule (SurfaceMessages): its reload and its
    /// delete each take a ticket. A delete is gated by busy and pending; a newer reload supersedes
    /// an older one. A reload's success turns a refusal that existed when it began into the review
    /// text (`reviewFailure`), so it clears both kinds from before its mark and nothing newer.
    var messages = SurfaceMessages<MessageKind, DependencyNotice>()
    var failure: DependencyNotice? { messages.value }
    var reviewFailure: ServerFailure?
    var reviewExitDetail: String? { reviewFailure?.exitDetail }
    var action: String { edges.isEmpty ? "Delete Task" : "Delete Task and remove Dependencies" }
    var reviewMessage: String {
        if changed {
            if reviewFailure?.code == "occ_conflict" { return "This Task changed. Confirm again to delete it." }
            return edges.isEmpty ? "This Task has no Dependencies now. Confirm again to delete it." : "Dependencies changed. Review the current list and confirm again."
        }
        return edges.isEmpty ? "Delete this Task?" : "Review these Dependencies before deleting this Task."
    }
}

@MainActor @Observable final class DependencyState {
    var dragSource: DependencyDragSource?
    var dropTarget: String?
    var dropStatus: DependencyDropStatus?
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
        pendingDependents.removeAll()
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
        let closing = dependencies.picker?.id
        dependencies.picker = nil
        if let closing { endMessage(raisedBy: .dependencyPicker(closing)) }
    }
    func setDependencyDirection(_ direction: DependencyDirection) async {
        guard dependencies.picker?.purpose == .edit || direction == .dependsOn else { return }
        guard dependencies.picker?.direction != direction else { return }
        dependencies.generation += 1
        dependencies.picker?.direction = direction
        await reloadDependencyPicker()
    }
    /// Reloads the picker. Opening it and the person's Reload clear an earlier reload or link notice
    /// on success (`clearing`); a link's read-back and a background refresh only refresh the data.
    func reloadDependencyPicker(clearing: Bool = true) async {
        guard let picker = dependencies.picker else { return }
        guard connection == .live else { dependencies.picker?.loading = false; return }
        if picker.purpose != .edit { await searchDependencyCandidates(); return }
        dependencies.picker?.reloadRequest += 1
        guard let request = dependencies.picker?.reloadRequest else { return }
        let epoch = discovery.credentialEpoch
        let run = dependencies.generation
        let client = self.client
        let id = picker.id
        dependencies.picker?.loading = true
        guard let ticket = dependencies.picker?.messages.begin(.reload) else { return }
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
            // Ends a reload or link notice from before it began; a newer one (a follow-up failure, say) stays.
            if clearing, dependencies.picker?.messages.isNewest(ticket) == true { dependencies.picker?.messages.clear([.reload, .link], since: ticket.mark) }
            await searchDependencyCandidates()
        } catch {
            authorize(error, epoch: epoch, profile: picker.profile)
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.picker?.id == id, dependencies.picker?.reloadRequest == request else { return }
            let failureNotice = dependencyNotice(error, context: .link)
            dependencies.picker?.messages.fail(failureNotice, ticket)
            dependencies.picker?.loading = false
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
            authorize(error, epoch: epoch, profile: picker.profile)
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.searchRequest == request, dependencies.picker?.id == picker.id, dependencies.picker?.text == picker.text else { return }
            dependencies.picker?.loading = false
            dependencies.picker?.searchFailure = dependencyNotice(error, context: .search)
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
        let mark = messageMark
        let epoch = discovery.credentialEpoch
        let run = dependencies.generation
        dependencies.pendingDependents.insert(dependent.id)
        dependencies.picker?.pending.insert(candidate.id)
        // The newest link action presents: it ends an earlier link or reload notice now.
        dependencies.picker?.messages.clear([.link, .reload])
        guard let linkTicket = dependencies.picker?.messages.begin(.link) else { return }
        dependencies.picker?.warnings = []
        defer {
            if discovery.credentialEpoch == epoch { dependencies.pendingDependents.remove(dependent.id) }
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
            // Ownership: the credential and Profile the edge was written under. (The Dependency
            // generation is not ownership: closing a picker advances it.)
            guard signedIn, profile == picker.profile, isCurrentCredential(epoch) else { return }
            // Presentation, only while this picker is still the one showing; a close at any point
            // (including during its reload) cannot skip the committed edge's catalog read-back.
            if dependencies.picker?.id == picker.id {
                await reloadDependencyPicker(clearing: false)
                if currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.picker?.id == picker.id,
                   dependencies.picker?.messages.succeed(linkTicket) == true {
                    dependencies.picker?.feedback = report.outcome == "unchanged" ? (remove ? "Already removed" : "Already linked") : (remove ? "Dependency removed" : "Dependency added")
                    dependencies.picker?.warnings = report.warnings.map { $0.notice }
                }
            }
            // Data: a committed edge reaches the list whether or not the picker is still showing.
            guard signedIn, profile == picker.profile, isCurrentCredential(epoch) else { return }
            // Presentation in the main window too: only the newest link of this picker may clear
            // an earlier hand-off (a superseded one presents nothing anywhere).
            if linkTicket.isNewest { clearMessage([.dependencyLink], since: mark) }
            if report.outcome != "unchanged" { await refreshAfterWrite("Dependencies updated", presenting: .dependencyPicker(picker.id), presents: linkTicket.isNewest) }
        } catch {
            authorize(error, epoch: epoch, profile: picker.profile)
            guard signedIn, profile == picker.profile, isCurrentCredential(epoch) else { return }
            var notice = dependencyNotice(error, context: dependent.status == "done" ? .linkDone : .link)
            notice.attemptTitle = candidate.title
            notice.attemptVerb = remove ? "remove" : "add"
            guard currentDependencyScope(profile: picker.profile, epoch: epoch, run: run), dependencies.picker?.id == picker.id else {
                // The picker can be closed while a link is pending (Close and Escape are not gated):
                // the newest link of that picker hands one named message to the main window, so the
                // failure is not silent. A superseded link hands off nothing (S1-16).
                handOff("Couldn't \(remove ? "remove" : "add") the Dependency on “\(candidate.title)”. " + notice.message, kind: .dependencyLink, from: linkTicket)
                return
            }
            if dependencies.picker?.messages.fail(notice, linkTicket) == true {
                dependencies.picker?.requiresReload = notice.failure?.code == "occ_conflict"
            }
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
