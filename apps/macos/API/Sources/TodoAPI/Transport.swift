import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

public struct BearerMiddleware: ClientMiddleware {
    public let credential: String
    public init(credential: String) { self.credential = credential }

    public func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if !credential.isEmpty { request.headerFields[.authorization] = "Bearer \(credential)" }
        let (response, originalBody) = try await next(request, body, baseURL)
        var responseBody = originalBody
        if operationID == "system.health", response.status == .ok, let originalBody {
            let data = try await Data(collecting: originalBody, upTo: 65_536)
            let health = try JSONDecoder().decode(ServerHealth.self, from: data)
            guard health.contract == TodoContract.id else { throw OutdatedServer(serverBuild: health.build ?? "unknown") }
            responseBody = HTTPBody(data)
        }
        let status = response.status.code
        if status >= 400 && status != 409 {
            var data: Data?
            if let responseBody { data = try await Data(collecting: responseBody, upTo: 65_536) }
            let detail = data.flatMap { try? JSONDecoder().decode(FailureMessage.self, from: $0) }
            throw RequestFailure(status: status, message: detail?.message ?? "The server rejected this request (HTTP \(status)).", code: detail?.code)
        }
        return (response, responseBody)
    }
}

private struct ServerHealth: Decodable { let contract: String?; let build: String? }
public struct OutdatedServer: Error, Sendable {
    public let serverBuild: String
    public init(serverBuild: String) { self.serverBuild = serverBuild }
}

public func todoClient(server: URL, credential: String) -> Client {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = 60
    configuration.timeoutIntervalForResource = 86_400
    configuration.urlCache = nil
    return Client(serverURL: server, transport: URLSessionTransport(configuration: .init(session: URLSession(configuration: configuration))), middlewares: [BearerMiddleware(credential: credential)])
}

private struct FailureMessage: Decodable { let message: String; let code: String? }

public struct RequestFailure: Error, Sendable {
    public let status: Int
    public let message: String
    public let code: String?
    public init(status: Int, message: String, code: String? = nil) { self.status = status; self.message = message; self.code = code }
}
