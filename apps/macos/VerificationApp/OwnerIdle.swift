import AppKit
import CoreGraphics

@MainActor enum OwnerIdle {
    static let events: [CGEventType] = [.keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel, .mouseMoved, .leftMouseDragged, .rightMouseDragged]
    private static var started: TimeInterval?

    static func requireIdle() throws {
        let front = NSWorkspace.shared.frontmostApplication?.bundleURL?.lastPathComponent
        try LaunchGuard.require(front != "Todo.app" && front != "Todo Electron.app", "The owner's Todo app is frontmost.")
        try LaunchGuard.require(events.allSatisfy { CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: $0) >= 60 }, "The owner must be idle for at least one minute before a visible run.")
        started = ProcessInfo.processInfo.systemUptime
    }

    static func monitor() -> Timer {
        let started = started ?? ProcessInfo.processInfo.systemUptime
        return Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            let elapsed = ProcessInfo.processInfo.systemUptime - started
            if events.contains(where: { CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: $0) < elapsed }) {
                FileHandle.standardError.write(Data("Todo Verification stopped: owner input detected.\n".utf8))
                exit(80)
            }
        }
    }
}
