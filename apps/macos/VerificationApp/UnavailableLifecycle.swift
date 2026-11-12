import SwiftUI

struct ServerIdentity: Codable, Equatable, Sendable {
    let build: String
    let contract: String
    @MainActor static var appBuild: String { LaunchGuard.accepted?.build ?? "verification" }
}
struct ManagedServerStatus: Sendable {
    let label = "Unavailable in Todo Verification"
    let loaded = false
    let installed = false
}
struct ServerSettingsView: View {
    let configuredServer: URL
    @Binding var status: ManagedServerStatus?
    var body: some View {
        Text("Managed server controls are unavailable in Todo Verification.")
    }
}
