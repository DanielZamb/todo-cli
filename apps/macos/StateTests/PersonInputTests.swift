import AppKit
import Foundation
import Testing
@testable import TodoState

/// MAC-C1-S1-32: one entry point counts every person action, and the forced Profile switch's
/// "acted" test is the union of that mark and the state the person changes. The real event path
/// (NSEvent's local monitor) cannot be driven headlessly; these tests drive `PersonInput.observe`
/// with synthesized events and the model's own entry points. MAC-C1-S1-34: the offer ends with its
/// notice, timed with an injected clock.
/// The notice timer's clock under test control: each sleep waits until `fire()`.
@MainActor final class NoticeClock {
    var started: [Double] = []
    var cancelled = 0
    private var generation = 0
    func sleep(_ seconds: Double) async throws {
        started.append(seconds)
        let waiting = generation
        do { while generation == waiting { try await Task.sleep(for: .milliseconds(1)) } } catch { cancelled += 1; throw error }
    }
    func fire() { generation += 1 }
}

@MainActor @Suite struct PersonInputTests {
    private func until(_ condition: () -> Bool) async throws {
        let deadline = ProcessInfo.processInfo.systemUptime + 5
        while !condition() {
            guard ProcessInfo.processInfo.systemUptime < deadline else { Issue.record("timed out"); throw CancellationError() }
            try await Task.sleep(for: .milliseconds(1))
        }
    }
    private func model() -> TodoModel {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-person-input"),
                              catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.profiles = [DiscoveryEntry(id: "work", name: "Work", open_task_count: 0, inbox_task_count: 0),
                          DiscoveryEntry(id: "launch", name: "Launch", open_task_count: 0, inbox_task_count: 0)]
        model.personInput.applicationActive = { true } // a test process is never the active app
        return model
    }
    private func task(_ id: String) -> TaskSnapshot {
        TaskSnapshot(id: id, profile_id: "work", row_version: 1, title: "Scratch Task", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }
    /// The client left "launch" for "work", the shown Profile.
    private func leave(_ model: TodoModel) -> ForcedProfileLeave {
        model.recordForcedLeave(profile: "launch", name: "Launch", view: ProfileViewState(model), switchedTo: model.profile,
                                notice: "\u{201C}Launch\u{201D} was deleted. Switched to Work.", carrying: nil)
        return model.forcedLeave!
    }
    static func mouse(_ type: NSEvent.EventType) -> NSEvent {
        NSEvent.mouseEvent(with: type, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: 0, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!
    }
    static func key(_ type: NSEvent.EventType, flags: NSEvent.ModifierFlags = []) -> NSEvent {
        NSEvent.keyEvent(with: type, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: 0, context: nil,
                         characters: type == .flagsChanged ? "" : "a", charactersIgnoringModifiers: type == .flagsChanged ? "" : "a", isARepeat: false, keyCode: type == .flagsChanged ? 56 : 0)!
    }
    static func scroll() -> NSEvent {
        NSEvent(cgEvent: CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: 4, wheel2: 0, wheel3: 0)!)!
    }

    @Test func mouseDownsAndKeyDownsCountAndNothingElseDoes() {
        let input = PersonInput()
        input.applicationActive = { true }
        var handed: [NSEvent.EventType] = []
        input.diagnostics = { handed.append($0.type) }
        let counted: [(String, NSEvent)] = [("left mouse down", Self.mouse(.leftMouseDown)), ("right mouse down", Self.mouse(.rightMouseDown)),
                                            ("other mouse down", Self.mouse(.otherMouseDown)), ("key down", Self.key(.keyDown))]
        let ignored: [(String, NSEvent)] = [("left mouse up", Self.mouse(.leftMouseUp)), ("left mouse dragged", Self.mouse(.leftMouseDragged)),
                                            ("mouse moved", Self.mouse(.mouseMoved)), ("key up", Self.key(.keyUp)),
                                            ("a modifier key alone", Self.key(.flagsChanged, flags: .shift)), ("scroll", Self.scroll())]
        for (name, event) in counted {
            let before = input.count
            input.observe(event)
            #expect(input.count == before + 1, "\(name) counts")
        }
        for (name, event) in ignored {
            let before = input.count
            input.observe(event)
            #expect(input.count == before, "\(name) does not count")
        }
        // Diagnostics receives exactly what its own monitor received before c10.
        #expect(handed == [.leftMouseDown, .keyDown, .leftMouseUp, .leftMouseDragged, .scrollWheel])
        input.diagnostics = nil
        input.observe(Self.mouse(.leftMouseDown))
        #expect(handed.count == 5 && input.count == 5, "with diagnostics off nothing is handed on, and the mark still advances")
    }

    @Test func theObserverDoesNotAllocate() {
        let input = PersonInput()
        input.applicationActive = { true }
        let events = [Self.mouse(.leftMouseDown), Self.key(.keyDown), Self.scroll(), Self.mouse(.mouseMoved)]
        for event in events { input.observe(event) } // warm
        var samples: [Int] = []
        for _ in 0..<5 {
            var before = malloc_statistics_t(), after = malloc_statistics_t()
            malloc_zone_statistics(nil, &before)
            for _ in 0..<2_500 { for event in events { input.observe(event) } }
            malloc_zone_statistics(nil, &after)
            samples.append(Int(after.size_allocated) - Int(before.size_allocated))
        }
        // 10,000 events per sample; an allocation per event would add at least 160 KB.
        #expect(samples.min()! < 1_024, "bytes allocated over 10,000 events, five samples: \(samples)")
    }

    @Test func noInputAndProgrammaticChangesDoNotCount() async throws {
        let model = model(), leave = leave(model)
        #expect(!model.personActedSinceLeave(leave))
        // The notice's own timer and its ending, a refresh's data, sheets closing, resets.
        var slept: [Double] = []
        model.noticeSleep = { slept.append($0) }
        model.publishNotice("\u{201C}Launch\u{201D} was deleted. Switched to Work.", seconds: 6)
        try await until { model.deletionNotice == nil }
        model.deletionNotice = nil
        model.tasks = [task("t1")]
        model.showingImport = false
        model.batchEdit = nil
        model.dependencies.picker = nil
        model.dependencies.reset()
        model.discovery.invalidate()
        model.newTitle = ""
        #expect(slept == [6] && !model.personActedSinceLeave(model.forcedLeave!), "timer \(slept)")
    }

    @Test(arguments: ["click", "right click", "key", "selection", "search", "Quick Add", "editor", "write", "Import", "Batch edit", "Find by id",
                      "Dependency picker", "Series", "History", "Snapshot dialog", "Profile deletion prompt", "transfer", "navigation prompt", "menu command"])
    func eachSourceCounts(_ source: String) async {
        let model = model(), leave = leave(model)
        switch source {
        case "click": model.personInput.observe(Self.mouse(.leftMouseDown))
        case "right click": model.personInput.observe(Self.mouse(.rightMouseDown))
        case "key": model.personInput.observe(Self.key(.keyDown))
        case "selection": model.notePersonActed() // the list's selection binding (AppViews)
        case "search": model.setSearchText("launch")
        case "Quick Add": model.quickAdd = true
        case "editor": model.editor = TaskDraft(task("t1"))
        case "write": await model.transition(task("t1"), action: "complete") // refused offline; the attempt counts
        case "Import": model.showingImport = true
        case "Batch edit": model.batchEdit = BatchEditDraft(profile: model.profile)
        case "Find by id": model.discovery.dialog = .lookup
        case "Dependency picker": model.dependencies.picker = .init(profile: model.profile, root: task("t1"), direction: .dependsOn)
        case "Series": model.showingSeries = true
        case "History": model.showingHistory = true
        case "Snapshot dialog": model.snapshotRestore = try! JSONDecoder().decode(SnapshotRestorePreview.self, from: Data(#"{"id":"s","dry_run":true,"seq_before":1,"seq_after":1,"seq_delta":0,"generation":"g","task_counts":[]}"#.utf8))
        case "Profile deletion prompt": model.profileDeletion = ProfileDeletionPrompt(name: "Work", count: 0)
        case "transfer": model.transferRequest = TaskTransferRequest(kind: .move, task: task("t1"))
        case "navigation prompt": model.pendingNavigation = .profile("launch")
        case "menu command": model.notePersonActed() // TodoApp's Commands (the source control holds each to it)
        default: Issue.record("unknown source \(source)")
        }
        #expect(model.personActedSinceLeave(leave), "\(source) counts as acting")
    }

    /// The input that caused the leave does not count: it came before the leave was recorded.
    @Test func inputBeforeTheLeaveDoesNotCount() {
        let model = model()
        model.personInput.observe(Self.mouse(.leftMouseDown)) // the click on Delete Profile
        model.showingImport = true; model.showingImport = false
        let leave = leave(model)
        #expect(!model.personActedSinceLeave(leave))
        model.personInput.observe(Self.mouse(.leftMouseDown))
        #expect(model.personActedSinceLeave(leave))
    }

    /// Coordinator's refinement (candidate 10): the click that only brings Todo to the front is not
    /// an action. A mouse-down while the app is not active does not count; nor does the first
    /// mouse-down within 0.5 s of activation with no input in between. The next click counts.
    @Test func theActivatingClickDoesNotCount() {
        // AppKit may deliver the activating click before or after the app becomes active.
        // Before: the click arrives while the app is not active, and the next click counts.
        let before = PersonInput()
        var active = false
        before.applicationActive = { active }
        before.observe(Self.mouse(.leftMouseDown))
        before.observe(Self.mouse(.rightMouseDown))
        #expect(before.count == 0, "mouse-downs while the app is not active")
        active = true
        before.applicationDidBecomeActive()
        before.observe(Self.mouse(.leftMouseDown))
        #expect(before.count == 1, "the click after the activating one counts")
        // After: the app is already active when the click arrives; the first mouse-down within half
        // a second of activation, with no input in between, is the activating one.
        let after = PersonInput()
        after.applicationActive = { true }
        after.applicationDidBecomeActive()
        after.observe(Self.mouse(.leftMouseDown))
        #expect(after.count == 0, "the first mouse-down just after activation")
        after.observe(Self.mouse(.leftMouseDown))
        #expect(after.count == 1, "the next click counts")
        after.applicationDidBecomeActive()
        after.observe(Self.key(.keyDown))
        after.observe(Self.mouse(.leftMouseDown))
        #expect(after.count == 3, "after a key-down, a click is not the activating one")
        after.applicationDidBecomeActive(at: ProcessInfo.processInfo.systemUptime - 1)
        after.observe(Self.mouse(.leftMouseDown))
        #expect(after.count == 4, "a first click a second after activation counts")
    }

    /// An activating click, then a restore: back to it. An activating click and a second click: stay
    /// and offer.
    @Test(arguments: [false, true]) func anActivatingClickThenARestore(_ secondClick: Bool) {
        let model = model()
        model.signedIn = true
        var active = false
        model.personInput.applicationActive = { active }
        let leave = leave(model)
        model.personInput.observe(Self.mouse(.leftMouseDown)) // brings Todo forward
        active = true
        model.personInput.applicationDidBecomeActive()
        if secondClick { model.personInput.observe(Self.mouse(.leftMouseDown)) }
        let returned = model.resolveForcedLeave(leave, acted: model.personActedSinceLeave(leave))
        #expect(returned == !secondClick)
        #expect(model.profile == (secondClick ? "work" : "launch"))
        #expect(model.deletionNotice == (secondClick ? "\u{201C}Launch\u{201D} was restored." : "\u{201C}Launch\u{201D} was restored. Switched back to it."))
        #expect((model.restoredProfileOffer != nil) == secondClick)
    }

    @Test func theOfferIsAnnouncedWithWhereToFindIt() {
        #expect(TodoModel.restoredProfileAnnouncement("Launch") == "\u{201C}Launch\u{201D} was restored. To go there, use Switch to Launch at the bottom of the window.")
    }

    /// Restored, the person did nothing: back to it, told so for 6 s. Restored after one click:
    /// stay, and the offer for 10 s.
    @Test(arguments: [false, true]) func aRestoreReturnsOrOffers(_ clicked: Bool) {
        let model = model()
        model.signedIn = true
        let leave = leave(model)
        if clicked { model.personInput.observe(Self.mouse(.leftMouseDown)) }
        let returned = model.resolveForcedLeave(leave, acted: model.personActedSinceLeave(leave))
        #expect(returned == !clicked)
        #expect(model.profile == (clicked ? "work" : "launch"))
        #expect(model.deletionNotice == (clicked ? "\u{201C}Launch\u{201D} was restored." : "\u{201C}Launch\u{201D} was restored. Switched back to it."))
        #expect(model.noticeSeconds == (clicked ? 10 : 6))
        #expect((model.restoredProfileOffer != nil) == clicked)
    }

    /// A second deletion while the person has done nothing carries the first place to return to;
    /// one click before it does not.
    @Test(arguments: [false, true]) func aSecondDeletionCarriesTheFirstLeaveOnlyWithoutInput(_ clicked: Bool) {
        let model = model()
        _ = leave(model) // launch → work
        if clicked { model.personInput.observe(Self.mouse(.leftMouseDown)) }
        let carried = model.forcedLeaveToCarry(leaving: "work")
        #expect((carried?.profile == "launch") == !clicked)
        model.recordForcedLeave(profile: "work", name: "Work", view: ProfileViewState(model), switchedTo: "personal", notice: "\u{201C}Work\u{201D} was deleted. Switched to Personal.", carrying: carried)
        #expect(model.forcedLeave?.profile == (clicked ? "work" : "launch"))
    }

    /// MAC-C1-S1-34: an ignored offer ends with its notice after 10 s, and a later ordinary notice
    /// lasts 3 s and has no offer.
    @Test func anIgnoredOfferEndsWithItsNoticeAndAnOrdinaryNoticeLastsThreeSeconds() async throws {
        let model = model()
        let clock = NoticeClock()
        model.noticeSleep = { try await clock.sleep($0) }
        model.signedIn = true
        let leave = leave(model)
        model.personInput.observe(Self.mouse(.leftMouseDown))
        _ = model.resolveForcedLeave(leave, acted: model.personActedSinceLeave(leave))
        #expect(model.restoredProfileOffer != nil && model.deletionNotice == "\u{201C}Launch\u{201D} was restored.")
        try await until { clock.started == [10] }
        clock.fire() // nobody hovered or focused it
        try await until { model.deletionNotice == nil }
        #expect(model.restoredProfileOffer == nil)
        model.deletionNotice = "Task deleted"
        #expect(model.restoredProfileOffer == nil && model.noticeSeconds == 3)
        try await until { clock.started == [10, 3] }
        clock.fire()
        try await until { model.deletionNotice == nil }
    }

    /// The UI check's items 3 and 4: the timer waits while the pointer is over the notice or its
    /// button has keyboard focus, and counts its full time again from when both have left; 10 s for
    /// the offer, 6 s for a forced switch.
    @Test(arguments: ["offer", "forced switch"]) func theTimerWaitsWhileHeldAndStartsAgainWhenLeft(_ notice: String) async throws {
        let model = model(), clock = NoticeClock()
        model.noticeSleep = { try await clock.sleep($0) }
        model.signedIn = true
        let seconds: Double = notice == "offer" ? 10 : 6
        if notice == "offer" {
            let leave = leave(model)
            model.personInput.observe(Self.mouse(.leftMouseDown))
            _ = model.resolveForcedLeave(leave, acted: model.personActedSinceLeave(leave))
        } else {
            model.publishNotice("\u{201C}Launch\u{201D} was deleted. Switched to Work.", seconds: 6)
        }
        try await until { clock.started == [seconds] }
        model.noticeHeld = true // the pointer arrives, or the button takes focus
        try await until { clock.cancelled == 1 }
        clock.fire() // time passes while held: nothing ends
        try await Task.sleep(for: .milliseconds(20))
        #expect(model.deletionNotice != nil && clock.started == [seconds])
        model.noticeHeld = false // both have left
        try await until { clock.started == [seconds, seconds] }
        #expect(model.deletionNotice != nil)
        clock.fire()
        try await until { model.deletionNotice == nil }
        #expect(model.restoredProfileOffer == nil)
    }
}
