import AppKit
import SwiftUI

struct SettingsView: View {
    enum Tab: String, CaseIterable {
        case general = "General"
        case server = "Server"
        case snapshots = "Snapshots"
        case notifications = "Notifications"
        case advanced = "Advanced"
        var symbol: String {
            switch self {
            case .general: "gearshape"
            case .server: "externaldrive.connected.to.line.below"
            case .snapshots: "clock.arrow.circlepath"
            case .notifications: "bell"
            case .advanced: "slider.horizontal.3"
            }
        }
    }
    @Bindable var model: TodoModel
    @State var selectedTab = Tab.general
    var compact = false
    @AppStorage("appearance") private var appearance = "System"
    var notifications: NotificationSettingsState?
    @State var serverStatus: ManagedServerStatus?
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView(selection: $selectedTab) {
            ForEach(Tab.allCases, id: \.self) { tab in
                page(tab).tabItem { Label(tab.rawValue, systemImage: tab.symbol) }.tag(tab)
            }
        }.frame(width: compact ? 393 : 600, height: compact ? 426 : 460)
            .preferredColorScheme(model.configuration.resolvedColorScheme(storedAppearance: appearance))
            .task(id: selectedTab) {
                if selectedTab == .notifications { await model.reminders.refreshAuthorization() }
                if selectedTab == .snapshots { await model.loadSnapshots() }
            }
            .sheet(isPresented: Binding(get: { model.profileDeletion != nil }, set: { if !$0 && !model.busy { model.profileDeletion = nil } })) { ProfileDeletionView(model: model).interactiveDismissDisabled(model.busy) }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active && selectedTab == .notifications { Task { await model.reminders.refreshAuthorization() } }
            }
            .sheet(isPresented: Binding(get: { model.snapshotRestore != nil }, set: { if !$0 { model.snapshotRestore = nil; model.snapshotRestoreTarget = nil } })) {
                SnapshotRestoreConfirmation(model: model)
            }
    }
    @ViewBuilder
    func page(_ tab: Tab) -> some View {
        if tab == .snapshots {
            GeometryReader { geometry in
                if geometry.size.width < 480 {
                    SnapshotSettingsSection(model: model, compact: true)
                } else {
                    Form { SnapshotSettingsSection(model: model) }.formStyle(.grouped).padding(12)
                }
            }.coordinateSpace(name: "snapshot-layout")
        } else {
        Form {
            switch tab {
            case .general:
                Section {
                    LabeledContent("Profile") {
                        Menu(model.profileName) {
                            Picker("Profile", selection: Binding(get: { model.profile }, set: { model.changeProfile($0) })) {
                                ForEach(model.profiles) { Text($0.name).tag($0.id) }
                            }.pickerStyle(.inline)
                            Divider()
                            Button("Delete \"\(model.profileName)\"…", role: .destructive) { model.beginProfileDeletion() }
                                .disabled(model.profiles.count < 2 || !model.canWrite || model.editor != nil)
                                .accessibilityIdentifier("delete-profile")
                        }.disabled(model.editor != nil || model.busy)
                    }
                    Picker("Appearance", selection: $appearance) {
                        ForEach(["System", "Light", "Dark"], id: \.self) { Text($0).tag($0) }
                    }
                }
                Section {
                    LabeledContent("Session", value: model.signedIn ? "Signed in" : "Signed out")
                    Button("Sign out") { Task { await model.signOut() } }.disabled(!model.signedIn || model.busy)
                }
            case .server:
                LabeledContent("Server", value: model.configuration.server.absoluteString).textSelection(.enabled)
                ServerSettingsView(configuredServer: model.configuration.server, status: $serverStatus)
            case .snapshots:
                SnapshotSettingsSection(model: model)
            case .notifications:
                let state = notificationState
                Section {
                    LabeledContent("Notifications", value: state.description)
                    HStack {
                        if state.access == .denied {
                            Button("Open System Settings…") {
                                openURL(URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")!)
                            }
                        } else if state.access != .allowed {
                            Button("Enable notifications") { Task { await model.reminders.authorize() } }
                                .disabled(state.access == .pending).accessibilityIdentifier("enable-notifications")
                        }
                        Button("Test notifications") {
                            Task {
                                await model.reminders.checkDelivery(
                                    server: model.configuration.server.absoluteString, profile: model.profile)
                            }
                        }.accessibilityIdentifier("check-notifications")
                    }
                    TimelineView(.periodic(from: .now, by: 60)) { context in
                        Text(state.lastTest?.description(now: context.date) ?? "Not tested yet")
                            .font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("notification-receipt")
                    }
                    Text("Test checks for reminders delivered by this server and Profile.").font(.caption).foregroundStyle(.secondary)
                }
            case .advanced:
                Section {
                    DisclosureGroup("Diagnostics") {
                        LabeledContent("Live sequence", value: model.lastSequence ?? "None")
                        LabeledContent("Resume cursor", value: model.resumeSequence ?? "None")
                        LabeledContent("Reconnects", value: String(model.reconnectCount))
                        LabeledContent("LaunchAgent", value: serverStatus?.label ?? "Not read yet")
                        LabeledContent("launchd", value: serverStatus.map { $0.loaded ? "Loaded" : "Not loaded" } ?? "Not read yet")
                        LabeledContent("Notification receipt", value: notificationState.receipt)
                    }
                }
            }
        }.formStyle(.grouped).padding(12)
        }
    }
    private var notificationState: NotificationSettingsState {
        notifications
            ?? NotificationSettingsState(
                authorization: model.reminders.authorization, lastTest: model.reminders.lastTest, receipt: model.reminders.lastReceipt)
    }
}

