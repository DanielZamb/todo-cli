import Foundation

final class MemorySessionVault: SessionStorage {
    private var credential: String?
    init(_ credential: String? = nil) { self.credential = credential }
    func load() throws -> String? { credential }
    func save(_ credential: String) throws { self.credential = credential }
    func delete() throws { credential = nil }
}

struct SessionVault {
    let service: String
    let account: String
    func load() throws -> String? { fatalError("Verification requires injected memory Session storage") }
    func save(_ credential: String) throws { fatalError("Verification requires injected memory Session storage") }
    func delete() throws { fatalError("Verification requires injected memory Session storage") }
}

struct VaultError: LocalizedError {
    var errorDescription: String? { "Session storage failed in Todo Verification." }
}
