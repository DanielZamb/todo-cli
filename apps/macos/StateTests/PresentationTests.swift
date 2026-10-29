import Foundation
import Testing
import UserNotifications

@testable import TodoState

struct PresentationTests {
    private func task(priority: String = "P3", status: String = "open", due: TaskTime? = TaskTime(kind: "date", date: "2026-10-28")) -> TaskSnapshot {
        TaskSnapshot(
            id: "row", profile_id: "work", row_version: 4, title: "Design review", description: nil,
            priority: priority, source: "manual", status: status, project_id: nil, tags: ["c", "a", "b"],
            due_at: due, scheduled_at: TaskTime(kind: "date", date: "2026-10-27"),
            energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: true, deleted_at: nil)
    }
    @Test func rowMetadata() {
        for priority in ["P1", "P2"] { #expect(TaskRowPresentation(task: task(priority: priority), tagNames: []).priority == priority) }
        for priority in ["P3", "P4"] { #expect(TaskRowPresentation(task: task(priority: priority), tagNames: []).priority == nil) }
        let value = task()
        let tags = [
            DiscoveryEntry(id: "b", name: "Beta", open_task_count: 1, inbox_task_count: nil),
            DiscoveryEntry(id: "a", name: "alpha", open_task_count: 1, inbox_task_count: nil),
        ]
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let row = TaskRowPresentation(
            task: value, tagNames: value.tagNames(from: tags), now: ISO8601DateFormatter().date(from: "2026-10-28T15:00:00Z")!,
            locale: Locale(identifier: "en_US"), calendar: calendar)
        #expect(row.tags == ["alpha", "Beta", "c"])
        #expect(row.due == "Today")
        #expect(row.scheduled == "Yesterday")
        #expect(row.compactDate == "Due Today")
        let scheduled = TaskRowPresentation(task: task(due: nil), tagNames: [], now: row.now, locale: row.locale, calendar: calendar)
        #expect(scheduled.compactDate == "Scheduled Yesterday")
        #expect(row.completionSymbol == "circle")
        #expect(TaskRowPresentation(task: task(status: "done"), tagNames: []).isDone)
        #expect(TaskRowPresentation(task: task(status: "done"), tagNames: []).completionSymbol == "checkmark.circle.fill")
    }
    @Test func serverAuthorityHasNoLocaleGrouping() {
        let configuration = ClientConfiguration(
            server: URL(string: "http://127.0.0.1:4310")!, initialProfile: "work", vaultService: "unused")
        #expect(configuration.serverAuthority == "127.0.0.1:4310")
    }
    @Test func rowDatesAndInstantTimes() {
        let now = ISO8601DateFormatter().date(from: "2026-10-28T15:00:00Z")!
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Bogota")!
        let locale = Locale(identifier: "en_US")
        for (date, expected) in [
            ("2026-10-28", "Today"), ("2026-10-29", "Tomorrow"), ("2026-10-27", "Yesterday"), ("2026-10-30", "Fri"),
            ("2026-11-03", "Tue"), ("2026-11-04", "Nov 4"), ("2026-10-20", "Oct 20"), ("2027-01-01", "Jan 1, 2027"),
        ] {
            #expect(RowDate.text(TaskTime(kind: "date", date: date), now: now, locale: locale, calendar: calendar) == expected)
        }
        #expect(
            RowDate.text(
                TaskTime(kind: "instant", utc: "2026-10-28T14:00:00Z", time_zone: "America/Bogota"), now: now, locale: locale,
                calendar: calendar) == "Today 9:00\u{202F}AM")
        var buddhist = Calendar(identifier: .buddhist)
        buddhist.timeZone = calendar.timeZone
        #expect(RowDate.text(TaskTime(kind: "date", date: "2026-10-28"), now: now, locale: locale, calendar: buddhist) == "Today")
    }
    @Test func unrequestedReminderPermissionKeepsEnableAvailable() {
        let description = NotificationPermission.description(for: .notDetermined)
        #expect(description == "Not requested")
        #expect(NotificationSettingsState(authorization: description).access == .notAsked)
        #expect(NotificationPermission.description(for: .denied) == "Disabled in System Settings")
        #expect(NotificationPermission.description(for: .authorized) == "Allowed")
    }
    @Test func notificationStatesAndTestResults() {
        #expect(NotificationSettingsState(authorization: "Allowed").access == .allowed)
        #expect(NotificationSettingsState(authorization: "denied").access == .denied)
        #expect(NotificationSettingsState(authorization: "Not requested").description == "Not asked yet")
        let now = Date(timeIntervalSince1970: 1000)
        #expect(NotificationTestResult(checkedAt: now, delivered: true).description(now: now) == "Last test: just now, delivered")
        #expect(NotificationTestResult(checkedAt: now, delivered: false).description(now: now) == "Last test: just now, not delivered")
        #expect(
            NotificationTestResult(checkedAt: now.addingTimeInterval(-120), delivered: true).description(
                now: now, locale: Locale(identifier: "en_US")) == "Last test: 2 minutes ago, delivered")
    }
    @Test func serverStatusUsesPlainWords() {
        #expect(
            ManagedServerStatus(label: "test", path: "/fixture", installed: true, loaded: true, configuration: nil).displayStatus
                == "Running")
        #expect(
            ManagedServerStatus(label: "test", path: "/fixture", installed: true, loaded: false, configuration: nil).displayStatus
                == "Installed, not running")
        #expect(
            ManagedServerStatus(label: "test", path: "/fixture", installed: false, loaded: false, configuration: nil).displayStatus
                == "Not installed")
    }
    @Test func recurrenceSummary() {
        #expect(
            Recurrence(dtstart: TaskTime(kind: "date", date: "2026-10-28"), rrule: "FREQ=WEEKLY;BYDAY=WE", exdate: []).summary
                == "Every Wednesday")
    }
    @Test func conflictPickerMapping() {
        #expect(ConflictChoice.mine.keepsMine == true)
        #expect(ConflictChoice.theirs.keepsMine == false)
        #expect(ConflictChoice(keepsMine: true) == .mine)
        #expect(ConflictChoice(keepsMine: false) == .theirs)
        #expect(ConflictChoice.mine.label("Local title") == "Keep mine: Local title")
        #expect(ConflictChoice.theirs.label("Server title") == "Keep theirs: Server title")
        var draft = TaskDraft(task())
        draft.title = "Local title"
        var latest = draft.base
        latest = TaskSnapshot(
            id: latest.id, profile_id: "work", row_version: 5, title: "Server title", description: nil, priority: "P3", source: "manual",
            status: "open", project_id: nil, tags: latest.tags, due_at: latest.due_at, scheduled_at: latest.scheduled_at, energy: nil,
            estimate_min: nil, occurrence: nil, legacy_series_detached: true, deleted_at: nil)
        #expect(draft.merging(latest, choices: ["title": ConflictChoice.mine.keepsMine]).title == "Local title")
        #expect(draft.merging(latest, choices: ["title": ConflictChoice.theirs.keepsMine]).title == "Server title")
    }
}

struct CompactFormattingTests {
    @Test func taskCounts() {
        #expect([0, 1, 2].map { TaskCount.text($0) } == ["0 tasks", "1 task", "2 tasks"])
        #expect(TaskCount.text(1, capitalized: true) == "1 Task")
        #expect([0, 1, 2].map { TaskCount.text($0, capitalized: true) } == ["0 Tasks", "1 Task", "2 Tasks"])
    }
    @Test func foreignZoneIsVisible() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Bogota")!
        let now = ISO8601DateFormatter().date(from: "2026-10-28T15:00:00Z")!
        #expect(RowDate.text(TaskTime(kind: "instant", utc: "2026-10-28T14:00:00Z", time_zone: "UTC"), now: now, locale: Locale(identifier: "en_US"), calendar: calendar) == "Today 2:00\u{202F}PM · UTC")
    }
}
