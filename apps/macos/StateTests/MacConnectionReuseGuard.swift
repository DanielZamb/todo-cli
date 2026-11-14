import Foundation
import Darwin
import Testing
import TodoAPI
@testable import TodoState

@Suite(.serialized) @MainActor struct MacConnectionReuseGuard {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_CLIENT_DIAGNOSTICS_SERVER"] != nil))
    func productionModelReusesConnectionsAndInvalidatesCredentialScope() async throws {
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["TODO_CLIENT_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
        let owner = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-mac-reuse-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: directory)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-reuse-guard"), clientDiagnostics: recorder, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.selectedView = "all"; model.replaceCredential(owner); model.signedIn = true; model.connection = .live
        model.clientDiagnosticsUI.stop()
        defer { model.signedIn = false; model.replaceCredential("") }
        for _ in 0..<2 { await model.refreshAfterWrite("Connection reuse control"); #expect(model.tasks.count == 178) }
        var snapshot = await recorder.snapshot()
        for _ in 0..<2000 {
            if snapshot.recentRequests.count == 16 { break }
            try await Task.sleep(for: .milliseconds(5)); snapshot = await recorder.snapshot()
        }
        let reused = snapshot.recentRequests.filter { $0.phases?.connectionReused == true }.count
        let fresh = snapshot.recentRequests.filter { $0.phases?.connectionReused == false }.count
        #expect(snapshot.requests == 16 && snapshot.refreshes == 2)
        #expect(snapshot.recentRequests.count == 16)
        #expect(snapshot.recentRequests.filter { $0.phases?.connectionReused == true }.count >= 8)
        #expect(snapshot.recentRequests.filter { $0.phases?.connectionReused == false }.count <= 8)
        model.replaceCredential(owner); model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
        await model.refreshAfterWrite("New credential recording scope")
        snapshot = await recorder.snapshot()
        for _ in 0..<2000 {
            if snapshot.recentRequests.count == 8 { break }
            try await Task.sleep(for: .milliseconds(5)); snapshot = await recorder.snapshot()
        }
        #expect(snapshot.requests == 8 && snapshot.refreshes == 1)
        #expect(snapshot.recentRequests.contains { $0.phases?.connectionReused == false })
        if let path = env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            let value: [String: Any] = ["refreshes": 2, "requests": 16, "new_connections": fresh, "reused_connections": reused, "credential_scope_requests": snapshot.requests, "credential_scope_new_connections": snapshot.recentRequests.filter { $0.phases?.connectionReused == false }.count]
            try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent("connections-after-two.json"))
        }
    }
}

extension MacConnectionReuseGuard {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_MAC_SOCKET_PROBE"] == "1"))
    func productionModelHoldsAtMostSixteenSocketsAfterThreeHundredRefreshes() async throws {
        var initialLimit = rlimit()
        try #require(getrlimit(RLIMIT_NOFILE, &initialLimit) == 0)
        var primaryLimit = initialLimit; primaryLimit.rlim_cur = 256
        try #require(setrlimit(RLIMIT_NOFILE, &primaryLimit) == 0)
        defer { var prior = initialLimit; _ = setrlimit(RLIMIT_NOFILE, &prior) }
        let initialResources = try #require(ClientProcessResources.read())
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["TODO_CLIENT_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
        let owner = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-mac-300-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: directory)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-300-guard"), clientDiagnostics: recorder, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.selectedView = "all"; model.replaceCredential(owner); model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
        defer { model.signedIn = false; model.replaceCredential("") }
        var samples: [Int] = []
        for _ in 0..<300 {
            await model.refreshAfterWrite("Direct-server socket guard")
            try #require(model.tasks.count == 178 && model.searchError == nil && model.taskLoadError == nil)
            samples.append(try #require(ClientProcessResources.read()).sockets)
        }
        let resource = try #require(ClientProcessResources.read()), snapshot = await recorder.snapshot()
        #expect(snapshot.refreshes == 300 && snapshot.requests == 2400)
        #expect(resource.sockets <= 16)
        if let path = env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            let value: [String: Any] = ["scope": "production model and transport directly against scratch server; no proxy", "refreshes": 300, "requests": snapshot.requests, "sockets": resource.sockets, "peak_sockets": samples.max() ?? 0, "descriptors": resource.descriptors, "soft_limit": resource.softLimit, "requested_initial_soft_limit": 256, "before_transport_descriptors": initialResources.descriptors, "before_transport_soft_limit": initialResources.softLimit]
            try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent("sockets-after-300.json"))
        }
    }
}

