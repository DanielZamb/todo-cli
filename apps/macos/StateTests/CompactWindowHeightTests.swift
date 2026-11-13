import AppKit
import SwiftUI
import Testing
@testable import TodoState

/// The taller Compact window (owner decision O34): its width stays 393 pt, its height starts at
/// 426 pt, can be dragged taller, and is remembered across launches and across switching to the
/// full window and back. A stored value out of range is clamped.
@MainActor @Suite(.serialized) struct CompactWindowHeightTests {
    private func suite() -> (UserDefaults, String) {
        let name = "todo-compact-height-" + UUID().uuidString
        return (UserDefaults(suiteName: name)!, name)
    }

    @Test func anOutOfRangeStoredHeightIsClamped() {
        let (defaults, name) = suite(); defer { defaults.removePersistentDomain(forName: name) }
        let store = CompactWindowHeight(defaults: defaults)
        #expect(store.restored(maximum: 900) == 426, "nothing stored: the minimum")
        let cases: [(Double, CGFloat)] = [(100, 426), (5000, 900), (640, 640), (.nan, 426), (-.infinity, 426)]
        for (stored, expected) in cases {
            defaults.set(stored, forKey: CompactWindowHeight.key)
            #expect(store.restored(maximum: 900) == expected, "stored \(stored)")
        }
        defaults.set("tall", forKey: CompactWindowHeight.key)
        #expect(store.restored(maximum: 900) == 426, "a value of the wrong type")
        #expect(CompactWindowHeight.clamp(700, maximum: 300) == 426, "a screen shorter than the minimum still gives the minimum")
    }

    /// The real window sizing view in an offscreen, resizable window: it opens Compact at the
    /// remembered height, remembers a drag, keeps it across the full window and back, and restores
    /// it in a relaunched scene. The width never changes.
    @Test func theDraggedHeightIsRememberedAcrossFullAndARelaunch() async throws {
        _ = NSApplication.shared
        let (defaults, name) = suite(); defer { defaults.removePersistentDomain(forName: name) }
        defaults.set(640.0, forKey: CompactWindowHeight.key)
        final class Mode { var compact = true }
        func scene(_ mode: Mode) -> (NSWindow, NSHostingView<AnyView>) {
            let window = NSWindow(contentRect: .init(x: 200, y: 200, width: 1100, height: 760), styleMask: [.titled, .resizable], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            let host = NSHostingView(rootView: AnyView(Color.clear.background(TaskWindowSizing(compact: mode.compact, defaults: defaults))))
            host.sizingOptions = [.minSize] // this root has no size of its own; the sizing view sets the minimum
            window.contentView = host
            return (window, host)
        }
        func content(_ window: NSWindow) -> NSSize { window.contentRect(forFrameRect: window.frame).size }
        func settle(_ condition: () -> Bool) async throws {
            for _ in 0..<200 { if condition() { return }; try await Task.sleep(for: .milliseconds(5)) }
        }
        let mode = Mode()
        let (window, host) = scene(mode)
        try await settle { content(window) == NSSize(width: 393, height: 640) }
        #expect(content(window) == NSSize(width: 393, height: 640), "opens at the remembered height: \(content(window))")
        // The minimum and the width limit come from RootView's content; WindowLayoutTests asserts them
        // on the real RootView. This bare root has no size, so SwiftUI may report its own minimum here.
        // The person drags it to 700 pt.
        window.setContentSize(NSSize(width: 393, height: 700))
        try await settle { (defaults.object(forKey: CompactWindowHeight.key) as? Double) == 700 }
        #expect((defaults.object(forKey: CompactWindowHeight.key) as? Double) == 700, "the drag is remembered")
        // Full window and back.
        mode.compact = false
        host.rootView = AnyView(Color.clear.background(TaskWindowSizing(compact: false, defaults: defaults)))
        try await settle { content(window).width >= 900 }
        #expect(content(window).width >= 900, "the full window: \(content(window))")
        #expect((defaults.object(forKey: CompactWindowHeight.key) as? Double) == 700, "the full window does not change it")
        host.rootView = AnyView(Color.clear.background(TaskWindowSizing(compact: true, defaults: defaults)))
        try await settle { content(window) == NSSize(width: 393, height: 700) }
        #expect(content(window) == NSSize(width: 393, height: 700), "back to Compact at the dragged height: \(content(window))")
        window.close()
        // A relaunched scene.
        let (relaunched, _) = scene(Mode())
        try await settle { content(relaunched) == NSSize(width: 393, height: 700) }
        #expect(content(relaunched) == NSSize(width: 393, height: 700), "restored after a relaunch: \(content(relaunched))")
        relaunched.close()
    }
}
