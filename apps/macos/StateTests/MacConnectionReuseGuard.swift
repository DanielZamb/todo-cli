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
