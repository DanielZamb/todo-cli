import AppKit
import Foundation
import HTTPTypes
import OpenAPIRuntime
import SwiftUI
import Testing
import TodoAPI
@testable import TodoState

/// Q13 (owner's decision): closing the inspector with unsaved changes asks the draft question, as
/// opening another Task does. Unsaved means changed fields, a pending Series edit or a Conflict's merge
/// choices. Every close a person can cause asks and leaves the editor as it is until the answer: Save
/// closes after the save succeeds (a refused save keeps the inspector open and says why), Discard
/// closes, Cancel keeps editing. Clean, nothing is asked. On 456af04b each of these closes dropped the
/// draft without a question. The production RootView in a hosted window that is never shown.
private actor Scripted: ClientTransport {
    struct Reply: Sendable { let operation: String; let status: Int; let json: String }
    var replies: [Reply]
    var calls: [String] = []
    var bodies: [String] = []
    var unscripted: [String] = []
    init(_ replies: [Reply] = []) { self.replies = replies }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        // The read-back after a write: a catalog that applies, so the connection stays live.
        switch operationID {
        case "reads.profiles": return json(#"[{"id":"work","name":"Work","created_at":"2026-10-27T00:00:00Z","updated_at":"2026-10-27T00:00:00Z","open_task_count":1,"inbox_task_count":1,"visible_task_count":1,"projects":[]}]"#)
        case "reads.view": return json(#"{"name":"today","now":"2026-11-14T12:00:00Z","groups":[]}"#)
        case "reads.projects", "reads.tags", "tasks.list": return json("[]")
        default: break
        }
        guard let index = replies.firstIndex(where: { $0.operation == operationID }) else { unscripted.append(operationID); throw URLError(.notConnectedToInternet) }
        let reply = replies.remove(at: index)
        calls.append(operationID)
        if let body { bodies.append(String(decoding: try await Data(collecting: body, upTo: 65_536), as: UTF8.self)) }
        return json(reply.json, status: reply.status)
    }
    private func json(_ value: String, status: Int = 200) -> (HTTPResponse, HTTPBody?) { (HTTPResponse(status: .init(code: status), headerFields: [.contentType: "application/json"]), HTTPBody(value)) }
}
/// A request body as compact JSON with sorted keys, for comparing against literals.
private func compact(_ body: String) -> String {
    guard let object = try? JSONSerialization.jsonObject(with: Data(body.utf8)),
          let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return body }
    return String(decoding: data, as: UTF8.self)
}

private func taskJSON(version: Int, title: String, status: String = "open") -> String {
    #"{"id":"t003","profile_id":"work","entity_version":1,"row_version":\#(version),"title":"\#(title)","description":null,"priority":"P1","status":"\#(status)","project_id":null,"tags":["focus"],"due_at":null,"scheduled_at":null,"energy":2,"estimate_min":30,"source":"manual","occurrence":null,"created_at":"2026-10-27T12:00:00Z","updated_at":"2026-10-27T12:00:00Z","completed_at":null,"deleted_at":null}"#
}

@MainActor @Suite(.serialized) struct EditorCloseTests {
    enum Unsaved: String, CaseIterable { case fields, series, conflict }
    private static let original = "Review the long launch checklist with the whole team 3"

