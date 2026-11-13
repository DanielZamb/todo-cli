import Foundation
import SwiftUI
import TodoAPI

struct DependencyBatchDraft: Identifiable {
    let id = UUID()
    var reloadRequest = 0
    let profile: String
    var root: TaskSnapshot
    let direction: DependencyDirection
    var targets: [TaskSnapshot] = []
    var selected: Set<String> = []
    var remove = false
    var loading = true
    var pending = false
    enum MessageKind: Hashable { case reload, run }
    /// This dialog instance's notice under the one message rule (SurfaceMessages): a reload and a
    /// preview or apply each take a ticket; a run is gated by `pending`, a reload supersedes an
    /// older reload, and a reload may still be loading while a run starts.
    var messages = SurfaceMessages<MessageKind, DependencyNotice>()
    var failure: DependencyNotice? { messages.value }
    var report: DependencyBatchReport?
    var items: [DependencyBatchItem] = []
    var versionFacts: [DependencyBatchVersionFact] = []
    var reviewedVersionFacts: [DependencyBatchVersionFact] {
        guard let report else { return versionFacts }
        guard report.dry_run else { return [] }
        return report.results.compactMap { row in
            guard items.indices.contains(row.index) else { return nil }
            let item = items[row.index]
            let advances: Bool
            if let error = row.error {
                guard error.code != "occ_conflict" else { return nil }
                advances = false
            } else if let result = row.result { advances = result.outcome != "unchanged" }
            else { return nil }
            guard let base = item.dependent_id == root.id ? root.row_version : targets.first(where: { $0.id == item.dependent_id })?.row_version else { return nil }
            return .init(action: item.action, dependent: item.dependent_id, blocker: item.blocker_id, baseVersion: base, advances: advances)
        }
    }
}
struct DependencyBatchVersionFact {
    let action: String
    let dependent: String
    let blocker: String
    let baseVersion: Int
    let advances: Bool
}
struct DependencyBatchItem: Codable {
    let action: String
    let dependent_id: String
    let blocker_id: String
    let from_version: Int
}
struct DependencyBatchReport: Decodable {
    struct Row: Decodable {
        let index: Int
        let result: DependencyEdgeReport?
        let error: ServerFailure?
        let exit_code: Int?
    }
    let dry_run: Bool
    let results: [Row]
    var requiresReload: Bool { results.contains { $0.error?.code == "occ_conflict" } }
}

