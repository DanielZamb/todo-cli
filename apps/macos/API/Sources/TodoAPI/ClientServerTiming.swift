import Foundation
import HTTPTypes

public struct ClientDiagnosticServerSpans: Codable, Sendable, Equatable {
    public var handler: Double?
    public var auth: Double?
    public var queue: Double?
    public var domain: Double?
    public var database: Double?
    public var encode: Double?
    private enum CodingKeys: String, CodingKey {
        case handler = "todo-handler", auth = "todo-auth", queue = "todo-queue", domain = "todo-domain", database = "todo-db", encode = "todo-encode"
    }
}
public enum ClientServerTiming {
    public static func spans(_ header: String?) -> ClientDiagnosticServerSpans? {
        var output = ClientDiagnosticServerSpans(), observed = false
        for metric in (header ?? "").split(separator: ",") {
            let parts = metric.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
            guard let name = parts.first, let parameter = parts.dropFirst().first(where: { $0.lowercased().hasPrefix("dur=") }), let duration = Double(parameter.dropFirst(4).trimmingCharacters(in: CharacterSet(charactersIn: " \""))), duration.isFinite, duration >= 0 else { continue }
            switch name.lowercased() {
            case "todo-handler", "handler": output.handler = duration
            case "todo-auth": output.auth = duration
            case "todo-queue": output.queue = duration
            case "todo-domain": output.domain = duration
            case "todo-db": output.database = duration
            case "todo-encode": output.encode = duration
            default: continue
            }
            observed = true
        }
        return observed ? output : nil
    }
    static func spans(_ response: HTTPResponse) -> ClientDiagnosticServerSpans? { spans(response.headerFields[HTTPField.Name("Server-Timing")!]) }
    static func spans(_ response: HTTPURLResponse?) -> ClientDiagnosticServerSpans? { spans(response?.value(forHTTPHeaderField: "Server-Timing")) }
    static func acceptedRequest(_ response: HTTPResponse) -> UUID? {
        response.headerFields[HTTPField.Name("X-Todo-Request")!].flatMap(UUID.init(uuidString:))
    }
}
