import SwiftUI
import AppKit

@main
struct TodoApp: App {
    @State private var model: TodoModel
    @AppStorage("appearance") private var appearance = "System"
    @AppStorage("compactMode") private var compactMode = false

    init() {
        let configuration = ClientConfiguration.load()
        configureVerificationKeychain()
        let model = TodoModel(configuration: configuration, clientDiagnostics: .init())
        // The person-input observer (MAC-C1-S1-32) is installed with the model, before any window or
        // owner diagnostics can start, so Diagnostics input never depends on which window opened first.
        model.personInput.install()
        _model = State(initialValue: model)
    }

    var body: some Scene {
        Window("Todo", id: "tasks") {
            RootView(model: model, compactMode: $compactMode)
                .task { await model.restore() }
        }
        .defaultSize(width: 1100, height: 760)
        // The window's limits come from the content: Compact is 393 pt wide (its maximum width
        // equals its minimum) and at least 426 pt tall with no maximum height (O34).
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(after: .newItem) {
                Button("New task") { model.notePersonActed(); model.quickAdd = true }
                    .keyboardShortcut("n").disabled(!model.canWrite)
                Button("Quick add in menu bar") { model.notePersonActed(); openMenuBarQuickAdd() }
                    .keyboardShortcut("n", modifiers: [.command, .option]).disabled(!model.signedIn)
            }
            CommandGroup(after: .sidebar) {
                Toggle("Compact mode", isOn: Binding(get: { compactMode }, set: { model.notePersonActed(); compactMode = $0 }))
                    .keyboardShortcut("m", modifiers: [.command, .shift])
            }
        }
        Window("Diagnostics", id: "diagnostics") {
            DiagnosticsView(model: model)
                .preferredColorScheme(model.configuration.resolvedColorScheme(storedAppearance: appearance))
        }.defaultSize(width: 1160, height: 840)
        .keyboardShortcut("d", modifiers: [.command, .shift])
        MenuBarExtra {
            Group {
                if model.signedIn {
                    QuickAddView(model: model, floating: false)
                } else {
                    Text("Sign in to Todo to add tasks.").padding(24)
                }
            }
            .tint(TodoColors.color("primary"))
            .preferredColorScheme(model.configuration.resolvedColorScheme(storedAppearance: appearance))
        } label: {
            Image(systemName: "checkmark.circle").accessibilityLabel("Todo quick add")
        }.menuBarExtraStyle(.window)
        Settings { SettingsView(model: model, compact: compactMode) }
    }

    private func openMenuBarQuickAdd() {
        guard let bar = NSApp.accessibilityExtrasMenuBar() as? any NSAccessibilityProtocol,
              let item = bar.accessibilityChildren()?.first as? any NSAccessibilityProtocol,
              item.accessibilityPerformPress() else { NSSound.beep(); return }
    }
}
