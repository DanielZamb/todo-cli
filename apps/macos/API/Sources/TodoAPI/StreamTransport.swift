import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

final class StreamTransport: ClientTransport, @unchecked Sendable {
    private let lock = NSLock()
    private let ordinary: URLSessionTransport
    private let diagnostics: ClientDiagnosticsRecorder
    private var streaming: URLSessionTransport?
    init(ordinary: URLSessionTransport, diagnostics: ClientDiagnosticsRecorder) { self.ordinary = ordinary; self.diagnostics = diagnostics }
    private func stream() -> URLSessionTransport {
        lock.withLock {
            if let streaming { return streaming }
            let configuration = URLSessionConfiguration.default
            configuration.timeoutIntervalForRequest = .greatestFiniteMagnitude
            configuration.timeoutIntervalForResource = 86_400
            configuration.urlCache = nil
            let session = diagnostics.isEnabled
                ? URLSession(configuration: configuration, delegate: ClientRequestMetrics(diagnostics), delegateQueue: nil)
                : URLSession(configuration: configuration)
            let transport = URLSessionTransport(configuration: .init(session: session))
            streaming = transport
            return transport
        }
    }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let transport = operationID == "changes.stream" ? stream() : ordinary
        return try await transport.send(request, body: body, baseURL: baseURL, operationID: operationID)
    }
}
