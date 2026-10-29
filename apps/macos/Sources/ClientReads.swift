import Foundation

struct DiscoveryEntry: Decodable, Identifiable {
    let id: String
    let name: String
    let open_task_count: Int
    let inbox_task_count: Int?
    var visible_task_count: Int? = nil
}

struct PlanningResult: Decodable {
    let name: String
    let groups: [Group]
    struct Group: Decodable, Identifiable {
        let name: String
        let tasks: [TaskSnapshot]
        var id: String { name }
    }
}

struct ParsedTask: Codable {
    let title: String
    var due_at: TaskTime?
    var scheduled_at: TaskTime?
    var priority: String?
    var tags: [String]
    var project: String?

    func displayingTokens(in input: String) -> Self {
        var value = self
        let expression = try? NSRegularExpression(pattern: #"[#@](?:"[^"]*"|'[^']*')|"([^"]*)"|'([^']*)'|(\S+)"#)
        let range = NSRange(input.startIndex..., in: input)
        let hasPriority = expression?.matches(in: input, range: range).contains { match in
            guard let range = Range(match.range(at: 3), in: input) else { return false }
            return ["p1", "p2", "p3", "p4"].contains(input[range].lowercased())
        } ?? false
        if !hasPriority { value.priority = nil }
        return value
    }

    func removing(_ fields: Set<String>) -> Self {
        var value = self
        if fields.contains("priority") { value.priority = nil }
        if fields.contains("due") { value.due_at = nil }
        if fields.contains("scheduled") { value.scheduled_at = nil }
        if fields.contains("project") { value.project = nil }
        value.tags.removeAll { fields.contains("tag:\($0)") }
        return value
    }
}

struct HistoryEntry: Decodable, Identifiable {
    let seq: Int64
    let outcome: String
    let reason: String?
    let event: Event
    var id: Int64 { seq }
    func canRevert(in entries: [Self]) -> Bool {
        guard outcome == "committed", ["AttachmentAdded", "AttachmentRemoved", "TaskEdited", "TaskCompleted", "TaskCancelled", "TaskReopened", "TaskMovedIn", "TaskDeleted", "TaskReverted"].contains(event.kind) else { return false }
        return !entries.contains { $0.outcome == "committed" && $0.event.originalSequence == seq }
    }
    var label: String {
        if ["TaskMovedIn", "TaskMovedOut"].contains(event.kind), event.originalSequence != nil { return "Reverted" }
        let kind = event.attemptedKind ?? event.originalKind ?? event.kind
        switch kind {
        case "TaskCreated": return event.copiedFrom.map { "Copied from \($0.profile_name) / \($0.source_task_id)" } ?? "Created"
        case "TaskEdited": return "Edited"
        case "AttachmentAdded": return "Attachment added"
        case "AttachmentRemoved": return "Attachment removed"
        case "TaskCompleted": return "Completed"
        case "TaskCancelled": return "Cancelled"
        case "TaskReopened": return "Reopened"
        case "TaskMovedIn", "TaskMovedOut": return "Moved"
        case "TaskDeleted": return "Deleted"
        case "TaskPurged": return "Purged"
        case "TaskReverted": return "Reverted"
        case "ReminderFired": return "Reminder"
        default: return "Change attempted"
        }
    }
    var rejectionReason: String {
        switch reason {
        case "conflict": return "The task changed before this attempt was saved."
        case "validation": return "Some values were not valid for this change."
        case "auth": return "This attempt did not have permission to change the task."
        case "profile_mismatch": return "The task belongs to another Profile."
        case "task_purged": return "The task's content was erased by Purge."
        case "invalid_revert": return "This change cannot be reverted."
        case "not_found": return "The task was no longer available."
        default: return "This attempt could not be saved."
        }
    }
    var occurredAt: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions.insert(.withFractionalSeconds)
        return formatter.date(from: event.occurred_at) ?? ISO8601DateFormatter().date(from: event.occurred_at)
    }
    func relativeTime(now: Date, locale: Locale = .current) -> String {
        guard let occurredAt else { return "Time unavailable" }
        if abs(occurredAt.timeIntervalSince(now)) < 60 { return "Just now" }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .full
        formatter.dateTimeStyle = .numeric
        return formatter.localizedString(for: occurredAt, relativeTo: now)
    }
    func localTime(locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        guard let occurredAt else { return "Time unavailable" }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateStyle = .full
        formatter.timeStyle = .long
        return formatter.string(from: occurredAt)
    }
    struct FieldChange: Equatable { let field: String; let before: String; let after: String }
    var fieldChanges: [FieldChange] {
        guard let edit = event.edit else { return [] }
        var result: [FieldChange] = []
        func add(_ field: String, _ before: String, _ after: String) {
            if before != after { result.append(.init(field: field, before: before, after: after)) }
        }
        let before = edit.before
        let after = edit.after
        add("Title", before.title, after.title)
        func textValue(_ value: String?) -> String { value.map { "\"\($0)\"" } ?? "None" }
        if before.description != after.description { result.append(.init(field: "Description", before: textValue(before.description), after: textValue(after.description))) }
        add("Priority", before.priority, after.priority)
        add("Source", before.source ?? "None", after.source ?? "None")
        if before.project_id != after.project_id { result.append(.init(field: "Project", before: textValue(edit.project_before?.name), after: textValue(edit.project_after?.name))) }
        if before.tags.sorted() != after.tags.sorted() {
            func tagValue(_ tags: [NamedValue]) -> String { tags.isEmpty ? "None" : tags.map { textValue($0.name) }.sorted().joined(separator: ", ") }
            result.append(.init(field: "Tags", before: tagValue(edit.tags_before), after: tagValue(edit.tags_after)))
        }
        for (field, old, new) in [("Due", before.due_at, after.due_at), ("Scheduled", before.scheduled_at, after.scheduled_at)] where old != new {
            result.append(.init(field: field, before: Self.timeValue(old), after: Self.timeValue(new)))
        }
        add("Energy", before.energy.map(String.init) ?? "None", after.energy.map(String.init) ?? "None")
        add("Estimate", before.estimate_min.map { "\($0) min" } ?? "None", after.estimate_min.map { "\($0) min" } ?? "None")
        let beforeRecurrence = edit.series_before?.deleted_at == nil ? edit.series_before?.recurrence : nil
        let afterRecurrence = edit.series_after?.deleted_at == nil ? edit.series_after?.recurrence : nil
        if beforeRecurrence != afterRecurrence {
            func recurrenceValue(_ value: Recurrence?) -> String {
                guard let recurrence = value else { return "None" }
                return recurrence.rrule + "; starts " + Self.timeValue(recurrence.dtstart) + (recurrence.exdate.isEmpty ? "" : "; excludes " + recurrence.exdate.map { Self.timeValue($0) }.joined(separator: ", "))
            }
            result.append(.init(field: "Recurrence", before: recurrenceValue(beforeRecurrence), after: recurrenceValue(afterRecurrence)))
        }
        return result
    }
    private static func timeValue(_ time: TaskTime?) -> String {
        guard let time else { return "None" }
        if time.kind == "date" { return time.display }
        guard let instant = time.instant else { return "Time unavailable" }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .long
        return formatter.string(from: instant) + (time.time_zone.map { " · \($0)" } ?? "")
    }
    struct Event: Decodable {
        let kind: String
        let occurred_at: String
        struct CopySource: Decodable { let profile_name: String; let source_task_id: String }
        var copiedFrom: CopySource?
        var originalKind: String?
        var attemptedKind: String?
        var originalSequence: Int64?
        var edit: Edit?
        var seriesChanges: [SeriesChange] = []
        var relatedTasks: [TaskSnapshot] = []
        var redactedTaskIDs: [String] = []

