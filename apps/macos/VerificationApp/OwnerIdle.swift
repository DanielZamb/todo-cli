import AppKit
import CoreGraphics

struct OwnerPreflight: Codable {
    let frontmostBundleID: String
    let frontmostName: String
    let frontmostBundleName: String
    let idleSeconds: Double
    let hidIdleSeconds: Double
}

@MainActor enum OwnerIdle {
    static let testInputTag: Int64 = 0x544F444F563031
    static let events: [CGEventType] = [.keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel, .mouseMoved, .leftMouseDragged, .rightMouseDragged]
    private static var started: TimeInterval?
    private static var localMonitor: Any?

    static func snapshot() -> OwnerPreflight {
        let front = NSWorkspace.shared.frontmostApplication
        return OwnerPreflight(frontmostBundleID: front?.bundleIdentifier ?? "unknown", frontmostName: front?.localizedName ?? "unknown", frontmostBundleName: front?.bundleURL?.lastPathComponent ?? "unknown",
            idleSeconds: events.map { CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: $0) }.min() ?? 0,
            hidIdleSeconds: events.map { CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: $0) }.min() ?? 0)
    }

    static func validate(_ state: OwnerPreflight) throws {
        try LaunchGuard.require(state.frontmostBundleID != "unknown" && state.frontmostBundleName != "unknown", "The frontmost application could not be identified.")
        try LaunchGuard.require(state.frontmostBundleName != "Todo.app" && state.frontmostBundleName != "Todo Electron.app", "The owner's Todo app is frontmost.")
        try LaunchGuard.require(state.idleSeconds >= 60, "The owner must be idle for at least one minute before a visible run.")
    }

    static func requireIdle() throws {
        let state = snapshot()
        let receipt = try JSONEncoder().encode(state)
        FileHandle.standardError.write(Data("preflight ".utf8) + receipt + Data("\n".utf8))
        try validate(state)
        started = ProcessInfo.processInfo.systemUptime
    }

    private static func stop(_ source: String) -> Never {
        FileHandle.standardError.write(Data(("Todo Verification stopped: " + source + ".\n").utf8))
        exit(80)
    }

    static func sessionInputArrived(elapsed: Double, idleSeconds: [Double]) -> Bool {
        idleSeconds.contains { $0 < elapsed }
    }

    static func monitor(interruptionRequest: URL) -> Timer {
        let started = started ?? ProcessInfo.processInfo.systemUptime
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel, .mouseMoved, .leftMouseDragged, .rightMouseDragged]) { event in
            MainActor.assumeIsolated { () -> Void in
                let tagged = event.cgEvent?.getIntegerValueField(.eventSourceUserData) == testInputTag
                stop(tagged ? "posted test input detected" : "owner input detected in verification window")
            }
            return nil
        }
        return Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            MainActor.assumeIsolated {
                if FileManager.default.fileExists(atPath: interruptionRequest.path) {
                    try? FileManager.default.removeItem(at: interruptionRequest)
                    let event = CGEvent(keyboardEventSource: CGEventSource(stateID: .privateState), virtualKey: 90, keyDown: true)!
                    event.setIntegerValueField(.eventSourceUserData, value: testInputTag)
                    NSApp.postEvent(NSEvent(cgEvent: event)!, atStart: false)
                    FileHandle.standardError.write(Data("posted marked F20 using NSApplication.postEvent in verification process\n".utf8))
                }
                let elapsed = ProcessInfo.processInfo.systemUptime - started
                if sessionInputArrived(elapsed: elapsed, idleSeconds: events.map { CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: $0) }) {
                    stop("owner input detected in session")
                }
            }
        }
    }
}
