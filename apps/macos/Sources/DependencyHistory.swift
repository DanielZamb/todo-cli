import SwiftUI

struct DependencyHistoryView: View {
    let model: TodoModel
    let entry: HistoryEntry
    var body: some View {
        if let delta = entry.event.dependencyDelta {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(delta.lines(profile: model.profile)) { line in
                    Text("\(line.prefix): \(title(line.edge.blocker_id)) blocks \(title(line.edge.dependent_id))").textSelection(.enabled)
                }
            }.font(.caption)
        }
    }
    private func title(_ id: String) -> String {
        entry.event.relatedTasks.first { $0.id == id }?.title ?? model.tasks.first { $0.id == id }?.title ?? id
    }
}