extension TodoModel {
    func beginDependencyBatch() async {
        guard let picker = dependencies.picker, canWrite else { return }
        closeDependencyPicker()
        dependencies.batch = .init(profile: picker.profile, root: picker.root, direction: picker.direction)
        await reloadDependencyBatch()
    }
    func reloadDependencyBatch() async {
        guard let batch = dependencies.batch, !batch.pending else { return }
        let epoch = discovery.credentialEpoch
        dependencies.batch?.reloadRequest += 1
        guard let request = dependencies.batch?.reloadRequest, let ticket = dependencies.batch?.messages.begin(.reload) else { return }
        dependencies.batch?.loading = true
        do {
            let rows = try await client.tasks_period_list(path: .init(profile: batch.profile)).ok.body.json.map(TaskSnapshot.decode)
            guard signedIn, profile == batch.profile, isCurrentCredential(epoch), dependencies.batch?.id == batch.id, dependencies.batch?.reloadRequest == request else { return }
            if let root = rows.first(where: { $0.id == batch.root.id }) { dependencies.batch?.root = root }
            dependencies.batch?.targets = rows.filter { $0.id != batch.root.id }
            dependencies.batch?.versionFacts = batch.reviewedVersionFacts
            dependencies.batch?.report = nil
            dependencies.batch?.items = []
            dependencies.batch?.loading = false
            // Fresh targets make an earlier reload or run notice untrue; one published after this
            // reload began (a run that failed meanwhile) survives.
            if dependencies.batch?.messages.isNewest(ticket) == true { dependencies.batch?.messages.clear([.reload, .run], since: ticket.mark) }
        } catch {
            authorize(error, epoch: epoch, profile: batch.profile)
            guard signedIn, profile == batch.profile, isCurrentCredential(epoch), dependencies.batch?.id == batch.id, dependencies.batch?.reloadRequest == request else { return }
            dependencies.batch?.loading = false
            let failureNotice = dependencyNotice(error, context: .link)
            dependencies.batch?.messages.fail(failureNotice, ticket)
        }
    }
    func previewDependencyBatch() async {
        guard let batch = dependencies.batch, canWrite, !batch.loading, !batch.pending else { return }
        var versions: [String: Int] = [:]
        let root = batch.root
        let selected = batch.targets.filter { batch.selected.contains($0.id) }
        dependencies.batch?.items = selected.map { target in
            let dependent = batch.direction == .dependsOn ? root : target
            let blocker = batch.direction == .dependsOn ? target : root
            let version = versions[dependent.id] ?? dependent.row_version
            let linked = dependent.depends_on?.contains(blocker.id) == true
            let action = batch.remove ? "undepend" : "depend"
            let fact = batch.versionFacts.first { $0.action == action && $0.dependent == dependent.id && $0.blocker == blocker.id && $0.baseVersion == dependent.row_version }
            if linked == batch.remove && fact?.advances != false { versions[dependent.id] = version + 1 }
            return .init(action: action, dependent_id: dependent.id, blocker_id: blocker.id, from_version: version)
        }
        await runDependencyBatch(dryRun: true)
    }
    func applyDependencyBatch() async {
        guard let report = dependencies.batch?.report, report.dry_run, !report.requiresReload else { return }
        await runDependencyBatch(dryRun: false)
    }
    private func runDependencyBatch(dryRun: Bool) async {
        guard let batch = dependencies.batch, canWrite, !batch.items.isEmpty, !batch.pending else { return }
        let epoch = discovery.credentialEpoch
        dependencies.batch?.pending = true
        guard let ticket = dependencies.batch?.messages.begin(.run) else { return }
        defer { if dependencies.batch?.id == batch.id { dependencies.batch?.pending = false } }
        struct Payload: Encodable { let items: [DependencyBatchItem]; let dry_run: Bool }
        var committed = false // the write's reply came back OK: its read-back cannot be skipped (S1-19)
        do {
            let payload = try decode(Operations.tasks_period_batchDepend.Input.Body.jsonPayload.self, Payload(items: batch.items, dry_run: dryRun))
            let response = try await client.tasks_period_batchDepend(path: .init(profile: batch.profile), body: .json(payload))
            if !dryRun, case .ok = response { committed = true }
            if case .conflict(let conflict) = response { throw try dependencyConflict(conflict.body.json) }
            let wire = try response.ok.body.json
            let report = try decode(DependencyBatchReport.self, wire)
            guard signedIn, profile == batch.profile, isCurrentCredential(epoch) else { return }
            // Once this dialog has closed, a committed apply still reaches the list and nothing is shown.
            guard dependencies.batch?.id == batch.id else { if !dryRun { await refreshAfterWrite("Dependencies updated", owner: .surface(.dependencyBatch(batch.id), .init(ticket))) }; return }
            if report.results.contains(where: { $0.error.map { $0.hasMalformedDependencyError || $0.exitDetail == nil } ?? false }) {
                dependencies.batch?.report = nil
                throw DependencyGraphReply.ProtocolError.incompatible
            }
            dependencies.batch?.report = report
            dependencies.batch?.messages.succeed(ticket)
            if !dryRun { await refreshAfterWrite("Dependencies updated", owner: .surface(.dependencyBatch(batch.id), .init(ticket))) }
        } catch {
            authorize(error, epoch: epoch, profile: batch.profile)
            // A committed apply whose reply could not be used (or carried an unreadable row) still
            // reads the catalog back (S1-19).
            if !dryRun, committed || committedBeforeFailure(error), signedIn, profile == batch.profile, isCurrentCredential(epoch) {
                await refreshAfterWrite("Dependencies updated", owner: .surface(.dependencyBatch(batch.id), .init(ticket)))
            }
            guard signedIn, profile == batch.profile, isCurrentCredential(epoch), dependencies.batch?.id == batch.id else { return }
            let failureNotice = dependencyNotice(error, context: .link)
            dependencies.batch?.messages.fail(failureNotice, ticket)
        }
    }
}

