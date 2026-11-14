import Foundation
import HTTPTypes
import OpenAPIRuntime

public struct ClientRequestCorrelation: ClientMiddleware {
    public init() {}
    public func intercept(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String, next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)) async throws -> (HTTPResponse, HTTPBody?) {
        let trace = ClientDiagnosticContext.traceID ?? ClientDiagnosticContext.actionID ?? UUID()
        let action = ClientDiagnosticContext.actionID ?? UUID()
        let id = UUID()
        var request = request
        request.headerFields[HTTPField.Name("X-Todo-Trace")!] = trace.uuidString.lowercased()
        request.headerFields[HTTPField.Name("X-Todo-Request")!] = id.uuidString.lowercased()
        request.headerFields[HTTPField.Name("X-Todo-Action")!] = action.uuidString.lowercased()
        return try await ClientDiagnosticContext.$traceID.withValue(trace) {
            try await ClientDiagnosticContext.$requestID.withValue(id) { try await next(request, body, baseURL) }
        }
    }
}
