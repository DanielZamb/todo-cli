import SwiftUI

struct ServerSettingsView: View {
    let configuredServer: URL
    private var lifecycle: ServerLifecycle { .production() }
    @Binding var status: ManagedServerStatus?
    @State private var error: String?
    @State private var busy = false
    @State private var database = ""
    @State private var port = "4310"
    @State private var confirmUninstall = false

    var body: some View {
        Section("Managed local server") {
            LabeledContent("Status", value: status?.displayStatus ?? "Status unavailable")
            LabeledContent("Installed server build", value: status?.installedIdentity?.build ?? "Not installed / unknown")
            LabeledContent("Bundled server build", value: status?.bundledIdentity?.build ?? "Unknown")
            if let configuration = status?.configuration {
                LabeledContent("Database", value: configuration.database).textSelection(.enabled)
                LabeledContent("Executable", value: configuration.executable).textSelection(.enabled)
                LabeledContent("Managed address", value: configuration.endpoint?.absoluteString ?? "Dynamic port · see server log")
                if configuration.endpoint != configuredServer {
                    Text("The app connects to \(configuredServer.absoluteString). Its configured address is preserved. To use this managed server, relaunch with --server and the managed address.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            } else if status != nil {
                TextField("Absolute database path", text: $database)
                    .accessibilityIdentifier("server-database")
                TextField("Loopback port", text: $port)
                    .accessibilityIdentifier("server-port")
                Text("Choose the database explicitly. Install starts the bundled server at this loopback port and keeps it running after the app closes.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let error { Text(error).foregroundStyle(TodoColors.color("destructive")).textSelection(.enabled) }
            HStack {
                Button("Refresh status") { run { try await lifecycle.status() } }
                if status?.installed == true {
                    if status?.needsUpdate == true {
                        Button("Update server") { run { try await lifecycle.update() } }
                            .accessibilityIdentifier("server-update")
                    }
                    Button("Repair / restart") { run { try await lifecycle.repair() } }
                        .accessibilityIdentifier("server-repair")
                        .help("Repair the LaunchAgent using its saved configuration and restart the server.")
                } else {
                    Button("Install server") {
                        let selectedDatabase = database
                        let selectedPort = Int(port) ?? -1
                        run { try await lifecycle.install(database: selectedDatabase, port: selectedPort) }
                    }.disabled(status == nil || status?.loaded == true || database.isEmpty)
                        .accessibilityIdentifier("server-install")
                }
                Button("Uninstall…", role: .destructive) { confirmUninstall = true }
                    .disabled(status == nil || (status?.installed == false && status?.loaded == false))
                    .accessibilityIdentifier("server-uninstall")
            }.disabled(busy)
            if busy { ProgressView("Reading server lifecycle…") }
            Text("Uninstall stops the LaunchAgent and removes its plist. The database and server logs remain. No installation runs automatically.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .task {
            guard status == nil else { return }
            port = String(configuredServer.port ?? 4310); run { try await lifecycle.status() }
        }
        .confirmationDialog("Stop and uninstall the managed server?", isPresented: $confirmUninstall) {
            Button("Uninstall server", role: .destructive) { run { try await lifecycle.uninstall() } }
        }
    }

    private func run(_ operation: @escaping @Sendable () async throws -> ManagedServerStatus) {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do { status = try await operation() }
            catch { self.error = error.localizedDescription; status = nil }
        }
    }
}
