import Foundation
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

@MainActor @Suite(.serialized) struct MacRetirementStressTests {
    private func cancellation(_ error: any Error) -> Bool {
        ((error as? ClientError)?.underlyingError ?? error) is CancellationError
    }
    private func healthCount() async throws -> Int {
        let control = try #require(ProcessInfo.processInfo.environment["TODO_MAC_RETIREMENT_COUNTER"].flatMap(URL.init(string:)))
        struct Count: Decodable { let count: Int }
        let (data, response) = try await URLSession.shared.data(from: control)
        try #require((response as? HTTPURLResponse)?.statusCode == 200)
        return try JSONDecoder().decode(Count.self, from: data).count
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_MAC_RETIREMENT_STRESS"] == "1"))
    func productionRetiredClientsRejectRequestsBeforeNetworkingOrRecording() async throws {
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["TODO_CLIENT_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
        let owner = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("todo-retired-client-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: directory)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-retired-client"), clientDiagnostics: recorder, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.replaceCredential(owner); model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
        defer { model.signedIn = false; model.replaceCredential("") }
        let old = model.client
        _ = try await old.system_period_health().ok.body.json
        let before = try await healthCount()
        model.replaceCredential(owner); model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
        var cancelled = 0
        for _ in 0..<20 {
            do { _ = try await old.system_period_health(); Issue.record("A retired Client admitted a request") }
            catch { #expect(cancellation(error)); if cancellation(error) { cancelled += 1 } }
        }
        #expect((await recorder.snapshot()).requests == 0)
        #expect(try await healthCount() == before)
        _ = try await model.client.system_period_health().ok.body.json
        #expect(try await healthCount() == before + 1)
        #expect((await recorder.snapshot()).requests == 1)
        #expect(cancelled == 20)
        if let path = env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            let value: [String: Any] = ["rejected_retired_requests": cancelled, "retired_server_health_delta": 0, "new_scope_server_health_delta": 1, "new_scope_recorded_requests": 1]
            try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent("retired-client.json"))
        }
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_MAC_RETIREMENT_STRESS"] == "1"))
    func productionRefreshWriteAndPollSurviveThreeThousandCredentialReplacements() async throws {
        let env = ProcessInfo.processInfo.environment
        let server = try #require(env["TODO_CLIENT_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
        let auth = TodoClientSession(server: server, credential: "")
        defer { auth.invalidate() }
        let first = try await auth.client.signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let second = try await auth.client.signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let observer = TodoClientSession(server: server, credential: first)
        defer { observer.invalidate() }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("todo-retirement-stress-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: directory)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-retirement-stress"), clientDiagnostics: recorder, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.selectedView = "all"; model.replaceCredential(first); model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
        defer { model.signedIn = false; model.replaceCredential("") }
        await model.refreshAfterWrite("Stress initial catalog")
        let initialTask = try #require(model.tasks.first { $0.status == "open" && $0.occurrence == nil && ($0.depends_on ?? []).isEmpty })
        let targetID = initialTask.id
        let beforeHealth = try await healthCount()
        struct Recorded: Decodable { let events: [ClientDiagnosticEvent] }
        struct Unexpected: Encodable { let iteration: Int; let before: [ClientDiagnosticEvent]; let after: ClientDiagnosticSummary }
        var unexpected: [Unexpected] = []
        var unfinishedIterations = 0, unfinishedRequests = 0
        var startedRefreshes = 0, startedWrites = 0, startedPolls = 0, retiredCallsCancelled = 0
        let start = ProcessInfo.processInfo.systemUptime
        for index in 0..<3000 {
            let target = try TaskSnapshot.decode(await observer.client.tasks_period_show(path: .init(profile: "work", task: targetID)).ok.body.json)
            recorder.clear(); recorder.authorizeOwnerSession(true)
            let old = model.client
            let refresh = Task { await model.refreshAfterWrite("Stress refresh") }
            let write = Task { await model.transition(target, action: target.status == "done" ? "reopen" : "complete") }
            let poll = Task { await ClientDiagnosticContext.$periodicPoll.withValue(true) { await model.loadDiagnostics() } }
            for _ in 0..<3 { await Task.yield() }
            var active: [ClientDiagnosticEvent] = []
            for _ in 0..<1000 {
                let data = try #require(try await recorder.exportMetadata())
                active = try JSONDecoder().decode(Recorded.self, from: data).events
                if active.contains(where: { $0.name == .refreshStarted }) && active.contains(where: { $0.name == .requestStarted && $0.operation == "tasks.transition" }) && active.contains(where: { $0.name == .requestStarted && $0.operation == "diagnostics.snapshot" }) { break }
                try await Task.sleep(for: .milliseconds(2))
            }
            try #require(active.contains { $0.name == .refreshStarted })
            try #require(active.contains { $0.name == .requestStarted && $0.operation == "tasks.transition" })
            try #require(active.contains { $0.name == .requestStarted && $0.operation == "diagnostics.snapshot" })
            let startedIDs = Set(active.filter { $0.name == .requestStarted }.compactMap(\.requestID))
            let finishedIDs = Set(active.filter { $0.name == .requestFinished }.compactMap(\.requestID))
            let unfinished = startedIDs.subtracting(finishedIDs).count
            unfinishedRequests += unfinished
            if unfinished > 0 { unfinishedIterations += 1 }
            startedRefreshes += active.filter { $0.name == .refreshStarted }.count
            startedWrites += active.filter { $0.name == .requestStarted && $0.operation == "tasks.transition" }.count
            startedPolls += active.filter { $0.name == .requestStarted && $0.operation == "diagnostics.snapshot" }.count
            model.replaceCredential(index.isMultiple(of: 2) ? second : first)
            model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
            model.message = "Current credential scope"
            await refresh.value; await write.value; await poll.value
            do { _ = try await old.system_period_health(); Issue.record("A retired stress Client admitted a request") }
            catch { #expect(cancellation(error)); if cancellation(error) { retiredCallsCancelled += 1 } }
            let current = await recorder.snapshot()
            let clean = current.requests == 0 && current.refreshes == 0 && !current.recent.contains { $0.name == .decodeFinished }
            if !clean, unexpected.count < 16, let path = env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
                unexpected.append(.init(iteration: index, before: active, after: current))
                try JSONEncoder().encode(unexpected).write(to: URL(fileURLWithPath: path).appendingPathComponent("retirement-unexpected.json"))
            }
            #expect(clean)
            #expect(model.signedIn && model.canWrite && model.message == "Current credential scope")
        }
        #expect(startedRefreshes >= 3000 && startedWrites == 3000 && startedPolls == 3000)
        #expect(retiredCallsCancelled == 3000 && unfinishedIterations == 3000)
        let healthDelta = try await healthCount() - beforeHealth
        #expect(healthDelta == 0)
        await model.refreshAfterWrite("Stress final catalog")
        let canonical = try await observer.client.tasks_period_list(path: .init(profile: "work")).ok.body.json.map(TaskSnapshot.decode)
        let finalTask = try #require(canonical.first { $0.id == targetID })
        let committedTransitions = finalTask.row_version - initialTask.row_version
        #expect(committedTransitions >= 0 && committedTransitions <= 3000)
        #expect(model.tasks.count == 178 && model.appliedSearchSnapshot?.rows.count == 178)
        let canonicalMatch = Dictionary(uniqueKeysWithValues: model.tasks.map { ($0.id, $0) }) == Dictionary(uniqueKeysWithValues: canonical.map { ($0.id, $0) })
        #expect(canonicalMatch)
        #expect(model.canWrite && model.signedIn)
        if let path = env["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            let value: [String: Any] = ["iterations": 3000, "refresh_attempts": 3000, "refreshes_started": startedRefreshes, "writes_started": startedWrites, "committed_transitions": committedTransitions, "polls_started": startedPolls, "retired_calls_cancelled": retiredCallsCancelled, "retired_server_health_delta": healthDelta, "tasks": model.tasks.count, "canonical_rows_match": canonicalMatch, "iterations_with_unfinished_requests": unfinishedIterations, "unfinished_requests_at_retirement": unfinishedRequests, "unexpected_scope_iterations": unexpected.count, "final_writable": model.canWrite, "elapsed_seconds": ProcessInfo.processInfo.systemUptime - start, "client_factory_override": false, "transport_override": false]
            try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent("retirement-stress.json"))
        }
    }
}
