import Foundation
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

/// MAC-C12-S1-8 (correctness seat, P3; the same on candidate 11): a link the server committed but
/// whose 2xx reply cannot be read is a commit. The picker reads itself back at once and shows what
/// the server has, and the notice says the reply could not be read, never "Couldn't add" and no
/// Reload; if that read-back fails, the read's own failure notice stands. On b968f31a it said
/// "Couldn't add “Task a”. Try again.", kept the stale row and owed no read.
@MainActor @Suite struct PickerUnreadableCommitTests {
    private func model(_ server: OwedReadServer) -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-unreadable-commit"),
                              clientFactory: { url, credential in Client(serverURL: url, transport: server, middlewares: [BearerMiddleware(credential: credential)]) },
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("synthetic-unreadable-commit"); model.signedIn = true; model.connection = .live
        return model
    }
    private func task(_ id: String) -> TaskSnapshot {
        TaskSnapshot(id: id, profile_id: "work", row_version: 1, title: "Task \(id)", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }

    @Test(arguments: ["add", "remove"])
    func anUnreadableCommitReadsThePickerBackAndSaysSo(_ action: String) async throws {
        let server = OwedReadServer()
        let model = model(server)
        if action == "remove" { await server.link("root", to: ["a"]) }
        await model.openDependencyPicker(task("root"))
        try #require(model.dependencies.picker?.checked("a") == (action == "remove"))
        await server.commitTheNextUnreadably()
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["a"]))
        let picker = try #require(model.dependencies.picker)
        #expect(await server.dependsOn("root") == (action == "add" ? ["a"] : []))
        #expect(picker.checked("a") == (action == "add"), "the row shows what the server has")
        #expect(picker.root.row_version == (await server.version("root")))
        #expect(picker.feedback == "The server's reply about \u{201C}Task a\u{201D} couldn't be read. The list has been read again and shows what the server has.")
        #expect(picker.failure == nil, "no \u{201C}Couldn't add\u{201D}: \(String(describing: picker.failure.map(DependencyNoticeContent.headline)))")
        #expect(!picker.requiresReload)
        #expect(!picker.owedRead && picker.pending.isEmpty)
    }

    @Test func whenTheReadBackFailsItsOwnNoticeStands() async throws {
        let server = OwedReadServer()
        let model = model(server)
        await model.openDependencyPicker(task("root"))
        await server.commitTheNextUnreadably()
        await server.failTheNextShow()
        await model.toggleDependency(try #require(model.dependencies.picker?.tasksByID["a"]))
        let picker = try #require(model.dependencies.picker)
        #expect(await server.dependsOn("root") == ["a"])
        #expect(picker.feedback == nil, "the list was not read again")
        let failure = try #require(picker.failure)
        #expect(!DependencyNoticeContent.headline(failure).hasPrefix("Couldn't add"))
        #expect(DependencyNoticeContent.headline(failure) == "The server couldn't be reached. Try again.")
    }
}
