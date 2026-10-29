import Foundation

@main
struct NotificationPermissionProof {
    @MainActor
    static func main() async throws {
        var registered = false
        let failure = await NotificationPermission.request(register: { registered = true }, authorize: {
            precondition(registered)
            throw NSError(domain: "UNErrorDomain", code: 1, userInfo: [NSLocalizedDescriptionKey: "Notifications are not allowed for this application"])
        })
        precondition(failure.authorization == "Notification permission failed: UNErrorDomain (1): Notifications are not allowed for this application")
        precondition(failure.failureReceipt == "Notification permission failed: UNErrorDomain (1): Notifications are not allowed for this application")
        let registration = await NotificationPermission.request(register: {
            throw NSError(domain: NSOSStatusErrorDomain, code: -43, userInfo: [NSLocalizedDescriptionKey: "Bundle not found"])
        }, authorize: { preconditionFailure("Registration failure must stop the authorization request") })
        precondition(registration.failureReceipt == "Notification permission failed: NSOSStatusErrorDomain (-43): Bundle not found")
        let allowed = await NotificationPermission.request(register: {}, authorize: { true })
        precondition(allowed.authorization == "Allowed" && allowed.failureReceipt == nil)
        let denied = await NotificationPermission.request(register: {}, authorize: { false })
        precondition(denied.authorization == "Disabled in System Settings" && denied.failureReceipt == nil)
        print("PASS: thrown authorization and registration errors retain domain/code; registration precedes authorization; allowed and denied results")
    }
}
