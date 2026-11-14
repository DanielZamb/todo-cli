import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

private actor SeatRestoreProfileGate: ClientTransport {
    var healthCalls = 0
    var profileCalls = 0
    var holding = false
    private var completion: CheckedContinuation<Void, Never>?
    func release() { completion?.resume(); completion = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if operationID == "system.health" {
            healthCalls += 1
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"service":"todo-server","contract":"\#(TodoContract.id)","build":"scratch"}"#))
        }
        if operationID == "reads.profiles" {
            profileCalls += 1
            if profileCalls == 1 { await withCheckedContinuation { completion = $0; holding = true } }
            // A response already delivered by an adapter can finish after caller cancellation.
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody("[]"))
        }
        throw URLError(.unsupportedURL)
    }
}
@MainActor @Suite(.serialized) struct SeatRestoreCancellationBoundaryTests {
    @Test func cancellingRestoreAfterVaultReadStillAllowsAnotherRestore() async throws {
        let server = URL(string: "http://127.0.0.1:1")!
        let service = "never-keychain-restore-profile-" + UUID().uuidString
        let vault = SessionVault(service: service, account: server.absoluteString)
        try vault.save("ses_scratch_saved")
        defer { try? vault.delete() }
        let gate = SeatRestoreProfileGate()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: service), clientFactory: { url, _ in Client(serverURL: url, transport: gate) }, clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        defer { model.signedIn = false; model.replaceCredential("") }
        let restore = Task { await model.restore() }
        for _ in 0..<1000 {
            if await gate.holding { break }
            try await Task.sleep(for: .milliseconds(2))
        }
        try #require(await gate.holding)
        #expect(model.busy && !model.canRestore && !model.signedIn)
        restore.cancel()
        await gate.release()
        await restore.value
        let retryAllowed = model.canRestore
        let before = await gate.healthCalls
        await model.restore()
        let retried = await gate.healthCalls > before
        #expect(!model.busy && !model.signedIn)
        #expect(retryAllowed)
        #expect(retried)
        if let p = ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] {
            let result: [String: Any] = ["cancelled_after_vault":true,"retry_allowed":retryAllowed,"second_restore_started":retried,"busy":model.busy,"signed_in":model.signedIn,"vault_retained":try vault.load() == "ses_scratch_saved","health_calls":await gate.healthCalls,"profile_calls":await gate.profileCalls]
            try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted,.sortedKeys]).write(to: URL(fileURLWithPath:p).appendingPathComponent("restore-cancelled-after-vault.json"))
        }
    }
}
