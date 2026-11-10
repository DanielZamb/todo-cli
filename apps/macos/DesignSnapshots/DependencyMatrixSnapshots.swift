import Foundation
import Testing
@testable import TodoState

@MainActor struct DependencyMatrixSnapshots {
    static let expectedFiles = 374
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DAG_ONLY"] == "1"))
    func renderDependencyMatrix() async throws {
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"]))
        let files = try await Self.render(directory: directory)
        try JSONSerialization.data(withJSONObject: ["files": files], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("manifest.json"))
    }
    static func render(directory: URL) async throws -> [String] {
        try await DependencyWebSnapshots.prove(directory: directory)
        let relation = try await DependencySnapshots.render(directory: directory)
        let graph = try await DependencyGraphSnapshots.render(directory: directory, matrix: true)
        let files = relation + graph
        #expect(Set(files).count == files.count)
        #expect(files.count == expectedFiles)
        return files
    }
}
