import XCTest
@testable import Todo

final class NotificationPermissionTests: XCTestCase {
    @MainActor
    func testThrownAuthorizationErrorRetainsDomainAndCode() async {
        let result = await NotificationPermission.request(register: {}, authorize: {
            throw NSError(domain: "UNErrorDomain", code: 1, userInfo: [NSLocalizedDescriptionKey: "Notifications are not allowed for this application"])
        })
        XCTAssertEqual(result.authorization, "Notification permission failed: UNErrorDomain (1): Notifications are not allowed for this application")
        XCTAssertEqual(result.failureReceipt, "Notification permission failed: UNErrorDomain (1): Notifications are not allowed for this application")
    }
}
