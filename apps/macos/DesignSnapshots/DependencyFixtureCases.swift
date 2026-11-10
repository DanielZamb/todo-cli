import Foundation
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

@MainActor enum DependencyFixtureCases {
    static let names = [
        "rows-snoozed", "filter-combined", "filter-empty", "order-lightest",
        "picker-loading", "picker-narrowed", "picker-no-matches", "picker-added", "picker-removed", "picker-already-linked", "picker-already-removed", "picker-many", "picker-redundant", "picker-self", "picker-limit", "picker-blocked-done", "picker-profile-mismatch", "picker-conflict", "picker-search-too-broad", "picker-offline", "picker-read-only", "picker-long-end", "picker-long-cycle",
        "delete-blockers", "delete-dependents", "delete-changed-empty", "delete-loading", "delete-pending", "delete-refused", "delete-conflict", "delete-offline",
        "initial", "initial-invalid", "series-initial", "follow-up",
        "batch-select-long", "batch-preview", "batch-mixed", "batch-conflict", "batch-cancelled",
        "history-added", "history-removed", "history-lifecycle", "history-revert-refused", "transfer-move", "transfer-copy",
        "error-blocked-complete", "error-reopen", "error-revert", "error-nested-import",
        "drag-allowed", "drag-pending", "drag-already", "drag-self", "drag-foreign", "drag-refused"
    ]
    static func failure(_ code: String, details: [String: Any]) throws -> ServerFailure {
        let value = try JSONDecoder().decode(ServerFailure.self, from: JSONSerialization.data(withJSONObject: ["generated_at": "2026-11-10T00:00:00Z", "code": code, "message": code == "too_many_dependencies" ? DependencyNotice.countAdvice(14) : "Agent copy must not appear", "exit_code": 2, "exit_meaning": "validation or usage", "details": details]))
        #expect(value.dependencyError != nil)
        return value
    }
    static func wire(_ task: TaskSnapshot) throws -> [String: Any] {
        var value = try JSONSerialization.jsonObject(with: JSONEncoder().encode(task)) as! [String: Any]
        for key in ["depends_on", "blocks", "ready", "blocked", "remaining_energy", "search_matches"] { value.removeValue(forKey: key) }
        value["entity_version"] = 1
        value["created_at"] = "2026-11-10T00:00:00Z"
        value["updated_at"] = "2026-11-10T00:00:00Z"
        value["completed_at"] = NSNull()
        for key in ["description", "project_id", "due_at", "scheduled_at", "energy", "estimate_min", "occurrence", "deleted_at"] where value[key] == nil { value[key] = NSNull() }
        return value
    }
    static func configure(_ name: String, model: TodoModel, root: TaskSnapshot, blocker: TaskSnapshot, cancelled: TaskSnapshot) throws {
        if name == "rows-snoozed" {
            model.tasks = [DependencySnapshots.task("snoozed-ready", title: "Send the approved summary", status: "snoozed", blockers: [cancelled.id], ready: true), DependencySnapshots.task("snoozed-blocked", title: "Wait for the final review", status: "snoozed", blockers: [blocker.id], blocked: true), blocker, cancelled]
        }
        if name == "filter-combined" { model.taskFilters = .init(prefix: "abc123", ready: true); model.searchText = "launch"; model.selectedProject = "project"; model.selectedTag = "review" }
        if name == "filter-empty" { model.taskFilters = .init(ready: true, blocked: true); model.matchingTaskIDs = [] }
        if name == "order-lightest" { model.taskFilters.order = "lightest" }
        switch name {
        case "picker-loading": model.dependencies.picker?.loading = true
        case "picker-narrowed": model.dependencies.picker?.text = "plan"; model.dependencies.picker?.candidates = model.tasks.filter { $0.id == "plain" }
        case "picker-no-matches": model.dependencies.picker?.linked = []; model.dependencies.picker?.candidates = []; model.dependencies.picker?.text = "no result"
        case "picker-added": model.dependencies.picker?.feedback = "Dependency added"
        case "picker-removed": model.dependencies.picker?.feedback = "Dependency removed"
        case "picker-already-linked": model.dependencies.picker?.feedback = "Already linked"
        case "picker-already-removed": model.dependencies.picker?.feedback = "Already removed"
        case "picker-many": model.dependencies.picker?.warnings = [.init(message: DependencyNotice.countAdvice(13))]
        case "picker-redundant": model.dependencies.picker?.warnings = [.init(message: "This Dependency is already implied by the path below. The Dependency was kept.", path: [blocker.id, cancelled.id, root.id])]
        case "picker-self": model.dependencies.picker?.failure = .project(try failure("dependency_cycle", details: ["dependent_id": root.id, "blocker_id": root.id, "path": [root.id, root.id]]), context: .link)
        case "picker-limit": model.dependencies.picker?.failure = .project(try failure("too_many_dependencies", details: ["dependent_id": root.id, "count": 14, "limit": 13]), context: .link)
        case "picker-blocked-done": model.dependencies.picker?.failure = .project(try failure("blocked", details: ["task_id": root.id, "blockers": [try wire(blocker)]]), context: .linkDone)
        case "picker-profile-mismatch": model.dependencies.picker?.failure = .project(try failure("dependency_profile_mismatch", details: ["dependent_id": root.id, "blocker_id": "foreign-task-id", "profile_id": "work"]), context: .link)
        case "picker-conflict": model.dependencies.picker?.failure = .project(.init(message: "Agent copy", code: "occ_conflict", exitCode: 4, exitMeaning: "Conflict"), context: .link); model.dependencies.picker?.requiresReload = true
        case "picker-search-too-broad": model.dependencies.picker?.failure = .project(.init(message: "Agent copy", code: "search_too_broad", exitCode: 2, exitMeaning: "validation or usage"), context: .search)
        case "picker-offline": model.connection = .offline
        case "picker-read-only": model.busy = true
        case "picker-long-end": model.dependencies.picker?.linked = (0..<30).map { DependencySnapshots.task("long-\($0)", title: "Long checked Dependency \($0) with a full title in its tooltip") }; model.dependencies.picker?.candidates = []
        case "picker-long-cycle":
            let tasks = (0..<24).map { DependencySnapshots.task("witness-\($0)", title: "Review the complete ordered loop witness Task \($0)") }
            model.tasks += tasks
            model.dependencies.picker?.failure = .project(try failure("dependency_cycle", details: ["dependent_id": root.id, "blocker_id": blocker.id, "path": tasks.map(\.id) + [tasks[0].id]]), context: .link)
        default: break
        }
        if name.hasPrefix("picker"), model.dependencies.picker?.failure != nil { model.dependencies.picker?.failure?.attemptTitle = blocker.title }
        switch name {
        case "delete-blockers": model.dependencies.deletion?.edges = [.init(profile_id: "work", dependent_id: root.id, blocker_id: cancelled.id)]
        case "delete-dependents": model.dependencies.deletion?.edges = [.init(profile_id: "work", dependent_id: cancelled.id, blocker_id: root.id)]
        case "delete-changed-empty": model.dependencies.deletion?.edges = []; model.dependencies.deletion?.changed = true
        case "delete-loading": model.dependencies.deletion?.loading = true; model.dependencies.deletion?.fingerprint = nil
        case "delete-pending": model.dependencies.deletion?.pending = true
        case "delete-refused": model.dependencies.deletion?.failure = .project(try failure("has_dependencies", details: ["task_id": root.id, "dependencies": [["profile_id": "work", "dependent_id": root.id, "blocker_id": blocker.id]], "flag": "--with-dependencies"]), context: .delete)
        case "delete-conflict": model.dependencies.deletion?.changed = true; model.dependencies.deletion?.failure = .project(.init(message: "Agent copy", code: "occ_conflict", exitCode: 4, exitMeaning: "Conflict"), context: .delete)
        case "delete-offline": model.connection = .offline
        default: break
        }
        if ["initial", "initial-invalid", "follow-up"].contains(name) {
            model.quickAdd = true; model.newTitle = "Prepare the next launch update"; model.dependencies.initial = [cancelled, blocker]
            if name == "initial-invalid" {
                let failure = try failure("dependency_profile_mismatch", details: ["dependent_id": root.id, "blocker_id": blocker.id, "profile_id": "work"])
                model.serverErrors[.quickAdd] = failure
                model.quickAddError = failure.nativeMessage
            }
            if name == "follow-up" { model.dependencies.initial = model.tasks.filter { $0.status == "done" } }
        }
        if name == "series-initial" { model.beginEditing(root); model.dependencies.firstOccurrenceInitial = [cancelled, blocker] }
        if name.hasPrefix("batch") {
            let targets = (0..<30).map { DependencySnapshots.task("batch-\($0)", title: "Review Dependency \($0) with a long Task title") }
            model.dependencies.batch = .init(profile: "work", root: root, direction: .dependsOn, targets: targets, selected: Set(targets.map(\.id)), loading: false)
            if name != "batch-select-long" {
                model.dependencies.batch?.items = targets.prefix(3).enumerated().map { index, target in .init(action: "depend", dependent_id: root.id, blocker_id: target.id, from_version: 3 + index) }
                let error = try failure("too_many_dependencies", details: ["dependent_id": root.id, "count": 14, "limit": 13])
                model.dependencies.batch?.report = .init(dry_run: name != "batch-mixed", results: [.init(index: 0, result: .init(outcome: "added", to_version: 4, warnings: []), error: nil, exit_code: nil), .init(index: 1, result: .init(outcome: "unchanged", to_version: 4, warnings: []), error: nil, exit_code: nil), .init(index: 2, result: nil, error: name == "batch-conflict" ? .init(message: "Agent copy", code: "occ_conflict", exitCode: 4, exitMeaning: "Conflict") : error, exit_code: name == "batch-conflict" ? 4 : 2)])
            }
            if name == "batch-cancelled" { model.dependencies.batch = nil }
        }
        if name.hasPrefix("error") || name == "history-revert-refused" {
            let code = name == "error-blocked-complete" ? "blocked" : "blocks_done_task"
            let details: [String: Any] = code == "blocked" ? ["task_id": root.id, "blockers": [try wire(blocker), try wire(cancelled)]] : ["task_id": root.id, "done_dependents": [try wire(DependencySnapshots.task("done-dependent", title: "Approved launch", status: "done"))], "follow_up_depends_on": "done-dependent"]
            let failure = try failure(code, details: details)
            let context: DependencyActionContext = name == "error-blocked-complete" ? .complete : name == "error-reopen" ? .reopen : .revert
            model.beginEditing(root); model.serverErrors[.editor] = failure; model.dependencyErrorContexts[.editor] = context
            let notice = DependencyNotice.project(failure, context: context)
            model.editorError = [notice.message, notice.detail].compactMap { $0 }.joined(separator: "\n")
        }
        if name.hasPrefix("history") && name != "history-revert-refused" {
            model.beginEditing(root)
            model.showingHistory = true
            let kind = name == "history-added" ? "DependencyAdded" : name == "history-removed" ? "DependencyRemoved" : "TaskDeleted"
            var event: [String: Any] = ["entity_version": kind == "TaskDeleted" ? 2 : 1, "kind": kind, "occurred_at": "2026-11-10T00:00:00Z", "dependent_id": root.id, "blocker_id": blocker.id, "from_version": 2, "to_version": 3]
            if kind == "TaskDeleted" { event["dependencies"] = ["added": [], "removed": [["profile_id": "work", "dependent_id": root.id, "blocker_id": blocker.id]], "versions": []] }
            model.history = try JSONDecoder().decode([HistoryEntry].self, from: JSONSerialization.data(withJSONObject: [["seq": 1, "outcome": "committed", "event": event]]))
        }
        if name == "error-nested-import" {
            let nested = try failure("dependency_cycle", details: ["dependent_id": root.id, "blocker_id": blocker.id, "path": [blocker.id, root.id, blocker.id]])
            let payload: [String: Any] = ["code": "invalid_import_item", "message": "Outer agent copy must not appear", "exit_code": 2, "exit_meaning": "validation or usage", "details": ["dependency_error": try JSONSerialization.jsonObject(with: JSONEncoder().encode(nested))]]
            let outer = try JSONDecoder().decode(ServerFailure.self, from: JSONSerialization.data(withJSONObject: payload))
            model.importReport = .init(generated_at: "2026-11-10T00:00:00Z", dry_run: true, items: [.init(external_id: "dependency-import-1", outcome: "rejected", task_id: root.id, from_version: 3, changed_fields: [], error: outer)], totals: .init(created: 0, updated: 0, unchanged: 0, rejected: 1))
        }
        if name.hasPrefix("transfer") { model.transferResult = .init(kind: name == "transfer-move" ? .move : .copy, task: root, profileName: "Personal", removedDependencies: name == "transfer-move" ? [.init(profile_id: "work", dependent_id: root.id, blocker_id: blocker.id)] : []) }
        if name.hasPrefix("drag") {
            model.dependencies.dragSource = .init(profile: "work", task: blocker.id); model.dependencies.dropTarget = root.id
            model.dependencies.dropStatus = name == "drag-pending" ? "Updating Dependencies…" : name == "drag-already" ? "Already depends on" : name == "drag-self" ? "A Task can't depend on itself." : name == "drag-foreign" ? "Tasks must be in the same Profile." : name == "drag-refused" ? "This Dependency would create a loop." : "\(root.title) will depend on \(blocker.title)"
        }
    }
    static func content(_ name: String, model: TodoModel, compact: Bool) -> AnyView? {
        if name == "batch-cancelled" { return AnyView(TaskListView(model: model, compactMode: compact).taskContent) }
        if name.hasPrefix("batch") { return AnyView(DependencyBatchView(model: model, compact: compact)) }
        if ["initial", "initial-invalid", "follow-up"].contains(name) { return AnyView(QuickAddView(model: model, floating: false, compact: compact)) }
        if name == "series-initial" { return AnyView(SeriesView(model: model, compact: compact)) }
        if name == "error-nested-import" { return AnyView(ImportView(model: model, compact: compact)) }
        if name.hasPrefix("error") || name.hasPrefix("history") { return AnyView(EditorView(model: model, compact: compact)) }
        if let result = model.transferResult, name.hasPrefix("transfer") { return AnyView(VStack { TaskTransferResultView(model: model, result: result); Spacer() }.padding(16)) }
        return nil
    }
}
