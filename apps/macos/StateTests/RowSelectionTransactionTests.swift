import AppKit
import Foundation
import Testing
import TodoAPI
@testable import TodoState

/// Follow-up 80, change 1: a keyboard selection with a clean editor opens the Task in the
/// selection's own transaction (`openForEditingNow`), so the list and the inspector render once
/// together; with unsaved changes, while busy or with a question up it goes through `navigate` as
/// before. Real arrow keys (and a real click) sent to the list's outline view in the production
/// RootView, in a hosted window that is never shown; search snapshot rows included.
extension MainThreadExclusive { @MainActor @Suite(.serialized) struct RowSelectionTransactionTests {
    private func views(_ v: NSView) -> [NSView] { [v] + v.subviews.flatMap(views) }
    private func open() async throws -> (SidebarRoomHarness, NSOutlineView) {
        let model = SidebarRoomHarness.fixtureModel()
        let room = await SidebarRoomHarness(model: model, at: SidebarRoomHarness.offScreen)
        model.beginEditing(model.tasks[0]); await room.settle()
        let outline = try #require(views(room.window.contentView!).compactMap { $0 as? NSOutlineView }.first)
        room.window.makeFirstResponder(outline); await room.settle()
        try #require(outline.selectedRow >= 0 && model.editor?.id == model.tasks[0].id)
        return (room, outline)
    }
    private func arrowDown(_ room: SidebarRoomHarness) async {
        let arrow = String(UnicodeScalar(0xF701)!), now = ProcessInfo.processInfo.systemUptime
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            room.window.sendEvent(NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [.numericPad, .function], timestamp: now, windowNumber: room.window.windowNumber,
                                                   context: nil, characters: arrow, charactersIgnoringModifiers: arrow, isARepeat: false, keyCode: 125)!)
        }
        await room.settle()
    }

    /// The selection and the editor land in one run-loop turn, so the list and the inspector render
    /// once together; through the hop to a Task the editor came at least one turn (and one render of
    /// the list alone) later. Measured on the selection's own Diagnostics events: the run-loop turns
    /// that end between `ui.action.started` and `model.published`.
    @Test func aCleanSelectionOpensTheTaskInTheSelectionsTurn() async throws {
        let journal = FileManager.default.temporaryDirectory.appendingPathComponent("row-turns-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: journal) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: journal); recorder.authorizeOwnerSession(true)
        let model = SidebarRoomHarness.fixtureModel(clientDiagnostics: recorder)
        model.personInput.applicationActive = { true }
        model.clientDiagnosticsUI.start()
        let room = await SidebarRoomHarness(model: model, at: SidebarRoomHarness.offScreen)
        defer { model.clientDiagnosticsUI.stop(); room.close() }
        model.beginEditing(model.tasks[0]); await room.settle()
        let outline = try #require(views(room.window.contentView!).compactMap { $0 as? NSOutlineView }.first)
        room.window.makeFirstResponder(outline); await room.settle()
        let opening = model.editor?.opening, row = outline.selectedRow
        final class Turns: @unchecked Sendable { var ends: [Double] = [] }
        let turns = Turns()
        let observer = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, true, 0) { _, _ in turns.ends.append(ProcessInfo.processInfo.systemUptime * 1000) }
        CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
        defer { CFRunLoopRemoveObserver(CFRunLoopGetMain(), observer, .commonModes) }
        let arrow = String(UnicodeScalar(0xF701)!), now = ProcessInfo.processInfo.systemUptime
        let down = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [.numericPad, .function], timestamp: now, windowNumber: room.window.windowNumber, context: nil, characters: arrow, charactersIgnoringModifiers: arrow, isARepeat: false, keyCode: 125)!
        model.personInput.observe(down) // what the app's local monitor does before dispatch
        room.window.sendEvent(down)
        await room.settle()
        #expect(outline.selectedRow == row + 1)
        #expect(model.editor != nil && model.editor?.id != model.tasks[0].id)
        #expect(model.editor?.opening != opening, "a new opening, as navigate makes")
        let events = (await recorder.snapshot()).recent
        let started = try #require(events.last { $0.name == .actionStarted && $0.action == .keyboardSelection }?.monotonicMS, "no handler start recorded")
        let published = try #require(events.last { $0.name == .resultPublished }?.monotonicMS, "no publication recorded")
        let between = turns.ends.filter { $0 > started && $0 < published }.count
        #expect(between == 0, "run-loop turns between the handler's start and the editor's publication: \(between) (\(String(format: "%.1f", published - started)) ms)")
    }

    @Test func unsavedChangesStillAskThroughNavigate() async throws {
        let (room, outline) = try await open()
        defer { room.close() }
        room.model.editor?.title = "Edited"
        let row = outline.selectedRow
        await arrowDown(room)
        guard case .edit? = room.model.pendingNavigation else { Issue.record("no question: \(String(describing: room.model.pendingNavigation))"); return }
        #expect(room.model.editor?.title == "Edited")
        #expect(outline.selectedRow == row, "the selection goes back to the open Task")
        room.model.cancelNavigation(); await room.settle()
        #expect(room.model.editor?.title == "Edited")
        #expect(outline.selectedRow == row)
    }

    @Test func whileBusyNothingOpens() async throws {
        let (room, outline) = try await open()
        defer { room.close() }
        let row = outline.selectedRow, id = room.model.editor?.id
        room.model.busy = true
        await arrowDown(room)
        #expect(room.model.editor?.id == id)
        #expect(outline.selectedRow == row, "the refused navigation puts the selection back")
        room.model.busy = false
    }

    @Test func withAQuestionUpNothingOpensSilently() async throws {
        let (room, _) = try await open()
        defer { room.close() }
        room.model.editor?.title = "Edited"
        #expect(room.model.closeEditor() == false)
        let id = room.model.editor?.id
        await arrowDown(room)
        #expect(room.model.editor?.id == id)
        #expect(room.model.editor?.title == "Edited")
        #expect(room.model.pendingNavigation != nil)
    }

    @Test func theSelectionMarksThePersonActing() async throws {
        let (room, _) = try await open()
        defer { room.close() }
        let before = room.model.personInput.count
        await arrowDown(room)
        #expect(room.model.personInput.count > before)
    }

    /// The run-loop turns that end between a selection's `ui.action.started` and its
    /// `model.published`, around `send`; and the selection's action, for its category.
    private func turnsBetween(_ model: TodoModel, _ recorder: ClientDiagnosticsRecorder, _ action: ClientDiagnosticAction, send: () async throws -> Void) async throws -> Int {
        final class Turns: @unchecked Sendable { var ends: [Double] = [] }
        let turns = Turns()
        let observer = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, true, 0) { _, _ in turns.ends.append(ProcessInfo.processInfo.systemUptime * 1000) }
        CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
        defer { CFRunLoopRemoveObserver(CFRunLoopGetMain(), observer, .commonModes) }
        try await send()
        let events = (await recorder.snapshot()).recent
        let started = try #require(events.last { $0.name == .actionStarted && $0.action == action }?.monotonicMS, "no handler start recorded for \(action)")
        let published = try #require(events.last { $0.name == .resultPublished && $0.monotonicMS >= started }?.monotonicMS, "no publication recorded")
        return turns.ends.filter { $0 > started && $0 < published }.count
    }
    private func recordedRoom(_ prepare: (TodoModel) -> Void = { _ in }) async throws -> (SidebarRoomHarness, NSOutlineView, ClientDiagnosticsRecorder, URL) {
        let journal = FileManager.default.temporaryDirectory.appendingPathComponent("row-turns-" + UUID().uuidString)
        let recorder = ClientDiagnosticsRecorder(journalDirectory: journal); recorder.authorizeOwnerSession(true)
        let model = SidebarRoomHarness.fixtureModel(clientDiagnostics: recorder)
        model.personInput.applicationActive = { true }
        prepare(model)
        model.clientDiagnosticsUI.start()
        let room = await SidebarRoomHarness(model: model, at: SidebarRoomHarness.offScreen)
        return (room, try #require(views(room.window.contentView!).compactMap { $0 as? NSOutlineView }.first), recorder, journal)
    }

    /// Search snapshot rows: the list shows the applied snapshot's rows, not the catalog's, and a
    /// keyboard selection among them opens the snapshot row's Task in the selection's turn.
    @Test func aSearchSnapshotRowOpensInTheSelectionsTurn() async throws {
        var rows: [TaskSnapshot] = []
        let (room, outline, recorder, journal) = try await recordedRoom { model in
            // Every sixth Task: all P1, so one group, and t006 follows t000 where the catalog has t003.
            rows = model.tasks.enumerated().filter { $0.offset % 6 == 0 }.map(\.element)
            model.appliedSearchSnapshot = TaskSearchSnapshot(appliedIdentity: model.requestedIdentity, rows: rows, groups: [])
        }
        let model = room.model
        defer { model.clientDiagnosticsUI.stop(); room.close(); try? FileManager.default.removeItem(at: journal) }
        await room.settle()
        model.beginEditing(rows[0]); await room.settle()
        room.window.makeFirstResponder(outline); await room.settle()
        try #require(model.editor?.id == rows[0].id && outline.selectedRow >= 0)
        let between = try await turnsBetween(model, recorder, .keyboardSelection) {
            let arrow = String(UnicodeScalar(0xF701)!), now = ProcessInfo.processInfo.systemUptime
            let down = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [.numericPad, .function], timestamp: now, windowNumber: room.window.windowNumber, context: nil, characters: arrow, charactersIgnoringModifiers: arrow, isARepeat: false, keyCode: 125)!
            model.personInput.observe(down)
            room.window.sendEvent(down)
            await room.settle()
        }
        #expect(model.editor?.id == rows[1].id, "the snapshot's next row (\(rows[1].id)), not the catalog's: \(String(describing: model.editor?.id))")
        #expect(model.pendingNavigation == nil)
        #expect(between == 0, "run-loop turns between the handler's start and the editor's publication: \(between)")
    }

    /// A pointer selection takes the same path: a click on another row opens that row's Task in the
    /// selection's turn and marks the person acting. The click is driven as AppKit completes it: the
    /// mouse-down through the app's input monitor, the outline view's own row selection (what its
    /// tracking loop does on release), then the mouse-up. A real mouse-down sent into the hosted
    /// window's list ends the test process inside that tracking loop, so the loop itself is not
    /// driven here.
    @Test func aPointerSelectionOpensTheTaskInTheSelectionsTurn() async throws {
        let (room, outline, recorder, journal) = try await recordedRoom()
        let model = room.model
        defer { model.clientDiagnosticsUI.stop(); room.close(); try? FileManager.default.removeItem(at: journal) }
        model.beginEditing(model.tasks[0]); await room.settle()
        let first = outline.selectedRow
        try #require(first >= 0 && model.editor?.id == model.tasks[0].id)
        let target = first + 2
        let before = model.personInput.count
        let between = try await turnsBetween(model, recorder, .taskSelection) {
            let rect = outline.rect(ofRow: target)
            let point = outline.convert(NSPoint(x: rect.minX + 60, y: rect.midY), to: nil), now = ProcessInfo.processInfo.systemUptime
            let down = try #require(NSEvent.mouseEvent(with: .leftMouseDown, location: point, modifierFlags: [], timestamp: now, windowNumber: room.window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: 1))
            let up = try #require(NSEvent.mouseEvent(with: .leftMouseUp, location: point, modifierFlags: [], timestamp: now + 0.05, windowNumber: room.window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: 0))
            model.personInput.observe(down) // what the app's local monitor does before dispatch
            outline.selectRowIndexes(IndexSet(integer: target), byExtendingSelection: false)
            model.personInput.observe(up)
            await room.settle()
        }
        #expect(outline.selectedRow == target)
        #expect(model.editor != nil && model.editor?.id != model.tasks[0].id)
        #expect(model.personInput.count > before)
        #expect(between == 0, "run-loop turns between the handler's start and the editor's publication: \(between)")
    }
} }
