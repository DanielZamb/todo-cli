import Foundation
import Testing
@testable import TodoState

/// The local messages the seat found outside the table (candidate 8, OBS-7b-2): the quiet
/// confirmation's lifetime and the Attachments section's own caption, now under the one rule.
@MainActor @Suite struct LocalMessageLifetimeTests {
    private func model() -> TodoModel {
        TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-local-messages"))
    }
    private func task(_ id: String) -> TaskSnapshot {
        TaskSnapshot(id: id, profile_id: "work", row_version: 1, title: "Scratch Task", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }

    @Test func aConfirmationsTimerEndsOnlyThatConfirmation() {
        let model = model()
        model.deletionNotice = "Task deleted"
        let firstTimer = model.noticeMessages.mark
        model.deletionNotice = "Task added"
        model.expireNotice(since: firstTimer)
        #expect(model.deletionNotice == "Task added", "a replacement keeps its own three seconds")
        let secondTimer = model.noticeMessages.mark
        model.deletionNotice = "Task added"
        model.expireNotice(since: secondTimer)
        #expect(model.deletionNotice == "Task added", "the same text again is a new confirmation")
        model.expireNotice(since: model.noticeMessages.mark)
        #expect(model.deletionNotice == nil, "its own timer ends it")
    }

    @Test func anOlderDropCannotChangeANewerOnesCaption() {
        let model = model()
        model.beginEditing(task("a"))
        // Older failure after newer success.
        var older = model.attachmentInputMessages.begin(.drop)
        var newer = model.attachmentInputMessages.begin(.drop)
        model.attachmentInputMessages.succeed(newer)
        model.attachmentInputMessages.fail("Could not read the dropped file. Try Add file.", older)
        #expect(model.attachmentInputError == nil)
        // Older success after newer failure.
        older = model.attachmentInputMessages.begin(.drop)
        newer = model.attachmentInputMessages.begin(.drop)
        model.attachmentInputMessages.fail("Images must be 20 MiB or smaller.", newer)
        model.attachmentInputMessages.succeed(older)
        #expect(model.attachmentInputError == "Images must be 20 MiB or smaller.")
        // A later successful drop ends that caption; a paste refusal stays its own kind.
        let later = model.attachmentInputMessages.begin(.drop)
        model.attachmentInputMessages.succeed(later)
        #expect(model.attachmentInputError == nil)
    }

    @Test func aDropFromAnEarlierEditorOpeningPresentsNothing() {
        let model = model()
        model.beginEditing(task("a"))
        let ticket = model.attachmentInputMessages.begin(.drop)
        model.beginEditing(task("b"))
        model.attachmentInputMessages.fail("Could not read the dropped file. Try Add file.", ticket)
        #expect(model.attachmentInputError == nil, "a new opening is a new instance")
        #expect(!model.attachmentInputMessages.isNewest(ticket))
    }
}
