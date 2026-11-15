import Foundation
import Testing
@testable import TodoState

/// The draft question's wording (UI seat, "Delta b968f31a"): the title names the Task and, for a
/// status change, what waits on the answer; the room rule's message says why the Task would close.
@Suite struct DraftQuestionWordingTests {
    private let task = TaskSnapshot(id: "t1", profile_id: "work", row_version: 1, title: "Ship the launch notes", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)

    @Test func theTitleNamesTheTaskAndTheReason() {
        let title = { (target: TodoModel.EditorNavigation?) in DraftNavigationPrompt.title(hasConflict: false, target: target, task: "Ship the launch notes") }
        #expect(title(.close(.person)) == "Save changes to \u{201C}Ship the launch notes\u{201D}?")
        #expect(title(.close(.sidebar)) == "Save changes to \u{201C}Ship the launch notes\u{201D}?")
        #expect(title(.edit(task)) == "Save changes to \u{201C}Ship the launch notes\u{201D}?")
        #expect(title(.transition(task, action: "complete")) == "Save changes to \u{201C}Ship the launch notes\u{201D} before completing it?")
        #expect(title(.transition(task, action: "cancel")) == "Save changes to \u{201C}Ship the launch notes\u{201D} before cancelling it?")
        #expect(title(.transition(task, action: "reopen")) == "Save changes to \u{201C}Ship the launch notes\u{201D} before reopening it?")
        #expect(DraftNavigationPrompt.title(hasConflict: true, target: .close(.person), task: "Ship the launch notes") == "Resolve the Conflict first")
    }

    @Test func theRoomRulesMessageSaysWhy() {
        #expect(DraftNavigationMessage.text(hasConflict: false, target: .close(.sidebar)) == "It closes to make room for the sidebar. Save your changes, discard them, or cancel to keep editing this task.")
        #expect(DraftNavigationMessage.text(hasConflict: false, target: .close(.person)) == "Save your changes, discard them, or cancel to keep editing this task.")
        #expect(DraftNavigationMessage.text(hasConflict: true, target: .close(.sidebar)) == "Resolve the Conflict in the inspector before saving. Discard changes to continue without them, or cancel to keep editing.")
    }
}
