import Foundation

struct TaskRowPresentation {
    let task: TaskSnapshot
    let tagNames: [String]
    var priority: String? { ["P1", "P2"].contains(task.priority) ? task.priority : nil }
    var tags: [String] { tagNames }
    var now = Date()
    var locale = Locale.current
    var calendar = Calendar.current
    var due: String? { task.due_at.map { RowDate.text($0, now: now, locale: locale, calendar: calendar) } }
    var scheduled: String? { task.scheduled_at.map { RowDate.text($0, now: now, locale: locale, calendar: calendar) } }
    var compactDate: String? { due.map { "Due " + $0 } ?? scheduled.map { "Scheduled " + $0 } }
    var isDone: Bool { task.status == "done" }
    var completionSymbol: String {
        switch task.status {
        case "done": "checkmark.circle.fill"
        case "cancelled": "xmark.circle"
        default: "circle"
        }
    }
}

enum ConflictChoice: String, CaseIterable {
    case mine, theirs
    var keepsMine: Bool { self == .mine }
    init(keepsMine: Bool) { self = keepsMine ? .mine : .theirs }
    func label(_ value: String) -> String { "Keep \(self == .mine ? "mine" : "theirs"): \(value.isEmpty ? "Empty" : value)" }
}

extension Recurrence {
    var summary: String {
        let draft = RecurrenceDraft(rule: rrule)
        switch draft.preset {
        case .daily: return "Every day"
        case .weekdays: return "Every weekday"
        case .weekly: return "Every " + Weekday.allCases.filter { draft.days.contains($0) }.map(\.fullTitle).joined(separator: ", ")
        case .monthlyDate: return "Monthly on day \(draft.day)"
        case .monthlyPosition: return "Monthly, \(draft.position == -1 ? "last" : String(draft.position)) \(draft.weekday.fullTitle)"
        case .custom: return rrule
        }
    }
}

extension Weekday {
    var fullTitle: String {
        switch self {
        case .mon: "Monday"
        case .tue: "Tuesday"
        case .wed: "Wednesday"
        case .thu: "Thursday"
        case .fri: "Friday"
        case .sat: "Saturday"
        case .sun: "Sunday"
        }
    }
}

extension ClientConfiguration {
    var serverAuthority: String {
        (server.host() ?? "localhost") + (server.port.map { ":" + String($0) } ?? "")
    }
}

enum RowDate {
    static func text(_ time: TaskTime, now: Date, locale: Locale = .current, calendar: Calendar = .current) -> String {
        let deviceZone = calendar.timeZone
        var calendar = calendar
        if let zone = time.time_zone.flatMap(TimeZone.init(identifier:)) { calendar.timeZone = zone }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        let date: Date?
        if time.kind == "instant" {
            date = time.instant
        } else {
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.dateFormat = "yyyy-MM-dd"
            date = time.date.flatMap(formatter.date(from:))
        }
        guard let date else { return time.display }
        formatter.locale = locale
        formatter.calendar = calendar
        let distance = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day
        let day: String
        switch distance {
        case 0: day = "Today"
        case 1: day = "Tomorrow"
        case -1: day = "Yesterday"
        case .some(-6 ... -2), .some(2...6):
            formatter.dateFormat = "EEE"
            day = formatter.string(from: date)
        default:
            formatter.setLocalizedDateFormatFromTemplate(
                calendar.component(.year, from: date) == calendar.component(.year, from: now) ? "MMM d" : "MMM d yyyy")
            day = formatter.string(from: date)
        }
        guard time.kind == "instant" else { return day }
        formatter.setLocalizedDateFormatFromTemplate("j:mm")
        return day + " " + formatter.string(from: date) + (time.time_zone == nil || calendar.timeZone == deviceZone ? "" : " · " + (time.time_zone ?? ""))
    }
}

extension ManagedServerStatus {
    var displayStatus: String { loaded ? "Running" : installed ? "Installed, not running" : "Not installed" }
}

struct NotificationTestResult {
    let checkedAt: Date
    let delivered: Bool
    func description(now: Date, locale: Locale = .current) -> String {
        let time: String
        if abs(checkedAt.timeIntervalSince(now)) < 60 {
            time = "just now"
        } else {
            let formatter = RelativeDateTimeFormatter()
            formatter.locale = locale
            formatter.dateTimeStyle = .numeric
            time = formatter.localizedString(for: checkedAt, relativeTo: now)
        }
        return "Last test: \(time), \(delivered ? "delivered" : "not delivered")"
    }
}

struct NotificationSettingsState {
    enum Access { case allowed, denied, notAsked, pending, failure }
    let authorization: String
    var lastTest: NotificationTestResult?
    var receipt = "Not tested yet"
    var access: Access {
        switch authorization {
        case "Allowed", "authorized", "provisional", "ephemeral": .allowed
        case "Disabled in System Settings", "denied", "Not allowed": .denied
        case "Not requested", "notDetermined", "Not asked yet": .notAsked
        case "Awaiting approval": .pending
        default: .failure
        }
    }
    var description: String {
        switch access {
        case .allowed: "Allowed"
        case .denied: "Not allowed"
        case .notAsked: "Not asked yet"
        case .pending: "Awaiting approval"
        case .failure: authorization
        }
    }
}

struct ReminderReceiptState {
    var generation = "initial"
    var lastReceipt = "Not tested yet"
    var lastTest: NotificationTestResult?
    mutating func reset(to generation: String) {
        self.generation = generation
        lastReceipt = "Not tested yet"
        lastTest = nil
    }
    func prefix(server: String, profile: String) -> String { "todo.\(server).\(profile).\(generation)." }
    func identifier(server: String, profile: String, seq: Int64) -> String { prefix(server: server, profile: profile) + String(seq) }
}
