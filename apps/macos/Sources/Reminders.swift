import Foundation
import Observation
import UserNotifications
import CoreServices

struct CommittedOperation: Decodable {
    let seq: Int64
    let profile: String?
    let outcome: String
    let event: OperationPayload

    struct ProfileName: Decodable { let name: String }
    struct OperationPayload: Decodable {
        var profile: ProfileName? = nil
        let kind: String
        let task_id: String?
        let title: String?
        let due_at: String?
    }
}

@MainActor
@Observable
final class Reminders: NSObject, UNUserNotificationCenterDelegate {
    var authorization = "Not requested"
    private var receiptState = ReminderReceiptState()
    var lastReceipt: String { receiptState.lastReceipt }
    var lastTest: NotificationTestResult? { receiptState.lastTest }
    private var requestingPermission = false
    private let registrationStatus: OSStatus
    private let center: UNUserNotificationCenter

    override init() {
        registrationStatus = LSRegisterURL(Bundle.main.bundleURL as CFURL, true)
        center = UNUserNotificationCenter.current()
        super.init()
        center.delegate = self
    }

    func resetGeneration(_ generation: String) { receiptState.reset(to: generation) }

    func refreshAuthorization() async {
        let settings = await center.notificationSettings()
        guard !Task.isCancelled, !requestingPermission else { return }
        authorization = NotificationPermission.description(for: settings.authorizationStatus)
    }

    func authorize() async {
        guard !requestingPermission else { return }
        requestingPermission = true
        defer { requestingPermission = false }
        authorization = "Awaiting approval"
        let result = await NotificationPermission.request(register: {
            guard self.registrationStatus == noErr else {
                throw NSError(domain: NSOSStatusErrorDomain, code: Int(self.registrationStatus))
            }
        }, authorize: {
            try await self.center.requestAuthorization(options: [.alert, .sound, .badge])
        })
        authorization = result.authorization
        if let receipt = result.failureReceipt {
            receiptState.lastReceipt = receipt
            FileHandle.standardError.write(Data((receipt + "\n").utf8))
        }
    }

    func deliver(_ operation: CommittedOperation, server: String, profile: String) async throws {
        guard operation.outcome == "committed", operation.profile == profile,
              operation.event.kind == "ReminderFired", let title = operation.event.title,
              let task = operation.event.task_id, let due = operation.event.due_at else { return }
        let generation = receiptState.generation
        let identifier = receiptState.identifier(server: server, profile: profile, seq: operation.seq)
        let settings = await center.notificationSettings()
        guard receiptState.generation == generation else { return }
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            if !requestingPermission { authorization = NotificationPermission.description(for: settings.authorizationStatus) }
            return
        }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = "Due now · \(profile)"
        content.sound = .default
        content.userInfo = ["seq": String(operation.seq), "profile": profile, "task": task, "due_at": due, "generation": generation]
        try await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil))
    }

    func checkDelivery(server: String, profile: String) async {
        let generation = receiptState.generation
        let prefix = receiptState.prefix(server: server, profile: profile)
        let delivered = await center.deliveredNotifications()
        guard receiptState.generation == generation else { return }
        let receipts = delivered.compactMap { notification -> (Int64, String)? in
            guard notification.request.identifier.hasPrefix(prefix) else { return nil }
            guard let text = notification.request.content.userInfo["seq"] as? String, let seq = Int64(text) else { return nil }
            return (seq, "Reminder sequence \(seq): \(notification.request.content.title)")
        }
        let receipt = receipts.max(by: { $0.0 < $1.0 })
        receiptState.lastTest = NotificationTestResult(checkedAt: .now, delivered: receipt != nil)
        receiptState.lastReceipt = receipt?.1 ?? "No matching reminder delivered"
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}
