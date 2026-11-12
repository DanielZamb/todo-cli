import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

// Drives the production model and default transport through a scratch fault
// proxy that only touches DELETE /auth/session. Subscriber counts come from the
// compiled server directly; delivered operation ids come from the proxy's
// per-stream accounting; expected ids come from the scratch op_log.

private struct Control {
    let base: String
    func call(_ path: String, probe: String? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: base + "/__ctl/" + path)!)
        request.timeoutInterval = 120
        if let probe { request.setValue(probe, forHTTPHeaderField: "X-Probe-Credential") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }
}

@MainActor private final class ConnectionSampler {
    private(set) var states: [String] = []
    private var running = false
    private var task: Task<Void, Never>?
    func start(_ model: TodoModel) {
        running = true; states = ["\(model.connection)"]
        task = Task { @MainActor in
            var last = states[0]
            while running {
                let now = "\(model.connection)"
                if now != last { states.append(now); last = now }
                await Task.yield()
            }
        }
    }
    func stop() async { running = false; await task?.value }
}

@MainActor @Suite(.serialized) struct SignOutStreamTests {
    private let env = ProcessInfo.processInfo.environment
    private func wait(_ seconds: Double = 60, _ predicate: () async throws -> Bool) async throws {
        let deadline = ProcessInfo.processInfo.systemUptime + seconds
        while ProcessInfo.processInfo.systemUptime < deadline {
            if try await predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw URLError(.timedOut)
    }

    private struct Case {
        let name: String
        let fault: String
        let cancel: Bool
        let revoked: Bool
        let replySeen: Bool
        var prime = true
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SIGN_OUT_STREAM"] == "1"))
    func signOutTransitionsKeepOneSubscriberAndContinuousCursor() async throws {
        let proxy = try #require(env["TODO_SIGN_OUT_PROXY"])
        let server = try #require(env["TODO_SIGN_OUT_SERVER"].flatMap(URL.init(string:)))
        let evidence = URL(fileURLWithPath: try #require(env["TODO_SIGN_OUT_EVIDENCE"]))
        let control = Control(base: proxy)
        let passphrase = "scratch verification passphrase"
        let directCredential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: passphrase))).ok.body.json.credential
        let direct = todoClient(server: server, credential: directCredential)
        func subscribers() async throws -> Int { try await direct.diagnostics_period_snapshot().ok.body.json.clients.count }

        let cases = [
            Case(name: "not-revoked-reply-seen", fault: "reject", cancel: false, revoked: false, replySeen: true),
            Case(name: "not-revoked-reply-lost", fault: "drop", cancel: false, revoked: false, replySeen: false),
            Case(name: "not-revoked-cancelled", fault: "drop", cancel: true, revoked: false, replySeen: false),
            Case(name: "revoked-reply-lost", fault: "revoke-drop", cancel: false, revoked: true, replySeen: false),
            Case(name: "revoked-cancelled", fault: "revoke-drop", cancel: true, revoked: true, replySeen: false),
            Case(name: "revoked-reply-seen", fault: "pass", cancel: false, revoked: true, replySeen: true),
            Case(name: "not-revoked-reply-seen-no-cursor", fault: "reject", cancel: false, revoked: false, replySeen: true, prime: false),
        ]
        var receipts: [[String: Any]] = []
        for item in cases {
            let journal = evidence.appendingPathComponent("journal-\(item.name)")
            try FileManager.default.createDirectory(at: journal, withIntermediateDirectories: true)
            let model = TodoModel(configuration: .init(server: URL(string: proxy)!, initialProfile: "work", vaultService: "memory-sign-out-\(item.name)-\(UUID())"), clientDiagnostics: ClientDiagnosticsRecorder(journalDirectory: journal))
            let vault = SessionVault(service: model.configuration.vaultService, account: proxy)
            #expect(await model.signIn(passphrase), "\(item.name) sign-in")
            try await wait { model.signedIn && model.connection == .live && !model.loading && model.canWrite }
            let credential = try #require(try vault.load())
            if item.prime {
                // The owner always resumes from a stored cursor; one operation gives this model one.
                let primed = try await control.call("write/1/prime-\(item.name)")
                let title = try #require((primed["titles"] as? [String])?.first)
                try await wait(30) { model.lastSequence != nil && model.tasks.contains { $0.title == title } }
            }
            try await Task.sleep(for: .seconds(3))
            let before = try await subscribers()
            let cursor = model.lastSequence ?? "0"
            let unauthorizedBefore = try await control.call("unauthorized")["count"] as? Int ?? -1

            _ = try await control.call("fault/" + item.fault)
            let sampler = ConnectionSampler(); sampler.start(model)
            let signOut = Task { await model.signOut() }
            var during = -1
            var wrote: [String: Any] = [:]
            if item.fault != "pass" {
                try await wait { try await control.call("state")["held"] as? Bool == true }
                wrote = try await control.call("write/5/\(item.name)")
                try await Task.sleep(for: .seconds(3))
                during = try await subscribers()
                if item.cancel { signOut.cancel() }
                _ = try await control.call("release")
            }
            await signOut.value
            if item.revoked {
                try await wait(30) { !model.signedIn }
            } else {
                try await wait(30) { model.signedIn && model.connection == .live && !model.loading && !model.busy }
                if let titles = wrote["titles"] as? [String] {
                    try await wait(30) { Set(titles).isSubset(of: Set(model.tasks.map(\.title))) }
                }
            }
            try await Task.sleep(for: .seconds(3))
            let after = try await subscribers()
            let unauthorizedSettled = try await control.call("unauthorized")["count"] as? Int ?? -1
            try await Task.sleep(for: .seconds(5))
            let unauthorizedLater = try await control.call("unauthorized")["count"] as? Int ?? -1
            await sampler.stop()
            let delivered = (try await control.call("delivered/\(cursor)")["ids"] as? [String]) ?? []
            let expected = (try await control.call("ops/work/\(cursor)")["ids"] as? [String]) ?? []
            let probe = try await control.call("probe", probe: credential)["status"] as? Int ?? -1
            let doubled = Dictionary(grouping: delivered, by: { $0 }).filter { $0.value.count > 1 }.keys.sorted()
            let skipped = item.revoked ? [] : Set(expected).subtracting(delivered).sorted()
            let receipt: [String: Any] = [
                "case": item.name, "fault": item.fault, "cancelled": item.cancel,
                "server_revoked": probe == 401, "reply_seen": item.replySeen,
                "subscribers": ["before": before, "during_sign_out": during, "after_3s": after],
                "signed_in": model.signedIn, "busy": model.busy, "diagnostics_loading": model.diagnosticsLoading,
                "connection": "\(model.connection)", "connection_states": sampler.states,
                "message": model.message ?? NSNull(),
                "vault_cleared": (try vault.load()) == nil,
                "unauthorized_responses": ["at_settle": unauthorizedSettled - unauthorizedBefore, "after_5s_more": unauthorizedLater - unauthorizedBefore],
                "resume_cursor": cursor, "primed_cursor": item.prime, "head": model.lastSequence ?? NSNull(),
                "expected_ops_after_cursor": expected, "delivered_ops_after_cursor": delivered,
                "doubled": doubled, "skipped": skipped, "written": wrote["titles"] ?? [],
            ]
            receipts.append(receipt)
            try JSONSerialization.data(withJSONObject: receipts, options: [.prettyPrinted, .sortedKeys]).write(to: evidence.appendingPathComponent("sign-out-stream.json"))

            #expect(before == 1, "\(item.name) one subscriber before sign-out")
            #expect(!model.connectionStatesContainOffline(sampler.states), "\(item.name) never shows Offline · Read only: \(sampler.states)")
            #expect(doubled.isEmpty, "\(item.name) doubled \(doubled)")
            #expect(unauthorizedLater == unauthorizedSettled, "\(item.name) no 401 loop")
            #expect(!model.busy && !model.diagnosticsLoading, "\(item.name) no stuck busy or loading")
            if item.revoked {
                #expect(probe == 401, "\(item.name) server revoked")
                #expect(!model.signedIn && after == 0, "\(item.name) signed out with zero subscribers")
                #expect((try vault.load()) == nil, "\(item.name) vault cleared")
            } else {
                #expect(probe == 200, "\(item.name) server kept the Session")
                #expect(model.signedIn && after == 1, "\(item.name) exactly one subscriber after reconnect, got \(after)")
                #expect(skipped.isEmpty, "\(item.name) skipped \(skipped)")
                #expect(Set(expected) == Set(delivered), "\(item.name) delivered exactly the committed operations")
                #expect(model.lastSequence == expected.last, "\(item.name) cursor reaches head")
                #expect(unauthorizedSettled == unauthorizedBefore, "\(item.name) no 401")
                #expect((try vault.load()) == credential, "\(item.name) vault kept")
                if item.cancel { #expect(model.message == nil, "\(item.name) cancellation shows no error") }
                else { #expect(model.message != nil, "\(item.name) failure shows its message") }
                model.signedIn = false; model.connect()
                try await Task.sleep(for: .seconds(3))
            }
            try await wait(10) { try await subscribers() == 0 }
        }
    }
}

// Reply-boundary controls that need a successful local sign-out, so they run
// here with the in-memory SessionVault instead of the Keychain-backed StateTests.
private actor SignOutReplyTransport: ClientTransport {
    let status: Int
    private var held: CheckedContinuation<Void, Never>?
    private(set) var holding = false
    private(set) var calls: [String] = []
    init(status: Int) { self.status = status }
    func release() { held?.resume(); held = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        calls.append(operationID)
        if operationID == "credentials.signOut" {
            await withCheckedContinuation { held = $0; holding = true }
            return (HTTPResponse(status: .init(code: status)), nil)
        }
        if operationID == "system.health" {
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"service":"todo-server","contract":"\#(TodoContract.id)","build":"scratch"}"#))
        }
        try await Task.sleep(for: .seconds(3600))
        throw CancellationError()
    }
}

@MainActor @Suite(.serialized) struct SignOutReplyBoundaryTests {
    private func model(_ transport: SignOutReplyTransport, _ name: String) -> (TodoModel, SessionVault) {
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "memory-reply-\(name)-\(UUID())"), clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) }, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        return (model, SessionVault(service: model.configuration.vaultService, account: "http://127.0.0.1:1"))
    }
    private func held(_ transport: SignOutReplyTransport) async throws {
        for _ in 0..<500 { if await transport.holding { return }; try await Task.sleep(for: .milliseconds(10)) }
        throw URLError(.timedOut)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SIGN_OUT_STREAM"] == "1"))
    func revocationReplySeenAfterCancellationStillSignsOut() async throws {
        let transport = SignOutReplyTransport(status: 204)
        let (model, vault) = model(transport, "cancelled-204")
        try vault.save("ses_scratch_revoked"); model.replaceCredential("ses_scratch_revoked"); model.signedIn = true; model.connection = .live
        let signOut = Task { await model.signOut() }
        try await held(transport)
        signOut.cancel()
        await transport.release(); await signOut.value
        #expect(!model.signedIn && !model.busy)
        #expect((try vault.load()) == nil)
        #expect(model.message == nil)
        #expect(await transport.calls.filter { $0 == "changes.stream" }.isEmpty)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SIGN_OUT_STREAM"] == "1"), arguments: [200, 409])
    func replyOtherThanNoContentKeepsTheSession(status: Int) async throws {
        let transport = SignOutReplyTransport(status: status)
        let (model, vault) = model(transport, "status-\(status)")
        try vault.save("ses_scratch_kept"); model.replaceCredential("ses_scratch_kept"); model.signedIn = true; model.connection = .live
        defer { model.signedIn = false; model.connect() }
        let signOut = Task { await model.signOut() }
        try await held(transport)
        await transport.release(); await signOut.value
        #expect(model.signedIn && !model.busy, "HTTP \(status)")
        #expect((try vault.load()) == "ses_scratch_kept", "HTTP \(status)")
        #expect(model.message != nil, "HTTP \(status)")
    }
}

private extension TodoModel {
    func connectionStatesContainOffline(_ states: [String]) -> Bool { states.contains("offline") }
}
