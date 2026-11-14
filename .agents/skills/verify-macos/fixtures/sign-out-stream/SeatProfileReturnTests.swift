// Kept in the repository as a regression test (candidate 10, MAC-C1-S1-36): the correctness
// seat's candidate 9 return probes, unchanged except for the liveness check at the end of each.
import Foundation
import Testing
import TodoAPI
@testable import TodoState

// Seat probe (candidate 9, Claude Opus 5.5): the Profile return fix (86549d65) beyond the worker's
// seven cases. Production model, production transport and a real stream against the compiled
// merged server (SEAT_SERVER). Each case uses its own Profile so that the server's request log can
// attribute every request to a Profile the client has left (`leftAt` in each receipt).
@MainActor @Suite(.serialized) struct SeatProfileReturnTests {
    private let passphrase = "scratch verification passphrase"
    private var url: URL { URL(string: ProcessInfo.processInfo.environment["SEAT_SERVER"]!)! }
    private static let clock: DateFormatter = { let f = DateFormatter(); f.dateFormat = "HH:mm:ss.SSS"; return f }()
    private func now() -> String { Self.clock.string(from: Date()) }

    private func until(_ what: String, seconds: Double = 15, _ condition: () -> Bool) async throws {
        let deadline = ProcessInfo.processInfo.systemUptime + seconds
        while !condition() {
            guard ProcessInfo.processInfo.systemUptime < deadline else { Issue.record("timed out: \(what)"); throw URLError(.timedOut) }
            try await Task.sleep(for: .milliseconds(10))
        }
    }
    private func owner() async throws -> String {
        try await todoClient(server: url, credential: "").signIn_period_signIn(body: .json(.init(passphrase: passphrase))).ok.body.json.credential
    }
    private func newProfile(_ api: Client, _ name: String) async throws {
        // A Profile is created by its first Task (the server's createTask on an unknown Profile name
        // creates it); the CLI's init is the other way. Use the CLI to be explicit.
        let cli = ProcessInfo.processInfo.environment["SEAT_CLI"] ?? ""
        if !cli.isEmpty {
            let p = Process(); p.executableURL = URL(fileURLWithPath: cli)
            p.arguments = ["init", "--profile", name, "--credential-profile", "work", "--format", "json"]
            var env = ProcessInfo.processInfo.environment; env["TODO_SERVER_URL"] = url.absoluteString; p.environment = env
            try p.run(); p.waitUntilExit()
        }
    }
    private func snapshot(_ api: Client, _ reason: String) async throws -> String {
        let created = try await api.snapshots_period_create(body: .json(.init(reason: reason))).ok.body.json
        return try #require((try JSONSerialization.jsonObject(with: JSONEncoder().encode(created)) as? [String: Any])?["id"] as? String)
    }
    private func restore(_ api: Client, _ id: String) async throws { _ = try await api.snapshots_period_restore(path: .init(snapshot: id), body: .json(.init(dry_run: false))).ok }
    private func delete(_ api: Client, _ profile: String) async throws {
        _ = try await api.reads_period_deleteProfile(path: .init(profile: profile), body: .json(.init(with_tasks: true, dry_run: false))).ok
    }
    private func live(_ credential: String, on profile: String, showing title: String) async throws -> TodoModel {
        let model = TodoModel(configuration: .init(server: url, initialProfile: profile, vaultService: "memory-seat-return-" + UUID().uuidString),
                              clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.clientDiagnosticsUI.stop()
        model.replaceCredential(credential); model.signedIn = true; model.selectedView = "all"
        model.connect()
        try await until("live on \(profile)") { model.canWrite && !model.loading && model.profile == profile && model.tasks.contains { $0.title == title } }
        return model
    }
    private func settled(_ model: TodoModel) async throws {
        try await until("settled") { model.signedIn && model.profileSwitchSettled(model.profile) }
        try await Task.sleep(for: .milliseconds(300))
        try await until("settled again") { model.signedIn && model.profileSwitchSettled(model.profile) }
    }
    private func write(_ name: String, _ value: [String: Any]) throws {
        guard let evidence = ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] else { return }
        try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: evidence).appendingPathComponent("seat-return-\(name).json"))
    }
    private func serverTitles(_ profile: String) async throws -> Set<String> {
        let fresh = todoClient(server: url, credential: try await owner())
        return Set(try await fresh.tasks_period_list(path: .init(profile: profile)).ok.body.json.map(TaskSnapshot.decode).filter { $0.deleted_at == nil }.map(\.title))
    }
    /// One case: a fresh Profile with one Task, snapshotted, shown live, deleted; `meanwhile` runs
    /// after the client has left; then (if `restoreAfterMS` is set) the Snapshot is restored.
    private func scenario(_ name: String, restoreAfterMS: Int?, modelCredential: String? = nil, meanwhile: (TodoModel, Client) async throws -> Void = { _, _ in }) async throws -> (TodoModel, [String: Any]) {
        let api = todoClient(server: url, credential: try await owner())
        let credential: String
        if let modelCredential { credential = modelCredential } else { credential = try await owner() }
        let profile = "seat" + name.filter(\.isLetter).lowercased().prefix(18) + String(Int.random(in: 100...999))
        try await newProfile(api, profile)
        let title = "Seat return " + name
        _ = try await api.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: title)))
        let id = try await snapshot(api, "seat return \(name)")
        let model = try await live(credential, on: profile, showing: title)
        let deletedAt = now()
        try await delete(api, profile)
        try await until("the client left") { model.profile != profile }
        let leftAt = now(), away = model.profile
        let leftNotice = model.deletionNotice
        try await settled(model)
        try await meanwhile(model, api)
        var restoredAt: String? = nil
        if let gap = restoreAfterMS {
            try await Task.sleep(for: .milliseconds(gap))
            restoredAt = now()
            try await restore(api, id)
            try await until("the reload resolved") { model.profile == profile || model.restoredProfileOffer != nil || model.deletionNotice?.contains("was restored") == true }
        } else {
            try await Task.sleep(for: .milliseconds(2500))
        }
        try await settled(model)
        var receipt: [String: Any] = ["case": name, "profile": profile, "away": away, "deleted_at": deletedAt, "left_at": leftAt, "restored_at": restoredAt ?? NSNull(),
                                      "left_notice": leftNotice ?? NSNull(), "profile_shown": model.profile, "notice": model.deletionNotice ?? NSNull(),
                                      "offer": model.restoredProfileOffer?.profile ?? NSNull(), "signed_in": model.signedIn, "forced_leave": model.forcedLeave?.profile ?? NSNull()]
        if model.signedIn, let shown = try? await serverTitles(model.profile) { receipt["catalog_matches_server"] = Set(model.tasks.map(\.title)) == shown }
        try write(name, receipt)
        return (model, receipt)
    }

    /// More gaps than the worker's 0 and 400 ms: on both sides of the old 250 ms timer and well after.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [100, 250, 1000, 3000])
    func aRestoreAfterAnyGapReturnsAPersonWhoDidNothing(_ gapMS: Int) async throws {
        let (model, receipt) = try await scenario("gap\(gapMS)", restoreAfterMS: gapMS)
        defer { model.signedIn = false; model.connect() }
        #expect(model.profile == receipt["profile"] as? String, "\(receipt)")
        #expect(model.deletionNotice?.hasSuffix("was restored. Switched back to it.") == true, "\(receipt)")
        #expect(receipt["catalog_matches_server"] as? Bool == true, "\(receipt)")
        #expect((receipt["left_notice"] as? String)?.contains("was deleted. Switched to") == true, "\(receipt)")
        // MAC-C1-S1-36: whatever the case ends on, the client still follows changes.
        try await StreamLiveness.expectFollows(model, server: url, "seat aRestoreAfterAnyGapReturnsAPersonWhoDidNothing")
    }

    /// The deletion holds: the client stays, says why, and (audited from the server log) starts no
    /// request for the left Profile.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aDeletionThatHoldsKeepsTheNoticeAndStartsNothingForTheLeftProfile() async throws {
        let (model, receipt) = try await scenario("holds", restoreAfterMS: nil)
        defer { model.signedIn = false; model.connect() }
        #expect(model.profile != receipt["profile"] as? String)
        #expect(model.deletionNotice?.contains("was deleted. Switched to") == true, "\(receipt)")
        // MAC-C1-S1-36: whatever the case ends on, the client still follows changes.
        try await StreamLiveness.expectFollows(model, server: url, "seat aDeletionThatHoldsKeepsTheNoticeAndStartsNothingForTheLeftProfile")
    }

    /// The ruling: if the person has acted since the forced switch, the client stays and offers.
    /// Completing a Task from the list is an action; is it counted?
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func completingATaskWhileAwayCountsAsActing() async throws {
        var completed = ""
        let (model, receipt) = try await scenario("completed", restoreAfterMS: 200) { model, api in
            _ = try await api.tasks_period_create(path: .init(profile: model.profile), body: .json(.init(title: "Away Task to complete")))
            try await self.until("a Task to complete") { model.tasks.contains { $0.status == "open" } }
            let task = try #require(model.tasks.first { $0.status == "open" })
            completed = task.title
            await model.transition(task, action: "complete")
        }
        defer { model.signedIn = false; model.connect() }
        var r = receipt; r["completed"] = completed; try write("completed", r)
        #expect(model.profile == receipt["away"] as? String, "a person who completed a Task should stay: \(r)")
        #expect(model.restoredProfileOffer != nil || model.deletionNotice?.hasSuffix("was restored.") == true, "\(r)")
        // MAC-C1-S1-36: whatever the case ends on, the client still follows changes.
        try await StreamLiveness.expectFollows(model, server: url, "seat completingATaskWhileAwayCountsAsActing")
    }

    /// Opening the Dependency picker on a Task while away is an action.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func openingTheDependencyPickerWhileAwayCountsAsActing() async throws {
        let (model, receipt) = try await scenario("picker", restoreAfterMS: 200) { model, api in
            _ = try await api.tasks_period_create(path: .init(profile: model.profile), body: .json(.init(title: "Away Task for the picker")))
            try await self.until("a Task") { !model.tasks.isEmpty }
            await model.openDependencyPicker(model.tasks[0])
        }
        defer { model.signedIn = false; model.connect() }
        #expect(model.profile == receipt["away"] as? String, "a person who opened the picker should stay: \(receipt)")
        // MAC-C1-S1-36: whatever the case ends on, the client still follows changes.
        try await StreamLiveness.expectFollows(model, server: url, "seat openingTheDependencyPickerWhileAwayCountsAsActing")
    }

    /// A view change on the first Profile the client moved to, then that Profile is deleted too, then
    /// a restore brings both back: the person acted (changed the view), so the client must not move
    /// them back to the first Profile.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aViewChangeBeforeASecondDeletionCountsAsActing() async throws {
        let credential = try await owner(), api = todoClient(server: url, credential: credential)
        let first = "seatfirst\(Int.random(in: 100...999))", second = "aaseatsecond\(Int.random(in: 100...999))"
        try await newProfile(api, first); try await newProfile(api, second)
        _ = try await api.tasks_period_create(path: .init(profile: first), body: .json(.init(title: "First Profile Task")))
        _ = try await api.tasks_period_create(path: .init(profile: second), body: .json(.init(title: "Second Profile Task")))
        let id = try await snapshot(api, "seat two deletions")
        let model = try await live(credential, on: first, showing: "First Profile Task")
        defer { model.signedIn = false; model.connect() }
        try await delete(api, first)
        try await until("left the first") { model.profile != first }
        try await settled(model)
        let away1 = model.profile
        // The client moves to the first remaining Profile in the server's order; make that the second.
        var receipt: [String: Any] = ["first": first, "second": second, "away1": away1]
        if away1 == second {
            model.selectView("today") // the person changes the view on the second Profile
            try await settled(model)
            try await delete(api, second)
            try await until("left the second") { model.profile != second }
            try await settled(model)
            receipt["away2"] = model.profile
            try await restore(api, id)
            try await until("the reload resolved") { model.profile == first || model.restoredProfileOffer != nil || model.deletionNotice?.contains("was restored") == true }
            try await settled(model)
        }
        receipt["profile_shown"] = model.profile; receipt["notice"] = model.deletionNotice ?? NSNull(); receipt["offer"] = model.restoredProfileOffer?.profile ?? NSNull()
        try write("two-deletions-view", receipt)
        try #require(away1 == second, "precondition: the client moved to the second Profile: \(receipt)")
        #expect(model.profile != first, "the person changed the view on the second Profile, so must not be carried to the first: \(receipt)")
        // MAC-C1-S1-36: whatever the case ends on, the client still follows changes.
        try await StreamLiveness.expectFollows(model, server: url, "seat aViewChangeBeforeASecondDeletionCountsAsActing")
    }

    /// A Session expiry while away (the server revokes the model's credential, a wake delivers the
    /// failure): the record is dropped, and after a new sign-in a restore neither returns nor offers.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aSessionExpiryWhileAwayDropsTheReturn() async throws {
        let modelCredential = try await owner()
        let credential = try await owner(), api = todoClient(server: url, credential: credential)
        let profile = "seatexpiry\(Int.random(in: 100...999))"
        try await newProfile(api, profile)
        _ = try await api.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: "Seat expiry Task")))
        let id = try await snapshot(api, "seat expiry")
        let model = try await live(modelCredential, on: profile, showing: "Seat expiry Task")
        defer { model.signedIn = false; model.connect() }
        try await delete(api, profile)
        try await until("the client left") { model.profile != profile }
        try await settled(model)
        let recorded = model.forcedLeave?.profile
        _ = try await todoClient(server: url, credential: modelCredential).credentials_period_signOut()
        _ = try await api.tasks_period_create(path: .init(profile: model.profile), body: .json(.init(title: "Wake after revocation")))
        try await until("the Session ended") { !model.signedIn }
        let droppedAtExpiry = model.forcedLeave == nil && model.restoredProfileOffer == nil
        model.replaceCredential(try await owner()); model.signedIn = true; model.connect()
        try await settled(model)
        let away = model.profile
        try await restore(api, id)
        try await Task.sleep(for: .milliseconds(1500))
        try await settled(model)
        let receipt: [String: Any] = ["profile": profile, "recorded": recorded ?? NSNull(), "dropped_at_expiry": droppedAtExpiry, "away": away, "profile_shown": model.profile, "notice": model.deletionNotice ?? NSNull(), "offer": model.restoredProfileOffer?.profile ?? NSNull()]
        try write("expiry", receipt)
        #expect(recorded == profile && droppedAtExpiry, "\(receipt)")
        #expect(model.profile == away && model.restoredProfileOffer == nil, "no return and no offer across a Session expiry: \(receipt)")
        // MAC-C1-S1-36: whatever the case ends on, the client still follows changes.
        try await StreamLiveness.expectFollows(model, server: url, "seat aSessionExpiryWhileAwayDropsTheReturn")
    }
}
