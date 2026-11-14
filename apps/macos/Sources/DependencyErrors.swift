import Foundation
import OpenAPIRuntime
import TodoAPI

enum DependencyActionContext { case link, linkDone, complete, reopen, revert, delete, search }

struct DependencyNotice {
    var message: String
    var attemptTitle: String? = nil
    var attemptVerb = "add"
    var detail: String? = nil
    var path: [String] = []
    var tasks: [TaskSnapshot] = []
    var recovery: String? = nil
    var followUp: String? = nil
    var failure: ServerFailure? = nil
    /// A failed "Create follow-up" offered by this notice, shown with it (the notice and its
    /// button stay, so the person can try again).
    var followUpFailure: String? = nil
    /// The text for a failure without a more specific one.
    static let genericFailure = "Couldn't update Dependencies. Try again."
    static func countAdvice(_ count: Int) -> String {
        "This Task depends on \(count) Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks."
    }
    static func project(_ failure: ServerFailure, context: DependencyActionContext) -> Self {
        if let nested = failure.nestedDependencyFailure { return project(nested, context: context) }
        if failure.hasMalformedDependencyError { return .init(message: "The server response could not be read. Your draft is preserved.") }
        do {
            if let error = failure.dependencyError {
                if let value = error.value1 {
                    return .init(message: value.details.dependent_id == value.details.blocker_id ? "A Task can't depend on itself." : "This Dependency would create a loop.", detail: failure.exitDetail, path: value.details.path, recovery: "Choose another Task", failure: failure)
                }
                if let value = error.value2 {
                    return .init(message: "A Task can have at most \(DependencyContract.directDependencies) direct Dependencies.\n" + countAdvice(value.details.count), detail: failure.exitDetail, recovery: "Choose fewer Dependencies", failure: failure)
                }
                if let value = error.value3 {
                    return try .init(message: context == .linkDone ? "A done Task can only depend on done or cancelled Tasks." : "Finish or cancel these Dependencies before marking this Task done.", detail: failure.exitDetail, tasks: value.details.blockers.map(TaskSnapshot.decode), recovery: context == .linkDone ? "Choose another Task" : nil, failure: failure)
                }
                if let value = error.value4 {
                    return try .init(message: context == .revert ? "This completion can't be reverted while these Tasks are done." : "This Task blocks done Tasks and can't be reopened.", detail: failure.exitDetail, tasks: value.details.done_dependents.map(TaskSnapshot.decode), recovery: "Create follow-up", followUp: value.details.follow_up_depends_on, failure: failure)
                }
                if error.value5 != nil { return .init(message: "Review these Dependencies before deleting this Task.", detail: failure.exitDetail, failure: failure) }
                if error.value6 != nil { return .init(message: "A Task and its Dependency must be in the same Profile.", detail: failure.exitDetail, recovery: "Choose a Task in this Profile", failure: failure) }
            }
        } catch { return .init(message: "The server response could not be read. Your draft is preserved.") }
        if ServerFailure.dependencyCodes.contains(failure.code ?? "") { return .init(message: "The server response could not be read. Your draft is preserved.") }
        let message: String
        switch failure.code {
        case "occ_conflict": message = "This Task changed. Reload its Dependencies before trying again."
        case "not_found": message = failure.isTaskLookup ? failure.primaryMessage : "Task not found."
        case "search_too_broad": message = "This search is too broad. Narrow the words or add more of the Task title."
        case "validation": message = "Check this Dependency and try again."
        case "unauthorized", "auth_required": message = "Your Session ended. Sign in again."
        case "forbidden": message = "This credential can't update Dependencies."
        default: message = genericFailure
        }
        guard failure.exitDetail != nil else { return .init(message: "The server response could not be read. Your draft is preserved.") }
        return .init(message: message, detail: failure.exitDetail, failure: failure)
    }
}

private struct DependencyConflictPair: Decodable { let exit_code: Int; let exit_meaning: String }

extension TodoModel {
    func dependencyConflict<Wire: Encodable>(_ wire: Wire) throws -> ServerFailure {
        let pair = try JSONDecoder().decode(DependencyConflictPair.self, from: JSONEncoder().encode(wire))
        return ServerFailure(message: "This Task changed. Reload its Dependencies before trying again.", code: "occ_conflict", exitCode: pair.exit_code, exitMeaning: pair.exit_meaning)
    }
    func dependencyNotice(_ error: Error, context: DependencyActionContext) -> DependencyNotice {
        if error is DecodingError || error is DependencyGraphReply.ProtocolError { return .init(message: "The server response could not be read. Your draft is preserved.") }
        if let request = (error as? RequestFailure) ?? (error as? ClientError)?.underlyingError as? RequestFailure { return .project(request.body, context: context) }
        if let server = error as? ServerFailure { return .project(server, context: context) }
        return .init(message: DependencyNotice.genericFailure)
    }
}

extension ServerFailure {
    private struct NestedDependency: Decodable { let dependency_error: Components.Schemas.DependencyError }
    private struct NestedField: Decodable { let dependency_error: OpenAPIValueContainer }
    private var containsNestedDependency: Bool { details.flatMap { try? $0.decoded(NestedField.self) } != nil }
    var nestedDependencyFailure: ServerFailure? {
        guard let details, let nested = try? details.decoded(NestedDependency.self), let data = try? JSONEncoder().encode(nested.dependency_error) else { return nil }
        return try? JSONDecoder().decode(ServerFailure.self, from: data)
    }
    var hasMalformedDependencyError: Bool { ServerFailure.dependencyCodes.contains(code ?? "") && dependencyError == nil || containsNestedDependency && nestedDependencyFailure == nil }
    var isDependencyFailure: Bool { ServerFailure.dependencyCodes.contains(code ?? "") || containsNestedDependency }
    var nativeMessage: String {
        guard isDependencyFailure else { return humanMessage }
        let notice = DependencyNotice.project(self, context: .link)
        return [notice.message, notice.detail].compactMap { $0 }.joined(separator: "\n")
    }
}
