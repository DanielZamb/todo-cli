import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

/// Answers every Diagnostics read with one scripted status, counting the reads.
private actor ScriptedDiagnostics: ClientTransport {
    var status = 503
    private(set) var reads = 0
    func set(_ value: Int) { status = value }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        reads += 1
        throw RequestFailure(status: status, message: "scripted \(status)", code: status == 401 ? "unauthorized" : "unavailable")
    }
}

/// MAC-C1-S1-27: a Diagnostics read that fails for any reason but a 401 keeps the Session, says the
/// server is unavailable, and doubles the retry from 2 s up to 30 s (TodoModel.loadDiagnostics).
/// 150fe685 rightly moved the live test's invalid credential to the 401 path (S1-20); this restores
/// the check of the other path, with a 503 and with a dropped connection.
@MainActor @Suite struct DiagnosticsBackoffTests {
    @Test(arguments: [503, 0])
    func aFailureOtherThan401DoublesTheRetryUpToThirtySeconds(_ status: Int) async {
        let transport = ScriptedDiagnostics()
        await transport.set(status)
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:9")!, initialProfile: "work", vaultService: "never-used-diagnostics-backoff"),
                              clientFactory: { url, token in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: token)]) },
                              clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
        model.clientDiagnosticsUI.stop()
        model.replaceCredential("scripted"); model.signedIn = true
        defer { model.signedIn = false }
        #expect(model.diagnosticsRetrySeconds == 1)
        var retries: [Int] = []
        for _ in 0..<6 {
            await model.loadDiagnostics()
            retries.append(Int(model.diagnosticsRetrySeconds))
        }
        #expect(retries == [2, 4, 8, 16, 30, 30], "status \(status): \(retries)")
        #expect(model.signedIn, "status \(status): the Session is kept")
        #expect(model.diagnosticsError == "Server unavailable; retrying when live.")
        #expect(model.diagnostics == nil)
        #expect(await transport.reads == 6)
    }
}
