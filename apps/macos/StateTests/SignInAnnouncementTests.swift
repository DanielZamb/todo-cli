import AppKit
import Foundation
import Testing
import TodoAPI
@testable import TodoState

/// The sign-in screen's message is announced once per message, as MessageBanner's are (UI seat on
/// cfe01e85): a Session the server ends says so to VoiceOver, where before it was a plain Text that
/// was never read. The production RootView in a hosted window that is never shown.
extension MainThreadExclusive { @MainActor @Suite(.serialized) struct SignInAnnouncementTests {
    @Test func theSessionEndedMessageIsAnnouncedOnce() async throws {
        let model = SidebarRoomHarness.fixtureModel()
        model.beginEditing(model.tasks[3]); model.editor?.title = "Edited"
        let room = await SidebarRoomHarness(model: model, at: SidebarRoomHarness.offScreen)
        defer { room.close() }
        model.handleAuthorization(RequestFailure(status: 401, message: "unauthorized", code: "unauthorized"), credentialEpoch: model.discovery.credentialEpoch)
        await room.settle()
        #expect(!model.signedIn)
        #expect(model.message == "Your Session ended. Unsaved changes to \u{201C}Review the long launch checklist with the whole team 3\u{201D} were lost. Sign in again.")
        // The view took this message's announcement; a second take is refused.
        #expect(model.takeAnnouncement(model.messageSequence) == false, "the sign-in screen did not announce its message")
    }
} }
