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
            if let detail, ServerFailure.dependencyCodes.contains(detail.code ?? ""), detail.dependencyError == nil {
                throw RequestFailure(status: status, message: "The server response could not be read. Your draft is preserved.", code: "incompatible_response")
            }
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
    return Client(serverURL: server, transport: URLSessionTransport(configuration: .init(session: URLSession(configuration: configuration))), middlewares: [BearerMiddleware(credential: credential), ClientRequestCorrelation()])
}

public func todoClient(server: URL, credential: String, diagnostics: ClientDiagnosticsRecorder) -> Client {
    guard diagnostics.isEnabled else { return todoClient(server: server, credential: credential) }
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = 60
    configuration.timeoutIntervalForResource = 86_400
    configuration.urlCache = nil
    let session = URLSession(configuration: configuration, delegate: ClientRequestMetrics(diagnostics), delegateQueue: nil)
    let transport = DiagnosticTransport(transport: URLSessionTransport(configuration: .init(session: session)), recorder: diagnostics)
    return Client(serverURL: server, transport: transport, middlewares: [BearerMiddleware(credential: credential), ClientRequestCorrelation()])
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
    private let raw: OpenAPIValueContainer?
    private enum CodingKeys: String, CodingKey { case profile, task_id, current_version }
    public init(profile: Profile? = nil, taskID: String? = nil, currentVersion: Int? = nil) {
        self.profile = profile; task_id = taskID; current_version = currentVersion; raw = nil
    }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        profile = try values.decodeIfPresent(Profile.self, forKey: .profile)
        task_id = try values.decodeIfPresent(String.self, forKey: .task_id)
        current_version = try values.decodeIfPresent(Int.self, forKey: .current_version)
        raw = try OpenAPIValueContainer(from: decoder)
    }
    public func decoded<Value: Decodable>(_ type: Value.Type) throws -> Value {
        try JSONDecoder().decode(type, from: JSONEncoder().encode(self))
    }
    public func encode(to encoder: Encoder) throws {
        if let raw { try raw.encode(to: encoder); return }
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encodeIfPresent(profile, forKey: .profile)
        try values.encodeIfPresent(task_id, forKey: .task_id)
        try values.encodeIfPresent(current_version, forKey: .current_version)
    }
}

public struct ServerFailure: Error, Codable, Sendable {
    public var generated_at: String? = nil
    public let message: String
    public let code: String?
    public let exit_code: Int?
    public let exit_meaning: String?
    public let details: FailureDetails?
    public init(message: String, code: String? = nil, exitCode: Int? = nil, exitMeaning: String? = nil, details: FailureDetails? = nil) {
        self.message = message; self.code = code; exit_code = exitCode; exit_meaning = exitMeaning; self.details = details
    }
    public static let dependencyCodes: Set<String> = ["dependency_cycle", "too_many_dependencies", "blocked", "blocks_done_task", "has_dependencies", "dependency_profile_mismatch"]
    public var dependencyError: Components.Schemas.DependencyError? {
        guard Self.dependencyCodes.contains(code ?? ""), exit_code == 2, exit_meaning == "validation or usage", let data = try? JSONEncoder().encode(self) else { return nil }
        return try? JSONDecoder().decode(Components.Schemas.DependencyError.self, from: data)
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