struct DependencyBatchView: View {
    @Bindable var model: TodoModel
    var compact = false
    var body: some View {
        if let batch = model.dependencies.batch {
            VStack(alignment: .leading, spacing: 10) {
                Text("Edit Dependencies together").font(.headline)
                Text(batch.direction.sentence(batch.root.title)).lineLimit(2)
                if batch.report == nil {
                    Picker("Action", selection: Binding(get: { batch.remove }, set: { model.dependencies.batch?.remove = $0 })) {
                        Text("Add").tag(false)
                        Text("Remove").tag(true)
                    }.pickerStyle(.segmented)
                }
                if !model.canWrite && !batch.pending { Text("Offline or read only. Reconnect to change Dependencies.").font(.caption).foregroundStyle(.secondary) }
                Divider().padding(.top, 8) // the scrolled list no longer meets the Action control flush (seat note 5)
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        if batch.loading { ProgressView("Loading Tasks…") }
                        if let failure = batch.failure { DependencyNoticeView(model: model, notice: failure) }
                        if let report = batch.report {
                            Text(report.dry_run ? "Preview · No changes saved" : "Dependencies updated").font(.subheadline.weight(.semibold)).accessibilityIdentifier("dependency-batch-summary")
                            ForEach(report.results, id: \.index) { row in
                                VStack(alignment: .leading, spacing: 4) {
                                    let item = batch.items.indices.contains(row.index) ? batch.items[row.index] : nil
                                    let candidateID = item.map { batch.direction == .dependsOn ? $0.blocker_id : $0.dependent_id }
                                    if let task = batch.targets.first(where: { $0.id == candidateID }) {
                                        TaskRow(task: task, canWrite: false, compact: compact, projectName: nil, tagNames: [], showsCompletion: false, relation: true, showsMetadata: false, complete: {})
                                    } else if let candidateID { Text(candidateID).lineLimit(1).help(candidateID) }
                                    if let result = row.result {
                                        Text(result.outcome == "unchanged" ? (batch.remove ? "Already removed" : "Already linked") : result.outcome.capitalized).font(.caption).foregroundStyle(.secondary)
                                        ForEach(result.warnings.indices, id: \.self) { DependencyNoticeView(model: model, notice: result.warnings[$0].notice, warning: true) }
                                    }
                                    if let failure = row.error { DependencyNoticeContent(model: model, notice: .project(failure, context: .linkDone), font: .caption) }
                                }.padding(8).frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
                                    .accessibilityIdentifier("dependency-batch-row-\(row.index)")
                            }
                        } else {
                            ForEach(batch.targets) { task in
                                Toggle(isOn: Binding(get: { batch.selected.contains(task.id) }, set: { checked in
                                    if checked { model.dependencies.batch?.selected.insert(task.id) } else { model.dependencies.batch?.selected.remove(task.id) }
                                })) {
                                    TaskRow(task: task, canWrite: false, compact: compact, projectName: model.projects.first { $0.id == task.project_id }?.name, tagNames: [], showsCompletion: false, relation: true, complete: {})
                                }.toggleStyle(.checkbox)
                            }
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.compactBounds("dependency-body")
                HStack {
                    Button("Cancel") { model.dependencies.batch = nil }.disabled(batch.pending).keyboardShortcut(.cancelAction)
                    Button("Reload") { Task { await model.reloadDependencyBatch() } }.disabled(batch.pending || model.connection != .live).accessibilityIdentifier("dependency-reload")
                    Spacer(minLength: 0)
                    if batch.report?.dry_run == true {
                        Button("Apply") { Task { await model.applyDependencyBatch() } }.disabled(!model.canWrite || batch.pending || batch.report?.requiresReload == true).accessibilityIdentifier("dependency-batch-apply")
                    } else if batch.report == nil {
                        Button("Preview") { Task { await model.previewDependencyBatch() } }.disabled(!model.canWrite || batch.pending || batch.loading || batch.selected.isEmpty)
                    }
                }.compactBounds("dependency-actions")
            }.padding(16).frame(width: compact ? 393 : 600, height: compact ? 426 : 640).accessibilityIdentifier("dependency-batch-preview")
        }
    }
}
