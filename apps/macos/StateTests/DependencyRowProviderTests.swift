import Foundation
import Testing
@testable import TodoState

@MainActor struct DependencyRowProviderTests {
    @Test func dependencyDragUsesTheListRowProvider() throws {
        let source = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Sources/DependencyDrag.swift")
        let content = try String(contentsOf: source, encoding: .utf8)
        #expect(!content.contains(".onDrag"), "Task row content must not intercept the selection mouse-down")
        #expect(content.contains(".itemProvider"), "Dependency payload belongs to the List row provider")
    }
    @Test func dependencyPayloadKeepsItsTwoFields() throws {
        let value = DependencyDragSource(profile: "scratch-profile", task: "scratch-task")
        let data = try JSONEncoder().encode(value)
        let fields = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(fields == ["profile": "scratch-profile", "task": "scratch-task"])
        #expect(try JSONDecoder().decode(DependencyDragSource.self, from: data) == value)
    }
}