struct SnapshotSettingsSection: View {
    @Bindable var model: TodoModel
    var compact = false
    var body: some View {
        if compact {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Snapshots").font(.headline)
                        Text("A point-in-time copy of every Profile.").font(.caption).foregroundStyle(.secondary)
                    }
                    createButton
                }
                status
                if !model.ownerSnapshots.isEmpty {
                    let visible = min(3, model.ownerSnapshots.count)
                    ScrollView {
                        VStack(spacing: 12) { ForEach(model.ownerSnapshots) { row($0) } }.scrollTargetLayout()
                    }.scrollTargetBehavior(.viewAligned)
                        .frame(height: CGFloat(visible * 76 + (visible - 1) * 12))
                        .snapshotBounds("viewport")
                }
                Text("Purged content stays erased.").font(.caption).foregroundStyle(.secondary)
            }.padding(12).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("A point-in-time copy of every Profile.").foregroundStyle(.secondary)
                    createButton
                }
            } header: { Text("Snapshots") }
            status
            ForEach(model.ownerSnapshots) { snapshot in Section { row(snapshot) } }
            Section { Text("Purged content stays erased. Todo saves your current state before a restore.").font(.caption).foregroundStyle(.secondary) }
        }
    }
    private var createButton: some View {
        Button("Create Snapshot") { Task { await model.createSnapshot() } }
            .frame(minHeight: 28).disabled(!model.canWrite).accessibilityIdentifier("create-snapshot")
    }
    @ViewBuilder private var status: some View {
        if let error = model.snapshotError {
            VStack(alignment: .leading, spacing: 4) {
                Text(error).foregroundStyle(.red).accessibilityIdentifier("snapshot-error")
                Button("Retry") { Task { await model.loadSnapshots() } }.frame(minHeight: 28)
            }
        }
        if !model.snapshotsLoaded && model.snapshotError == nil { ProgressView("Loading Snapshots…") }
        if model.snapshotsLoaded && model.ownerSnapshots.isEmpty {
            ContentUnavailableView("No Snapshots yet", systemImage: "clock.arrow.circlepath", description: Text("Create one before making changes you may want to restore."))
                .accessibilityIdentifier("snapshots-empty")
        }
    }
    private func row(_ snapshot: OwnerSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(snapshot.timeDescription).fontWeight(.medium).lineLimit(1).minimumScaleFactor(0.85)
                Spacer(minLength: 4)
                Button("Restore…") { Task { await model.previewSnapshotRestore(snapshot) } }
                    .frame(minHeight: 28).disabled(!model.canWrite).accessibilityIdentifier("restore-snapshot-\(snapshot.id)")
                    .snapshotBounds("restore-\(snapshot.id)")
                Button { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: snapshot.path)]) } label: {
                    Image(systemName: "folder").frame(width: 28, height: 28).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(.secondary)
                    .accessibilityLabel("Reveal in Finder").help("Reveal in Finder")
                    .snapshotBounds("finder-\(snapshot.id)")
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("\(SnapshotPresentation.reason(snapshot.reason)) · \(snapshot.sizeDescription)").lineLimit(1)
                    .help(SnapshotPresentation.reason(snapshot.reason)).snapshotBounds("text-reason-\(snapshot.id)")
                ViewThatFits(in: .horizontal) {
                    Text(counts(snapshot.task_counts))
                    Text(counts(Array(snapshot.task_counts.prefix(1))) + " · +\(snapshot.task_counts.count - 1)")
                }.lineLimit(1).snapshotBounds("text-counts-\(snapshot.id)")
            }.font(.caption).foregroundStyle(.secondary)
        }.padding(.horizontal, compact ? 8 : 0).padding(.vertical, compact ? 8 : 0)
            .frame(height: compact ? 76 : nil, alignment: .leading)
            .background { if compact { RoundedRectangle(cornerRadius: 8).fill(TodoColors.color("card")) } }
            .snapshotBounds("row-\(snapshot.id)")
    }
    private func counts(_ values: [SnapshotTaskCount]) -> String {
        values.map { "\(SnapshotPresentation.profileName($0.name)): \(SnapshotPresentation.tasks($0.count))" }.joined(separator: " · ")
    }
}

