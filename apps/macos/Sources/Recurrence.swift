import Foundation

struct Recurrence: Codable, Equatable {
    var dtstart: TaskTime
    var rrule: String
    var exdate: [TaskTime]
}

struct SeriesDefinition: Decodable {
    let id: String
    let profile_id: String
    let recurrence: Recurrence
    let deleted_at: String?
}

enum RecurrencePreset: String, CaseIterable {
    case daily = "Daily", weekdays = "Weekdays", weekly = "Weekly on chosen days"
    case monthlyDate = "Monthly by date", monthlyPosition = "Monthly by position", custom = "Custom rule"
}

enum Weekday: String, CaseIterable {
    case mon = "MO", tue = "TU", wed = "WE", thu = "TH", fri = "FR", sat = "SA", sun = "SU"
    var title: String {
        switch self {
        case .mon: "Mon"
        case .tue: "Tue"
        case .wed: "Wed"
        case .thu: "Thu"
        case .fri: "Fri"
        case .sat: "Sat"
        case .sun: "Sun"
        }
    }
}

struct RecurrenceDraft {
    var preset = RecurrencePreset.daily
    var days: Set<Weekday> = [.mon]
    var day = 1
    var position = 1
    var weekday = Weekday.mon

    init(rule: String = "FREQ=DAILY") {
        if rule == "FREQ=DAILY" { return }
        if rule == "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" { preset = .weekdays; return }
        if rule.hasPrefix("FREQ=WEEKLY;BYDAY=") {
            let values = rule.dropFirst("FREQ=WEEKLY;BYDAY=".count).split(separator: ",").map(String.init)
            let parsed = values.compactMap(Weekday.init(rawValue:))
            if !parsed.isEmpty, parsed.count == values.count { preset = .weekly; days = Set(parsed); return }
        }
        if rule.hasPrefix("FREQ=MONTHLY;BYMONTHDAY="), let value = Int(rule.dropFirst("FREQ=MONTHLY;BYMONTHDAY=".count)), (1...31).contains(value) {
            preset = .monthlyDate; day = value; return
        }
        if rule.hasPrefix("FREQ=MONTHLY;BYDAY="), let value = Int(rule.dropFirst("FREQ=MONTHLY;BYDAY=".count).dropLast(2)), [-1, 1, 2, 3, 4].contains(value), let day = Weekday(rawValue: String(rule.suffix(2))) {
            preset = .monthlyPosition; position = value; weekday = day; return
        }
        preset = .custom
    }

    var rule: String {
        switch preset {
        case .daily: "FREQ=DAILY"
        case .weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
        case .weekly: "FREQ=WEEKLY;BYDAY=" + Weekday.allCases.filter { days.contains($0) }.map(\.rawValue).joined(separator: ",")
        case .monthlyDate: "FREQ=MONTHLY;BYMONTHDAY=\(day)"
        case .monthlyPosition: "FREQ=MONTHLY;BYDAY=\(position)\(weekday.rawValue)"
        case .custom: ""
        }
    }
    var valid: Bool { preset != .custom && (preset != .weekly || !days.isEmpty) && (1...31).contains(day) }
}

enum TaskWriteIntent {
    case move(String), copy(String), revert(Int64), editSeries(Recurrence), skipOccurrence
    var mergesFields: Bool { if case .editSeries = self { true } else { false } }
}

struct TaskTransferRequest: Identifiable {
    enum Kind: String { case move, copy
        var title: String { self == .move ? "Move to Profile" : "Copy to Profile" }
        var action: String { self == .move ? "Move task" : "Copy task" }
    }
    let kind: Kind
    let task: TaskSnapshot
    var id: String { kind.rawValue + task.id }
}

extension TaskWriteIntent {
    var transfer: (kind: TaskTransferRequest.Kind, destination: String)? {
        switch self {
        case .move(let destination): return (.move, destination)
        case .copy(let destination): return (.copy, destination)
        default: return nil
        }
    }
}

struct TaskTransferResult {
    let kind: TaskTransferRequest.Kind
    let task: TaskSnapshot
    let profileName: String
    var message: String { "Task \(kind == .copy ? "copied" : "moved") to \(profileName)" }
    var openTitle: String { "Open in \(profileName)" }
}