extension MacConnectionReuseGuard {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_IDLE_DELAYED_SERVER"] != nil))
    func credentialReplacementCancelsAnOrdinaryRequestAlreadyInFlight() async throws {
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["TODO_IDLE_DELAYED_SERVER"].flatMap(URL.init(string:)))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-mac-cancel-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: directory)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-request-cancel"), clientDiagnostics: recorder, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential("ses_synthetic-not-sent-to-protected-routes"); model.signedIn = true; model.clientDiagnosticsUI.stop()
        defer { model.signedIn = false; model.replaceCredential("") }
        let request = Task { @MainActor () -> ClientDiagnosticReason? in
            do { _ = try await model.client.system_period_health().ok.body.json; return nil }
            catch { return ClientDiagnosticReason(error: error) }
        }
        for _ in 0..<2000 {
            if (await recorder.snapshot()).requests == 1 { break }
            try await Task.sleep(for: .milliseconds(5))
        }
        #expect((await recorder.snapshot()).requests == 1)
        try await Task.sleep(for: .milliseconds(50))
        model.replaceCredential("")
        let reason = await request.value
        #expect(reason == .cancelled)
        if let path = env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            let value: [String: Any] = ["cancelled": reason == .cancelled, "reason": reason?.rawValue ?? "request completed"]
            try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent("credential-request-cancel.json"))
        }
        await recorder.flush()
    }
}

extension MacConnectionReuseGuard {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_MAC_RESTART_CONTROL"] != nil))
    func reusedProductionPoolSurvivesRestartBeforeTheFirstReadAndEachWrite() async throws {
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["TODO_CLIENT_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
        let control = try #require(env["TODO_MAC_RESTART_CONTROL"].flatMap(URL.init(string:)))
        let owner = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-mac-restart-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: directory)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-restart-guard"), clientDiagnostics: recorder, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.selectedView = "all"; model.replaceCredential(owner); model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
        defer { model.signedIn = false; model.replaceCredential("") }
        let observer = todoClient(server: server, credential: owner)
        func restart() async throws {
            var request = URLRequest(url: control); request.httpMethod = "POST"
            let (_, response) = try await URLSession.shared.data(for: request)
            try #require((response as? HTTPURLResponse)?.statusCode == 200)
        }
        func warm() async {
            for _ in 0..<2 { await model.refreshAfterWrite("Restart pool warmup") }
        }
        func history(_ task: String) async throws -> [HistoryEntry] {
            try model.decode([HistoryEntry].self, await observer.reads_period_history(path: .init(profile: "work", task: task)).ok.body.json)
        }
        await warm(); try #require(model.tasks.count == 178 && model.canWrite)
        try await restart()
        let profiles = try model.decode([DiscoveryEntry].self, await model.client.reads_period_profiles().ok.body.json)
        #expect(profiles.contains { $0.id == "work" })
        await warm()
        let target = try #require(model.tasks.first { $0.status == "open" && $0.occurrence == nil && ($0.depends_on ?? []).isEmpty })
        let before = try await history(target.id).count
        try await restart()
        await model.transition(target, action: "complete")
        let completed = try #require(model.tasks.first { $0.id == target.id })
        #expect(completed.status == "done" && completed.row_version == target.row_version + 1)
        let completeSucceeded = model.editorError == nil && model.message == nil && model.canWrite
        #expect(completeSucceeded)
        let completeDelta = try await history(target.id).count - before
        #expect(completeDelta == 1)
        await warm()
        try await restart()
        let created = try await model.client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "Restart transport control"))).ok.body.json
        let createdTask = try model.decode(TaskSnapshot.self, created)
        let newHistory = try await history(createdTask.id)
        let tasks = try model.decode([TaskSnapshot].self, await observer.tasks_period_list(path: .init(profile: "work")).ok.body.json)
        #expect(tasks.count == 179)
        #expect(tasks.filter { $0.title == "Restart transport control" }.count == 1)
        #expect(newHistory.count == 1 && newHistory.first?.event.kind == "TaskCreated")
        if let path = env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            let receipt: [String: Any] = ["restarts": 3, "first_get_succeeded": profiles.contains { $0.id == "work" }, "complete_history_delta": completeDelta, "complete_reported_success": completeSucceeded, "new_tasks": tasks.count - 178, "created_history_records": newHistory.count, "write_retry_added": false, "scope": "restart completes before each first model/generated request; response loss after commit is not injected"]
            try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent("restart-transport.json"))
        }
        await recorder.flush()
    }
}

extension MacConnectionReuseGuard {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_MAC_RETIREMENT_RACE"] == "1"))
    func productionRefreshCredentialReplacementRaceDoesNotAbort() async throws {
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["TODO_CLIENT_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
        let auth = todoClient(server: server, credential: "")
        let first = try await auth.signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let second = try await auth.signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-retirement-race-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: directory)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-retirement-race"), clientDiagnostics: recorder, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.selectedView = "all"; model.replaceCredential(first); model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
        defer { model.signedIn = false; model.replaceCredential("") }
        for index in 0..<200 {
            let refresh = Task { await model.refreshAfterWrite("Retirement creation race") }
            for _ in 0..<3 { await Task.yield() }
            model.replaceCredential(index.isMultiple(of: 2) ? second : first)
            model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
            await refresh.value
        }
        await model.refreshAfterWrite("Final credential scope")
        #expect(model.tasks.count == 178 && model.appliedSearchSnapshot?.rows.count == 178)
        #expect(model.signedIn && model.canWrite)
        if let path = env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            let receipt: [String: Any] = ["iterations": 200, "yields_before_replacement": 3, "tasks": model.tasks.count, "final_writable": model.canWrite, "client_factory_override": false, "transport_override": false, "crashed": false]
            try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent("retirement-model-race.json"))
        }
    }
}
