import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import TodoAPI

private final class VerificationMetrics: VerificationHTTP, @unchecked Sendable {
    let recorder: ClientDiagnosticsRecorder
    init(_ recorder: ClientDiagnosticsRecorder) { self.recorder = recorder; super.init() }
    private func interval(_ start: Date?, _ end: Date?) -> Double? {
        guard let start, let end else { return nil }
        return max(0, end.timeIntervalSince(start) * 1000)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        guard let id = task.originalRequest?.value(forHTTPHeaderField: "X-Todo-Request").flatMap(UUID.init(uuidString:)), let transaction = metrics.transactionMetrics.last else { return }
        let phases = ClientDiagnosticRequestPhases(fetchToRequestMS: interval(transaction.fetchStartDate, transaction.requestStartDate), dnsMS: interval(transaction.domainLookupStartDate, transaction.domainLookupEndDate), connectMS: interval(transaction.connectStartDate, transaction.connectEndDate), sendMS: interval(transaction.requestStartDate, transaction.requestEndDate), firstByteMS: interval(transaction.requestEndDate, transaction.responseStartDate), transferMS: interval(transaction.responseStartDate, transaction.responseEndDate), connectionReused: transaction.isReusedConnection, receivedBytes: task.countOfBytesReceived, serverSpans: ClientServerTiming.spans((task.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Server-Timing")))
        recorder.requestFinished(id, status: (task.response as? HTTPURLResponse)?.statusCode, reason: task.error.map { ClientDiagnosticReason(error: $0) }, phases: phases)
    }
}

private final class VerificationStreamSession: Sendable {
    let session: URLSession
    init(recorder: ClientDiagnosticsRecorder) {
        let configuration = VerificationHTTP.configuration()
        configuration.timeoutIntervalForRequest = .greatestFiniteMagnitude
        configuration.timeoutIntervalForResource = 86_400
        session = URLSession(configuration: configuration, delegate: VerificationMetrics(recorder), delegateQueue: nil)
    }
    func cancel() { session.invalidateAndCancel() }
    deinit { cancel() }
}

private struct VerificationStreamBody: AsyncSequence, Sendable {
    typealias Element = HTTPBody.ByteChunk
    let body: HTTPBody
    let session: VerificationStreamSession
    func makeAsyncIterator() -> Iterator { Iterator(base: body.makeAsyncIterator(), session: session) }
    struct Iterator: AsyncIteratorProtocol {
        var base: HTTPBody.AsyncIterator
        let session: VerificationStreamSession
        mutating func next() async throws -> Element? {
            let session = session
            do {
                let chunk = try await withTaskCancellationHandler {
                    try Task.checkCancellation()
                    return try await base.next()
                } onCancel: { session.cancel() }
                if chunk == nil { session.cancel() }
                return chunk
            } catch { session.cancel(); throw error }
        }
    }
}

private struct VerificationTransport: ClientTransport {
    let base: URLSessionTransport
    let origin: URL
    let recorder: ClientDiagnosticsRecorder
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        try verificationRequire(baseURL == origin && (request.scheme == nil || request.scheme == "http") && (request.authority == nil || request.authority == origin.host! + ":" + String(origin.port!)) && request.path?.hasPrefix("/") == true && request.path?.hasPrefix("//") == false, "A verification request attempted a different origin.")
        try await MainActor.run {
            try LaunchGuard.files!.verify()
            try LaunchGuard.verifyOwnedChild()
        }
        let id = recorder.requestStarted(operation: operationID)
        do {
            let stream = operationID == "changes.stream" ? VerificationStreamSession(recorder: recorder) : nil
            let transport = stream.map { URLSessionTransport(configuration: .init(session: $0.session)) } ?? base
            let result: (HTTPResponse, HTTPBody?)
            do {
                let received = try await ClientDiagnosticContext.$requestID.withValue(id) { try await transport.send(request, body: body, baseURL: baseURL, operationID: operationID) }
                if let stream, let body = received.1 { result = (received.0, HTTPBody(VerificationStreamBody(body: body, session: stream), length: body.length, iterationBehavior: .single)) }
                else { stream?.cancel(); result = received }
            } catch { stream?.cancel(); throw error }
            try verificationRequire(result.0.status.code < 300 || result.0.status.code >= 400, "A verification API request attempted a redirect.")
            recorder.requestHeaders(id, status: result.0.status.code, serverSpans: ClientServerTiming.spans(result.0.headerFields[HTTPField.Name("Server-Timing")!]), acceptedRequestID: result.0.headerFields[HTTPField.Name("X-Todo-Request")!].flatMap(UUID.init(uuidString:)))
            return result
        } catch { recorder.requestFinished(id, status: nil, reason: ClientDiagnosticReason(error: error)); throw error }
    }
}

@MainActor final class VerificationClientFactory {
    let manifest: VerificationManifest
    private var credential: String?
    private var session: URLSession?
    private var current: Client?
    let recorder: ClientDiagnosticsRecorder
    init(manifest: VerificationManifest) {
        self.manifest = manifest
        recorder = .init(journalDirectory: URL(fileURLWithPath: manifest.home).appendingPathComponent("journal"))
    }
    func client(server: URL, credential: String) -> Client {
        precondition(server.absoluteString == manifest.serverURL)
        if self.credential == credential, let current { return current }
        session?.invalidateAndCancel()
        let configuration = VerificationHTTP.configuration()
        configuration.timeoutIntervalForRequest = 60
        configuration.timeoutIntervalForResource = 86_400
        let session = URLSession(configuration: configuration, delegate: VerificationMetrics(recorder), delegateQueue: nil)
        self.session = session; self.credential = credential
        let transport = VerificationTransport(base: URLSessionTransport(configuration: .init(session: session)), origin: server, recorder: recorder)
        let client = Client(serverURL: server, transport: transport, middlewares: [BearerMiddleware(credential: credential), ClientRequestCorrelation()])
        current = client; return client
    }
}
