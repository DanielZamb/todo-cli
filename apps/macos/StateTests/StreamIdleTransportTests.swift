import Foundation
import Testing
@testable import TodoAPI
@testable import TodoState

private actor IdleStreamObservation {
    private(set) var ready = false
    func observeReady() { ready = true }
}

@MainActor @Suite(.serialized) struct StreamIdleTransportTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_IDLE_SUBSCRIBERS"] != nil))
    func productionModelCancelsIdleSubscribersAtEveryLifecycleBoundary() async throws {
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["TODO_IDLE_NATIVE_SERVER"].flatMap(URL.init(string:)))
        let output = URL(fileURLWithPath: try #require(env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"]))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: credential)
        let journal = URL(fileURLWithPath: try #require(env["TODO_CLIENT_DIAGNOSTICS_JOURNAL"]))
        let recorder = ClientDiagnosticsRecorder(journalDirectory: journal)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-subscribers-" + UUID().uuidString), clientDiagnostics: recorder)
        let prefix = "cursor.\(model.configuration.vaultService).\(server.absoluteString)."
        for profile in ["work", "personal"] { UserDefaults.standard.set(try #require(env["TODO_IDLE_START_CURSOR"]), forKey: prefix + profile) }
        defer { for profile in ["work", "personal"] { UserDefaults.standard.removeObject(forKey: prefix + profile) }; model.signedIn = false; model.connect() }
        model.restoreGeneration = try #require(env["TODO_IDLE_START_GENERATION"])
        model.replaceCredential(credential); model.selectedView = "all"; model.signedIn = true
        var counts = [Int]()
        func count() async throws -> Int { try await direct.diagnostics_period_snapshot().ok.body.json.clients.count }
        struct NotLive: Error, CustomStringConvertible { let description: String }
        func live(_ profile: String) async throws {
            for _ in 0..<2000 { if model.profile == profile && model.canWrite && !model.loading { return }; try await Task.sleep(for: .milliseconds(10)) }
            throw NotLive(description: "waiting for \(profile): profile \(model.profile) connection \(model.connection) loading \(model.loading) canWrite \(model.canWrite) signedIn \(model.signedIn) counts so far \(counts) message \(model.message ?? "nil")")
        }
        counts.append(try await count())
        model.connect(); try await live("work"); counts.append(try await count())
        model.changeProfile("personal"); try await live("personal")
        try await Task.sleep(for: .seconds(3)); counts.append(try await count())
        for index in 0..<9 { let profile = index.isMultiple(of: 2) ? "work" : "personal"; model.changeProfile(profile); try await live(profile) }
        try await Task.sleep(for: .seconds(3)); counts.append(try await count())
        _ = try await direct.tasks_period_create(path: .init(profile: "personal"), body: .json(.init(title: "Stream cancellation boundary")))
        try await Task.sleep(for: .seconds(3)); counts.append(try await count())
        let replacement = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        model.replaceCredential(replacement); model.connect(); try await live("work")
        try await Task.sleep(for: .seconds(3)); counts.append(try await count())
        model.changeProfile("personal"); try await live("personal")
        _ = try await direct.reads_period_deleteProfile(path: .init(profile: "personal"), body: .json(.init(with_tasks: true, dry_run: false)))
        try await live("work"); try await Task.sleep(for: .seconds(3)); counts.append(try await count())
        model.signedIn = false; model.connect()
        try await Task.sleep(for: .seconds(3)); counts.append(try await count())
        let labels = ["before", "connected", "first_switch_after_3s", "ten_switches_after_3s", "old_profile_operation_after_3s", "credential_change_after_3s", "profile_deletion_after_3s", "signed_out_after_3s"]
        let receipt: [String: Any] = ["labels": labels, "counts": counts, "diagnostics_enabled": true, "app_launched": false, "sign_out_boundary": "signedIn false plus connect; SessionVault signOut not called"]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("stream-subscribers.json"))
        #expect(counts == [0, 1, 1, 1, 1, 1, 1, 0])
    }
    /// O3 (the stream-wake seat's finding): stopping the stream ends its native request, so the
    /// server sees the subscription end promptly, without an event. The seat's sequence, sampled
    /// 400 ms after each step: stop, reconnect, Profile switch, final stop, with the production
    /// session (diagnostics on) and with the plain client factory (diagnostics off). After the
    /// reconnect the stream resumes from its last event id: an event written while stopped arrives.
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_IDLE_SUBSCRIBERS"] != nil), arguments: ["production-session", "client-factory"])
    func stoppingTheStreamEndsItsServerSubscriptionPromptly(_ setup: String) async throws {
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["TODO_IDLE_NATIVE_SERVER"].flatMap(URL.init(string:)))
        let output = URL(fileURLWithPath: try #require(env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"]))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: credential)
        let journal = URL(fileURLWithPath: try #require(env["TODO_CLIENT_DIAGNOSTICS_JOURNAL"])).appendingPathComponent("o3-" + setup)
        try FileManager.default.createDirectory(at: journal, withIntermediateDirectories: true)
        let configuration = ClientConfiguration(server: server, initialProfile: "work", vaultService: "never-used-o3-" + UUID().uuidString)
        let model = setup == "production-session"
            ? TodoModel(configuration: configuration, clientDiagnostics: ClientDiagnosticsRecorder(journalDirectory: journal))
            : TodoModel(configuration: configuration, clientFactory: { url, _ in todoClient(server: url, credential: credential) })
        let prefix = "cursor.\(model.configuration.vaultService).\(server.absoluteString)."
        for profile in ["work", "zo3switch"] { UserDefaults.standard.set(try #require(env["TODO_IDLE_START_CURSOR"]), forKey: prefix + profile) }
        // The switch saves the chosen Profile in the defaults; the next test must start from its own.
        let savedProfile = UserDefaults.standard.object(forKey: "profile")
        defer {
            for profile in ["work", "zo3switch"] { UserDefaults.standard.removeObject(forKey: prefix + profile) }
            model.signedIn = false; model.connect()
            if let savedProfile { UserDefaults.standard.set(savedProfile, forKey: "profile") } else { UserDefaults.standard.removeObject(forKey: "profile") }
        }
        model.restoreGeneration = try #require(env["TODO_IDLE_START_GENERATION"])
        model.replaceCredential(credential); model.selectedView = "all"
        func count() async throws -> Int { try await direct.diagnostics_period_snapshot().ok.body.json.clients.count }
        func sample() async throws -> Int { try await Task.sleep(for: .milliseconds(400)); return try await count() }
        struct NotLive: Error, CustomStringConvertible { let description: String }
        func live(_ profile: String, _ step: String) async throws {
            for _ in 0..<2000 { if model.profile == profile && model.connection == .live && model.canWrite && !model.loading { return }; try await Task.sleep(for: .milliseconds(10)) }
            throw NotLive(description: "\(setup) \(step): profile \(model.profile) connection \(model.connection) loading \(model.loading) canWrite \(model.canWrite) signedIn \(model.signedIn) message \(model.message ?? "nil")")
        }
        let before = try await count()
        model.signedIn = true; model.connect(); try await live("work", "first connect")
        try await Task.sleep(for: .milliseconds(400))
        model.signedIn = false; model.connect()
        let stopped = try await sample()
        let stoppedAt = try #require(model.lastSequence)
        let title = "O3 written while stopped " + UUID().uuidString
        _ = try await direct.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: title)))
        model.signedIn = true; model.connect(); try await live("work", "reconnect")
        let reconnected = try await sample()
        let resumedFrom = model.resumeSequence
        for _ in 0..<500 { if model.tasks.contains(where: { $0.title == title }) { break }; try await Task.sleep(for: .milliseconds(10)) }
        let delivered = model.tasks.contains { $0.title == title }
        model.changeProfile("zo3switch"); try await live("zo3switch", "switch")
        let switched = try await sample()
        model.signedIn = false; model.connect()
        let finalStopped = try await sample()
        let counts = [stopped, reconnected, switched, finalStopped]
        let receipt: [String: Any] = ["setup": setup, "labels": ["stopped", "reconnected", "switched_profile", "final_stopped"], "counts": counts, "before": before,
                                      "resumed_from": resumedFrom ?? "nil", "stopped_at": stoppedAt, "event_written_while_stopped_delivered": delivered, "sample_ms": 400]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("stream-stop-subscribers-\(setup).json"))
        #expect(before == 0)
        #expect(counts == [0, 1, 1, 0], "\(setup): open subscriptions after stop, reconnect, switch, final stop: \(counts)")
        #expect(resumedFrom == stoppedAt, "\(setup): the reconnect resumes from the last event id")
        #expect(delivered, "\(setup): the event written while stopped arrives after the reconnect")
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_IDLE_NATIVE_SERVER"] != nil))
    func nativeIdleStreamOutlivesOrdinaryTimeoutButOrdinaryReadsStillTimeOut() async throws {
        let environment = ProcessInfo.processInfo.environment
        let server = try #require(environment["TODO_IDLE_NATIVE_SERVER"].flatMap(URL.init(string:)))
        let delayed = try #require(environment["TODO_IDLE_DELAYED_SERVER"].flatMap(URL.init(string:)))
        let output = URL(fileURLWithPath: try #require(environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"]))
        let owner = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: owner)
        #expect(try await direct.tasks_period_list(path: .init(profile: "personal")).ok.body.json.isEmpty)
        let short = todoClient(server: server, credential: owner, diagnostics: .disabled, requestTimeout: 0.1)
        let body = try await short.changes_period_stream(path: .init(profile: "personal"), headers: .init(last_hyphen_event_hyphen_id: "0", x_hyphen_todo_hyphen_client: .swiftui)).ok.body.text_event_hyphen_stream
        let observation = IdleStreamObservation()
        let reader = Task {
            var parser = EventStreamDecoder(), ready = false
            for try await chunk in body {
                for event in try parser.append(chunk) {
                    if event.name == "ready" { ready = true; await observation.observeReady() }
                    if event.name == "operation" { return (ready, event.data) }
                }
            }
            return (ready, "")
        }
        let deadline = Task { try await Task.sleep(for: .seconds(65)); reader.cancel() }
        defer { deadline.cancel(); reader.cancel() }
        for _ in 0..<100 {
            if await observation.ready { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        try #require(await observation.ready)
        let idleStarted = ProcessInfo.processInfo.systemUptime
        try await Task.sleep(for: .milliseconds(1500))
        let created = try await direct.tasks_period_create(path: .init(profile: "personal"), body: .json(.init(title: "Native idle boundary"))).ok.body.json
        let survived: Bool, reason: String
        let result = await reader.result
        let ready = await observation.ready
        switch result {
        case .success(let value): survived = value.1.contains(created.id); reason = "none"
        case .failure(let error): survived = false; reason = ClientDiagnosticReason(error: error).rawValue
        }
        var ordinaryTimedOut = false
        do { _ = try await todoClient(server: delayed, credential: owner, diagnostics: .disabled, requestTimeout: 0.1).system_period_health() }
        catch { ordinaryTimedOut = ClientDiagnosticReason(error: error) == .timeout }
        let receipt: [String: Any] = ["stream_survived_idle": survived, "ready_observed": ready, "ordinary_timeout_observed": ordinaryTimedOut, "stream_end_reason": reason, "idle_ms": (ProcessInfo.processInfo.systemUptime - idleStarted) * 1000, "minimum_idle_ms": 1500, "ordinary_timeout_ms": 100, "operations_received": survived ? 1 : 0, "app_launched": false]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("stream-native.json"))
        #expect(survived)
        #expect(ready)
        #expect(ordinaryTimedOut)
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_IDLE_LONG_MS"] != nil))
    func productionModelHasNoReconnectOrCatalogReadsForFiveIdleMinutes() async throws {
        let environment = ProcessInfo.processInfo.environment
        let server = try #require(environment["TODO_IDLE_NATIVE_SERVER"].flatMap(URL.init(string:)))
        let output = URL(fileURLWithPath: try #require(environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"]))
        let journal = URL(fileURLWithPath: try #require(environment["TODO_CLIENT_DIAGNOSTICS_JOURNAL"]))
        let idleMS = try #require(environment["TODO_IDLE_LONG_MS"].flatMap(Int.init))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let recorder = ClientDiagnosticsRecorder(journalDirectory: journal)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-long-idle-" + UUID().uuidString), clientDiagnostics: recorder)
        let cursorKey = "cursor.\(model.configuration.vaultService).\(server.absoluteString).work"
        UserDefaults.standard.set(try #require(environment["TODO_IDLE_START_CURSOR"]), forKey: cursorKey)
        defer { UserDefaults.standard.removeObject(forKey: cursorKey) }
        model.restoreGeneration = try #require(environment["TODO_IDLE_START_GENERATION"])
        model.replaceCredential(credential); model.selectedView = "all"; model.signedIn = true; model.connect()
        defer { model.signedIn = false; model.connect() }
        for _ in 0..<1000 {
            if model.canWrite && model.tasks.count == 178 && (model.lastSequence.flatMap(Int64.init) ?? 0) > 0 && !model.searchPending { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        try #require(model.canWrite && model.tasks.count == 178 && (model.lastSequence.flatMap(Int64.init) ?? 0) > 0 && !model.searchPending)
        // The window's precondition (MAC-C1-S1-29): no system clock or time zone change during it. Such
        // a change rightly makes the model refresh (TodoModel's clockChange trigger), so a window that
        // sees one is not an idle window: it is recorded and the window starts again, at most three
        // times. The expectations below are unchanged and apply to a window without one.
        let clock = ClockChanges()
        let observers = [Notification.Name.NSSystemClockDidChange, .NSSystemTimeZoneDidChange].map { name in
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { _ in clock.record(name.rawValue) }
        }
        defer { observers.forEach(NotificationCenter.default.removeObserver) }
        // A control posts a clock change into the first window (TODO_IDLE_CLOCK_CONTROL=1).
        let control = environment["TODO_IDLE_CLOCK_CONTROL"] == "1"
        var restarted: [[String: Any]] = []
        var baseline = await recorder.snapshot(), reconnects = model.reconnectCount, cursor = model.lastSequence
        var start = ProcessInfo.processInfo.systemUptime
        var final = baseline
        for attempt in 0..<3 {
            baseline = await recorder.snapshot(); reconnects = model.reconnectCount; cursor = model.lastSequence
            start = ProcessInfo.processInfo.systemUptime
            let seen = clock.count
            if control && attempt == 0 {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(idleMS / 4))
                    NotificationCenter.default.post(name: .NSSystemClockDidChange, object: nil)
                }
            }
            try await Task.sleep(for: .milliseconds(idleMS))
            final = await recorder.snapshot()
            guard clock.count > seen else { break }
            restarted.append(["attempt": attempt, "changes": Array(clock.names.dropFirst(seen)), "refreshes": final.refreshes - baseline.refreshes, "requests": final.requests - baseline.requests])
            for _ in 0..<1000 where model.loading || model.searchPending { try await Task.sleep(for: .milliseconds(10)) }
            try await Task.sleep(for: .milliseconds(500))
        }
        try #require(restarted.count < 3, "three idle windows in a row saw a system clock change: \(restarted)")
        #expect(model.canWrite)
        #expect(!model.loading)
        #expect(model.lastSequence == cursor)
        #expect(model.reconnectCount == reconnects)
        #expect(final.refreshes == baseline.refreshes)
        #expect(final.requests == baseline.requests)
        let receipt: [String: Any] = ["idle_ms": (ProcessInfo.processInfo.systemUptime - start) * 1000, "refreshes": final.refreshes - baseline.refreshes, "requests": final.requests - baseline.requests, "reconnects": model.reconnectCount - reconnects, "can_write": model.canWrite, "loading": model.loading, "app_launched": false, "windows_restarted_for_clock_change": restarted, "clock_control": control]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("stream-five-minutes.json"))
        if let data = try await recorder.exportMetadata() { try data.write(to: output.appendingPathComponent("stream-five-minutes-metadata.json")) }
        model.signedIn = false; model.connect(); await recorder.flush()
    }

}

/// System clock and time zone changes seen during an idle window (MAC-C1-S1-29).
private final class ClockChanges: @unchecked Sendable {
    private let lock = NSLock()
    private var seen: [String] = []
    func record(_ name: String) { lock.withLock { seen.append(name) } }
    var count: Int { lock.withLock { seen.count } }
    var names: [String] { lock.withLock { seen } }
}
