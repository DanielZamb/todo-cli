import Foundation
import Security
import Darwin

func configureVerificationKeychain() {
    guard ProcessInfo.processInfo.environment["TODO_VERIFY_KEYCHAIN_NO_UI"] == "1" else { return }
    let status = SecKeychainSetUserInteractionAllowed(false)
    if status != errSecSuccess {
        _ = VaultError(status: status)
        exit(78)
    }
}

struct SessionVault {
    let service: String
    let account: String

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func load() throws -> String? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let credential = String(data: data, encoding: .utf8) else { throw VaultError(status: status) }
        return credential
    }

    func save(_ credential: String) throws {
        var attributes = query
        attributes[kSecValueData as String] = Data(credential.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let updated = SecItemUpdate(query as CFDictionary, [kSecValueData as String: Data(credential.utf8)] as CFDictionary)
            guard updated == errSecSuccess else { throw VaultError(status: updated) }
        } else if status != errSecSuccess { throw VaultError(status: status) }
    }

    func delete() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw VaultError(status: status) }
    }
}

struct VaultError: LocalizedError {
    let status: OSStatus

    init(status: OSStatus) {
        self.status = status
        let environment = ProcessInfo.processInfo.environment
        if environment["TODO_VERIFY_KEYCHAIN_NO_UI"] == "1", let path = environment["TODO_VERIFY_KEYCHAIN_FAILURE"],
           let data = try? JSONSerialization.data(withJSONObject: ["status": status, "reason": "Keychain interaction unavailable, rejected or cancelled. Stop native verification; do not retry."]) {
            try? data.write(to: URL(fileURLWithPath: path), options: .atomic)
        }
    }
    var errorDescription: String? { "Keychain: \(SecCopyErrorMessageString(status, nil) as String? ?? String(status))" }
}
