import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

final class ClientRequestMetrics: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    let recorder: ClientDiagnosticsRecorder
    init(_ recorder: ClientDiagnosticsRecorder) { self.recorder = recorder }
    static func interval(_ start: Date?, _ end: Date?) -> Double? {
        guard let start, let end else { return nil }
        return max(0, end.timeIntervalSince(start) * 1000)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        guard let id = task.originalRequest?.value(forHTTPHeaderField: "X-Todo-Request").flatMap(UUID.init(uuidString:)), let transaction = metrics.transactionMetrics.last else { return }
        let phases = ClientDiagnosticRequestPhases(
            fetchToRequestMS: Self.interval(transaction.fetchStartDate, transaction.requestStartDate),
            dnsMS: Self.interval(transaction.domainLookupStartDate, transaction.domainLookupEndDate),
            connectMS: Self.interval(transaction.connectStartDate, transaction.connectEndDate),
            sendMS: Self.interval(transaction.requestStartDate, transaction.requestEndDate),
            firstByteMS: Self.interval(transaction.requestEndDate, transaction.responseStartDate),
            transferMS: Self.interval(transaction.responseStartDate, transaction.responseEndDate),
            connectionReused: transaction.isReusedConnection, receivedBytes: task.countOfBytesReceived, serverSpans: ClientServerTiming.spans(task.response as? HTTPURLResponse))
        recorder.requestFinished(id, status: (task.response as? HTTPURLResponse)?.statusCode, reason: task.error.map(Self.reason), phases: phases)
    }
    static func reason(_ error: any Error) -> ClientDiagnosticReason {
        if let wrapped = error as? ClientError { return reason(wrapped.underlyingError) }
        let code = (error as NSError).code
        if (error as NSError).domain == NSURLErrorDomain {
            if code == NSURLErrorTimedOut { return .timeout }
            if code == NSURLErrorCancelled { return .cancelled }
            return .transport
        }
        return .other
    }
}

struct DiagnosticTransport: ClientTransport {
    let transport: URLSessionTransport
    let recorder: ClientDiagnosticsRecorder
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let id = recorder.requestStarted(operation: operationID)
        do {
            let response = try await ClientDiagnosticContext.$requestID.withValue(id) {
                try await transport.send(request, body: body, baseURL: baseURL, operationID: operationID)
            }
            recorder.requestHeaders(id, status: response.0.status.code, serverSpans: ClientServerTiming.spans(response.0), acceptedRequestID: ClientServerTiming.acceptedRequest(response.0))
            return response
        } catch {
            recorder.requestFinished(id, status: nil, reason: ClientRequestMetrics.reason(error))
            throw error
        }
    }
}

public extension ClientDiagnosticReason {
    init(error: any Error) { self = ClientRequestMetrics.reason(error) }
}
