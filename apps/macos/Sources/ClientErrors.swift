import SwiftUI
import TodoAPI

enum ClientErrorPosition { case message, editor, history, discovery, taskLoad, quickAdd, parse, importTasks, profileDeletion, snapshot, batchEdit, attachmentBatch }

extension TodoModel {
    func serverError(at position: ClientErrorPosition, text: String?) -> ServerFailure? {
        guard let failure = serverErrors[position], failure.humanMessage == text else { return nil }
        return failure
    }
    func lookupError(at position: ClientErrorPosition, text: String?) -> ServerFailure? {
        guard let failure = serverError(at: position, text: text), failure.isTaskLookup else { return nil }
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
    var reasonFont: Font? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            let message = Text(failure.primaryMessage).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
            if let reasonFont { message.font(reasonFont) } else { message }
            if let detail = failure.exitDetail { Text(detail).font(.caption).foregroundStyle(.secondary) }
            Button("Find Task by id") { Task { await model.findTaskAfterLookupError(failure) } }
                .buttonStyle(.bordered).accessibilityIdentifier("discovery-error-find")
        }.accessibilityIdentifier("task-lookup-error")
            .reportErrorBounds("card-" + (failure.details?.task_id ?? "unknown"))
    }
}

struct ClientErrorNotice: View {
    let model: TodoModel
    let text: String
    let position: ClientErrorPosition
    var body: some View {
        if let failure = model.serverError(at: position, text: text) {
            ServerErrorNotice(model: model, failure: failure, neutral: position == .discovery)
        } else {
            Text(text).foregroundStyle(position == .discovery ? Color.primary : TodoColors.color("destructive")).fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct ServerErrorNotice: View {
    let model: TodoModel
    let failure: ServerFailure
    var neutral = false
    var currentVersion: Int? = nil
    var reasonFont: Font? = nil
    var body: some View {
        if failure.isTaskLookup { TaskLookupErrorNotice(model: model, failure: failure, reasonFont: reasonFont) }
        else {
            VStack(alignment: .leading, spacing: 4) {
                let message = Text(failure.primaryMessage).foregroundStyle(neutral ? Color.primary : TodoColors.color("destructive"))
                if let reasonFont { message.font(reasonFont) } else { message }
                if failure.code == "occ_conflict", let currentVersion { Text("Version \(currentVersion). Reload Tasks.").font(.caption).foregroundStyle(.secondary) }
                if let detail = failure.exitDetail { Text(detail).font(.caption).foregroundStyle(.secondary) }
            }
        }
    }
}

struct ReportErrorLayoutFrames: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, next in next }) }
}

extension View {
    func reportErrorBounds(_ name: String) -> some View {
        background(GeometryReader { geometry in Color.clear.preference(key: ReportErrorLayoutFrames.self, value: [name: geometry.frame(in: .global)]) })
    }
}
