import SwiftUI
import TodoAPI

enum ClientErrorPosition { case message, editor, history, discovery, taskLoad, quickAdd, parse, importTasks, profileDeletion, snapshot, batchEdit, attachmentBatch }

extension TodoModel {
    func serverError(at position: ClientErrorPosition, text: String?) -> ServerFailure? {
        guard let failure = serverErrors[position] else { return nil }
        let notice = DependencyNotice.project(failure, context: dependencyErrorContexts[position] ?? .link)
        let projected = [notice.message, notice.detail].compactMap { $0 }.joined(separator: "\n")
        guard failure.nativeMessage == text || failure.isDependencyFailure && projected == text else { return nil }
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
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(failure.primaryMessage).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
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
    var dependency: DependencyNotice? = nil
    var dependencyWarning = false
    var retry: (() -> Void)? = nil
    var body: some View {
        if let dependency {
            VStack(alignment: .leading, spacing: 8) {
                DependencyNoticeContent(model: model, notice: dependency, warning: dependencyWarning)
                if let retry {
                    Button("Retry", action: retry).accessibilityIdentifier("dependency-graph-retry")
                }
            }
                .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(nsColor: .separatorColor), lineWidth: 1))
        } else if let failure = model.serverError(at: position, text: text) {
            ServerErrorNotice(model: model, failure: failure, neutral: position == .discovery, dependencyContext: model.dependencyErrorContexts[position] ?? .link)
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
    var dependencyContext: DependencyActionContext = .link
    var body: some View {
        if failure.isDependencyFailure { DependencyNoticeView(model: model, notice: .project(failure, context: dependencyContext)) }
        else if failure.isTaskLookup { TaskLookupErrorNotice(model: model, failure: failure) }
        else {
            VStack(alignment: .leading, spacing: 4) {
                Text(failure.primaryMessage).foregroundStyle(neutral ? Color.primary : TodoColors.color("destructive"))
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
