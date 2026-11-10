import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct DependencyDragSource: Codable, Equatable, Sendable {
    static let contentType = UTType(exportedAs: "local.todo.task-dependency")
    let profile: String
    let task: String
}

extension TodoModel {
    func dependencyDropText(source: DependencyDragSource, target: TaskSnapshot) -> String {
        guard source.profile == profile, target.profile_id == profile else { return "Tasks must be in the same Profile." }
        guard source.task != target.id else { return "A Task can't depend on itself." }
        if target.depends_on?.contains(source.task) == true { return "Already depends on" }
        let sourceTitle = tasks.first { $0.id == source.task }?.title ?? source.task
        return "\(target.title) will depend on \(sourceTitle)"
    }
    func commitDependencyDrop(_ source: DependencyDragSource, target: TaskSnapshot) async {
        guard canWrite, source.profile == profile, target.profile_id == profile, source.task != target.id,
              let blocker = tasks.first(where: { $0.id == source.task && $0.profile_id == profile }) else { return }
        if target.depends_on?.contains(source.task) == true { dependencies.dropStatus = "Already depends on"; return }
        dependencies.dropStatus = "Updating Dependencies…"
        await openDependencyPicker(target)
        guard dependencies.picker?.root.id == target.id, dependencies.picker?.profile == source.profile else { return }
        if dependencies.picker?.checked(blocker.id) == true { dependencies.dropStatus = "Already depends on"; return }
        await toggleDependency(blocker)
        dependencies.dropStatus = dependencies.picker?.failure?.message ?? dependencies.picker?.feedback
    }
}

struct DependencyDragModifier: ViewModifier {
    let model: TodoModel
    let task: TaskSnapshot
    func body(content: Content) -> some View {
        content
            .onDrag {
                guard model.canWrite else { return NSItemProvider() }
                let source = DependencyDragSource(profile: task.profile_id, task: task.id)
                model.dependencies.dragSource = source
                let provider = NSItemProvider()
                let data = try? JSONEncoder().encode(source)
                provider.registerDataRepresentation(forTypeIdentifier: DependencyDragSource.contentType.identifier, visibility: .ownProcess) { completion in
                    completion(data, nil)
                    return nil
                }
                return provider
            }
            .accessibilityIdentifier("dependency-drag-source-\(task.id)")
            .onDrop(of: [DependencyDragSource.contentType.identifier], isTargeted: Binding(get: { model.dependencies.dropTarget == task.id }, set: { targeted in
                if targeted, let source = model.dependencies.dragSource {
                    model.dependencies.dropTarget = task.id
                    model.dependencies.dropStatus = model.dependencyDropText(source: source, target: task)
                } else if model.dependencies.dropTarget == task.id { model.dependencies.dropTarget = nil }
            })) { providers in
                guard model.canWrite, let provider = providers.first, let expected = model.dependencies.dragSource else { return false }
                provider.loadDataRepresentation(forTypeIdentifier: DependencyDragSource.contentType.identifier) { data, _ in
                    guard let data, let source = try? JSONDecoder().decode(DependencyDragSource.self, from: data), source == expected else { return }
                    Task { @MainActor in await model.commitDependencyDrop(source, target: task) }
                }
                return true
            }
            .background { Color.clear.accessibilityIdentifier("dependency-drop-target-\(task.id)") }
    }
}
