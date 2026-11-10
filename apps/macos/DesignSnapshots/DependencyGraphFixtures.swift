import Foundation
@testable import TodoState

@MainActor enum DependencyGraphFixtures {
    static let names = ["loading", "singleton", "chain", "converging", "diverging", "mixed", "dag", "expanded", "all", "focused", "large", "energy", "ready-root", "terminal", "details", "offline", "deleted", "read-failure", "retry-success", "sse-preserved", "profile-reset", "auth-reset", "reset-focus"]
    static func model(_ name: String) -> TodoModel {
        let model = DependencyGraphSnapshots.fixture()
        if name == "loading" { model.dependencies.graph?.report = nil; model.dependencies.graph?.loading = true; return model }
        if name == "deleted" { model.dependencies.graph?.report = nil; model.dependencies.graph?.deleted = true; return model }
        if name == "read-failure" { model.dependencies.graph?.report = nil; model.dependencies.graph?.failure = .init(message: "Couldn't load Dependencies. Try again."); return model }
        if name == "profile-reset" || name == "auth-reset" {
            model.dependencies.reset()
            if name == "profile-reset" { model.profile = "personal" } else { model.signedIn = false }
            return model
        }
        let count = name == "large" ? 51 : name == "singleton" || name == "ready-root" || name == "terminal" ? 1 : name == "mixed" ? 5 : 4
        let rootIndex = name == "diverging" ? 0 : name == "mixed" ? 2 : count - 1
        let tasks = (0..<count).map { index in DependencySnapshots.task("g\(index)", title: name == "large" ? "Review long launch Task \(index) with a full accessible title and Project" : ["Agree on scope", "Review the copy", "Check the schedule", "Ship the release", "Send the update"][index], status: name == "terminal" ? "done" : "open", ready: index == 0, blocked: index > 0, energy: name == "energy" ? [2, nil, 1, 3][index] : 2) }
        var pairs: [(Int, Int)]
        let shape: String
        let orientation: String?
        switch name {
        case "converging": pairs = [(0, 3), (1, 3), (2, 3)]; shape = "tree"; orientation = "converging"
        case "diverging": pairs = [(0, 1), (0, 2), (0, 3)]; shape = "tree"; orientation = "diverging"
        case "mixed": pairs = [(0, 2), (1, 2), (2, 3), (2, 4)]; shape = "tree"; orientation = "mixed"
        case "dag", "energy": pairs = [(0, 1), (0, 2), (1, 3), (2, 3)]; shape = "dag"; orientation = nil
        default: pairs = count == 1 ? [] : (1..<count).map { ($0 - 1, $0) }; shape = count == 1 ? "single" : "chain"; orientation = nil
        }
        if name == "energy" { pairs = [(0, 3), (1, 3), (2, 3)] }
        let root = tasks[rootIndex]
        let nodes = tasks.enumerated().map { index, task in
            DependencyGraphReport.Node(mermaid_id: "n\(index)", task: task, in_degree: pairs.filter { $0.1 == index }.count, out_degree: pairs.filter { $0.0 == index }.count, ready: name != "terminal" && !pairs.contains { $0.1 == index }, blocked: name != "terminal" && pairs.contains { $0.1 == index }, depth: name == "converging" || name == "diverging" || name == "energy" ? (pairs.contains { $0.1 == index } ? 1 : 0) : name == "mixed" ? (index < 2 ? 0 : index == 2 ? 1 : 2) : name == "dag" ? (index == 3 ? 2 : index == 0 ? 0 : 1) : index, remaining_energy: .init(energy: name == "energy" ? [2, 0, 1, 6][index] : name == "converging" ? [2, 2, 2, 8][index] : name == "diverging" ? [2, 4, 4, 4][index] : name == "mixed" ? [2, 2, 6, 8, 8][index] : name == "dag" ? [2, 4, 4, 8][index] : name == "terminal" ? 0 : (index + 1) * 2, unweighted: name == "energy" && (index == 1 || index == 3) ? 1 : 0))
        }
        let edges = pairs.map { DependencyEdge(profile_id: "work", dependent_id: tasks[$0.1].id, blocker_id: tasks[$0.0].id) }
        let mermaid = "flowchart TD\n" + tasks.enumerated().map { "n\($0.offset)[\"\($0.element.title)\"]" }.joined(separator: "\n") + "\n" + pairs.map { "n\($0.0) --> n\($0.1)" }.joined(separator: "\n")
        let report = DependencyGraphReport(profile_id: "work", task_id: root.id, nodes: nodes, edges: edges, ancestors: name == "diverging" || count == 1 ? [] : Array(tasks.prefix(rootIndex)).map(\.id), descendants: rootIndex == count - 1 ? [] : tasks.suffix(from: rootIndex + 1).map(\.id), lightest_next: name == "terminal" ? [] : name == "energy" ? [tasks[2].id, tasks[0].id, tasks[1].id] : name == "converging" ? Array(tasks.prefix(3)).map(\.id) : name == "mixed" ? Array(tasks.prefix(2)).map(\.id) : [tasks[0].id], sources: name == "converging" || name == "mixed" ? Array(tasks.prefix(name == "mixed" ? 2 : 3)).map(\.id) : [tasks[0].id], sinks: name == "diverging" ? tasks.dropFirst().map(\.id) : name == "mixed" ? tasks.suffix(2).map(\.id) : [tasks[count - 1].id], topological_order: tasks.map(\.id), shape: name == "energy" ? "tree" : shape, orientation: name == "energy" ? "converging" : orientation, mermaid: mermaid)
        model.tasks = tasks
        model.dependencies.graph = .init(profile: "work", root: root.id, request: 1, selected: root.id, focused: root.id)
        model.dependencies.graph?.publish(report)
        if name == "expanded" { model.dependencies.graph?.expanded = [tasks[max(0, rootIndex - 1)].id] }
        if name == "all" || name == "focused" || name == "details" || name == "energy" { model.dependencies.graph?.overview = true }
        if name == "focused" { model.dependencies.graph?.selected = tasks[1].id; model.dependencies.graph?.focused = tasks[1].id }
        if name == "offline" { model.connection = .offline }
        if name == "sse-preserved" { model.dependencies.graph?.viewport = .init(x: 22, y: 15, scale: 0.7); model.dependencies.graph?.expanded = [tasks[1].id]; model.dependencies.graph?.publish(report) }
        return model
    }
}