        init(kind: String, occurred_at: String) { self.kind = kind; self.occurred_at = occurred_at }
        private enum CodingKeys: String, CodingKey {
            case copied_from, kind, occurred_at, original_kind, attempted_kind, original_seq, series, series_before, series_after, task, before, after, next_occurrences, tasks, replay, task_ids
        }
        init(from decoder: any Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            kind = try values.decode(String.self, forKey: .kind)
            occurred_at = try values.decode(String.self, forKey: .occurred_at)
            copiedFrom = try values.decodeIfPresent(CopySource.self, forKey: .copied_from)
            originalKind = try values.decodeIfPresent(String.self, forKey: .original_kind)
            attemptedKind = try values.decodeIfPresent(String.self, forKey: .attempted_kind)
            originalSequence = try values.decodeIfPresent(Int64.self, forKey: .original_seq)
            switch kind {
            case "TaskCreated":
                seriesChanges = [SeriesChange(before: nil, after: try values.decodeIfPresent(SeriesDefinition.self, forKey: .series))]
            case "TaskEdited":
                edit = try Edit(from: decoder)
                seriesChanges = [SeriesChange(before: try values.decodeIfPresent(SeriesDefinition.self, forKey: .series_before), after: try values.decodeIfPresent(SeriesDefinition.self, forKey: .series_after))]
            case "TaskHistoryRedacted":
                let replay = try values.decode(RedactedReplay.self, forKey: .replay)
                seriesChanges = replay.series
                relatedTasks = replay.tasks.flatMap { [$0.before, $0.after].compactMap { $0 } }
                redactedTaskIDs = try values.decode([String].self, forKey: .task_ids)
            case "TaskReverted":
                seriesChanges = try values.decodeIfPresent([SeriesChange].self, forKey: .series) ?? []
                let changes = try values.decodeIfPresent([TaskChange].self, forKey: .tasks) ?? []
                relatedTasks = changes.flatMap { [$0.before, $0.after].compactMap { $0 } }
            default: break
            }
            for key in [CodingKeys.task, .before, .after] {
                if let task = try values.decodeIfPresent(TaskSnapshot.self, forKey: key) { relatedTasks.append(task) }
            }
            relatedTasks += try values.decodeIfPresent([TaskSnapshot].self, forKey: .next_occurrences) ?? []
        }
    }
    struct NamedValue: Decodable { let name: String }
    struct Edit: Decodable {
        let before: TaskSnapshot
        let after: TaskSnapshot
        let project_before: NamedValue?
        let project_after: NamedValue?
        let tags_before: [NamedValue]
        let tags_after: [NamedValue]
        let series_before: SeriesDefinition?
        let series_after: SeriesDefinition?
    }
    struct SeriesChange: Decodable { let before: SeriesDefinition?; let after: SeriesDefinition? }
    struct TaskChange: Decodable { let before: TaskSnapshot?; let after: TaskSnapshot? }
    struct RedactedReplay: Decodable { let tasks: [TaskChange]; let series: [SeriesChange] }

