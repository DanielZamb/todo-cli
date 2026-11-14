import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

/// Candidate 11, the coordinator's ruling on the picker: a read-back or a background refresh no
/// longer disables the rows; a click acts on what its row showed; a read never undoes a toggle in
/// flight; the list is disabled when the picker's own Task is gone. Uses PickerServer
/// (DependencyPickerRowsTests.swift).
@MainActor @Suite struct DependencyPickerRefreshTests {
    private func model(_ server: PickerServer) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-picker-refresh"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: server, middlewares: [BearerMiddleware(credential: credential)]) },
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("synthetic-picker"); model.signedIn = true; model.connection = .live
        return model
    }
    private func root() -> TaskSnapshot {
        TaskSnapshot(id: "root", profile_id: "work", row_version: 1, title: "Task root", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }
    private func until(_ what: String, _ condition: () async -> Bool) async throws {
        for _ in 0..<2000 { if await condition() { return }; try await Task.sleep(for: .milliseconds(2)) }
        Issue.record("timed out: \(what)"); throw CancellationError()
    }
    private func opened(_ server: PickerServer) async throws -> TodoModel {
        let model = model(server)
        await model.openDependencyPicker(root())
        try #require(model.dependencies.picker?.rowIDs == ["a", "b", "c"])
        return model
    }

    @Test func aBackgroundRefreshLeavesTheRowsEnabledAndThePersonsReloadDoesNot() async throws {
        let server = PickerServer()
        let model = try await opened(server)
        await server.hold("tasks.show")
        let refresh = Task { await model.refreshDependencyPicker() }
        try await until("the refresh is in flight") { await server.isHeld("tasks.show") }
        #expect(model.dependencies.picker?.loading == false, "a background refresh does not show loading")
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["b"]))
        #expect(await server.writes.map(\.blocker) == ["b"], "a toggle during a background refresh goes through")
        await server.release("tasks.show"); await refresh.value
        // The person's own reload shows loading and disables the list.
        await server.hold("tasks.show")
        let reload = Task { await model.reloadDependencyPicker() }
        try await until("the reload is in flight") { await server.isHeld("tasks.show") }
        #expect(model.dependencies.picker?.loading == true)
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["c"]))
        #expect(await server.writes.map(\.blocker) == ["b"], "a toggle during the person's reload is refused, as before")
        await server.release("tasks.show"); await reload.value
        #expect(model.dependencies.picker?.loading == false)
    }

    @Test func aClickActsOnWhatItsRowShowed() async throws {
        let server = PickerServer()
        let model = try await opened(server)
        // A Version that arrived after the draw is not used: the click carries the drawn one.
        model.dependencies.picker?.root = TaskSnapshot(id: "root", profile_id: "work", row_version: 7, title: "Task root", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
        let a = try #require(model.dependencies.picker?.tasksByID["a"])
        await model.toggleDependency(a, drawn: .init(checked: false, dependentVersion: 1))
        #expect(await server.writes.first?.fromVersion == 1)
        #expect(await server.writes.first?.op == "tasks.depend")
        // The checked state drawn decides add or remove, not a newer one.
        let b = try #require(model.dependencies.picker?.tasksByID["b"])
        let version = try #require(model.dependencies.picker?.root.row_version)
        await model.toggleDependency(b, drawn: .init(checked: true, dependentVersion: version))
        #expect(await server.writes.last?.op == "tasks.undepend")
    }

    /// Holds by supersession, not by the write clock (MAC-C11-S1-3): the toggle's read-back starts a
    /// newer read, and the old refresh is not published. With the stand-aside and the owed read, no
    /// schedule was found in which the clock decides; removing it leaves every picker suite and the
    /// seat's probes green (fix head evidence, `noclock-run`).
    @Test func aRefreshStartedBeforeAToggleReplyNeverUndoesIt() async throws {
        let server = PickerServer()
        let model = try await opened(server)
        // Refresh started (it holds on its candidates read), toggle sent, toggle replies, old refresh replies.
        await server.hold("tasks.show")
        let refresh = Task { await model.refreshDependencyPicker() }
        try await until("the refresh is in flight") { await server.isHeld("tasks.show") }
        var shown: [Bool] = []
        let watch = Task { @MainActor in
            while !Task.isCancelled {
                let checked = model.dependencies.picker?.checked("a") ?? false
                if shown.last != checked { shown.append(checked) }
                try? await Task.sleep(for: .milliseconds(1))
            }
        }
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["a"]))
        #expect(model.dependencies.picker?.checked("a") == true)
        await server.release("tasks.show"); await refresh.value
        try await Task.sleep(for: .milliseconds(20))
        watch.cancel()
        #expect(model.dependencies.picker?.checked("a") == true)
        #expect(shown == [false, true], "the row shows the toggle's result once: \(shown)")
    }

    @Test func theListIsDisabledWhenThePickersOwnTaskIsGone() async throws {
        let server = PickerServer()
        let model = try await opened(server)
        await server.missing()
        await model.refreshDependencyPicker()
        #expect(model.dependencies.picker?.rootGone == true)
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["a"]))
        #expect(await server.writes.isEmpty)
    }

}
