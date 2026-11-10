import AppKit
import SwiftUI
import Testing
import TodoAPI
import Vision
@testable import TodoState

enum SnapshotText {
    static func read(_ bitmap: NSBitmapImageRep) throws -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["en-US"]
        try VNImageRequestHandler(cgImage: try #require(bitmap.cgImage)).perform([request])
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    }
}

@MainActor struct DependencyReviewSnapshots {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func liveSeriesAndFilteredEmptyResultsHaveVisibleProductionContent() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent()
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        let original = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "DAG production recurring Task"))).ok.body.json)
        let blocker = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "Review the recurring launch"))).ok.body.json)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-series-content"))
        model.replaceCredential(session.credential); model.signedIn = true; model.connection = .live
        defer { model.signedIn = false; model.connect() }
        model.beginEditing(original)
        await model.openSeries()
        #expect(model.showingSeries)
        #expect(model.series == nil)
        #expect(model.editor?.id == original.id)
        var content: [String: [String]] = [:]
        content["series-before-save"] = try await capture(SeriesView(model: model, compact: true), name: "series-production-before-save", directory: directory)
        #expect(content["series-before-save"]?.contains("Create Series") == true)
        await model.openInitialDependencyPicker(firstOccurrence: true)
        #expect(model.dependencies.picker?.purpose == .firstOccurrence)
        #expect(model.dependencies.picker?.rows.contains { $0.id == blocker.id } == true)
        await model.toggleDependency(blocker)
        #expect(model.dependencies.firstOccurrenceInitial.map(\.id) == [blocker.id])
        model.closeDependencyPicker()
        content["series-with-dependency"] = try await capture(SeriesView(model: model, compact: true), name: "series-production-with-dependency", directory: directory)
        #expect(content["series-with-dependency"]?.contains("First Occurrence Dependencies") == true)
        #expect(content["series-with-dependency"]?.joined(separator: " ").contains(blocker.title) == true)
        let unchanged = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: original.id)).ok.body.json)
        #expect(unchanged.row_version == 1)
        #expect(unchanged.occurrence == nil)
        #expect(unchanged.depends_on == [])
        model.showingSeries = false
        model.editor = nil
        model.selectView("all")
        model.applyTaskFilters(.init(ready: true, blocked: true))
        for _ in 0..<6000 {
            if model.taskFilters.ready && model.taskFilters.blocked && !model.loading { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(model.taskFilters.ready && model.taskFilters.blocked)
        #expect(TaskListView(model: model, compactMode: true).visibleTasks.isEmpty)
        content["filtered-empty"] = try await capture(TaskListView(model: model, compactMode: true).taskContent, name: "filters-production-empty", directory: directory)
        #expect(content["filtered-empty"]?.contains("No matching tasks.") == true)
        #expect(content["filtered-empty"]?.contains("Clear filters") == true)
        #expect(content["filtered-empty"]?.contains("Filter tasks") == false)
        try JSONEncoder().encode(content).write(to: directory.appendingPathComponent("dependency-production-visible-content.json"))
    }

    private func capture<V: View>(_ view: V, name: String, directory: URL) async throws -> [String] {
        NSApplication.shared.setActivationPolicy(.prohibited)
        NSApplication.shared.appearance = NSAppearance(named: .aqua)
        let controller = NSHostingController(rootView: view.frame(width: 393, height: 426).background(.background).environment(\.colorScheme, .light).tint(TodoColors.color("primary")))
        let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: 393, height: 426), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = controller
        defer { window.close() }
        let host = controller.view
        host.frame = .init(x: 0, y: 0, width: 393, height: 426)
        host.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(300))
        host.layoutSubtreeIfNeeded()
        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        try #require(bitmap.representation(using: .png, properties: [:])).write(to: directory.appendingPathComponent(name + ".png"))
        return try SnapshotText.read(bitmap)
    }
}
