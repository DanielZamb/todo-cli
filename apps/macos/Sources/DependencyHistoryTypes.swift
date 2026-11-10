import Foundation

struct DependencyVersionChange: Decodable {
    let id: String
    let from_version: Int
    let to_version: Int
    let updated_at: String
}
struct DependencyChanges: Decodable {
    let added: [DependencyEdge]
    let removed: [DependencyEdge]
    let versions: [DependencyVersionChange]
}
enum DependencyHistoryDelta {
    case edge(added: Bool, dependent: String, blocker: String, fromVersion: Int, toVersion: Int)
    case lifecycle(DependencyChanges)
    struct Line: Identifiable { let id: String; let prefix: String; let edge: DependencyEdge }
    func lines(profile: String) -> [Line] {
        switch self {
        case .edge(let added, let dependent, let blocker, _, _):
            return [.init(id: "edge", prefix: added ? "Added" : "Removed", edge: .init(profile_id: profile, dependent_id: dependent, blocker_id: blocker))]
        case .lifecycle(let changes):
            return changes.added.enumerated().map { .init(id: "added-\($0.offset)", prefix: "Added", edge: $0.element) } + changes.removed.enumerated().map { .init(id: "removed-\($0.offset)", prefix: "Removed", edge: $0.element) }
        }
    }
}
