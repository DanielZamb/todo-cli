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
        _model = State(initialValue: TodoModel(configuration: configuration))
    }

    var body: some Scene {
        Window("Todo", id: "tasks") {
            RootView(model: model, compactMode: $compactMode)
                .task { await model.restore() }
        }
        .defaultSize(width: 1100, height: 760)
        .commands {
            CommandGroup(after: .newItem) {
                Button("New task") { model.quickAdd = true }
                    .keyboardShortcut("n").disabled(!model.canWrite)
                Button("Quick add in menu bar", action: openMenuBarQuickAdd)
                    .keyboardShortcut("n", modifiers: [.command, .option]).disabled(!model.signedIn)
            }
            CommandGroup(after: .sidebar) {
                Toggle("Compact mode", isOn: $compactMode)
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
