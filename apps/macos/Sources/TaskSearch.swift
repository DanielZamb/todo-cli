import Foundation
import SwiftUI

struct TaskSearchIdentity: Equatable {
    let profile: String
    let view: String
    let filters: TaskListFilters
    let text: String
    let project: String?
    let tag: String?
}

enum TaskSearchPhase { case idle, showing, debouncing, requesting, error }

struct TaskSearchSnapshot {
    let appliedIdentity: TaskSearchIdentity
    let rows: [TaskSnapshot]
    let groups: [PlanningResult.Group]
}

struct TaskSearchMatch: Codable, Equatable, Sendable {
    enum Field: String, Codable, Sendable { case title, description }
    let field: Field
    let start: Int
    let end: Int
}

enum TaskSearchPresentation {
    static func highlighted(_ text: String, spans: [TaskSearchMatch], field: TaskSearchMatch.Field) -> AttributedString {
        var result = AttributedString(text)
        for span in spans where span.field == field && span.start >= 0 && span.end > span.start && span.end <= text.utf16.count {
            guard let range = Range(NSRange(location: span.start, length: span.end - span.start), in: text),
                  let start = AttributedString.Index(range.lowerBound, within: result),
                  let end = AttributedString.Index(range.upperBound, within: result) else { continue }
            result[start..<end].backgroundColor = .yellow.opacity(0.3)
            result[start..<end].inlinePresentationIntent = .stronglyEmphasized
        }
        return result
    }

    static func descriptionExcerpt(_ task: TaskSnapshot) -> AttributedString? {
        let spans = task.search_matches ?? []
        guard !spans.contains(where: { $0.field == .title }), let first = spans.first(where: { $0.field == .description }),
              let text = task.description, first.start >= 0, first.end <= text.utf16.count,
              let match = Range(NSRange(location: first.start, length: first.end - first.start), in: text) else { return nil }
        let start = text.index(match.lowerBound, offsetBy: -28, limitedBy: text.startIndex) ?? text.startIndex
        let end = text.index(match.upperBound, offsetBy: 40, limitedBy: text.endIndex) ?? text.endIndex
        var result = highlighted(text, spans: spans, field: .description)
        guard let a = AttributedString.Index(start, within: result), let b = AttributedString.Index(end, within: result) else { return nil }
        result = AttributedString(result[a..<b])
        for whitespace in ["\n", "\r", "\t"] {
            while let range = result.range(of: whitespace) { result.replaceSubrange(range, with: AttributedString(" ")) }
        }
        return AttributedString(start == text.startIndex ? "" : "…") + result + AttributedString(end == text.endIndex ? "" : "…")
    }
}