struct SnapshotBoundsKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, new in new }) }
}
extension View {
    func snapshotBounds(_ id: String) -> some View {
        background { GeometryReader { geometry in Color.clear.preference(key: SnapshotBoundsKey.self, value: [id: geometry.frame(in: .named("snapshot-layout"))]) } }
    }
}

struct SnapshotRestoreConfirmation: View {
    @Bindable var model: TodoModel
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Restore Snapshot?", systemImage: "clock.arrow.circlepath").font(.title2)
            Text("Return every Profile to \(model.snapshotRestoreTarget?.timeDescription ?? "the selected time"). Changes made after that time will be lost. Todo will save your current state first.")
            ForEach(model.snapshotRestore?.task_counts ?? [], id: \.profile) { row in
                LabeledContent(SnapshotPresentation.profileName(row.name), value: "\(SnapshotPresentation.tasks(row.before)) now, \(row.after) after restore")
            }
            if let error = model.snapshotError { Text(error).foregroundStyle(.red) }
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { model.snapshotRestore = nil; model.snapshotRestoreTarget = nil }.keyboardShortcut(.cancelAction).disabled(model.busy)
                Button("Restore Snapshot", role: .destructive) { Task { await model.confirmSnapshotRestore() } }
                    .buttonStyle(.borderedProminent).tint(TodoColors.color("destructive"))
                    .disabled(!model.canWrite).accessibilityIdentifier("confirm-snapshot-restore")
            }
        }.padding(24).frame(idealWidth: 480).accessibilityIdentifier("snapshot-restore-confirmation")
    }
}

struct ProfileDeletionPrompt {
    let name: String
    var count: Int
    var deleteTasks = false
    var title: String {
        guard deleteTasks else { return "Delete \"\(name)\"?" }
        return "Delete \"\(name)\" and its \(count == 1 ? "Task" : TaskCount.text(count, capitalized: true))?"
    }
    var actionTitle: String { deleteTasks ? (count == 1 ? "Delete Profile and Task" : "Delete Profile and Tasks") : "Delete Profile" }
    var refusal: String { "\"\(name)\" has \(TaskCount.text(count, capitalized: true)). Delete \(count == 1 ? "it" : "them") too, or move \(count == 1 ? "it" : "them") to another Profile first." }
    var message: String {
        if count > 0 && !deleteTasks { return refusal }
        return "Todo saves a Snapshot first, so you can undo this in Settings › Snapshots. You'll switch to another Profile."
    }

}

struct ProfileDeletionView: View {
    @Bindable var model: TodoModel
    var body: some View {
        if let prompt = model.profileDeletion {
            VStack(alignment: .leading, spacing: 16) {
                Label(prompt.title, systemImage: "trash").font(.headline)
                Text(model.profileDeletionError ?? prompt.message)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(model.profileDeletionError == nil ? Color.primary : Color.red)
                    .accessibilityIdentifier(model.profileDeletionError == nil ? "profile-deletion-message" : "profile-deletion-error")
                HStack {
                    Spacer()
                    Button("Cancel", role: .cancel) { model.profileDeletion = nil }.disabled(model.busy)
                    if prompt.count > 0 && !prompt.deleteTasks {
                        Button("Delete Tasks too…") { model.profileDeletion?.deleteTasks = true; model.profileDeletionError = nil }
                            .accessibilityIdentifier("profile-delete-tasks-step")
                    } else {
                        Button(prompt.actionTitle, role: .destructive) { Task { await model.deleteProfile() } }
                            .buttonStyle(.borderedProminent).tint(.red)
                            .disabled(model.busy).accessibilityIdentifier("confirm-delete-profile")
                    }
                }
            }.padding(24).frame(maxWidth: 480).accessibilityIdentifier("profile-deletion-confirmation")
        }
    }
}
