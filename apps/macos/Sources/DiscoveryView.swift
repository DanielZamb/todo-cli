import SwiftUI

struct DiscoveryActions: View {
    let model: TodoModel
    var body: some View {
        Button("Profiles and Projects", systemImage: "folder") { Task { await model.openDiscovery(.directory) } }
            .accessibilityIdentifier("discovery-directory")
        Button("Find Task by id", systemImage: "magnifyingglass") { Task { await model.openDiscovery(.lookup) } }
            .accessibilityIdentifier("discovery-lookup")
    }
}

struct DiscoveryView: View {
    @Bindable var model: TodoModel
    var compact = false
    @FocusState private var prefixFocused: Bool
    private var state: DiscoveryState { model.discovery }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(state.dialog == .directory ? "Profiles and Projects" : "Find Task by id").font(.headline)
            Text("Search Profiles available to this credential").font(.caption).foregroundStyle(.secondary)
            if state.dialog == .lookup {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Id starts with").font(.caption)
                    HStack {
                        TextField("Id starts with", text: Binding(get: { state.prefix }, set: { model.editDiscoveryPrefix($0) }), prompt: Text("Hex digits and hyphens"))
                            .textFieldStyle(.roundedBorder).focused($prefixFocused)
                            .accessibilityIdentifier("discovery-prefix").compactBounds("discovery-prefix")
                            .onSubmit { submit() }
                        Button("Find") { submit() }.buttonStyle(.borderedProminent)
                            .disabled(state.phase == .requesting || model.connection != .live)
                            .accessibilityIdentifier("discovery-find").compactBounds("discovery-find")
                    }
                }
            }
            if state.phase == .showing && state.dialog == .directory {
                directoryList
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) { content }
                        .frame(maxWidth: .infinity, alignment: .leading)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Divider()
            HStack {
                Spacer()
                Button("Close") { model.closeDiscovery() }.keyboardShortcut(.cancelAction)
                    .accessibilityIdentifier("discovery-close").compactBounds("discovery-close")
            }
        }.padding(16).frame(width: compact ? 393 : 560, height: compact ? 426 : 600)
            .onAppear { prefixFocused = true }
            .alert(DraftNavigationPrompt.title(hasConflict: model.conflict != nil), isPresented: Binding(get: { model.pendingNavigation != nil }, set: { if !$0 { model.cancelNavigation() } }), presenting: model.pendingNavigation) { target in
                DraftNavigationActions(model: model, target: target)
            } message: { _ in DraftNavigationMessage(hasConflict: model.conflict != nil) }
    }
    private func submit() { Task { await model.requestDiscovery() } }
    @ViewBuilder private var content: some View {
        switch state.phase {
        case .requesting:
            ProgressView(state.dialog == .directory ? "Loading Profiles and Projects…" : "Finding Tasks…")
        case .editing, .closed:
            Text("Enter the start of a Task id, then choose Find.").foregroundStyle(.secondary)
        case .invalid:
            Text(state.error ?? "Enter a valid id prefix.").foregroundStyle(TodoColors.color("destructive")).accessibilityIdentifier("discovery-error")
        case .offline:
            Text("Offline. Reconnect to search Profiles.").foregroundStyle(.secondary)
            if model.connection == .live { retry }
        case .error:
            VStack(alignment: .leading, spacing: 6) {
                let parts = (state.error ?? "Couldn't read discovery.").components(separatedBy: "\nerror ")
                Text(parts[0]).textSelection(.enabled)
                if parts.count > 1 { Text("error " + parts[1]).font(.caption).foregroundStyle(.secondary) }
            }.accessibilityIdentifier("discovery-error")
            retry
        case .empty:
            Text(state.dialog == .directory ? "No Profiles available." : "No Tasks found.").foregroundStyle(.secondary)
        case .showing:
            if state.dialog == .lookup {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(state.appliedSnapshot?.matches ?? []) { match in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(match.title).font(.headline).fixedSize(horizontal: false, vertical: true)
                            Text("Profile: \(match.profile.name)")
                            fullID(match.profile.id)
                            Text(match.project ?? "No Project").foregroundStyle(.secondary)
                            fullID(match.task_id)
                            Button(state.copiedID == match.id ? model.taskIDCopyFeedback ?? "Copy task id" : "Copy task id", systemImage: "doc.on.doc") {
                                model.copyTaskID(match.task_id)
                                state.copiedID = match.id
                            }.accessibilityIdentifier("discovery-copy-\(match.task_id)")
                            Button("Show in \(match.profile.name)") { Task { await model.showDiscoveryMatch(match) } }
                                .accessibilityIdentifier("discovery-show-\(match.task_id)")
                        }
                    }
                }.accessibilityIdentifier("discovery-results")
            }
        }
    }
    private var directoryList: some View {
        List {
            ForEach(state.appliedSnapshot?.profiles ?? []) { profile in
                Section {
                    if profile.projects.isEmpty {
                        Text("No Projects").foregroundStyle(.secondary).listRowSeparator(.hidden)
                    } else {
                        Text("Projects").font(.caption).foregroundStyle(.secondary).listRowSeparator(.hidden)
                        ForEach(profile.projects) { project in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(project.name).textSelection(.enabled)
                                if project.id != project.name { labeledID(project.id) }
                            }.padding(.leading, 12).listRowSeparator(.hidden)
                        }
                    }
                } header: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(profile.name).font(.body.weight(.semibold)).foregroundStyle(.primary).textSelection(.enabled)
                        if profile.id != profile.name { labeledID(profile.id) }
                    }
                }
            }
        }.listStyle(.inset).accessibilityIdentifier("discovery-directory-list")
    }
    private func labeledID(_ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("id").font(.caption).foregroundStyle(.secondary)
            fullID(value)
        }
    }
    private var retry: some View {
        Button("Retry") { Task { await model.requestDiscovery(retry: true) } }
            .disabled(model.connection != .live).accessibilityIdentifier("discovery-directory-retry")
    }
    private func fullID(_ value: String) -> some View {
        Text(value).font(.caption.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
    }
}
