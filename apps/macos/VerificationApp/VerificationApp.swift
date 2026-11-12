import AppKit
import CoreServices
import SwiftUI
import TodoAPI

@_silgen_name("todo_verification_trap_ready")
private func credentialTrapReady()

@main
enum VerificationEntry {
    @MainActor static func main() {
        credentialTrapReady()
        do {
            try verificationRequire(CommandLine.arguments.contains("--check-manifest") || VerificationBuild.visibleAllowed, "Visible launches are held pending coordinator release.")
            try LaunchGuard.check(expectedContract: TodoContract.id, visible: !CommandLine.arguments.contains("--check-manifest"), expectedServerSHA256: VerificationBuild.serverSHA256, expectedCLISHA256: VerificationBuild.cliSHA256, expectedBoundarySHA256: VerificationBuild.boundarySHA256, expectedPreflightSHA256: VerificationBuild.preflightSHA256, beforeSandbox: OwnerIdle.acceptOwnedPreflight)
            if CommandLine.arguments.contains("--check-manifest") {
                print("manifest accepted; no window constructed")
                exit(0)
            }
            try OwnerIdle.requireIdle()
            try ScratchSandbox.install(LaunchGuard.accepted!)
            try VerificationDirectories.install()
            try VerificationDefaults.install()
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(78)
        }
        TodoVerificationApp.main()
    }
}

struct TodoVerificationApp: App {
    @State private var model: TodoModel
    @AppStorage("compactMode") private var compactMode = false
    @AppStorage("appearance") private var appearance = "System"
    @State private var activityMonitor: Timer?

    init() {
        let manifest = LaunchGuard.accepted!
        let factory = VerificationClientFactory(manifest: manifest)
        let configuration = ClientConfiguration(server: URL(string: manifest.serverURL)!, initialProfile: manifest.profile, vaultService: "local.todo.verification.memory")
        _model = State(initialValue: TodoModel(configuration: configuration, clientFactory: { server, credential in factory.client(server: server, credential: credential) }, clientDiagnostics: factory.recorder, sessionStorage: MemorySessionVault(manifest.session)))
    }

    var body: some Scene {
        Window("Todo Verification", id: "tasks") {
            RootView(model: model, compactMode: $compactMode)
                .task {
                    activityMonitor = OwnerIdle.monitor(interruptionRequest: URL(fileURLWithPath: LaunchGuard.accepted!.root).appendingPathComponent("interruption-control"), requireGlobal: true)
                    NSApp.activate(ignoringOtherApps: true)
                    let identity: [String: Any] = ["bundleIdentifier": Bundle.main.bundleIdentifier ?? "missing", "bundlePath": Bundle.main.bundlePath, "runningBundleIdentifier": NSRunningApplication.current.bundleIdentifier ?? "missing", "activationPolicy": NSApp.activationPolicy().rawValue, "windows": NSApp.windows.map { ["title": $0.title, "visible": $0.isVisible, "number": $0.windowNumber] as [String: Any] }]
                    if let receipt = try? JSONSerialization.data(withJSONObject: identity, options: [.sortedKeys]) { FileHandle.standardError.write(Data("app identity ".utf8) + receipt + Data("\n".utf8)) }
                    model.selectedView = "all"
                    await model.restore()
                }
        }.defaultSize(width: 1100, height: 760)
        .commands {
            CommandGroup(after: .newItem) {
                Button("New task") { model.quickAdd = true }.keyboardShortcut("n").disabled(!model.canWrite)
                Button("Quick add in menu bar", action: openMenuBarQuickAdd)
                    .keyboardShortcut("n", modifiers: [.command, .option]).disabled(!model.signedIn)
            }
            CommandGroup(after: .sidebar) {
                Toggle("Compact mode", isOn: $compactMode).keyboardShortcut("m", modifiers: [.command, .shift])
            }
        }
        Window("Diagnostics · Todo Verification", id: "diagnostics") {
            DiagnosticsView(model: model)
                .preferredColorScheme(model.configuration.resolvedColorScheme(storedAppearance: appearance))
        }.defaultSize(width: 1160, height: 840)
        .keyboardShortcut("d", modifiers: [.command, .shift])
        MenuBarExtra {
            Group {
                if model.signedIn { QuickAddView(model: model, floating: false) }
                else { Text("Sign in to Todo Verification to add tasks.").padding(24) }
            }.tint(TodoColors.color("primary"))
                .preferredColorScheme(model.configuration.resolvedColorScheme(storedAppearance: appearance))
        } label: {
            Text("Test").accessibilityLabel("Todo Verification quick add")
        }.menuBarExtraStyle(.window)
        Settings { SettingsView(model: model, compact: compactMode) }
    }

    private func openMenuBarQuickAdd() {
        guard let bar = NSApp.accessibilityExtrasMenuBar() as? any NSAccessibilityProtocol,
              let item = bar.accessibilityChildren()?.first as? any NSAccessibilityProtocol,
              item.accessibilityPerformPress() else { NSSound.beep(); return }
    }
}
