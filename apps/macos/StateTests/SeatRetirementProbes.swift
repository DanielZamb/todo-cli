import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import TodoAPI
@testable import TodoState

private actor FailedSignOutPollTransport: ClientTransport {
    var holding = false
    var continuation: CheckedContinuation<Void,Never>?
    var calls: [String] = []
    func release() { continuation?.resume(); continuation = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse,HTTPBody?) {
        calls.append(operationID)
        if operationID == "diagnostics.snapshot" {
            await withCheckedContinuation { continuation = $0; holding = true }
            throw URLError(.cancelled)
        }
        throw URLError(.notConnectedToInternet)
    }
}

@MainActor @Suite(.serialized) struct SeatRetirementProbes {
    @Test func failedSignOutDoesNotLeaveDiagnosticsLoadingForever() async throws {
        let transport = FailedSignOutPollTransport()
        let model = TodoModel(configuration:.init(server:URL(string:"http://127.0.0.1:1")!,initialProfile:"work",vaultService:"never-keychain-signout-poll"),clientFactory:{url,_ in Client(serverURL:url,transport:transport)},clientDiagnostics:.disabled,catalogNotifications:NotificationCenter(),wakeNotifications:NotificationCenter())
        model.replaceCredential("ses_scratch_old"); model.signedIn = true; model.connection = .live; model.clientDiagnosticsUI.stop()
        defer { model.signedIn = false; model.replaceCredential("") }
        let poll = Task { await model.loadDiagnostics() }
        for _ in 0..<500 { if await transport.holding { break }; try await Task.sleep(for:.milliseconds(10)) }
        try #require(await transport.holding)
        #expect(model.diagnosticsLoading)
        await model.signOut()
        await transport.release(); await poll.value
        let after = model.diagnosticsLoading
        #expect(model.signedIn)
        #expect(!after)
        if let path = ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] {
            let value:[String:Any] = ["signed_in_after_failed_signout":model.signedIn,"diagnostics_loading_after_old_poll_finished":after,"calls":await transport.calls]
            try JSONSerialization.data(withJSONObject:value,options:.prettyPrinted).write(to:URL(fileURLWithPath:path).appendingPathComponent("failed-signout-poll.json"))
        }
    }
}
