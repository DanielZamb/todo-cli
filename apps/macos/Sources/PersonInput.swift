import AppKit

/// MAC-C1-S1-32: the one entry point that counts a person's actions. The forced Profile switch's
/// "acted" test and the Diagnostics monitor both observe it, and it does not depend on Diagnostics
/// being enabled or on a recording being kept.
///
/// Its sources:
/// - the always-on input observer (`install`): a mouse-down (left, right, other) or a key-down in
///   the app's own windows. A local event monitor only receives the app's own events. Scroll,
///   pointer movement, hover, a modifier key alone and key-up are not actions;
/// - `TodoModel.notePersonActed()`, which every other source calls: a write the person started (at
///   the start of every write function), a sheet or dialog presented, selection, search typing, an
///   editor or Quick Add opening, a Profile change, a menu command, a drop, a paste and an
///   accessibility action. These need no event, so a VoiceOver press that ends in a write or a
///   presentation counts too.
///
/// The mark is content-free: a count and the time of the last action. It never holds characters,
/// key codes, locations or targets.
///
/// The click that only brings Todo to the front is not an action (coordinator's refinement, on the
/// UI seat's advice, candidate 10): a mouse-down while the app is not active does not count, and
/// neither does the first mouse-down within half a second of the app becoming active with no input
/// in between (AppKit may activate the app before it delivers that click). Every later click counts;
/// a view that acts on the first click still marks through its write or presentation.
@MainActor final class PersonInput {
    /// How many actions the person has taken since launch.
    private(set) var count = 0
    /// When the last one was taken (system uptime, seconds).
    private(set) var lastUptime: TimeInterval = 0
    /// While owner diagnostics are on, the Diagnostics monitor's input handler. It receives exactly
    /// the events its own monitor received before c10: left mouse down, up and dragged, key-down
    /// and scroll. What the journal records does not change.
    var diagnostics: (@MainActor (NSEvent) -> Void)?
    private var monitor: Any?
    private var sheetObserver: NSObjectProtocol?
    private var sheetNotifications = NotificationCenter.default
    private var activationObserver: NSObjectProtocol?
    /// Whether the app is active; tests inject their own.
    var applicationActive: @MainActor () -> Bool = { NSApplication.shared.isActive }
    /// When the app last became active (system uptime), and whether any input has arrived since.
    private var activatedAt = -Double.infinity
    private var inputSinceActivation = true
    /// When a mouse-down last arrived while the app was not active (the activating click, skipped).
    private var inactiveMouseDownAt = -Double.infinity
    static let activatingClickWindow: TimeInterval = 0.5

    /// The app became active (NSApplication.didBecomeActiveNotification).
    func applicationDidBecomeActive(at uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        activatedAt = uptime
        // If the activating click already arrived (while inactive, and skipped), the next click is
        // the person's; otherwise the first click after activation may be the activating one.
        inputSinceActivation = uptime - inactiveMouseDownAt < Self.activatingClickWindow
    }
    /// Whether a mouse-down at `timestamp` (event time, system uptime) only brings the app forward.
    private func activates(at timestamp: TimeInterval) -> Bool {
        defer { inputSinceActivation = true }
        if !applicationActive() { inactiveMouseDownAt = timestamp; return true }
        return !inputSinceActivation && timestamp - activatedAt < Self.activatingClickWindow
    }

    func mark() {
        count &+= 1
        lastUptime = ProcessInfo.processInfo.systemUptime
    }

    /// The app's only input monitor (a second `addLocalMonitorForEvents` fails the source control).
    /// Also counts any sheet a window begins, which covers sheets and dialogs held in a view's own
    /// state. Idempotent.
    func install(notifications: NotificationCenter = .default) {
        guard monitor == nil else { return }
        sheetNotifications = notifications
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown, .leftMouseUp, .leftMouseDragged, .scrollWheel]) { [weak self] event in
            MainActor.assumeIsolated { self?.observe(event) }
            return event
        }
        sheetObserver = notifications.addObserver(forName: NSWindow.willBeginSheetNotification, object: nil, queue: nil) { [weak self] _ in
            MainActor.assumeIsolated { self?.mark() }
        }
        activationObserver = notifications.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: nil) { [weak self] _ in
            MainActor.assumeIsolated { self?.applicationDidBecomeActive() }
        }
    }

    /// Constant time, no allocation: a switch on the event's type, a counter, a clock read and,
    /// with diagnostics on, the hand-off.
    func observe(_ event: NSEvent) {
        switch event.type {
        case .leftMouseDown:
            if !activates(at: event.timestamp) { mark() }
            diagnostics?(event)
        case .keyDown:
            inputSinceActivation = true
            mark()
            diagnostics?(event)
        case .rightMouseDown, .otherMouseDown:
            if !activates(at: event.timestamp) { mark() }
        case .leftMouseUp, .leftMouseDragged, .scrollWheel:
            diagnostics?(event)
        default:
            break
        }
    }

    isolated deinit {
        if let monitor { NSEvent.removeMonitor(monitor) }
        if let sheetObserver { sheetNotifications.removeObserver(sheetObserver) }
        if let activationObserver { sheetNotifications.removeObserver(activationObserver) }
    }
}
