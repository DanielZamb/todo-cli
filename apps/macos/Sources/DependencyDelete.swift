import Foundation
import TodoAPI

extension TodoModel {
    func openDependencyDelete(_ task: TaskSnapshot) async {
        guard signedIn, task.profile_id == profile else { return }
        dependencies.deletion = .init(profile: profile, task: task)
        await reloadDependencyDelete()
    }
    func closeDependencyDelete() {
        let closing = dependencies.deletion?.id
        dependencies.deletion = nil
        if let closing { endMessage(raisedBy: .deleteDialog(closing)) }
    }
    func reloadDependencyDelete(changed: Bool = false) async {
        guard let deletion = dependencies.deletion else { return }
        let epoch = discovery.credentialEpoch
        let client = self.client
        dependencies.deletion?.request += 1
        guard let request = dependencies.deletion?.request else { return }
        dependencies.deletion?.loading = true
        dependencies.deletion?.fingerprint = nil
        dependencies.deletion?.acceptedFromVersion = nil
        dependencies.deletion?.changed = changed || deletion.changed
        if changed, let failure = deletion.failure?.failure { dependencies.deletion?.reviewFailure = failure }
        do {
            let current = try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: deletion.profile, task: deletion.task.id)).ok.body.json)
            guard currentDependencyDelete(deletion, epoch: epoch, request: request) else { return }
            guard current.id == deletion.task.id, current.profile_id == deletion.profile else { throw DependencyGraphReply.ProtocolError.incompatible }
            let response = try await client.tasks_period_delete(path: .init(profile: deletion.profile, task: current.id), query: .init(from_version: String(current.row_version), with_dependencies: ._true, dry_run: ._true))
            guard currentDependencyDelete(deletion, epoch: epoch, request: request) else { return }
            if case .conflict(let conflict) = response { throw try dependencyConflict(conflict.body.json) }
            let preview = try response.ok.body.json
            let after = try TaskSnapshot.decode(preview)
            guard let fingerprint = preview.dependency_fingerprint, !fingerprint.isEmpty, preview.dry_run == true,
                  preview.confirm_from_version == nil || preview.confirm_from_version == current.row_version,
                  after.id == current.id, after.profile_id == current.profile_id else { throw DependencyGraphReply.ProtocolError.incompatible }
            let edges = try (preview.removed_dependencies ?? []).map { try decode(DependencyEdge.self, $0) }
            var endpoints: [TaskSnapshot] = []
            let ids = Set(edges.flatMap { [$0.blocker_id, $0.dependent_id] }).subtracting([current.id])
            for id in ids.sorted() { endpoints.append(try await TaskSnapshot.decode(client.tasks_period_show(path: .init(profile: deletion.profile, task: id)).ok.body.json)) }
            guard currentDependencyDelete(deletion, epoch: epoch, request: request) else { return }
            dependencies.deletion?.task = current
            dependencies.deletion?.edges = edges
            dependencies.deletion?.endpoints = endpoints
            dependencies.deletion?.fingerprint = fingerprint
            dependencies.deletion?.acceptedFromVersion = current.row_version
            dependencies.deletion?.loading = false
            dependencies.deletion?.failure = nil
        } catch {
            guard currentDependencyDelete(deletion, epoch: epoch, request: request) else { return }
            dependencies.deletion?.loading = false
            dependencies.deletion?.failure = dependencyNotice(error, context: .delete)
            handleAuthorization(error, credentialEpoch: epoch)
        }
    }
    private func currentDependencyDelete(_ deletion: DependencyDelete, epoch: Int, request: Int) -> Bool {
        signedIn && profile == deletion.profile && isCurrentCredential(epoch) && dependencies.deletion?.id == deletion.id && dependencies.deletion?.request == request
    }
    func confirmDependencyDelete() async {
        guard canWrite, let deletion = dependencies.deletion, !deletion.loading, !deletion.pending, deletion.fingerprint != nil, deletion.acceptedFromVersion != nil else { return }
        dependencies.deletion?.pending = true
        await deleteTask(deletion.task)
        if dependencies.deletion?.id == deletion.id { dependencies.deletion?.pending = false }
    }
}
