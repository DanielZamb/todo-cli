import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct DependencyDragSource: Codable, Equatable, Sendable {
    static let contentType = UTType(exportedAs: "local.todo.task-dependency")
    let profile: String
    let task: String
}

/// Where a row drop was made (MAC-C1-S1-30, the S1-24 rule): the Session, the Profile, the dragged
/// Task and the row it was dropped on, captured when the person drops. The drop writes only while
/// all of them are still current, so data that arrives after a credential change, a Profile switch
/// or a sign-out and new sign-in starts nothing.
struct DependencyDropOrigin: Equatable {
    let credentialEpoch: Int
    let profile: String
    let source: DependencyDragSource
    let targetID: String
}

struct DependencyDropStatus {
    let text: String
    let accessibilityValue: String
    init(_ text: String, accessibilityValue: String? = nil) {
        self.text = text
        self.accessibilityValue = accessibilityValue ?? text
    }
}

extension TodoModel {
    func dependencyDropStatus(source: DependencyDragSource, target: TaskSnapshot) -> DependencyDropStatus {
        guard source.profile == profile, target.profile_id == profile else { return .init("Tasks must be in the same Profile.") }
        guard source.task != target.id else { return .init("A Task can't depend on itself.") }
        let sourceTitle = tasks.first { $0.id == source.task }?.title ?? source.task
        if target.depends_on?.contains(source.task) == true { return .init("Already depends on \(sourceTitle)", accessibilityValue: "\(target.title) already depends on \(sourceTitle)") }
        return .init("Will depend on \(sourceTitle)", accessibilityValue: "\(target.title) will depend on \(sourceTitle)")
    }
    /// The origin of a drop on `target` made now.
    func dependencyDropOrigin(source: DependencyDragSource, target: TaskSnapshot) -> DependencyDropOrigin {
        DependencyDropOrigin(credentialEpoch: discovery.credentialEpoch, profile: profile, source: source, targetID: target.id)
    }
    func isCurrentDependencyDrop(_ origin: DependencyDropOrigin) -> Bool {
        isCurrentEpoch(origin.credentialEpoch) && profile == origin.profile && origin.source.profile == profile
    }
    /// A row drop (MAC-C1-S1-30): the provider's data arrives after an await, so the drop is
    /// written only if it is the dragged source and its origin is still current.
    func receiveDependencyDrop(_ provider: NSItemProvider, origin: DependencyDropOrigin, target: TaskSnapshot) async {
        guard let data = try? await Self.providerData(provider, type: DependencyDragSource.contentType.identifier),
              let source = try? JSONDecoder().decode(DependencyDragSource.self, from: data), source == origin.source,
              target.id == origin.targetID, isCurrentDependencyDrop(origin) else { return }
        await commitDependencyDrop(source, target: target, origin: origin)
    }
    func commitDependencyDrop(_ source: DependencyDragSource, target: TaskSnapshot, origin: DependencyDropOrigin? = nil) async {
        let origin = origin ?? dependencyDropOrigin(source: source, target: target)
        guard canWrite, isCurrentDependencyDrop(origin), source.profile == profile, target.profile_id == profile, source.task != target.id,
              let blocker = tasks.first(where: { $0.id == source.task && $0.profile_id == profile }) else { return }
        if target.depends_on?.contains(source.task) == true { dependencies.dropStatus = dependencyDropStatus(source: source, target: target); return }
        dependencies.dropStatus = .init("Updating Dependencies…")
        await openDependencyPicker(target)
        // The picker opened after an await: the origin is checked again, with no await between this
        // check and the write's own credential capture in toggleDependency.
        guard isCurrentDependencyDrop(origin), dependencies.picker?.root.id == target.id, dependencies.picker?.profile == source.profile else { return }
        if dependencies.picker?.checked(blocker.id) == true {
            dependencies.dropStatus = .init("Already depends on \(blocker.title)", accessibilityValue: "\(target.title) already depends on \(blocker.title)")
            return
        }
        await toggleDependency(blocker)
        dependencies.dropStatus = (dependencies.picker?.failure?.message ?? dependencies.picker?.feedback).map { .init($0) }
    }
}

struct DependencyDragModifier: ViewModifier {
    let model: TodoModel
    let task: TaskSnapshot
    func body(content: Content) -> some View {
        content
            .itemProvider {
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
                    model.dependencies.dropStatus = model.dependencyDropStatus(source: source, target: task)
                } else if model.dependencies.dropTarget == task.id { model.dependencies.dropTarget = nil }
            })) { providers in
                guard model.canWrite, let provider = providers.first, let expected = model.dependencies.dragSource else { return false }
                // The origin is captured at the drop, before the provider's data arrives (S1-30).
                let origin = model.dependencyDropOrigin(source: expected, target: task)
                Task { @MainActor in await model.receiveDependencyDrop(provider, origin: origin, target: task) }
                return true
            }
            .background { Color.clear.accessibilityIdentifier("dependency-drop-target-\(task.id)") }
    }
}
