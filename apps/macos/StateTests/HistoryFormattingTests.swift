import Foundation
import Testing
@testable import TodoState

private let timestamp = "2026-10-27T12:00:00Z"
private let historyTask = #"{"id":"task-1","profile_id":"work","row_version":1,"title":"Original title","description":null,"priority":"P3","status":"open","project_id":null,"tags":[],"due_at":null,"scheduled_at":null,"energy":null,"estimate_min":null,"occurrence":null,"deleted_at":null}"#
private func historyEntry(_ event: String, seq: Int64 = 1, reason: String? = nil) throws -> HistoryEntry {
    let json = #"{"seq":\#(seq),"outcome":"\#(reason == nil ? "committed" : "rejected")","reason":\#(reason.map { "\"\($0)\"" } ?? "null"),"event":{"occurred_at":"\#(timestamp)",\#(event)}}"#
    return try JSONDecoder().decode(HistoryEntry.self, from: Data(json.utf8))
}

@Test func plainHistoryLabelsAndMeaningfulRevert() throws {
    let events = try [
        historyEntry(#""kind":"TaskCreated""#),
        historyEntry(#""kind":"TaskCompleted""#, seq: 2),
        historyEntry(#""kind":"TaskCancelled""#, seq: 3),
        historyEntry(#""kind":"TaskReopened""#, seq: 4),
        historyEntry(#""kind":"TaskMovedIn","original_seq":null"#, seq: 5),
        historyEntry(#""kind":"TaskDeleted""#, seq: 6),
        historyEntry(#""kind":"TaskReverted","original_seq":2"#, seq: 7),
        historyEntry(#""kind":"ReminderFired""#, seq: 8),
        historyEntry(#""kind":"TaskAttemptRejected","attempted_kind":"TaskEdited""#, seq: 9, reason: "conflict"),
        historyEntry(#""kind":"TaskMovedOut","original_seq":5"#, seq: 10)
    ]
    #expect(events.map(\.label) == ["Created", "Completed", "Cancelled", "Reopened", "Moved", "Deleted", "Reverted", "Reminder", "Edited", "Reverted"])
    #expect(events.map { $0.canRevert(in: events) } == [false, false, true, true, false, true, true, false, false, false])
    #expect(events[8].rejectionReason == "The task changed before this attempt was saved.")
    #expect(try historyEntry(#""kind":"TaskAttemptRejected","attempted_kind":"TaskDeleted""#, reason: "future_reason").rejectionReason == "This attempt could not be saved.")
}

@Test func editsShowLiteralOldAndNewValues() throws {
    let after = historyTask.replacingOccurrences(of: "Original title", with: "New title").replacingOccurrences(of: #""description":null"#, with: #""description":"Notes""#).replacingOccurrences(of: "P3", with: "P1").replacingOccurrences(of: #""estimate_min":null"#, with: #""estimate_min":25"#)
    let entry = try historyEntry(#""kind":"TaskEdited","before":\#(historyTask),"after":\#(after),"project_before":null,"project_after":null,"tags_before":[],"tags_after":[],"series_before":null,"series_after":null"#)
    #expect(entry.label == "Edited")
    #expect(entry.fieldChanges == [
        .init(field: "Title", before: "Original title", after: "New title"),
        .init(field: "Description", before: "None", after: "\"Notes\""),
        .init(field: "Priority", before: "P3", after: "P1"),
        .init(field: "Estimate", before: "None", after: "25 min")
    ])
    #expect(entry.canRevert(in: [entry]))
    let reverted = try historyEntry(#""kind":"TaskReverted","original_seq":1"#, seq: 2)
    #expect(entry.canRevert(in: [entry, reverted]) == false)
}

@Test func redactedEntriesDescribeErasureWithoutRecoveringReplayContent() throws {
    let entry = try historyEntry(#""kind":"TaskHistoryRedacted","original_kind":"TaskEdited","attempted_kind":null,"task_ids":["task-1"],"replay":{"tasks":[],"series":[]}"#)
    #expect(entry.label == "Edited")
    #expect(entry.fieldChanges == [])
    #expect(entry.canRevert(in: [entry]) == false)
}

@Test func historyTimesAreRelativeAndLocal() throws {
    let entry = try historyEntry(#""kind":"TaskCompleted""#)
    let now = try #require(ISO8601DateFormatter().date(from: "2026-10-27T12:02:00Z"))
    let locale = Locale(identifier: "en_US")
    #expect(entry.relativeTime(now: now, locale: locale) == "2 minutes ago")
    #expect(entry.relativeTime(now: now.addingTimeInterval(-100), locale: locale) == "Just now")
    #expect(entry.localTime(locale: locale, timeZone: try #require(TimeZone(identifier: "America/Bogota"))) == "Tuesday, October 27, 2026 at 7:00:00\u{202F}AM GMT-5")
}

@Test func editedMetadataUsesNamesAndDateOnlyValues() throws {
    let after = historyTask.replacingOccurrences(of: #""project_id":null"#, with: #""project_id":"project-1""#).replacingOccurrences(of: #""tags":[]"#, with: #""tags":["tag-1"]"#).replacingOccurrences(of: #""due_at":null"#, with: #""due_at":{"kind":"date","date":"2026-10-28"}"#)
    let entry = try historyEntry(#""kind":"TaskEdited","before":\#(historyTask),"after":\#(after),"project_before":null,"project_after":{"name":"Launch"},"tags_before":[],"tags_after":[{"name":"Focus"}],"series_before":null,"series_after":null"#)
    #expect(entry.fieldChanges == [
        .init(field: "Project", before: "None", after: "\"Launch\""),
        .init(field: "Tags", before: "None", after: "\"Focus\""),
        .init(field: "Due", before: "None", after: "Oct 28, 2026")
    ])
}

@Test func deletedSeriesShowsRecurrenceRemoval() throws {
    let series = #"{"id":"series-1","profile_id":"work","recurrence":{"dtstart":{"kind":"date","date":"2026-10-28"},"rrule":"FREQ=DAILY","exdate":[]},"deleted_at":null}"#
    let deleted = series.replacingOccurrences(of: #""deleted_at":null"#, with: #""deleted_at":"2026-10-27T12:00:00Z""#)
    let entry = try historyEntry(#""kind":"TaskEdited","before":\#(historyTask),"after":\#(historyTask),"project_before":null,"project_after":null,"tags_before":[],"tags_after":[],"series_before":\#(series),"series_after":\#(deleted)"#)
    #expect(entry.fieldChanges == [.init(field: "Recurrence", before: "FREQ=DAILY; starts Oct 28, 2026", after: "None")])
}

@Test func literalPlaceholderNamesAndEmptyTextRemainDistinct() throws {
    let after = historyTask.replacingOccurrences(of: #""description":null"#, with: #""description":"None""#).replacingOccurrences(of: #""project_id":null"#, with: #""project_id":"project-1""#).replacingOccurrences(of: #""tags":[]"#, with: #""tags":["tag-1"]"#)
    let entry = try historyEntry(#""kind":"TaskEdited","before":\#(historyTask),"after":\#(after),"project_before":null,"project_after":{"name":"None"},"tags_before":[],"tags_after":[{"name":"None"}],"series_before":null,"series_after":null"#)
    #expect(entry.fieldChanges == [
        .init(field: "Description", before: "None", after: "\"None\""),
        .init(field: "Project", before: "None", after: "\"None\""),
        .init(field: "Tags", before: "None", after: "\"None\"")
    ])
    let empty = historyTask.replacingOccurrences(of: #""description":null"#, with: #""description":"""#)
    let named = historyTask.replacingOccurrences(of: #""description":null"#, with: #""description":"None""#)
    let fromEmpty = try historyEntry(#""kind":"TaskEdited","before":\#(empty),"after":\#(named),"project_before":null,"project_after":null,"tags_before":[],"tags_after":[],"series_before":null,"series_after":null"#)
    #expect(fromEmpty.fieldChanges == [.init(field: "Description", before: "\"\"", after: "\"None\"")])
    let toEmpty = try historyEntry(#""kind":"TaskEdited","before":\#(historyTask),"after":\#(empty),"project_before":null,"project_after":null,"tags_before":[],"tags_after":[],"series_before":null,"series_after":null"#)
    #expect(toEmpty.fieldChanges == [.init(field: "Description", before: "None", after: "\"\"")])
}
