import AppKit
import SwiftUI
import Testing
@testable import TodoState

@MainActor private final class DiscoveryFrames { var frames: [String: CGRect] = [:] }

@MainActor struct DiscoverySnapshots {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DISCOVERY_ONLY"] == "1"))
    func renderDiscoveryScreens() async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_SNAPSHOT_DIR"]))
        var files: [String] = []
        var geometry: [String: [String: [Double]]] = [:]
        let profile = DiscoveryName(id: "work", name: "Work")
        let match = TaskLookupMatch(profile: profile, task_id: "aaaaaaaa-1111-4222-8333-444444444444", title: "Review ARG report before Friday", project: "ARG")
        let states: [(String, DiscoveryDialog, DiscoveryPhase)] = [
            ("directory-ready", .directory, .showing), ("directory-empty", .directory, .empty),
            ("directory-loading", .directory, .requesting), ("directory-error", .directory, .error),
            ("directory-offline", .directory, .offline), ("directory-dense", .directory, .showing),
            ("lookup-editing", .lookup, .editing), ("lookup-invalid", .lookup, .invalid),
            ("lookup-loading", .lookup, .requesting), ("lookup-ready", .lookup, .showing),
            ("lookup-empty", .lookup, .empty), ("lookup-error", .lookup, .error),
            ("lookup-offline", .lookup, .offline), ("lookup-copied", .lookup, .showing),
            ("lookup-copy-failed", .lookup, .showing), ("lookup-dense", .lookup, .showing)
        ]
        for compact in [true, false] {
            for scheme in [ColorScheme.light, .dark] {
                let appearance = try #require(NSAppearance(named: scheme == .light ? .aqua : .darkAqua))
                NSApplication.shared.appearance = appearance
                for (name, dialog, phase) in states {
                    let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-discovery-snapshot"))
                    model.signedIn = true
                    model.connection = .live
                    model.discovery.dialog = dialog
                    model.discovery.phase = phase
                    model.discovery.prefix = phase == .invalid ? "invalid!" : "aaaa"
                    model.discovery.error = phase == .invalid ? "Enter 1 to 36 hexadecimal digits or hyphens." : "Task not found in Profile Work (work). Use Find Task by id to search Profiles available to this credential.\nerror 3 - not found or auth missing"
                    let identity = DiscoveryIdentity(credentialEpoch: 0, generation: 0, dialog: dialog, prefix: "aaaa")
                    let projects = [DiscoveryName(id: "63bbdd22-1111-4222-8333-444444444444", name: "ARG")]
                    let profiles = [ProfileDirectoryEntry(id: "work", name: "Work", projects: projects), ProfileDirectoryEntry(id: "personal", name: "Personal", projects: [])]
                    model.discovery.appliedSnapshot = .init(appliedIdentity: identity, profiles: name == "directory-dense" ? (0..<12).map { ProfileDirectoryEntry(id: "profile-\($0)", name: "Profile \($0)", projects: projects) } : profiles, matches: name == "lookup-dense" ? (0..<12).map { TaskLookupMatch(profile: profile, task_id: "aaaaaaaa-1111-4222-8333-4444444444\(String(format: "%02d", $0))", title: "Review report \($0)", project: nil) } : [match])
                    if name == "lookup-copied" || name == "lookup-copy-failed" {
                        model.discovery.copiedID = match.id
                        model.taskIDCopyFeedback = name == "lookup-copied" ? "Copied" : "Couldn't copy. Try again."
                    }
                    let frames = DiscoveryFrames()
                    let width: CGFloat = compact ? 393 : 560
                    let height: CGFloat = compact ? 426 : 600
                    let view = DiscoveryView(model: model, compact: compact)
                        .onPreferenceChange(CompactLayoutKey.self) { value in MainActor.assumeIsolated { frames.frames = value } }
                        .environment(\.colorScheme, scheme).environment(\.controlActiveState, .key)
                        .tint(TodoColors.color("primary")).background(.background)
                    let controller = NSHostingController(rootView: view)
                    let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.titled], backing: .buffered, defer: false)
                    window.isReleasedWhenClosed = false
                    window.appearance = appearance
                    window.contentViewController = controller
                    let host = controller.view
                    host.frame = .init(x: 0, y: 0, width: width, height: height)
                    host.layoutSubtreeIfNeeded()
                    try await Task.sleep(for: .milliseconds(120))
                    host.layoutSubtreeIfNeeded()
                    let file = "discovery-\(compact ? "compact" : "full")-\(name)-\(scheme == .light ? "light" : "dark").png"
                    for key in dialog == .lookup ? ["discovery-close", "discovery-find", "discovery-prefix"] : ["discovery-close"] {
                        let frame = try #require(frames.frames[key])
                        #expect(frame.minX >= 0 && frame.maxX <= width && frame.minY >= 0 && frame.maxY <= height, "\(file) \(key) \(frame)")
                    }
                    geometry[file] = frames.frames.mapValues { [Double($0.minX), Double($0.minY), Double($0.width), Double($0.height)] }
                    let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                    host.cacheDisplay(in: host.bounds, to: bitmap)
                    try #require(bitmap.representation(using: .png, properties: [:])).write(to: directory.appendingPathComponent(file))
                    files.append(file)
                    window.close()
                }
            }
        }
        #expect(files.count == 64)
        try JSONSerialization.data(withJSONObject: ["files": files], options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("manifest.json"))
        try JSONSerialization.data(withJSONObject: geometry, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("discovery-layout.json"))
    }
}
