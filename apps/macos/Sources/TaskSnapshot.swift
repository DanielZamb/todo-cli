import Foundation

struct TaskSnapshot: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let profile_id: String
    let row_version: Int
    var external_id: String? = nil
    let title: String
    let description: String?
    let priority: String
    let source: String?
    let status: String
    let project_id: String?
    let tags: [String]
    let due_at: TaskTime?
    let scheduled_at: TaskTime?
    let energy: Int?
    let estimate_min: Int?
    let occurrence: OccurrenceOrigin?
    let legacy_series_detached: Bool?
    let deleted_at: String?
    var attachments: [AttachmentSnapshot]? = nil
    var jiraAttachment: AttachmentSnapshot? { attachments?.first { $0.label?.lowercased() == "jira" } }

    struct OccurrenceOrigin: Codable, Equatable, Sendable {
        let series_id: String
    }
    var seriesKey: String? { occurrence?.series_id ?? (legacy_series_detached == true ? nil : "legacy-series:\(id)") }

    func tagNames(from definitions: [DiscoveryEntry]) -> [String] {
        tags.map { id in definitions.first { $0.id == id }?.name ?? id }
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    static func decode<T: Encodable>(_ value: T) throws -> Self {
        try JSONDecoder().decode(Self.self, from: JSONEncoder().encode(value))
    }
}

struct TaskTime: Codable, Equatable, Sendable {
    let kind: String
    var date: String?
    var utc: String?
    var time_zone: String?

    var instant: Date? {
        guard let utc else { return nil }
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: utc) { return date }
        formatter.formatOptions.insert(.withFractionalSeconds)
        return formatter.date(from: utc)
    }

    var display: String {
        if kind == "date", let date {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            guard let parsed = formatter.date(from: date) else { return date }
            formatter.dateFormat = "MMM d, yyyy"
            return formatter.string(from: parsed)
        }
        guard let parsed = instant else { return "" }
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("MMM d, yyyy j:mm")
        formatter.timeZone = time_zone.flatMap(TimeZone.init(identifier:)) ?? .current
        let suffix = time_zone == TimeZone.current.identifier ? "" : time_zone.map { " · \($0)" } ?? ""
        return formatter.string(from: parsed) + suffix
    }
}

enum MetadataKind: String, Identifiable {
    case project = "Project"
    case tag = "Tag"
    var id: String { rawValue }
}

struct TaskDraft: Identifiable {
    let id: String
    var base: TaskSnapshot
    var title: String
    var description: String
    var priority: String
    var project: String?
    var projectName: String?
    var tagNames: [String] = []
    var tags: [String]
    var due: TaskTime?
    var scheduled: TaskTime?
    var energy: Int?
    var estimate: Int?

    init(_ task: TaskSnapshot) {
        id = task.id
        base = task
        title = task.title
        description = task.description ?? ""
        priority = task.priority
        project = task.project_id
        tags = task.tags
        due = task.due_at
        scheduled = task.scheduled_at
        energy = task.energy
        estimate = task.estimate_min
    }

    mutating func addMetadata(_ kind: MetadataKind, name: String, projects: [DiscoveryEntry], tags definitions: [DiscoveryEntry]) {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        switch kind {
        case .project:
            project = projects.first { $0.name == name }?.id
            projectName = project == nil ? name : nil
        case .tag:
            let name = name.lowercased()
            if let existing = definitions.first(where: { $0.name == name }) {
                if !tags.contains(existing.id) { tags.append(existing.id) }
            } else if !tagNames.contains(name) { tagNames.append(name) }
        }
    }
}

struct TaskConflict {
    var latest: TaskSnapshot?
    var choices: [String: Bool] = [:]
}

struct ClientConfiguration {
    let server: URL
    let initialProfile: String
    let vaultService: String
    var appearance: String? = nil

    static func load(arguments: [String] = CommandLine.arguments) -> Self {
        let overrides = arguments.indices.filter { arguments[$0] == "--server" || arguments[$0].hasPrefix("--server=") }
        let override: URL?
        if let index = overrides.first {
            guard overrides.count == 1, arguments[index] == "--server", arguments.indices.contains(index + 1),
                  let server = serverURL(arguments[index + 1]) else {
                fatalError("--server requires one absolute HTTP or HTTPS URL")
            }
            override = server
        } else { override = nil }
        func argument(_ name: String) -> String? {
            guard let index = arguments.firstIndex(of: name), arguments.indices.contains(index + 1) else { return nil }
            return arguments[index + 1]
        }
        if let path = ProcessInfo.processInfo.environment["TODO_MACOS_CONFIG"] {
            guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
                  let values = try? JSONDecoder().decode([String: String].self, from: data),
                  let address = values["server"], let server = serverURL(address),
                  let service = values["keychainService"], !service.isEmpty else {
                fatalError("TODO_MACOS_CONFIG must name a valid client configuration")
            }
            return Self(server: server, initialProfile: values["profile"] ?? "work", vaultService: service, appearance: values["appearance"] ?? argument("-AppleInterfaceStyle"))
        }
        return Self(
            server: override ?? URL(string: "http://127.0.0.1:4310")!,
            initialProfile: argument("--profile") ?? UserDefaults.standard.string(forKey: "profile") ?? "default",
            vaultService: argument("--keychain-service") ?? "local.todo.session",
            appearance: argument("-AppleInterfaceStyle")
        )
    }

    private static func serverURL(_ address: String) -> URL? {
        guard address.rangeOfCharacter(from: .whitespacesAndNewlines.union(.controlCharacters)) == nil,
              let url = URL(string: address, encodingInvalidCharacters: false),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = components.host, !host.isEmpty,
              components.user == nil, components.password == nil,
              components.port.map({ (1...65535).contains($0) }) ?? true else { return nil }
        let authority = address.dropFirst(scheme.count + 3).prefix { !"/?#".contains($0) }
        guard !authority.hasSuffix(":") else { return nil }
        return url
    }
}
