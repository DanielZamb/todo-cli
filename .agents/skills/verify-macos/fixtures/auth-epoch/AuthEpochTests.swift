import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

private actor AuthEpochTransport: ClientTransport {
    private let live = URLSessionTransport()
    private var armed = false
    private var beforeSend = true
    private var sending: CheckedContinuation<Void, Never>?
    private var response: CheckedContinuation<Void, Never>?
    private(set) var started = 0
    private(set) var held401 = 0
    func hold(beforeSend: Bool) { armed = true; self.beforeSend = beforeSend }
    func allowSend() { sending?.resume(); sending = nil }
    func release401() { response?.resume(); response = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let hold = armed && operationID == "reads.projects"
        let gateSend = beforeSend
        if hold { armed = false; started += 1 }
        if hold && gateSend { await withCheckedContinuation { sending = $0 } }
        let result = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        if hold {
            #expect(result.0.status.code == 401)
            let bytes: Data?
            if let body = result.1 { bytes = try await Data(collecting: body, upTo: 65536) } else { bytes = nil }
            held401 += 1
            await withCheckedContinuation { response = $0 }
            return (result.0, bytes.map { HTTPBody($0) })
        }
        return result
    }
}

@MainActor private final class AuthCredentialCapture { var value = "" }

@MainActor struct AuthEpochTests {
    private func wait(_ predicate: () async -> Bool) async throws {
        for _ in 0..<6000 {
            if await predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw URLError(.timedOut)
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_AUTH_EPOCH_MEMORY_VAULT"] == "1"))
    func oldUnauthorizedCannotExpireReplacementSessionAndCurrentUnauthorizedStillExpires() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_AUTH_EPOCH_SERVER"].flatMap(URL.init(string:)))
        let transport = AuthEpochTransport()
        let capture = AuthCredentialCapture()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "memory-auth-epoch-\(UUID())"), clientFactory: { url, credential in
            capture.value = credential
            return Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
        })
        #expect(await model.signIn("scratch verification passphrase"))
        try await wait { model.connection == .live && !model.loading }
        _ = model.client
        let credentialA = capture.value
        #expect(credentialA.hasPrefix("ses_"))
        await transport.hold(beforeSend: true)
        let oldRead = Task { await model.refreshConflictDefinitions() }
        try await wait { await transport.started == 1 }
        await model.signOut()
        #expect(model.signedIn == false)
        await transport.allowSend()
        try await wait { await transport.held401 == 1 }
        #expect(await model.signIn("scratch verification passphrase"))
        try await wait { model.connection == .live && !model.loading }
        _ = model.client
        let credentialB = capture.value
        #expect(credentialB.hasPrefix("ses_"))
        #expect(credentialB != credentialA)
        #expect(model.message == nil)
        await transport.release401()
        await oldRead.value
        _ = model.client
        let replacementSurvived = model.signedIn
        let credentialStillB = capture.value == credentialB
        let obsoleteNoticeDiscarded = model.message == nil && model.editorError == nil
        #expect(replacementSurvived == true)
        #expect(credentialStillB == true)
        #expect(obsoleteNoticeDiscarded == true)

        if !model.signedIn { #expect(await model.signIn("scratch verification passphrase")) }
        try await wait { model.connection == .live && !model.loading }
        _ = model.client
        let current = capture.value
        model.signedIn = false
        model.connect()
        model.signedIn = true
        _ = try await todoClient(server: server, credential: current).credentials_period_signOut()
        await transport.hold(beforeSend: false)
        let currentRead = Task { await model.refreshConflictDefinitions() }
        try await wait { await transport.held401 == 2 }
        await transport.release401()
        await currentRead.value
        _ = model.client
        #expect(model.signedIn == false)
        #expect(capture.value == "")
        #expect(model.message == "Your Session ended. Sign in again.")
        let receipt: [String: Any] = ["replacementSignedIn": replacementSurvived, "credentialStillB": credentialStillB, "obsoleteNoticeDiscarded": obsoleteNoticeDiscarded, "current401SignedOut": !model.signedIn, "currentCredentialCleared": capture.value.isEmpty, "currentNotice": model.message ?? ""]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_AUTH_EPOCH_RECEIPT"])))
    }
}
