import Foundation
// Copied into Sources of a measured tree only. The harness inserts
// PressReleaseTrace.handled() as the first statement of the Task list's
// selection onChange, so it marks SwiftUI's handler entry on every tree.
@MainActor enum PressReleaseTrace {
    static var handlers: [Double] = []
    static func handled() { handlers.append(ProcessInfo.processInfo.systemUptime * 1000) }
}
