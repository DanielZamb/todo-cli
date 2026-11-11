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
        func live(_ profile: String) async throws {
            for _ in 0..<2000 { if model.profile == profile && model.canWrite && !model.loading { return }; try await Task.sleep(for: .milliseconds(10)) }
            throw URLError(.timedOut)
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
        let receipt: [String: Any] = ["labels": labels, "counts": counts, "diagnostics_enabled": true, "app_launched": false, "keychain_called": false, "sign_out_boundary": "signedIn false plus connect; SessionVault signOut not called"]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("stream-subscribers.json"))
        #expect(counts == [0, 1, 1, 1, 1, 1, 1, 0])
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
        let receipt: [String: Any] = ["stream_survived_idle": survived, "ready_observed": ready, "ordinary_timeout_observed": ordinaryTimedOut, "stream_end_reason": reason, "idle_ms": (ProcessInfo.processInfo.systemUptime - idleStarted) * 1000, "minimum_idle_ms": 1500, "ordinary_timeout_ms": 100, "operations_received": survived ? 1 : 0, "app_launched": false, "keychain_called": false]
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
        let baseline = await recorder.snapshot(), reconnects = model.reconnectCount, cursor = model.lastSequence
        let start = ProcessInfo.processInfo.systemUptime
        try await Task.sleep(for: .milliseconds(idleMS))
        let final = await recorder.snapshot()
        #expect(model.canWrite)
        #expect(!model.loading)
        #expect(model.lastSequence == cursor)
        #expect(model.reconnectCount == reconnects)
        #expect(final.refreshes == baseline.refreshes)
        #expect(final.requests == baseline.requests)
        let receipt: [String: Any] = ["idle_ms": (ProcessInfo.processInfo.systemUptime - start) * 1000, "refreshes": final.refreshes - baseline.refreshes, "requests": final.requests - baseline.requests, "reconnects": model.reconnectCount - reconnects, "can_write": model.canWrite, "loading": model.loading, "app_launched": false, "keychain_called": false]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("stream-five-minutes.json"))
        if let data = try await recorder.exportMetadata() { try data.write(to: output.appendingPathComponent("stream-five-minutes-metadata.json")) }
        model.signedIn = false; model.connect(); await recorder.flush()
    }

}
