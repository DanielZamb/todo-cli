import Foundation

struct DependencyGraphIdentity: Codable, Equatable, Sendable {
    let profile: String
    let root: String
    let credentialEpoch: Int
    let request: Int
}

struct DependencyViewport: Codable, Equatable, Sendable {
    var x = 0.0
    var y = 0.0
    var scale = 1.0
    var isValid: Bool { x.isFinite && y.isFinite && scale.isFinite && scale > 0 }
}

struct DependencyGraphRender: Encodable {
    let v = 1
    let type = "render"
    let identity: DependencyGraphIdentity
    let root_id: String
    enum NodeState: String, Encodable { case ready, blocked, done, cancelled }
    struct Node: Encodable {
        let mermaid_id: String
        let task_id: String
        var title: String? = nil
        var state: NodeState? = nil
    }
    struct Theme: Encodable { let mode: String; let tokens: [String: String] }
    let nodes: [Node]
    let mermaid: String
    let visible_ids: [String]
    let viewport: DependencyViewport?
    let selected_id: String?
    let focused_id: String?
    let theme: Theme
    let reduced_motion: Bool

    enum CodingKeys: String, CodingKey { case v, type, identity, root_id, nodes, mermaid, visible_ids, viewport, selected_id, focused_id, theme, reduced_motion }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(v, forKey: .v)
        try values.encode(type, forKey: .type)
        try values.encode(identity, forKey: .identity)
        try values.encode(root_id, forKey: .root_id)
        try values.encode(nodes, forKey: .nodes)
        try values.encode(mermaid, forKey: .mermaid)
        try values.encode(visible_ids, forKey: .visible_ids)
        try values.encodeIfPresent(viewport, forKey: .viewport)
        try values.encode(selected_id, forKey: .selected_id)
        try values.encode(focused_id, forKey: .focused_id)
        try values.encode(theme, forKey: .theme)
        try values.encode(reduced_motion, forKey: .reduced_motion)
    }
}

struct DependencyGraphReply: Decodable, Equatable {
    enum Event: Equatable {
        case ready, rendered(Int), renderError(String), activate(String), context(String), focus(String?), expand(String), viewport(DependencyViewport)
    }
    let identity: DependencyGraphIdentity
    let event: Event
    enum CodingKeys: String, CodingKey { case v, type, identity, node_count, message, task_id, x, y, scale }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        guard try values.decode(Int.self, forKey: .v) == 1 else { throw ProtocolError.incompatible }
        identity = try values.decode(DependencyGraphIdentity.self, forKey: .identity)
        switch try values.decode(String.self, forKey: .type) {
        case "ready": event = .ready
        case "rendered":
            let count = try values.decode(Int.self, forKey: .node_count)
            guard count >= 0 else { throw ProtocolError.incompatible }
            event = .rendered(count)
        case "renderError": event = .renderError(try values.decode(String.self, forKey: .message))
        case "activate": event = .activate(try values.decode(String.self, forKey: .task_id))
        case "context": event = .context(try values.decode(String.self, forKey: .task_id))
        case "focus":
            guard values.contains(.task_id) else { throw ProtocolError.incompatible }
            event = .focus(try values.decodeIfPresent(String.self, forKey: .task_id))
        case "expand": event = .expand(try values.decode(String.self, forKey: .task_id))
        case "viewport":
            let viewport = try DependencyViewport(x: values.decode(Double.self, forKey: .x), y: values.decode(Double.self, forKey: .y), scale: values.decode(Double.self, forKey: .scale))
            guard viewport.isValid else { throw ProtocolError.incompatible }
            event = .viewport(viewport)
        default: throw ProtocolError.incompatible
        }
    }
    func isCurrent(_ current: DependencyGraphIdentity, knownIDs: Set<String>) -> Bool {
        guard identity == current else { return false }
        switch event {
        case .activate(let id), .context(let id), .expand(let id): return knownIDs.contains(id)
        case .focus(let id): return id.map(knownIDs.contains) ?? true
        default: return true
        }
    }
    enum ProtocolError: Error { case incompatible }
}
