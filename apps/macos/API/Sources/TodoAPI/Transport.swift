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
            let detail = data.flatMap { try? JSONDecoder().decode(ServerFailure.self, from: $0) }
            throw RequestFailure(status: status, body: detail ?? ServerFailure(message: "The server rejected this request (HTTP \(status))."))
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

public struct FailureDetails: Codable, Sendable {
    public struct Profile: Codable, Sendable, Equatable {
        public let id: String
        public let name: String
        public init(id: String, name: String) { self.id = id; self.name = name }
    }
    public let profile: Profile?
    public let task_id: String?
    public let current_version: Int?
    public init(profile: Profile? = nil, taskID: String? = nil, currentVersion: Int? = nil) {
        self.profile = profile; task_id = taskID; current_version = currentVersion
    }
}

public struct ServerFailure: Error, Codable, Sendable {
    public let message: String
    public let code: String?
    public let exit_code: Int?
    public let exit_meaning: String?
    public let details: FailureDetails?
    public init(message: String, code: String? = nil, exitCode: Int? = nil, exitMeaning: String? = nil, details: FailureDetails? = nil) {
        self.message = message; self.code = code; exit_code = exitCode; exit_meaning = exitMeaning; self.details = details
    }
    public var isTaskLookup: Bool { details?.profile != nil && details?.task_id != nil }
    public var primaryMessage: String {
        if isTaskLookup, let profile = details?.profile { return "Task not found in \(profile.name)." }
        return message
    }
    public var exitDetail: String? {
        guard let exit_code, let exit_meaning else { return nil }
        return "error \(exit_code) - \(exit_meaning)"
    }
    public var humanMessage: String { [primaryMessage, exitDetail].compactMap { $0 }.joined(separator: "\n") }
}

public struct RequestFailure: Error, Sendable {
    public let status: Int
    public let body: ServerFailure
    public var message: String { body.message }
    public var code: String? { body.code }
    public var exitCode: Int? { body.exit_code }
    public var exitMeaning: String? { body.exit_meaning }
    public var exitDetail: String? { body.exitDetail }
    public var humanMessage: String { body.humanMessage }
    public init(status: Int, body: ServerFailure) { self.status = status; self.body = body }
    public init(status: Int, message: String, code: String? = nil, exitCode: Int? = nil, exitMeaning: String? = nil, details: FailureDetails? = nil) {
        self.status = status; body = .init(message: message, code: code, exitCode: exitCode, exitMeaning: exitMeaning, details: details)
    }
}
