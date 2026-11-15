import AppKit
import Foundation
import Observation
import OpenAPIRuntime
import TodoAPI

/// What the person had on a Profile: its view, Project, Tag, filters and search text.
struct ProfileViewState: Equatable {
    var selectedView: String
    var selectedProject: String?
    var selectedTag: String?
    var filters: TaskListFilters
    var searchText: String
    @MainActor init(_ model: TodoModel) {
        selectedView = model.selectedView; selectedProject = model.selectedProject; selectedTag = model.selectedTag
        filters = model.requestedTaskFilters; searchText = model.searchText
    }
}

/// A switch the client made because the shown Profile was deleted (ruling on the candidate 9
/// restore finding). It records where the person was, where the client moved them and under which
/// credential. When a restore's reload finds the Profile again, the client returns to it if the
/// person has done nothing since; otherwise it stays and offers to go there. It never crosses a
/// credential change or a sign-out, and the person is never left on another Profile untold.
struct ForcedProfileLeave: Equatable {
    let profile: String
    let name: String
    let view: ProfileViewState
    let switchedTo: String
    var baseline: ProfileViewState
    let credentialEpoch: Int
    let notice: String
    /// The person-input count when the leave was recorded (PersonInput, MAC-C1-S1-32).
    var inputMark = 0
}

extension TodoModel {
    /// "\"Work\" was restored. Switched back to it." and the offer "\"Work\" was restored."
    /// The offer as VoiceOver hears it (coordinator, candidate 10).
    static func restoredProfileAnnouncement(_ name: String) -> String {
        "\u{201C}\(name)\u{201D} was restored. To go there, use Switch to \(name) at the bottom of the window."
    }
    static func restoredProfileNotice(_ name: String, returned: Bool) -> String {
        returned ? "\u{201C}\(name)\u{201D} was restored. Switched back to it." : "\u{201C}\(name)\u{201D} was restored."
    }

    /// The one entry point for every source of a person's action (MAC-C1-S1-32): the input
    /// observer counts mouse-downs and key-downs itself; everything else (a write the person
    /// started, a sheet or dialog presented, selection, search typing, an editor or Quick Add
    /// opening, a Profile change, a menu command, a drop, a paste, an accessibility action) calls
    /// this. Programmatic resets, refreshes, stream events, timers and the notice ending by itself
    /// never call it.
    func notePersonActed() { personInput.mark() }
    /// A sheet or dialog going from hidden to shown. Closing one is not an action of its own.
    func notePresented(_ shown: Bool, _ wasShown: Bool) { if shown && !wasShown { notePersonActed() } }

    /// "Acted" is the union of the person-input mark and the state the person changes, compared
    /// against what was captured when the leave was recorded; the input that caused the leave was
    /// counted before it and so does not count.
    func personActedSinceLeave(_ leave: ForcedProfileLeave) -> Bool {
        personInput.count != leave.inputMark || profile != leave.switchedTo || ProfileViewState(self) != leave.baseline || editor != nil || quickAdd || !newTitle.isEmpty
    }

    /// Asked before the client switches away from `deleted`, while the shown state is still the one
    /// the person left: an earlier leave to carry forward when the Profile the client moved them
    /// to is now gone too and they have done nothing since (personActedSinceLeave(earlier)).
    func forcedLeaveToCarry(leaving deleted: String) -> ForcedProfileLeave? {
        guard let earlier = forcedLeave, earlier.credentialEpoch == discovery.credentialEpoch, earlier.switchedTo == deleted,
              !personActedSinceLeave(earlier) else { return nil }
        return earlier
    }

    /// Called after the client switched away from a deleted Profile. A second forced switch while
    /// the person has still done nothing (`carrying`, from forcedLeaveToCarry before the switch)
    /// keeps the first Profile and view as the place to return to.
    func recordForcedLeave(profile deleted: String, name: String, view: ProfileViewState, switchedTo: String, notice: String, carrying earlier: ForcedProfileLeave?) {
        let epoch = discovery.credentialEpoch
        let first = earlier.flatMap { $0.credentialEpoch == epoch ? $0 : nil }
        forcedLeave = ForcedProfileLeave(profile: first?.profile ?? deleted, name: first?.name ?? name, view: first?.view ?? view, switchedTo: switchedTo,
                                         baseline: ProfileViewState(self), credentialEpoch: epoch, notice: notice, inputMark: personInput.count)
        restoredProfileOffer = nil
    }

    /// After a reload's rediscovery. Returns true when the client switched back (the stream is
    /// reconnecting into that Profile); false when it stays where it is.
    func resolveForcedLeave(_ leave: ForcedProfileLeave, acted: Bool) -> Bool {
        guard signedIn, isCurrentEpoch(leave.credentialEpoch) else { forcedLeave = nil; return false }
        guard let back = profiles.first(where: { $0.id == leave.profile }) else {
            // The deletion still holds: stay where the client switched to, and keep saying why.
            if profile == leave.switchedTo { publishNotice(leave.notice, seconds: 6) }
            return false
        }
        forcedLeave = nil
        if acted {
            restoredProfileOffer = leave
            publishNotice(Self.restoredProfileNotice(back.name, returned: false), seconds: 10)
            // The offer is spoken too, with its action, so VoiceOver users hear it (UI check, c10).
            announce(Self.restoredProfileAnnouncement(back.name))
            return false
        }
        returnToProfile(leave)
        publishNotice(Self.restoredProfileNotice(back.name, returned: true), seconds: 6)
        return true
    }

    /// The notice's offer: go to the restored Profile, with the view it had. Like any Profile
    /// change, not while an editor is open or a write is running.
    func goToRestoredProfile() {
        guard let offer = restoredProfileOffer, signedIn, isCurrentEpoch(offer.credentialEpoch), editor == nil, !busy,
              profiles.contains(where: { $0.id == offer.profile }) else { return }
        restoredProfileOffer = nil
        deletionNotice = nil
        returnToProfile(offer)
    }

    private func returnToProfile(_ leave: ForcedProfileLeave) {
        activateProfile(leave.profile)
        selectedView = leave.view.selectedView
        selectedProject = leave.view.selectedProject
        selectedTag = leave.view.selectedTag
        if leave.view.filters != requestedTaskFilters { applyTaskFilters(leave.view.filters) }
        if leave.view.searchText != searchText { searchText = leave.view.searchText; scheduleSearch() }
    }
}
