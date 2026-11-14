import Foundation
import Testing
import TodoAPI
@testable import TodoState

/// MAC-C1-S1-36 (the correctness seat's probe, kept as a regression test): after another client
/// deletes the shown Profile and restores the Snapshot taken before it, whatever Profile the client
/// ends on, it still follows changes. Red on c334462b and 5702b2bb: the stream's ProfileDeleted
/// branch returned whenever leaveDeletedProfile did nothing (the restore had landed first), leaving
/// `connection` live with no stream. Production model, transport and stream on the scratch server.
@MainActor @Suite(.serialized) struct DeletedProfileLivenessTests {
    private var url: URL { URL(string: ProcessInfo.processInfo.environment["SEAT_SERVER"]!)! }
    private func owner() async throws -> String {
        try await todoClient(server: url, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
    }
    private func write(_ name: String, _ value: Any) throws {
        guard let evidence = ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] else { return }
        try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: evidence).appendingPathComponent("liveness-\(name).json"))
    }
    private func newProfile(_ name: String) throws {
        let p = Process(); p.executableURL = URL(fileURLWithPath: ProcessInfo.processInfo.environment["SEAT_CLI"]!)
        p.arguments = ["init", "--profile", name, "--credential-profile", "work", "--format", "json"]
        p.environment = ProcessInfo.processInfo.environment.merging(["TODO_SERVER_URL": url.absoluteString]) { _, new in new }
        p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
        try p.run(); p.waitUntilExit()
        try #require(p.terminationStatus == 0, "todo init --profile \(name)")
    }
    private func snapshot(_ api: Client) async throws -> String {
        let created = try await api.snapshots_period_create(body: .json(.init(reason: "liveness"))).ok.body.json
        return try #require((try JSONSerialization.jsonObject(with: JSONEncoder().encode(created)) as? [String: Any])?["id"] as? String)
    }
    private func model(_ credential: String, on profile: String, showing title: String) async throws -> TodoModel {
        let model = TodoModel(configuration: .init(server: url, initialProfile: profile, vaultService: "memory-liveness-" + UUID().uuidString),
                              clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.clientDiagnosticsUI.stop()
        model.replaceCredential(credential); model.signedIn = true; model.selectedView = "all"; model.connect()
        let ok = await StreamLiveness.until(15) { model.canWrite && !model.loading && model.profile == profile && model.tasks.contains { $0.title == title } && model.profileSwitchSettled(profile) }
        try #require(ok, "live on \(profile)")
        return model
    }

    /// Delete with Tasks, then restore after `gapMS`; 1.5 s later the client must still follow
    /// changes (and, in the first round, deliver a reminder fired afterwards). 20 rounds per gap.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil), arguments: [0, 5, 20, 60])
    func afterADeletionAndARestoreTheClientStillFollowsChanges(_ gapMS: Int) async throws {
        let api = todoClient(server: url, credential: try await owner())
        var rounds: [[String: Any]] = []
        for round in 0..<20 {
            let profile = "live\(gapMS)x\(round)" + String(UUID().uuidString.prefix(4)).lowercased()
            try newProfile(profile)
            let title = "Liveness \(gapMS) \(round)"
            _ = try await api.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: title)))
            let id = try await snapshot(api)
            let m = try await model(try await owner(), on: profile, showing: title)
            _ = try await api.reads_period_deleteProfile(path: .init(profile: profile), body: .json(.init(with_tasks: true, dry_run: false))).ok
            if gapMS > 0 { try await Task.sleep(for: .milliseconds(gapMS)) }
            _ = try await api.snapshots_period_restore(path: .init(snapshot: id), body: .json(.init(dry_run: false))).ok
            try await Task.sleep(for: .milliseconds(1500))
            var row = try await StreamLiveness.expectFollows(m, server: url, reminder: round == 0, "gap \(gapMS) ms, round \(round)")
            row["round"] = round; row["profile_shown"] = m.profile; row["on_restored"] = m.profile == profile
            row["connection"] = String(describing: m.connection); row["notice"] = m.deletionNotice ?? NSNull()
            rounds.append(row)
            m.signedIn = false; m.connect()
        }
        let dead = rounds.filter { ($0["write_appeared"] as? Bool) != true }
        try write("gap\(gapMS)", ["gap_ms": gapMS, "rounds": rounds.count, "not_following": dead.count, "detail": rounds])
        #expect(dead.isEmpty, "\(dead.count) of \(rounds.count) rounds left a client that no longer follows changes: \(dead.prefix(3))")
    }

    /// A deletion with no restore, 200 times: the client leaves within 15 s, says so, and follows
    /// changes on the Profile it moved to.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func twoHundredDeletionsEachLeaveAndStayLive() async throws {
        let api = todoClient(server: url, credential: try await owner())
        var times: [Double] = [], stuck: [[String: Any]] = [], deadAfter: [[String: Any]] = [], untold = 0
        for round in 0..<200 {
            let profile = "del\(round)" + String(UUID().uuidString.prefix(4)).lowercased()
            try newProfile(profile)
            let title = "Deletion \(round)"
            _ = try await api.tasks_period_create(path: .init(profile: profile), body: .json(.init(title: title)))
            let m = try await model(try await owner(), on: profile, showing: title)
            let start = ProcessInfo.processInfo.systemUptime
            _ = try await api.reads_period_deleteProfile(path: .init(profile: profile), body: .json(.init(with_tasks: true, dry_run: false))).ok
            let left = await StreamLiveness.until(15) { m.profile != profile }
            if left {
                times.append((ProcessInfo.processInfo.systemUptime - start) * 1000)
                if m.deletionNotice?.hasPrefix("\u{201C}\(profile)\u{201D} was deleted. Switched to ") != true { untold += 1 }
                let settled = await StreamLiveness.until(15) { m.profileSwitchSettled(m.profile) }
                let result = settled ? try await StreamLiveness.check(m, server: url) : nil
                if result?.streamFollows != true || result?.writeAppeared != true { deadAfter.append(["round": round, "profile_shown": m.profile, "settled": settled]) }
            } else {
                stuck.append(["round": round, "profile": profile, "connection": String(describing: m.connection), "stream_follows": m.streamFollowsCurrentProfile])
            }
            m.signedIn = false; m.connect()
        }
        let sorted = times.sorted()
        func pct(_ q: Double) -> Double { sorted.isEmpty ? -1 : sorted[min(sorted.count - 1, Int(Double(sorted.count) * q))] }
        try write("two-hundred", ["deletions": 200, "left": times.count, "untold": untold, "stuck": stuck, "not_live_after_leaving": deadAfter, "leave_ms_median": pct(0.5), "leave_ms_p99": pct(0.99), "leave_ms_max": sorted.last ?? -1])
        #expect(stuck.isEmpty && deadAfter.isEmpty && untold == 0, "stuck \(stuck.count), not live after leaving \(deadAfter.count), untold \(untold)")
    }
}
