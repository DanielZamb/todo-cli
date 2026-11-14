import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

private final class StreamSession: Sendable {
    let session: URLSession
    init(diagnostics: ClientDiagnosticsRecorder) {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = .greatestFiniteMagnitude
        configuration.timeoutIntervalForResource = 86_400
        configuration.urlCache = nil
        session = diagnostics.isEnabled
            ? URLSession(configuration: configuration, delegate: ClientRequestMetrics(diagnostics), delegateQueue: nil)
            : URLSession(configuration: configuration)
    }
    func cancel() { session.invalidateAndCancel() }
    deinit { cancel() }
}

private struct StreamBody: AsyncSequence, Sendable {
    typealias Element = HTTPBody.ByteChunk
    let body: HTTPBody
    let session: StreamSession
    func makeAsyncIterator() -> Iterator { Iterator(base: body.makeAsyncIterator(), session: session) }
    struct Iterator: AsyncIteratorProtocol {
        var base: HTTPBody.AsyncIterator
        let session: StreamSession
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

final class StreamTransport: ClientTransport, Sendable {
    private let ordinary: URLSessionTransport
    private let diagnostics: ClientDiagnosticsRecorder
    init(ordinary: URLSessionTransport, diagnostics: ClientDiagnosticsRecorder) { self.ordinary = ordinary; self.diagnostics = diagnostics }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        guard operationID == "changes.stream" else { return try await ordinary.send(request, body: body, baseURL: baseURL, operationID: operationID) }
        let session = StreamSession(diagnostics: diagnostics)
        let transport = URLSessionTransport(configuration: .init(session: session.session))
        do {
            let (response, body) = try await transport.send(request, body: body, baseURL: baseURL, operationID: operationID)
            guard let body else { session.cancel(); return (response, nil) }
            return (response, HTTPBody(StreamBody(body: body, session: session), length: body.length, iterationBehavior: .single))
        } catch { session.cancel(); throw error }
    }
}
