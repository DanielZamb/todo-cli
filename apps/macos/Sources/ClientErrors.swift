import SwiftUI
import TodoAPI

enum ClientErrorPosition { case message, editor, history, discovery, taskLoad, quickAdd, parse, importTasks, profileDeletion, snapshot, batchEdit, attachmentBatch }

extension TodoModel {
    func lookupError(at position: ClientErrorPosition, text: String?) -> ServerFailure? {
        guard let failure = lookupErrors[position], failure.humanMessage == text else { return nil }
        return failure
    }

    func findTaskAfterLookupError(_ failure: ServerFailure) async {
        guard signedIn, failure.isTaskLookup else { return }
        let credentialEpoch = discovery.credentialEpoch
        batchEdit = nil
        attachmentBatch = nil
        showingImport = false
        await Task.yield()
        guard signedIn, discovery.credentialEpoch == credentialEpoch else { return }
        await openDiscovery(.lookup)
        if let prefix = failure.details?.task_id, !prefix.isEmpty, TaskListFilters(prefix: prefix).prefixIsValid {
            editDiscoveryPrefix(prefix)
        }
    }
}

struct TaskLookupErrorNotice: View {
    let model: TodoModel
    let failure: ServerFailure
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(failure.primaryMessage).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
            if let detail = failure.exitDetail { Text(detail).font(.caption).foregroundStyle(.secondary) }
            Button("Find Task by id") { Task { await model.findTaskAfterLookupError(failure) } }
                .buttonStyle(.bordered).accessibilityIdentifier("discovery-error-find")
        }.accessibilityIdentifier("task-lookup-error")
    }
}

struct ClientErrorNotice: View {
    let model: TodoModel
    let text: String
    let position: ClientErrorPosition
    var body: some View {
        if let failure = model.lookupError(at: position, text: text) {
            TaskLookupErrorNotice(model: model, failure: failure)
        } else {
            Text(text).foregroundStyle(position == .discovery ? Color.primary : TodoColors.color("destructive")).fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct ServerErrorNotice: View {
    let model: TodoModel
    let failure: ServerFailure
    var body: some View {
        if failure.isTaskLookup { TaskLookupErrorNotice(model: model, failure: failure) }
        else { Text(failure.humanMessage).font(.caption).foregroundStyle(TodoColors.color("destructive")) }
    }
}
