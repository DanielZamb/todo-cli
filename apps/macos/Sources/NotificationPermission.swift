import Foundation
import UserNotifications

struct NotificationPermission {
    let authorization: String
    let failureReceipt: String?

    static func description(for status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional: "Allowed"
        case .denied: "Disabled in System Settings"
        case .notDetermined: "Not requested"
        @unknown default: "Status unavailable"
        }
    }

    @MainActor
    static func request(register: () throws -> Void, authorize: () async throws -> Bool) async -> Self {
        do {
            try register()
            let granted = try await authorize()
            return Self(authorization: granted ? "Allowed" : "Disabled in System Settings", failureReceipt: nil)
        } catch {
            let error = error as NSError
            let receipt = "Notification permission failed: \(error.domain) (\(error.code)): \(error.localizedDescription)"
            return Self(authorization: receipt, failureReceipt: receipt)
        }
    }
}