    static func series(for task: TaskSnapshot, entries: [Self]) -> SeriesDefinition? {
        guard let key = task.seriesKey else { return nil }
        var definitions: [String: SeriesDefinition] = [:]
        for entry in entries.sorted(by: { $0.seq < $1.seq }) where entry.outcome == "committed" {
            for change in entry.event.seriesChanges {
                if let after = change.after { definitions[after.id] = after }
                else if let before = change.before { definitions[before.id] = nil }
            }
        }
        return definitions[key].flatMap { $0.profile_id == task.profile_id ? $0 : nil }
    }
}

struct OwnerSnapshot: Codable, Identifiable {
    let id: String
    let created_at: String
    let schema_version: Int
    let seq: Int
    let size: Int
    let reason: String
    let sha256: String
    let path: String
    let task_counts: [SnapshotTaskCount]
    var timeDescription: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: created_at) ?? ISO8601DateFormatter().date(from: created_at)
        return date?.formatted(date: .abbreviated, time: .shortened) ?? created_at
    }
    var sizeDescription: String { ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file) }
}
struct SnapshotTaskCount: Codable { let profile: String; let name: String; let count: Int }
struct SnapshotCatalog: Decodable { let snapshots: [OwnerSnapshot] }
struct SnapshotReload: Decodable { let generation: String; let seq: Int }
struct SnapshotRestorePreview: Decodable {
    let id: String
    let dry_run: Bool
    let seq_before: Int
    let seq_after: Int
    let seq_delta: Int
    let generation: String
    let task_counts: [ProfileChange]
    struct ProfileChange: Decodable { let profile: String; let name: String; let before: Int; let after: Int }
}

enum TaskCount {
    static func text(_ count: Int, capitalized: Bool = false) -> String {
        let noun = capitalized ? "Task" : "task"
        return "\(count) \(noun)\(count == 1 ? "" : "s")"
    }
}

enum SnapshotPresentation {
    static func profileName(_ name: String) -> String { name.prefix(1).uppercased() + String(name.dropFirst()) }
    static func tasks(_ count: Int) -> String { TaskCount.text(count, capitalized: true) }
    static func reason(_ value: String) -> String {
        switch value {
        case "manual": return "Manual"
        case "daily": return "Daily"
        case "pre-restore": return "Before restore"
        case "pre-migration": return "Before update"
        case "pre-purge": return "Before Purge"
        default:
            let deletion = "before Profile delete "
            if value.hasPrefix(deletion) { return "Before deleting Profile \"\(profileName(String(value.dropFirst(deletion.count))))\"" }
            let imported = "before import "
            if value.hasPrefix(imported) { return "Before import of \(value.dropFirst(imported.count))" }
            return profileName(value)
        }
    }
}
