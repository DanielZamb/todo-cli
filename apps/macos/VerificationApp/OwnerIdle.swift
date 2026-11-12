import AppKit
import ApplicationServices
import CoreGraphics

@_silgen_name("verification_hid_idle_seconds")
func verificationHIDIdleSeconds() -> Double

struct OwnerPreflight: Codable {
    let frontmostBundleID: String
    let frontmostName: String
    let frontmostBundleName: String
    let idleSeconds: Double
    let hidIdleSeconds: Double
}

final class OwnerInputWatch: @unchecked Sendable {
    private let timer: DispatchSourceTimer
    init(started: Double, combined: @escaping @Sendable () -> Double = { CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: UInt32.max)!) }, hid: @escaping @Sendable () -> Double = { verificationHIDIdleSeconds() }) {
        timer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "local.todo.verification.owner-input", qos: .userInteractive))
        timer.schedule(deadline: .now(), repeating: .milliseconds(50))
        timer.setEventHandler {
            let elapsed = ProcessInfo.processInfo.systemUptime - started
            let sessionIdle = combined(), hidIdle = hid()
            if sessionIdle < 0 || hidIdle < 0 || sessionIdle < elapsed || hidIdle < elapsed {
                OwnerIdle.stop("owner input or unavailable idle signal detected independently of the UI thread")
            }
        }
        timer.resume()
    }
    deinit { timer.cancel() }
}

@MainActor enum OwnerIdle {
    nonisolated static let testInputTag: Int64 = 0x544F444F563031
    static let inputTypes: [NSEvent.EventType] = [.keyDown, .keyUp, .flagsChanged, .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseUp, .mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged, .mouseEntered, .mouseExited, .scrollWheel, .tabletPoint, .tabletProximity, .gesture, .magnify, .swipe, .rotate, .beginGesture, .endGesture, .pressure, .directTouch, .changeMode, .smartMagnify, .quickLook, .systemDefined, .cursorUpdate, .mouseCancelled]
    static let inputMask = inputTypes.reduce(NSEvent.EventTypeMask()) { $0.union(NSEvent.EventTypeMask(rawValue: 1 << $1.rawValue)) }
    private static var started: TimeInterval?
    private static var localMonitor: Any?
    private static var globalMonitor: Any?
    private static var watch: OwnerInputWatch?

    static func snapshot() -> OwnerPreflight {
        let front = NSWorkspace.shared.frontmostApplication
        return OwnerPreflight(frontmostBundleID: front?.bundleIdentifier ?? "unknown", frontmostName: front?.localizedName ?? "unknown", frontmostBundleName: front?.bundleURL?.lastPathComponent ?? "unknown",
            idleSeconds: CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: UInt32.max)!), hidIdleSeconds: verificationHIDIdleSeconds())
    }
    static func validate(_ state: OwnerPreflight) throws {
        try LaunchGuard.require(state.frontmostBundleID != "unknown" && state.frontmostBundleName != "unknown", "The frontmost application could not be identified.")
        try LaunchGuard.require(state.frontmostBundleName != "Todo.app" && state.frontmostBundleName != "Todo Electron.app", "The owner's Todo app is frontmost.")
        try LaunchGuard.require(state.idleSeconds >= 60 && state.hidIdleSeconds >= 60, "The owner must be idle on both session and HID signals for one minute.")
    }
    static func requireIdle() throws {
        let state = snapshot()
        FileHandle.standardError.write(Data("preflight ".utf8) + (try JSONEncoder().encode(state)) + Data("\n".utf8))
        try validate(state)
        try LaunchGuard.require(AXIsProcessTrusted() && CGPreflightListenEventAccess(), "Global owner-input monitoring permission is unavailable; no prompt was requested.")
        started = ProcessInfo.processInfo.systemUptime
        installMonitors(requireGlobal: true)
    }
    nonisolated static func stop(_ source: String) -> Never {
        FileHandle.standardError.write(Data(("Todo Verification stopped: " + source + ".\n").utf8))
        exit(80)
    }
    nonisolated static func sessionInputArrived(elapsed: Double, idleSeconds: [Double]) -> Bool { idleSeconds.contains { $0 < elapsed } }
    private static func installMonitors(requireGlobal: Bool) {
        let began = started ?? ProcessInfo.processInfo.systemUptime
        if localMonitor == nil { localMonitor = NSEvent.addLocalMonitorForEvents(matching: inputMask) { event in
            let tagged = event.cgEvent?.getIntegerValueField(.eventSourceUserData) == testInputTag
            stop(tagged ? "posted test input detected (type \(event.type.rawValue))" : "owner input detected in verification window")
        } }
        guard localMonitor != nil else { stop("local input monitor could not be installed") }
        if requireGlobal && globalMonitor == nil {
            globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: inputMask) { _ in stop("owner input detected by the global monitor") }
            guard globalMonitor != nil else { stop("global input monitor could not be installed") }
            watch = OwnerInputWatch(started: began)
        }
    }
    static func monitor(interruptionRequest: URL, requireGlobal: Bool = false) -> Timer {
        installMonitors(requireGlobal: requireGlobal)
        return Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            MainActor.assumeIsolated {
                if let files = LaunchGuard.files {
                    do { try files.verify(); try files.audit(); try LaunchGuard.verifyOwnedChild() }
                    catch { stop("the scratch descriptors or owned server changed") }
                }
                if FileManager.default.fileExists(atPath: interruptionRequest.path) {
                    try? FileManager.default.removeItem(at: interruptionRequest)
                    let event = CGEvent(keyboardEventSource: CGEventSource(stateID: .privateState), virtualKey: 90, keyDown: true)!
                    event.setIntegerValueField(.eventSourceUserData, value: testInputTag)
                    NSApp.postEvent(NSEvent(cgEvent: event)!, atStart: false)
                }
            }
        }
    }
}
