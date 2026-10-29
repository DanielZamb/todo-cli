import Foundation

extension TaskDraft {
    var changedFields: [String] {
        Self.fields.filter { !sameValue($0, as: Self(base)) }
    }

    static let fields = ["title", "description", "priority", "due_at", "scheduled_at", "energy", "estimate_min", "project_id", "tags"]

    func sameValue(_ field: String, as other: Self) -> Bool {
        switch field {
        case "title": title == other.title
        case "description": description == other.description
        case "priority": priority == other.priority
        case "due_at": due == other.due
        case "scheduled_at": scheduled == other.scheduled
        case "project_id": project == other.project && projectName == other.projectName
        case "tags": tags == other.tags && tagNames == other.tagNames
        case "energy": energy == other.energy
        case "estimate_min": estimate == other.estimate
        default: true
        }
    }

    func value(_ field: String, projects: [String: String] = [:], tags tagLabels: [String: String] = [:]) -> String {
        switch field {
        case "title": title
        case "description": description
        case "priority": priority
        case "due_at": due?.display ?? "None"
        case "scheduled_at": scheduled?.display ?? "None"
        case "project_id": projectName ?? project.map { projects[$0] ?? $0 } ?? "None"
        case "tags": (tags.map { tagLabels[$0] ?? $0 } + tagNames).joined(separator: ", ")
        case "energy": energy.map(String.init) ?? "None"
        case "estimate_min": estimate.map(String.init) ?? "None"
        default: ""
        }
    }

    func overlaps(with latest: TaskSnapshot) -> [String] {
        let current = Self(latest)
        let original = Self(base)
        return changedFields.filter { !current.sameValue($0, as: original) && !current.sameValue($0, as: self) }
    }

    func merging(_ latest: TaskSnapshot, choices: [String: Bool]) -> Self {
        var merged = Self(latest)
        for field in changedFields where choices[field] != false {
            switch field {
            case "title": merged.title = title
            case "description": merged.description = description
            case "priority": merged.priority = priority
            case "due_at": merged.due = due
            case "scheduled_at": merged.scheduled = scheduled
            case "project_id": merged.project = project; merged.projectName = projectName
            case "tags": merged.tags = tags; merged.tagNames = tagNames
            case "energy": merged.energy = energy
            case "estimate_min": merged.estimate = estimate
            default: break
            }
        }
        return merged
    }

    func changesData() throws -> Data {
        try JSONSerialization.data(withJSONObject: ["from_version": base.row_version, "changes": fieldValues(changedFields)])
    }

    func seriesData(_ recurrence: Recurrence) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["from_version": base.row_version, "changes": fieldValues(changedFields), "recurrence": JSONSerialization.jsonObject(with: JSONEncoder().encode(recurrence))])
    }

    func newSeriesData(_ recurrence: Recurrence) throws -> Data {
        var fields = try fieldValues(Self.fields)
        fields["source"] = "manual"
        return try JSONSerialization.data(withJSONObject: ["task": fields, "recurrence": JSONSerialization.jsonObject(with: JSONEncoder().encode(recurrence))])
    }

    private func fieldValues(_ fields: [String]) throws -> [String: Any] {
        var changes: [String: Any] = [:]
        let encoder = JSONEncoder()
        for field in fields {
            switch field {
            case "title": changes[field] = title
            case "description": changes[field] = description.isEmpty ? NSNull() : description as Any
            case "priority": changes[field] = priority
            case "due_at": changes[field] = try due.map { try JSONSerialization.jsonObject(with: encoder.encode($0)) } ?? NSNull()
            case "scheduled_at": changes[field] = try scheduled.map { try JSONSerialization.jsonObject(with: encoder.encode($0)) } ?? NSNull()
            case "project_id":
                if let projectName { changes["project_name"] = projectName }
                else { changes[field] = project.map { $0 as Any } ?? NSNull() }
            case "tags":
                changes[field] = tags
                if !tagNames.isEmpty { changes["tag_names"] = tagNames }
            case "energy": changes[field] = energy.map { $0 as Any } ?? NSNull()
            case "estimate_min": changes[field] = estimate.map { $0 as Any } ?? NSNull()
            default: break
            }
        }
        return changes
    }
}
