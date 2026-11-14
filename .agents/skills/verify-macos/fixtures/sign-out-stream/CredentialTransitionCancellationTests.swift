import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

// Cancellation at every await of restore, sign-in and sign-out: before the request,
// during it, after a successful reply and after a failed reply. A cancelled task must
// reach the same cleanup as a thrown cancellation and leave a retry possible.
// Runs with the in-memory SessionVault; no server is needed.

enum Point: String, CaseIterable, Sendable { case before, during, afterSuccess, afterFailure }

private actor CancelGate: ClientTransport {
    let operation: String
    let occurrence: Int
    let point: Point
    var counts: [String: Int] = [:]
    var holding = false
    private var continuation: CheckedContinuation<Void, Never>?
    init(operation: String, occurrence: Int = 1, point: Point) { self.operation = operation; self.occurrence = occurrence; self.point = point }
    func release() { continuation?.resume(); continuation = nil }
    func count(_ operation: String) -> Int { counts[operation, default: 0] }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        counts[operationID, default: 0] += 1
        // URLSession does not start a request for an already cancelled task.
        if Task.isCancelled { throw CancellationError() }
        // Before: the task is cancelled before it starts, so nothing is held for it.
        if point != .before, operationID == operation, counts[operationID] == occurrence {
            await withCheckedContinuation { continuation = $0; holding = true }
            // During: the transport drops the reply, as URLSession does when its task is cancelled.
            if point == .during { throw CancellationError() }
            if point == .afterFailure { throw RequestFailure(status: 503, message: "held reply failed", code: "unavailable") }
        }
        switch operationID {
        case "system.health":
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"service":"todo-server","contract":"\#(TodoContract.id)","build":"scratch"}"#))
        case "reads.profiles":
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody("[]"))
        case "signIn.signIn":
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"id":"s1","kind":"session","name":null,"profile":null,"scope":"read-write","created_at":"2026-11-11T00:00:00Z","expires_at":"2026-11-18T00:00:00Z","revoked_at":null,"credential":"ses_scratch_signed_in"}"#))
        case "credentials.signOut":
            return (HTTPResponse(status: .noContent), nil)
        default:
            try await Task.sleep(for: .seconds(3600))
            throw CancellationError()
        }
    }
}

@MainActor @Suite(.serialized) struct CredentialTransitionCancellationTests {
    private let server = URL(string: "http://127.0.0.1:1")!

    private func model(_ gate: CancelGate, _ name: String) -> (TodoModel, SessionVault) {
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "memory-cancel-\(name)-\(UUID())"), clientFactory: { url, credential in Client(serverURL: url, transport: gate, middlewares: [BearerMiddleware(credential: credential)]) }, clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        return (model, SessionVault(service: model.configuration.vaultService, account: server.absoluteString))
    }

    /// Runs `body` in a Task and cancels it at `point` around the held operation.
    private func cancel(_ point: Point, _ gate: CancelGate, _ body: @escaping @MainActor () async -> Void) async throws {
        let task = Task { @MainActor in await body() }
        if point == .before { task.cancel(); await task.value; return }
        for _ in 0..<1000 { if await gate.holding { break }; try await Task.sleep(for: .milliseconds(2)) }
        try #require(await gate.holding, "held \(gate.operation)")
        task.cancel()
        await gate.release()
        await task.value
    }

    private func gate(_ operation: String, occurrence: Int = 1, _ point: Point) -> CancelGate {
        CancelGate(operation: operation, occurrence: occurrence, point: point)
    }

    @Test(arguments: Point.allCases, [("system.health", 1), ("reads.profiles", 1)])
    func cancelledRestoreAllowsAnotherRestore(point: Point, held: (String, Int)) async throws {
        let gate = gate(held.0, occurrence: held.1, point)
        let (model, vault) = model(gate, "restore")
        try vault.save("ses_scratch_saved")
        defer { model.signedIn = false; model.connect(); try? vault.delete() }
        try await cancel(point, gate) { await model.restore() }
        let label = "\(held.0) \(point.rawValue)"
        #expect(!model.busy && !model.signedIn, "\(label)")
        #expect(model.canRestore, "\(label): Retry Session shown")
        #expect((try vault.load()) == "ses_scratch_saved", "\(label): stored Session kept")
        let health = await gate.count("system.health")
        await model.restore()
        #expect(await gate.count("system.health") > health, "\(label): a second restore runs")
        #expect(model.signedIn && !model.busy, "\(label): the second restore signs in")
    }

    @Test(arguments: Point.allCases, [("system.health", 1), ("signIn.signIn", 1), ("system.health", 2), ("reads.profiles", 1)])
    func cancelledSignInAllowsAnotherSignIn(point: Point, held: (String, Int)) async throws {
        let gate = gate(held.0, occurrence: held.1, point)
        let (model, vault) = model(gate, "sign-in")
        defer { model.signedIn = false; model.connect(); try? vault.delete() }
        var result: Bool?
        try await cancel(point, gate) { result = await model.signIn("scratch verification passphrase") }
        let label = "\(held.0)#\(held.1) \(point.rawValue)"
        #expect(result == false, "\(label)")
        #expect(!model.busy && !model.signedIn, "\(label)")
        #expect(model.message == nil, "\(label): cancellation shows no message")
        #expect(await model.signIn("scratch verification passphrase"), "\(label): a second sign-in succeeds")
        #expect(model.signedIn && !model.busy, "\(label)")
    }

    @Test(arguments: Point.allCases)
    func cancelledSignOutEndsConsistently(point: Point) async throws {
        let gate = gate("credentials.signOut", point)
        let (model, vault) = model(gate, "sign-out")
        try vault.save("ses_scratch_current")
        model.replaceCredential("ses_scratch_current"); model.signedIn = true; model.connection = .live
        defer { model.signedIn = false; model.connect(); try? vault.delete() }
        let streams = await gate.count("system.health")
        try await cancel(point, gate) { await model.signOut() }
        #expect(!model.busy, "\(point.rawValue)")
        let stored = try vault.load()
        if point == .afterSuccess {
            // The server revoked the credential: the local sign-out completes even though cancelled.
            #expect(!model.signedIn && stored == nil, "\(point.rawValue)")
        } else {
            #expect(model.signedIn && stored == "ses_scratch_current", "\(point.rawValue)")
            #expect(model.message == nil, "\(point.rawValue): cancellation shows no message")
            for _ in 0..<500 { if await gate.count("system.health") > streams { break }; try await Task.sleep(for: .milliseconds(2)) }
            #expect(await gate.count("system.health") > streams, "\(point.rawValue): the still-signed-in model reconnects")
        }
    }
}
