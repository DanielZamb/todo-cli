import Foundation
import Testing
import TodoAPI
@testable import TodoState

/// Candidate 9 merge (integ/c9-server, the stream wake): a Profile deletion followed by a Snapshot
/// restore now usually reaches the client as the deletion (ProfileDeleted, then a not_found failure
/// and a close) and then a reconnect into the restored state. Before the fix the client left the
/// Profile, the restore's reload cleared the "was deleted" notice, and the person stayed, untold,
/// on another Profile. The ruling: never on another Profile untold; back to the restored Profile
/// if the person has done nothing since the forced switch, otherwise stay and offer it; never
/// across a sign-out or a credential change. Production model, production transport and a real
/// stream against the compiled scratch server (SEAT_SERVER); the CLI is SEAT_CLI.
@MainActor @Suite(.serialized) struct ProfileRestoreWakeTests {
    private let passphrase = "scratch verification passphrase"
    private let restored = "wakerestore"
    private var url: URL { URL(string: ProcessInfo.processInfo.environment["SEAT_SERVER"]!)! }

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
    private func snapshot(_ api: Client, _ reason: String) async throws -> String {
        let created = try await api.snapshots_period_create(body: .json(.init(reason: reason))).ok.body.json
        return try #require((try JSONSerialization.jsonObject(with: JSONEncoder().encode(created)) as? [String: Any])?["id"] as? String)
    }
    private func restore(_ api: Client, _ id: String) async throws { _ = try await api.snapshots_period_restore(path: .init(snapshot: id), body: .json(.init(dry_run: false))).ok }
    private func delete(_ api: Client, _ profile: String) async throws {
        _ = try await api.reads_period_deleteProfile(path: .init(profile: profile), body: .json(.init(with_tasks: true, dry_run: false))).ok
    }
    private func titles(_ api: Client, _ profile: String) async throws -> Set<String> {
        Set(try await api.tasks_period_list(path: .init(profile: profile)).ok.body.json.map(TaskSnapshot.decode).filter { $0.deleted_at == nil }.map(\.title))
    }
    /// Signed in on `profile`, live, showing `title`.
    private func live(_ credential: String, on profile: String, showing title: String?) async throws -> TodoModel {
        let model = TodoModel(configuration: .init(server: url, initialProfile: profile, vaultService: "memory-wake-restore-" + UUID().uuidString),
                              clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.clientDiagnosticsUI.stop()
        model.replaceCredential(credential); model.signedIn = true; model.selectedView = "all"
        model.connect()
        try await until("live on \(profile)") { model.canWrite && !model.loading && model.profile == profile && (title.map { t in model.tasks.contains { $0.title == t } } ?? true) }
        return model
    }
    private func settled(_ model: TodoModel) async throws {
        try await until("settled") { model.signedIn && model.profileSwitchSettled(model.profile) }
        try await Task.sleep(for: .milliseconds(300))
        try await until("settled again") { model.signedIn && model.profileSwitchSettled(model.profile) }
    }
    private func write(_ name: String, _ value: [String: Any]) throws {
        guard let evidence = ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] else { return }
        try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: evidence).appendingPathComponent("profile-restore-\(name).json"))
    }
    private func state(_ model: TodoModel, _ api: Client) async throws -> [String: Any] {
        // A fresh owner credential: a sign-out in the test revokes the one `api` was made with.
        let fresh = todoClient(server: url, credential: try await owner())
        var server: Set<String>? = nil, listing: String? = nil
        do { server = try await titles(fresh, model.profile) } catch { listing = "\(error)".prefix(300).description }
        return ["profile_shown": model.profile, "listing_error": listing ?? NSNull(), "server_profiles": (try? await fresh.reads_period_profiles().ok.body.json.map { "\($0)".prefix(80).description }) ?? [], "signed_in": model.signedIn, "connection": String(describing: model.connection), "notice": model.deletionNotice ?? NSNull(),
                "offer": model.restoredProfileOffer?.profile ?? NSNull(), "restored_listed": model.profiles.contains { $0.id == restored },
                "tasks_shown": model.tasks.count, "catalog_matches_server": server.map { Set(model.tasks.map(\.title)) == $0 } ?? false]
    }

    /// The finding's own case at both gaps: back on the restored Profile, told so; at 0 ms the
    /// client's Profile read may already see the restore, so it never leaves.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [0, 400])
    func aDeletionThenARestoreReturnsToTheRestoredProfile(_ gapMS: Int) async throws {
        let credential = try await owner(), api = todoClient(server: url, credential: credential)
        let title = "Wake restore " + UUID().uuidString
        _ = try await api.tasks_period_create(path: .init(profile: restored), body: .json(.init(title: title)))
        let id = try await snapshot(api, "c9 wake restore \(gapMS) ms")
        let model = try await live(credential, on: restored, showing: title)
        defer { model.signedIn = false; model.connect() }
        try await delete(api, restored)
        if gapMS > 0 { try await until("the client left the deleted Profile") { model.profile != restored } }
        let left = model.profile != restored
        try await restore(api, id)
        try await until("back on the restored Profile") { model.profile == restored && model.tasks.contains { $0.title == title } }
        try await settled(model)
        var receipt = try await state(model, api); receipt["gap_ms"] = gapMS; receipt["left_before_restore"] = left
        try write("wake-\(gapMS)ms", receipt)
        #expect(model.signedIn && model.profile == restored && model.tasks.contains { $0.title == title }, "\(receipt)")
        #expect(receipt["catalog_matches_server"] as? Bool == true, "\(receipt)")
        if left { #expect(model.deletionNotice == "\"\(restored)\" was restored. Switched back to it.", "\(receipt)") }
    }

    /// The person acted after the forced switch: the client stays, and the notice offers the
    /// restored Profile; taking the offer goes there.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aPersonWhoActedStaysAndIsOfferedTheRestoredProfile() async throws {
        let credential = try await owner(), api = todoClient(server: url, credential: credential)
        let title = "Wake restore acted " + UUID().uuidString
        _ = try await api.tasks_period_create(path: .init(profile: restored), body: .json(.init(title: title)))
        let id = try await snapshot(api, "c9 wake restore acted")
        let model = try await live(credential, on: restored, showing: title)
        defer { model.signedIn = false; model.connect() }
        try await delete(api, restored)
        try await until("the client left the deleted Profile") { model.profile != restored }
        let away = model.profile
        try await settled(model)
        model.setSearchText("launch") // the person types in the Find field
        try await restore(api, id)
        try await until("the offer") { model.restoredProfileOffer != nil }
        try await settled(model)
        let receipt = try await state(model, api)
        try write("acted", receipt)
        #expect(model.profile == away, "the person stays where they are: \(receipt)")
        #expect(model.deletionNotice == "\"\(restored)\" was restored.", "\(receipt)")
        model.goToRestoredProfile()
        try await until("the offer taken") { model.profile == restored && model.tasks.contains { $0.title == title } }
        #expect(model.restoredProfileOffer == nil && model.signedIn)
    }

    /// A reload after which the deletion still holds: stay where the client switched to, and the
    /// "was deleted" notice is shown again rather than cleared.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func whenTheDeletionHoldsTheClientStaysAndSaysWhy() async throws {
        let credential = try await owner(), api = todoClient(server: url, credential: credential)
        let title = "Wake restore holds " + UUID().uuidString
        _ = try await api.tasks_period_create(path: .init(profile: restored), body: .json(.init(title: title)))
        let before = try await snapshot(api, "c9 wake restore holds, before")
        let model = try await live(credential, on: restored, showing: title)
        defer { model.signedIn = false; model.connect() }
        try await delete(api, restored)
        try await until("the client left the deleted Profile") { model.profile != restored }
        let away = model.profile, notice = model.deletionNotice
        let after = try await snapshot(api, "c9 wake restore holds, after the deletion")
        try await restore(api, after) // a reload, with the Profile still deleted
        try await until("the reload") { model.restoreReloadCount > 0 }
        try await settled(model)
        let receipt = try await state(model, api)
        try write("deletion-holds", receipt)
        #expect(model.profile == away && model.deletionNotice == notice && notice != nil, "\(receipt)")
        try await restore(api, before) // leave the database as the suite had it
    }

    /// A second deletion while away (the Profile the client was moved to is deleted too): the
    /// place to return to stays the first Profile, with its view.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aSecondDeletionWhileAwayStillReturnsToTheFirstProfile() async throws {
        let credential = try await owner(), api = todoClient(server: url, credential: credential)
        let title = "Wake restore twice " + UUID().uuidString
        _ = try await api.tasks_period_create(path: .init(profile: restored), body: .json(.init(title: title)))
        let id = try await snapshot(api, "c9 wake restore twice")
        let model = try await live(credential, on: restored, showing: title)
        defer { model.signedIn = false; model.connect() }
        try await delete(api, restored)
        try await until("the first switch") { model.profile != restored }
        let first = model.profile
        try await settled(model)
        try await delete(api, first)
        try await until("the second switch") { model.profile != first && model.profile != restored }
        try await settled(model)
        try await restore(api, id)
        try await until("back on the first Profile") { model.profile == restored && model.tasks.contains { $0.title == title } }
        try await settled(model)
        var receipt = try await state(model, api); receipt["first_switch"] = first
        try write("second-deletion", receipt)
        #expect(model.deletionNotice == "\"\(restored)\" was restored. Switched back to it.", "\(receipt)")
    }

    /// The restored Profile comes back with the Snapshot's Tasks, not the ones it had when deleted.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func aRestoreWithDifferentTasksShowsTheRestoredTasks() async throws {
        let credential = try await owner(), api = todoClient(server: url, credential: credential)
        let kept = "Wake restore kept " + UUID().uuidString, later = "Wake restore later " + UUID().uuidString
        _ = try await api.tasks_period_create(path: .init(profile: restored), body: .json(.init(title: kept)))
        let id = try await snapshot(api, "c9 wake restore different Tasks")
        _ = try await api.tasks_period_create(path: .init(profile: restored), body: .json(.init(title: later)))
        let model = try await live(credential, on: restored, showing: later)
        defer { model.signedIn = false; model.connect() }
        try await delete(api, restored)
        try await until("the client left") { model.profile != restored }
        try await restore(api, id)
        try await until("back with the Snapshot's Tasks") { model.profile == restored && model.tasks.contains { $0.title == kept } }
        try await settled(model)
        let receipt = try await state(model, api)
        try write("different-tasks", receipt)
        #expect(!model.tasks.contains { $0.title == later } && receipt["catalog_matches_server"] as? Bool == true, "\(receipt)")
    }

    /// A restore that removes the shown Profile (a Snapshot from before it existed): the client
    /// switches and says why, instead of moving silently.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil && ProcessInfo.processInfo.environment["SEAT_CLI"] != nil))
    func aRestoreThatRemovesTheShownProfileSaysWhy() async throws {
        let credential = try await owner(), api = todoClient(server: url, credential: credential)
        let id = try await snapshot(api, "c9 restore before a Profile existed")
        let late = "wakelate" + String(UUID().uuidString.prefix(6)).lowercased()
        let initialize = Process()
        initialize.executableURL = URL(fileURLWithPath: ProcessInfo.processInfo.environment["SEAT_CLI"]!)
        initialize.arguments = ["init", "--profile", late, "--credential-profile", "work", "--format", "json"]
        initialize.environment = ProcessInfo.processInfo.environment.merging(["TODO_SERVER_URL": url.absoluteString]) { _, new in new }
        initialize.standardOutput = FileHandle.nullDevice
        try initialize.run(); initialize.waitUntilExit()
        try #require(initialize.terminationStatus == 0, "todo init --profile \(late)")
        let model = try await live(credential, on: late, showing: nil)
        defer { model.signedIn = false; model.connect() }
        try await restore(api, id)
        try await until("moved off the removed Profile") { model.profile != late }
        try await settled(model)
        let receipt = try await state(model, api)
        try write("removed-by-restore", receipt)
        // Either path tells the person: the reload's rediscovery ("is not in this database any more")
        // or a reconnect's not_found ("was deleted").
        let notice = model.deletionNotice ?? ""
        #expect(model.signedIn && notice.hasPrefix("\"\(late)\" ") && notice.contains("Switched to "), "\(receipt)")
    }

    /// A return never crosses a sign-out or a credential change (S1-20, S1-24).
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: ["signOut", "credential"])
    func aReturnNeverCrossesASignOutOrACredentialChange(_ boundary: String) async throws {
        let credential = try await owner(), api = todoClient(server: url, credential: credential)
        let title = "Wake restore boundary " + UUID().uuidString
        _ = try await api.tasks_period_create(path: .init(profile: restored), body: .json(.init(title: title)))
        let second = try await owner() // before the Snapshot, so the restore keeps it
        let id = try await snapshot(api, "c9 wake restore \(boundary)")
        let model = try await live(credential, on: restored, showing: title)
        defer { model.signedIn = false; model.connect() }
        try await delete(api, restored)
        try await until("the client left") { model.profile != restored }
        let away = model.profile
        try await settled(model)
        if boundary == "signOut" { await model.signOut() }
        model.replaceCredential(second); model.signedIn = true; model.connect()
        try await settled(model)
        // The sign-out revoked the first credential, so the restore uses the second.
        try await restore(todoClient(server: url, credential: second), id)
        try await until("the reload") { model.restoreReloadCount > 0 }
        try await settled(model)
        var receipt = try await state(model, api); receipt["boundary"] = boundary
        try write("boundary-\(boundary)", receipt)
        #expect(model.profile == away && model.restoredProfileOffer == nil && model.forcedLeave == nil, "\(receipt)")
        #expect(model.deletionNotice != "\"\(restored)\" was restored. Switched back to it.", "\(receipt)")
    }
}