    private func open(_ transport: Scripted = Scripted(), unsaved: Unsaved? = .fields, compact: Bool = false, width: CGFloat = 1300) async -> SidebarRoomHarness {
        let room = await SidebarRoomHarness(model: SidebarRoomHarness.fixtureModel(transport: transport), at: SidebarRoomHarness.offScreen, width: compact ? 420 : width, compact: compact)
        room.model.beginEditing(room.model.tasks[3]); await room.settle()
        switch unsaved {
        case .fields: room.model.editor?.title = "Edited title"
        case .series: room.model.recurrenceDraft = Recurrence(dtstart: TaskTime(kind: "date", date: "2026-11-16"), rrule: "FREQ=DAILY", exdate: [])
        case .conflict: room.model.conflict = TaskConflict(latest: nil)
        case nil: break
        }
        await room.settle()
        return room
    }
    /// Escape: in the full window the editor's Close button carries the cancel shortcut; in Compact the
    /// window's exit command.
    private func escape(_ room: SidebarRoomHarness) async {
        let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: room.window.windowNumber,
                                     context: nil, characters: "\u{1b}", charactersIgnoringModifiers: "\u{1b}", isARepeat: false, keyCode: 53)!
        _ = room.window.performKeyEquivalent(with: event)
        await room.settle()
    }
    /// The system dismissing the inspector (its split item collapsing), which sets the binding false.
    private func dismiss(_ room: SidebarRoomHarness) async {
        room.controllers.first { $0.splitViewItems.contains { $0.behavior == .inspector } }?.toggleInspector(nil)
        await room.settle()
    }
    private func expectIntact(_ room: SidebarRoomHarness, _ unsaved: Unsaved, inspector: Bool = true) {
        #expect(room.model.pendingNavigation != nil, "the draft question was not asked")
        #expect(room.model.editor?.id == "t003")
        switch unsaved {
        case .fields: #expect(room.model.editor?.title == "Edited title")
        case .series: #expect(room.model.recurrenceDraft != nil)
        case .conflict: #expect(room.model.conflict != nil)
        }
        if inspector { #expect(room.inspectorShown) }
    }

    // MARK: each close a person can cause asks, and the draft stays

    @Test(arguments: Unsaved.allCases)
    func escapeAsksAndKeepsTheDraft(unsaved: Unsaved) async throws {
        let room = await open(unsaved: unsaved)
        defer { room.close() }
        await escape(room)
        expectIntact(room, unsaved)
    }

    @Test func theSystemDismissingTheInspectorAsksAndKeepsTheDraft() async throws {
        let room = await open()
        defer { room.close() }
        await dismiss(room)
        expectIntact(room, .fields)
    }

    @Test func compactEscapeAsksAndKeepsTheDraft() async throws {
        let room = await open(compact: true)
        defer { room.close() }
        await escape(room)
        expectIntact(room, .fields, inspector: false)
    }

    /// The room rule: a 480 pt inspector in a 900 pt window off every screen, so it cannot grow.
    @Test(arguments: ["toolbar", "menu"])
    func theRoomRuleAsksAndShowsNothingUntilTheAnswer(path: String) async throws {
        let room = await open(unsaved: nil)
        defer { room.close() }
        try await room.widenInspector(to: 480)
        await room.toggle(path)
        await room.resize(900)
        try await room.widenInspector(to: 480)
        room.model.editor?.title = "Edited title"
        try #require(!room.sidebarShown && room.inspectorWidth == 480)
        await room.toggle(path)
        expectIntact(room, .fields)
        #expect(!room.sidebarShown)
        #expect(room.window.frame.width == 900)
        #expect(room.inspectorWidth == 480)
    }

    @Test(arguments: ["complete", "cancel"])
    func aTransitionOfTheOpenTaskAsksFirst(action: String) async throws {
        let transport = Scripted()
        let room = await open(transport)
        defer { room.close() }
        await room.model.transition(room.model.tasks[3], action: action)
        await room.settle()
        expectIntact(room, .fields)
        #expect(await transport.calls.isEmpty)
    }

    /// Delete needs no draft question: its review is the question, the draft stays while it is open,
    /// and only a validated delete discards it (DependencyRecoveryParityTests).
    @Test func deletingTheOpenTaskOpensItsReviewAndKeepsTheDraft() async throws {
        let room = await open()
        defer { room.close() }
        await room.model.openDependencyDelete(room.model.tasks[3])
        await room.settle()
        #expect(room.model.pendingNavigation == nil)
        #expect(room.model.dependencies.deletion?.task.id == "t003")
        #expect(room.model.editor?.title == "Edited title")
    }

    // MARK: the answers

    @Test func discardCloses() async throws {
        let transport = Scripted()
        let room = await open(transport)
        defer { room.close() }
        await escape(room)
        let target = try #require(room.model.pendingNavigation)
        #expect(await room.model.discardAndNavigate(target))
        await room.settle()
        #expect(room.model.pendingNavigation == nil)
        #expect(room.model.editor == nil)
        #expect(!room.inspectorShown)
        #expect(await transport.calls.isEmpty)
    }

    @Test func saveClosesAfterTheSaveSucceeds() async throws {
        let transport = Scripted([.init(operation: "tasks.edit", status: 200, json: taskJSON(version: 2, title: "Edited title"))])
        let room = await open(transport)
        defer { room.close() }
        await escape(room)
        let target = try #require(room.model.pendingNavigation)
        #expect(await room.model.saveAndNavigate(target))
        await room.settle()
        #expect(await transport.calls == ["tasks.edit"])
        #expect(await transport.bodies.map(compact) == [#"{"changes":{"title":"Edited title"},"from_version":1}"#])
        #expect(room.model.editor == nil)
        #expect(!room.inspectorShown)
    }

    @Test func aRefusedSaveKeepsTheInspectorOpenAndSaysWhy() async throws {
        let transport = Scripted([.init(operation: "tasks.edit", status: 422, json: #"{"message":"invalid_title"}"#)])
        let room = await open(transport)
        defer { room.close() }
        await escape(room)
        let target = try #require(room.model.pendingNavigation)
        #expect(await room.model.saveAndNavigate(target) == false)
        await room.settle()
        #expect(await transport.calls == ["tasks.edit"])
        #expect(room.model.editor?.title == "Edited title")
        let unscripted = await transport.unscripted
        #expect(room.model.editorError == "invalid_title", "unscripted: \(unscripted)")
        #expect(room.inspectorShown)
    }

    @Test func cancelKeepsEditing() async throws {
        let room = await open()
        defer { room.close() }
        await escape(room)
        try #require(room.model.pendingNavigation != nil)
        room.model.cancelNavigation()
        await room.settle()
        #expect(room.model.pendingNavigation == nil)
        #expect(room.model.editor?.title == "Edited title")
        #expect(room.inspectorShown)
    }

    /// The room rule's answers: Save or Discard closes the inspector and shows the sidebar, without
    /// growing the window; Cancel leaves both as they were.
    @Test(arguments: ["save", "discard", "cancel"])
    func theRoomRulesAnswers(answer: String) async throws {
        let transport = Scripted([.init(operation: "tasks.edit", status: 200, json: taskJSON(version: 2, title: "Edited title"))])
        let room = await open(transport, unsaved: nil)
        defer { room.close() }
        try await room.widenInspector(to: 480)
        await room.toolbarToggle()
        await room.resize(900)
        try await room.widenInspector(to: 480)
        room.model.editor?.title = "Edited title"
        await room.toolbarToggle()
        let target = try #require(room.model.pendingNavigation)
        switch answer {
        case "save": #expect(await room.model.saveAndNavigate(target))
        case "discard": #expect(await room.model.discardAndNavigate(target))
        default: room.model.cancelNavigation()
        }
        await room.settle()
        if answer == "cancel" {
            #expect(room.model.pendingNavigation == nil)
            #expect(room.model.editor?.title == "Edited title")
            #expect(room.inspectorShown)
            #expect(!room.sidebarShown)
            #expect(room.inspectorWidth == 480)
        } else {
            #expect(room.model.editor == nil)
            #expect(room.sidebarShown)
            #expect(!room.inspectorShown)
            #expect(await transport.calls == (answer == "save" ? ["tasks.edit"] : []))
        }
        #expect(room.window.frame.width == 900)
        #expect(room.outside.isEmpty)
    }

    /// Discard, then the transition runs on the Task as it was; Save, then on the saved Version.
    @Test(arguments: ["save", "discard"])
    func aTransitionRunsAfterTheAnswer(answer: String) async throws {
        let transport = Scripted([.init(operation: "tasks.edit", status: 200, json: taskJSON(version: 2, title: "Edited title")),
                                  .init(operation: "tasks.transition", status: 200, json: taskJSON(version: answer == "save" ? 3 : 2, title: "x", status: "done"))])
        let room = await open(transport)
        defer { room.close() }
        await room.model.transition(room.model.tasks[3], action: "complete")
        let target = try #require(room.model.pendingNavigation)
        if answer == "save" { #expect(await room.model.saveAndNavigate(target)) } else { #expect(await room.model.discardAndNavigate(target)) }
        await room.settle()
        #expect(await transport.calls == (answer == "save" ? ["tasks.edit", "tasks.transition"] : ["tasks.transition"]))
        #expect(await transport.bodies.last.map(compact) == #"{"action":"complete","from_version":\#(answer == "save" ? 2 : 1)}"#)
        #expect(room.model.editor == nil)
    }

    // MARK: clean, twice, and the person's input

    @Test func escapeOnACleanEditorClosesWithoutAQuestion() async throws {
        let room = await open(unsaved: nil)
        defer { room.close() }
        await escape(room)
        #expect(room.model.pendingNavigation == nil)
        #expect(room.model.editor == nil)
        #expect(!room.inspectorShown)
    }

    @Test func theRoomRulesCleanCloseSaysSo() async throws {
        let room = await open(unsaved: nil)
        defer { room.close() }
        try await room.widenInspector(to: 480)
        await room.toolbarToggle()
        await room.resize(900)
        try await room.widenInspector(to: 480)
        await room.toolbarToggle()
        #expect(room.model.pendingNavigation == nil)
        #expect(room.model.editor == nil)
        #expect(room.sidebarShown)
        #expect(!room.inspectorShown)
        #expect(room.outside.isEmpty)
        #expect(room.model.deletionNotice == "Closed \u{201C}\(Self.original)\u{201D} to make room for the sidebar.")
    }

    /// Two closes together ask once: the question is presented (and marked) once, for the first.
    @Test func twoClosesTogetherAskOnce() async throws {
        let room = await open()
        defer { room.close() }
        let before = room.model.personInput.count
        await escape(room)
        await dismiss(room)
        await room.model.transition(room.model.tasks[3], action: "complete")
        #expect(room.model.personInput.count - before == 2) // the presentation, and the transition's own mark
        // Matched by its description, so this test also compiles where `.close` does not exist.
        #expect(String(describing: room.model.pendingNavigation).contains("close(TodoState.TodoModel.EditorClose.person)"), "the first close's question was replaced")
        expectIntact(room, .fields)
    }

    /// Answering the question is the person acting (MAC-C1-S1-32): Save, Discard and Cancel each mark.
    @Test(arguments: ["save", "discard", "cancel"])
    func answeringTheQuestionMarksThePersonActing(answer: String) async throws {
        let transport = Scripted([.init(operation: "tasks.edit", status: 422, json: #"{"message":"invalid_title"}"#)])
        let room = await open(transport)
        defer { room.close() }
        await escape(room)
        let target = try #require(room.model.pendingNavigation)
        let before = room.model.personInput.count
        switch answer {
        case "save": _ = await room.model.saveAndNavigate(target)
        case "discard": _ = await room.model.discardAndNavigate(target)
        default: room.model.cancelNavigation()
        }
        #expect(room.model.personInput.count > before)
    }
}
