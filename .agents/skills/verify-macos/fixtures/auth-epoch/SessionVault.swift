import Foundation

@MainActor struct SessionVault {
    private static var sessions: [String: String] = [:]
    let service: String
    let account: String
    private var key: String { service + account }
    func load() throws -> String? { Self.sessions[key] }
    func save(_ value: String) throws { Self.sessions[key] = value }
    func delete() throws { Self.sessions[key] = nil }
}
struct VaultError: LocalizedError {
    var errorDescription: String? { "In-memory Session adapter failure" }
}
