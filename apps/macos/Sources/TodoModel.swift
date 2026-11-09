import AppKit
import Foundation
import Observation
import OpenAPIRuntime
import TodoAPI

@MainActor
@Observable
final class TodoModel {
    enum Connection { case connecting, live, offline }
    let configuration: ClientConfiguration
    @ObservationIgnored private var initializedReminders: Reminders?
    var reminders: Reminders {
        if let initializedReminders { return initializedReminders }
        let value = Reminders()
        value.resetGeneration(restoreGeneration)
        initializedReminders = value
        return value
    }
    var profile: String
    var tasks: [TaskSnapshot] = []
    var profiles: [DiscoveryEntry] = []
    var profileDeletion: ProfileDeletionPrompt?
    var profileDeletionError: String?
    var projects: [DiscoveryEntry] = []
    var tags: [DiscoveryEntry] = []
    var planning: PlanningResult?
    var viewCounts: [String: Int] = [:]
    var profileName: String { profiles.first { $0.id == profile }?.name ?? "Profile" }
    var writeIntent: TaskWriteIntent?
    var batchEdit: BatchEditDraft?
    var attachmentBatch: AttachmentBatchDraft?
    var showingImport = false
    var importDocument: ImportDocument?
    var importReport: ImportSummary?
    var importError: String?
    var importCloseMissing = false

    var transferRequest: TaskTransferRequest?
    var transferResult: TaskTransferResult?
    var showingSeries = false
    var series: SeriesDefinition?
    var recurrenceDraft: Recurrence?
    var seriesLoading = false
    private var seriesGeneration = 0
    var selectedView = "today"
    var selectedProject: String? { didSet { if oldValue != selectedProject, appliedSearchSnapshot != nil || loading || searchPending { scheduleSearch() } } }
    var selectedTag: String? { didSet { if oldValue != selectedTag, appliedSearchSnapshot != nil || loading || searchPending { scheduleSearch() } } }
    var taskFilters = TaskListFilters()
    private(set) var requestedTaskFilters = TaskListFilters()
    var searchText = ""
    var searchPhase = TaskSearchPhase.idle
    var appliedSearchSnapshot: TaskSearchSnapshot?
    var searchError: String?
    @ObservationIgnored private var searchDebounce: Task<Void, Never>?
    var requestedIdentity: TaskSearchIdentity {
        .init(profile: profile, view: selectedView, filters: requestedTaskFilters, text: searchText, project: selectedProject, tag: selectedTag)
    }
    var searchStale: Bool { appliedSearchSnapshot?.appliedIdentity != requestedIdentity }
    var searchPending: Bool { searchPhase == .debouncing || searchPhase == .requesting }
    var searchActive: Bool { !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    var taskIDCopyFeedback: String?
    @ObservationIgnored private var copyFeedbackTask: Task<Void, Never>?
    var matchingTaskIDs: Set<String>?
    var parsedTask: ParsedTask?
    var parsedInput = ""
    var removedQuickAddFields: Set<String> = []
    var parseError: String?
    var history: [HistoryEntry] = []
    var diagnostics: DiagnosticsSnapshot?
    var diagnosticsError: String?
    var diagnosticsLoading = false
    var diagnosticsLive = true
    var diagnosticsRetrySeconds = 1
    var historyError: String?
    var showingHistory = false
    private var importGeneration = 0
    private var parseGeneration = 0
    private var historyGeneration = 0
    var lookupErrors: [ClientErrorPosition: ServerFailure] = [:]
    let discovery = DiscoveryState()
    var signedIn = false { didSet { if !signedIn { discovery.credentialChanged() } } }
    var canRestore = false
    var busy = false
    var loading = false
    var connection = Connection.connecting { didSet { if connection == .offline { discoveryWentOffline() } } }
    var outdatedServerBuild: String?
    var message: String?
    var taskLoadError: String?
    var quickAdd = false
    var newTitle = ""
    var quickAddError: String?
    enum EditorNavigation {
        case edit(TaskSnapshot)
        case move(TaskSnapshot, to: String)
        case copy(TaskSnapshot, to: String)
        case profile(String)
        case openTransfer(TaskTransferResult)
        case showDiscovery(DiscoveryShowIntent)
    }
    var pendingNavigation: EditorNavigation?
    var deletionNotice: String?
    var focusEditorTitle = false
    var editor: TaskDraft?
    var editorError: String?
    var conflict: TaskConflict?
    var reconnectCount = 0
    var lastSequence: String?
    var resumeSequence: String?
    var ownerSnapshots: [OwnerSnapshot] = []
    var snapshotsLoaded = false
    var snapshotError: String?
    var snapshotRestore: SnapshotRestorePreview?
    var snapshotRestoreTarget: OwnerSnapshot?
    var restoreGeneration = "initial"
    var restoreReloadCount = 0
    private var credential = ""
    func replaceCredential(_ value: String) {
        discovery.credentialChanged()
        disconnect()
        importGeneration += 1
        parseGeneration += 1
        historyGeneration += 1
        seriesGeneration += 1
        lookupErrors = [:]
        credential = value
    }
    private var streamTask: Task<Void, Never>?
    private var restored = false
    private var generation = 0
    private var refreshGeneration = 0
    private var vault: SessionVault { SessionVault(service: configuration.vaultService, account: configuration.server.absoluteString) }
    private let clientFactory: (URL, String) -> Client
    var client: Client { clientFactory(configuration.server, credential) }
    private var cursorKey: String { "cursor.\(configuration.vaultService).\(configuration.server.absoluteString).\(profile)" }
    private var restoreCursorKey: String { "restore-cursor.\(configuration.server.absoluteString)" }
    var canWrite: Bool { signedIn && connection == .live && !busy && outdatedServerBuild == nil }

    init(configuration: ClientConfiguration, clientFactory: @escaping (URL, String) -> Client = todoClient) {
        self.configuration = configuration
        self.clientFactory = clientFactory
        profile = configuration.initialProfile
        if UserDefaults.standard.string(forKey: restoreCursorKey) != nil {
            restoreGeneration = UserDefaults.standard.string(forKey: "restore-generation.\(configuration.server.absoluteString)") ?? "initial"
        }
    }

    func resetImport() {
        batchEdit = nil
        attachmentBatch = nil
        importGeneration += 1
        importDocument = nil
        importReport = nil
        importError = nil
        importCloseMissing = false
    }

    func loadImport(data: Data, name: String) {
        resetImport()
        do { importDocument = try ImportDocument(data: data, name: name) }
        catch { importError = "Cannot read this file. Choose a JSON array or NDJSON file." }
    }

    func previewImport() async { await runImport(dryRun: true) }
    func applyImport() async { await runImport(dryRun: false) }

    private func runImport(dryRun: Bool) async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite, let document = importDocument else { return }
        if !dryRun && importReport?.dry_run != true { return }
        let requestedProfile = profile
        let requestedGeneration = importGeneration
        busy = true
        importError = nil
        defer { busy = false }
        do {
            let items: [OpenAPIValueContainer]
            var cancellations: Operations.tasks_period_importTasks.Input.Body.jsonPayload.close_missing_candidatesPayload?
            if dryRun { items = document.items }
            else {
                guard let preview = importReport else { return }
                items = try document.pinned(to: preview)
                if importCloseMissing { cancellations = document.cancellations(from: preview) }
            }
            let response = try await client.tasks_period_importTasks(path: .init(profile: requestedProfile), body: .json(.init(file_name: document.name, items: try JSONDecoder().decode(OpenAPIArrayContainer.self, from: JSONEncoder().encode(items)), dry_run: dryRun, close_missing: importCloseMissing, close_missing_candidates: cancellations)))
            let report = try decode(ImportSummary.self, response.ok.body.json)
            guard profile == requestedProfile, importGeneration == requestedGeneration else { return }
            importReport = report
            if !dryRun { await refreshAfterWrite("Import applied") }
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            guard profile == requestedProfile, importGeneration == requestedGeneration else { return }
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            importError = describe(error, at: .importTasks)
        }
    }

    func restore() async {
        var credentialEpoch = discovery.credentialEpoch
        guard !restored, !busy, !signedIn else { return }
        busy = true
        canRestore = false
        defer { busy = false }
        restored = true
        do {
            guard try await checkServerContract() else { return }
            if let value = try vault.load() {
                replaceCredential(value)
                credentialEpoch = discovery.credentialEpoch
                try await discoverProfiles()
                guard isCurrentCredential(credentialEpoch) else { return }
                signedIn = true
                connect()
            }
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            if failure(error)?.status == 401 { expireSession(credentialEpoch: credentialEpoch) }
            else if error is VaultError { message = describe(error) }
            else {
                restored = false
                canRestore = true
                message = describe(error)
            }
        }
    }

    func signIn(_ passphrase: String) async -> Bool {
        var credentialEpoch = discovery.credentialEpoch
        guard !busy else { return false }
        busy = true
        defer { busy = false }
        do {
            guard try await checkServerContract() else { return false }
            let response = try await client.signIn_period_signIn(body: .json(.init(passphrase: passphrase)))
            let session = try response.ok.body.json
            guard try await checkServerContract(), isCurrentCredential(credentialEpoch) else { return false }
            try vault.save(session.credential)
            replaceCredential(session.credential)
            credentialEpoch = discovery.credentialEpoch
            message = nil
            try await discoverProfiles()
            guard isCurrentCredential(credentialEpoch) else { return false }
            signedIn = true
            restored = true
            canRestore = false
            connect()
            return true
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return false }
            message = describe(error)
            return false
        }
    }

    func signOut() async {
        guard !busy else { return }
        discovery.credentialChanged()
        disconnect()
        let credentialEpoch = discovery.credentialEpoch
        busy = true
        defer { busy = false }
        do {
            _ = try await client.credentials_period_signOut()
            guard isCurrentCredential(credentialEpoch) else { return }
            try vault.delete()
            disconnect()
            replaceCredential("")
            signedIn = false
            diagnostics = nil
            tasks = []
            appliedSearchSnapshot = nil
            searchError = nil
            searchPhase = .idle
            editor = nil
            quickAdd = false
            newTitle = ""
            message = nil
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            message = describe(error)
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            if signedIn { connect() }
        }
    }

    func beginProfileDeletion() {
        guard profiles.count > 1, canWrite, editor == nil else { return }
        profileDeletionError = nil
        profileDeletion = ProfileDeletionPrompt(name: profileName, count: profiles.first { $0.id == profile }?.visible_task_count ?? tasks.count)
    }

    func deleteProfile() async {
        let credentialEpoch = discovery.credentialEpoch
        guard let prompt = profileDeletion, canWrite, editor == nil else { return }
        let deleted = profile
        let run = generation
        busy = true
        defer { busy = false }
        do {
            let response = try await client.reads_period_deleteProfile(path: .init(profile: deleted), body: .json(.init(with_tasks: prompt.deleteTasks, dry_run: false)))
            _ = try response.ok.body.json
            guard profile == deleted, generation == run, !Task.isCancelled else { return }
            profileDeletion = nil
            try await leaveDeletedProfile(named: prompt.name)
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            guard profile == deleted, generation == run, !Task.isCancelled else { return }
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            if let values = try? await client.reads_period_profiles().ok.body.json,
               let latest = try? decode([DiscoveryEntry].self, values) {
                guard profile == deleted, generation == run, !Task.isCancelled else { return }
                profiles = latest
                if let count = latest.first(where: { $0.id == deleted })?.visible_task_count { profileDeletion?.count = count }
            }
            guard profile == deleted, generation == run, !Task.isCancelled else { return }
            profileDeletionError = failure(error)?.code == "profile_not_empty" ? profileDeletion?.refusal : describe(error)
        }
    }

    func leaveDeletedProfile(named name: String? = nil) async throws {
        let deleted = profile
        let run = generation
        let deletedName = name ?? profiles.first { $0.id == deleted }?.name ?? deleted
        let values = try await client.reads_period_profiles().ok.body.json
        let latest = try decode([DiscoveryEntry].self, values)
        guard profile == deleted, generation == run, !Task.isCancelled else { return }
        profiles = latest
        guard !latest.contains(where: { $0.id == deleted }), let next = latest.first else { return }
        editor = nil
        conflict = nil
        history = []
        activateProfile(next.id)
        message = nil
        deletionNotice = "\"\(deletedName)\" was deleted. Switched to \(next.name)."
    }

    func changeProfile(_ value: String) {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, editor == nil, !busy else { return }
        transferResult = nil
        activateProfile(value)
    }

    func activateProfile(_ value: String) {
        profileDeletion = nil
        profileDeletionError = nil
        disconnect()
        profile = value
        resetImport()
        showingImport = false
        UserDefaults.standard.set(value, forKey: "profile")
        tasks = []
        appliedSearchSnapshot = nil
        searchError = nil
        searchPhase = .idle
        taskLoadError = nil
        planning = nil
        viewCounts = [:]
        projects = []
        tags = []
        selectedProject = nil
        selectedTag = nil
        taskFilters = .init()
        requestedTaskFilters = .init()
        matchingTaskIDs = nil
        parsedTask = nil
        parseGeneration += 1
        if signedIn { connect() }
    }

    func connect() {
        disconnect()
        guard signedIn else { return }
        connection = .connecting
        loading = true
        lastSequence = UserDefaults.standard.string(forKey: cursorKey) ?? UserDefaults.standard.string(forKey: restoreCursorKey)
        let run = generation
        streamTask = Task { await followChanges(generation: run) }
    }

    private func disconnect() {
        generation += 1
        streamTask?.cancel()
        streamTask = nil
        invalidateSearch()
    }

    private func refresh(generation run: Int) async -> TaskSearchRefreshOutcome {
        let credentialEpoch = discovery.credentialEpoch
        guard outdatedServerBuild == nil, generation == run, !Task.isCancelled else { return .superseded }
        searchDebounce?.cancel()
        refreshGeneration += 1
        let request = refreshGeneration
        let identity = requestedIdentity
        searchPhase = .requesting
        do {
            let values = try await client.tasks_period_list(path: .init(profile: identity.profile)).ok.body.json
            let decoded = try values.map(TaskSnapshot.decode)
            var query = identity.filters.query
            query.text = identity.text.isEmpty ? nil : identity.text
            let filteredResponse: [TaskSnapshot]
            if identity.filters.isEmpty && identity.text.isEmpty && identity.project == nil && identity.tag == nil {
                filteredResponse = decoded
            } else {
                filteredResponse = try await client.tasks_period_list(path: .init(profile: identity.profile), query: query).ok.body.json.map(TaskSnapshot.decode)
            }
            let filtered = filteredResponse.filter {
                (identity.project == nil || $0.project_id == identity.project) && (identity.tag == nil || $0.tags.contains(identity.tag ?? ""))
            }
            let profileValues = try await client.reads_period_profiles().ok.body.json
            let projectValues = try await client.reads_period_projects(path: .init(profile: identity.profile)).ok.body.json
            let tagValues = try await client.reads_period_tags(path: .init(profile: identity.profile)).ok.body.json
            let decodedProfiles = try decode([DiscoveryEntry].self, profileValues)
            let decodedProjects = try decode([DiscoveryEntry].self, projectValues)
            let decodedTags = try decode([DiscoveryEntry].self, tagValues)
            let today = try await decode(PlanningResult.self, client.reads_period_view(path: .init(profile: identity.profile, view: .today)).ok.body.json)
            let overdue = try await decode(PlanningResult.self, client.reads_period_view(path: .init(profile: identity.profile, view: .overdue)).ok.body.json)
            let scheduled = try await decode(PlanningResult.self, client.reads_period_view(path: .init(profile: identity.profile, view: .scheduled)).ok.body.json)
            let inbox = try await decode(PlanningResult.self, client.reads_period_view(path: .init(profile: identity.profile, view: .inbox)).ok.body.json)
            let views = ["today": today, "overdue": overdue, "scheduled": scheduled, "inbox": inbox]
            guard canPublishSearch(run: run, request: request, identity: identity) else { return .superseded }
            let byID = Dictionary(uniqueKeysWithValues: filtered.map { ($0.id, $0) })
            let groups = views[identity.view]?.groups.compactMap { group -> PlanningResult.Group? in
                let rows = group.tasks.compactMap { byID[$0.id] }
                return rows.isEmpty ? nil : .init(name: group.name, tasks: rows)
            } ?? []
            appliedSearchSnapshot = .init(appliedIdentity: identity, rows: identity.view == "all" ? filtered : groups.flatMap(\.tasks), groups: groups)
            tasks = decoded
            matchingTaskIDs = identity.filters.isEmpty ? nil : Set(filtered.map(\.id))
            taskFilters = identity.filters
            profiles = decodedProfiles
            projects = decodedProjects.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            tags = decodedTags.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            planning = views[identity.view]
            viewCounts = views.mapValues { $0.groups.flatMap(\.tasks).filter { $0.status == "open" }.count }
            viewCounts["all"] = decoded.filter { $0.status == "open" }.count
            loading = false
            taskLoadError = nil
            searchError = nil
            searchPhase = .showing
            return .applied
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return .superseded }
            guard canPublishSearch(run: run, request: request, identity: identity) else { return .superseded }
            if taskFilters != identity.filters {
                requestedTaskFilters = taskFilters
                taskLoadError = "Could not apply filters. Your previous filters are still active."
            } else if !identity.text.isEmpty || appliedSearchSnapshot?.appliedIdentity.text.isEmpty == false {
                let applied = appliedSearchSnapshot?.appliedIdentity.text ?? ""
                searchError = applied.isEmpty ? "Couldn't search. Showing tasks without search." : "Couldn't search. Showing results for \"\(applied)\"."
            } else {
                taskLoadError = describe(error, at: .taskLoad)
            }
            loading = false
            searchPhase = .error
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            return .failed
        }
    }

    private func canPublishSearch(run: Int, request: Int, identity: TaskSearchIdentity) -> Bool {
        generation == run && refreshGeneration == request && requestedIdentity == identity && !Task.isCancelled
    }

    private func invalidateSearch() {
        refreshGeneration += 1
        searchDebounce?.cancel()
        searchDebounce = nil
    }

    func setSearchText(_ text: String) {
        guard searchText != text else { return }
        searchText = text
        scheduleSearch()
    }

    private func scheduleSearch() {
        invalidateSearch()
        searchPhase = .debouncing
        taskLoadError = nil
        searchError = nil
        let run = generation
        let identity = requestedIdentity
        searchDebounce = Task {
            do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
            guard generation == run, requestedIdentity == identity, !Task.isCancelled else { return }
            searchDebounce = nil
            _ = await retrySearch()
        }
    }

    @discardableResult
    func retrySearch() async -> TaskSearchRefreshOutcome {
        await refresh(generation: generation)
    }

    func copyTaskID(_ id: String, pasteboard: NSPasteboard = .general) {
        copyFeedbackTask?.cancel()
        pasteboard.clearContents()
        let copied = pasteboard.setString(id, forType: .string)
        taskIDCopyFeedback = copied ? "Copied" : "Couldn't copy. Try again."
        guard copied else { return }
        copyFeedbackTask = Task {
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
            taskIDCopyFeedback = nil
        }
    }

    private func followChanges(generation run: Int) async {
        let credentialEpoch = discovery.credentialEpoch
        var attempt = 0
        while !Task.isCancelled && generation == run {
            do {
                guard try await checkServerContract(), generation == run, !Task.isCancelled else { loading = false; return }
                let response = try await client.changes_period_stream(path: .init(profile: profile), headers: .init(last_hyphen_event_hyphen_id: lastSequence, x_hyphen_todo_hyphen_client: .swiftui, x_hyphen_todo_hyphen_generation: restoreGeneration))
                guard generation == run, !Task.isCancelled else { return }
                resumeSequence = lastSequence
                let body = try response.ok.body.text_event_hyphen_stream
                var parser = EventStreamDecoder()
                for try await chunk in body {
                    for event in try parser.append(chunk) {
                        guard generation == run, !Task.isCancelled else { return }
                        if event.name == "ready" {
                            _ = await refresh(generation: run)
                            guard generation == run, !Task.isCancelled else { return }
                            connection = .live
                            message = nil
                            attempt = 0
                        } else if event.name == "reload" {
                            let reload = try JSONDecoder().decode(SnapshotReload.self, from: Data(event.data.utf8))
                            UserDefaults.standard.set(String(reload.seq), forKey: restoreCursorKey)
                            restoreGeneration = reload.generation
                            initializedReminders?.resetGeneration(reload.generation)
                            restoreReloadCount += 1
                            UserDefaults.standard.set(reload.generation, forKey: "restore-generation.\(configuration.server.absoluteString)")
                            let prefix = "cursor.\(configuration.vaultService).\(configuration.server.absoluteString)."
                            for key in UserDefaults.standard.dictionaryRepresentation().keys where key.hasPrefix(prefix) { UserDefaults.standard.removeObject(forKey: key) }
                            lastSequence = String(reload.seq)
                            resumeSequence = nil
                            UserDefaults.standard.set(lastSequence, forKey: cursorKey)
                            tasks = []; projects = []; tags = []; planning = nil; viewCounts = [:]
                            selectedProject = nil; selectedTag = nil
                            appliedSearchSnapshot = nil
                            searchError = nil
                            taskFilters = .init(); matchingTaskIDs = nil
                            requestedTaskFilters = .init()
                            editor = nil; conflict = nil; history = []; series = nil
                            pendingNavigation = nil; recurrenceDraft = nil; writeIntent = nil
                            transferRequest = nil; transferResult = nil
                            resetImport(); showingImport = false
                            profileDeletion = nil; profileDeletionError = nil; deletionNotice = nil
                            showingSeries = false; showingHistory = false; seriesLoading = false
                            editorError = nil; historyError = nil; snapshotRestore = nil; snapshotRestoreTarget = nil
                            refreshGeneration += 1; historyGeneration += 1; seriesGeneration += 1
                            let previousProfile = profile
                            try await discoverProfiles()
                            if profile != previousProfile {
                                UserDefaults.standard.set(String(reload.seq), forKey: cursorKey)
                                connect()
                                return
                            }
                            _ = await refresh(generation: run)
                            await loadSnapshots()
                        } else if event.name == "operation" {
                            let wire = try JSONDecoder().decode(Components.Schemas.CommittedOperation.self, from: Data(event.data.utf8))
                            let operation = try decode(CommittedOperation.self, wire)
                            guard operation.outcome == "committed", operation.profile == profile,
                                  let id = event.id, Int64(id) == operation.seq else { throw StreamError.invalidUTF8 }
                            if let cursor = lastSequence.flatMap(Int64.init), operation.seq <= cursor { continue }
                            if operation.event.kind == "ProfileDeleted" {
                                try await leaveDeletedProfile(named: operation.event.profile?.name)
                                return
                            }
                            _ = await refresh(generation: run)
                            guard generation == run, !Task.isCancelled else { return }
                            if operation.event.kind == "ReminderFired" {
                                try await reminders.deliver(operation, server: configuration.server.absoluteString, profile: profile)
                            }
                            guard generation == run, !Task.isCancelled else { return }
                            lastSequence = id
                            UserDefaults.standard.set(id, forKey: cursorKey)
                        } else if event.name == "effect/http-api/stream/failure" {
                            if event.data.contains("Unauthorized") { expireSession(credentialEpoch: credentialEpoch); return }
                            throw StreamError.closed
                        }
                    }
                }
                throw StreamError.closed
            } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
                if Task.isCancelled || generation != run { return }
                if failure(error)?.status == 401 { expireSession(credentialEpoch: credentialEpoch); return }
                if failure(error)?.status == 404 {
                    do { try await leaveDeletedProfile(); if generation != run { return } } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            message = describe(error) }
                }
                connection = .offline
                loading = false
                message = describe(error)
                attempt += 1
                reconnectCount += 1
                do { try await Task.sleep(for: .seconds(min(8, attempt))) } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            return }
                guard generation == run else { return }
                connection = .connecting
            }
        }
    }

    func create(openEditor: Bool) async -> Bool {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite else { return false }
        let title = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return false }
        let removedFields = removedQuickAddFields
        busy = true
        quickAddError = nil
        defer { busy = false }
        do {
            let parsed = try await parse(title).removing(removedFields)
            var value: [String: Any] = ["title": parsed.title]
            if let priority = parsed.priority { value["priority"] = priority }
            if let due = parsed.due_at { value["due_at"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(due)) }
            if let scheduled = parsed.scheduled_at { value["scheduled_at"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(scheduled)) }
            if let name = parsed.project { value["project_name"] = name }
            value["tag_names"] = parsed.tags
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: value))
            let response = try await client.tasks_period_create(path: .init(profile: profile), body: .json(payload))
            let task = try TaskSnapshot.decode(response.ok.body.json)
            newTitle = ""
            removedQuickAddFields = []
            quickAdd = false
            if openEditor {
                if hasUnsavedEditor { pendingNavigation = .edit(task) }
                else { beginEditing(task, focusTitle: true) }
            }
            await refreshAfterWrite("Task added")
            announce("Task added to \(profileName)")
            return true
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return false }
            quickAddError = describe(error, at: .quickAdd); handleAuthorization(error, credentialEpoch: credentialEpoch); return false }
    }

    @discardableResult
    func save() async -> TaskSnapshot? {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite, let draft = editor else { return nil }
        writeIntent = nil
        busy = true
        editorError = nil
        defer { busy = false }
        do {
            let payload = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: draft.changesData())
            let response = try await client.tasks_period_edit(path: .init(profile: profile, task: draft.id), body: .json(payload))
            if case .conflict(let response) = response {
                struct Payload: Decodable { let latest: TaskSnapshot? }
                let payload = try JSONDecoder().decode(Payload.self, from: JSONEncoder().encode(response.body.json))
                conflict = TaskConflict(latest: payload.latest)
                announce("Conflict. Choose which changes to keep.")
                return nil
            }
            let saved = try TaskSnapshot.decode(response.ok.body.json)
            editor = nil
            conflict = nil
            writeIntent = nil
            await refreshAfterWrite("Task saved")
            announce("Task saved")
            return saved
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return nil }
            editorError = describe(error, at: .editor); handleAuthorization(error, credentialEpoch: credentialEpoch); return nil }
    }

    func refreshConflictDefinitions() async {
        let credentialEpoch = discovery.credentialEpoch
        guard outdatedServerBuild == nil else { return }
        let requestedProfile = profile
        do {
            let projectValues = try await client.reads_period_projects(path: .init(profile: requestedProfile)).ok.body.json
            let tagValues = try await client.reads_period_tags(path: .init(profile: requestedProfile)).ok.body.json
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile, conflict != nil else { return }
            projects = try decode([DiscoveryEntry].self, projectValues).sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            tags = try decode([DiscoveryEntry].self, tagValues).sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            editorError = describe(error, at: .editor); handleAuthorization(error, credentialEpoch: credentialEpoch) }
    }

    var hasUnsavedEditor: Bool {
        editor != nil && (editor?.changedFields.isEmpty == false || conflict != nil || recurrenceDraft != nil)
    }

    @discardableResult
    func navigate(_ target: EditorNavigation) async -> Bool {
        guard !busy else { return false }
        if case .showDiscovery(let intent) = target, !canShowDiscovery(intent) { return false }
        switch target {
        case .edit(let task) where editor?.id == task.id: return true
        case .profile(let destination) where destination == profile: return true
        default: break
        }
        if hasUnsavedEditor {
            pendingNavigation = target
            return false
        }
        return await applyNavigation(target)
    }

    @discardableResult
    func discardAndNavigate(_ target: EditorNavigation) async -> Bool {
        guard !busy else { return false }
        if case .showDiscovery(let intent) = target, !canShowDiscovery(intent) { return false }
        if case .move = target, !canWrite { return false }
        if case .copy = target, !canWrite { return false }
        pendingNavigation = nil
        if let base = editor?.base { beginEditing(base) }
        return await applyNavigation(target)
    }

    @discardableResult
    func saveAndNavigate(_ target: EditorNavigation) async -> Bool {
        guard canWrite, conflict == nil, let draft = editor else { return false }
        if case .showDiscovery(let intent) = target, !canShowDiscovery(intent) { return false }
        pendingNavigation = nil
        let saved: TaskSnapshot
        if let recurrence = recurrenceDraft {
            await saveSeries(recurrence)
            guard recurrenceDraft == nil, conflict == nil, editorError == nil, let task = editor?.base else { return false }
            saved = task
        } else if !draft.changedFields.isEmpty {
            guard let task = await save() else { return false }
            saved = task
        } else { saved = draft.base }
        if case .move(let task, let destination) = target, task.id == draft.id, saved.id == task.id {
            return await applyNavigation(.move(saved, to: destination))
        }
        if case .copy(let task, let destination) = target, task.id == draft.id, saved.id == task.id {
            return await applyNavigation(.copy(saved, to: destination))
        }
        return await applyNavigation(target)
    }

    private func applyNavigation(_ target: EditorNavigation) async -> Bool {
        pendingNavigation = nil
        switch target {
        case .showDiscovery(let intent):
            return await applyDiscoveryShow(intent)
        case .edit(let task):
            if editor?.id != task.id { beginEditing(task) }
        case .move(let task, let destination):
            guard canWrite else { return false }
            if editor?.id != task.id { beginEditing(task) }
            await write(.move(destination))
            return editorError == nil && conflict == nil
        case .copy(let task, let destination):
            guard canWrite else { return false }
            if editor?.id != task.id { beginEditing(task) }
            await write(.copy(destination))
            return editorError == nil && conflict == nil
        case .openTransfer(let result):
            editor = nil
            conflict = nil
            writeIntent = nil
            recurrenceDraft = nil
            series = nil
            transferResult = nil
            activateProfile(result.task.profile_id)
            beginEditing(result.task)
        case .profile(let destination):
            editor = nil
            conflict = nil
            writeIntent = nil
            recurrenceDraft = nil
            series = nil
            changeProfile(destination)
        }
        return true
    }

    func cancelNavigation() {
        pendingNavigation = nil
        discovery.showIntent = nil
    }

    func beginEditing(_ task: TaskSnapshot, focusTitle: Bool = false) {
        copyFeedbackTask?.cancel()
        taskIDCopyFeedback = nil
        focusEditorTitle = focusTitle
        historyGeneration += 1
        editorError = nil
        conflict = nil
        writeIntent = nil
        showingSeries = false
        series = nil
        recurrenceDraft = nil
        seriesGeneration += 1
        seriesLoading = false
        history = []
        historyError = nil
        showingHistory = false
        editor = TaskDraft(task)
    }

    func resolveConflict() async {
        guard let draft = editor, let conflict, let latest = conflict.latest else { return }
        if writeIntent == nil || writeIntent?.mergesFields == true {
            guard !draft.overlaps(with: latest).contains(where: { conflict.choices[$0] == nil }) else { return }
        }
        editor = draft.merging(latest, choices: conflict.choices)
        self.conflict = nil
        if let writeIntent { await write(writeIntent) }
        else { await save() }
    }

    func transition(_ task: TaskSnapshot, action: String) async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite else { return }
        busy = true
        defer { busy = false }
        do {
            let data = try JSONSerialization.data(withJSONObject: ["from_version": task.row_version, "action": action])
            let payload = try JSONDecoder().decode(Operations.tasks_period_transition.Input.Body.jsonPayload.self, from: data)
            let response = try await client.tasks_period_transition(path: .init(profile: profile, task: task.id), body: .json(payload))
            if case .conflict = response {
                _ = await refresh(generation: generation)
                editorError = "The Task changed. Close and reopen it before trying that action again."
                message = editorError
                return
            }
            _ = try response.ok.body.json
            if editor?.id == task.id { editor = nil }
            await refreshAfterWrite("Task updated")
            announce("Task updated")
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            message = describe(error); editorError = describe(error, at: .editor); handleAuthorization(error, credentialEpoch: credentialEpoch) }
    }

    func deleteTask(_ task: TaskSnapshot) async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite else { return }
        busy = true
        defer { busy = false }
        do {
            let response = try await client.tasks_period_delete(path: .init(profile: profile, task: task.id), query: .init(from_version: String(task.row_version)))
            if case .conflict = response {
                if editor?.id == task.id { editorError = "The Task changed. Close and reopen it before deleting." }
                else { message = "The task changed before it could be deleted." }
                return
            }
            _ = try response.ok.body.json
            if editor?.id == task.id {
                editor = nil
                conflict = nil
                writeIntent = nil
                recurrenceDraft = nil
                series = nil
                pendingNavigation = nil
                deletionNotice = "Task deleted"
            }
            await refreshAfterWrite("Task deleted")
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            if editor?.id == task.id { editorError = describe(error, at: .editor) }
            else { message = describe(error) }
            handleAuthorization(error, credentialEpoch: credentialEpoch)
        }
    }

    func write(_ intent: TaskWriteIntent) async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite, let draft = editor else { return }
        transferResult = nil
        busy = true
        if case .editSeries(let recurrence) = intent { recurrenceDraft = recurrence }
        writeIntent = nil
        historyGeneration += 1
        seriesGeneration += 1
        seriesLoading = false
        editorError = nil
        defer { busy = false }
        do {
            let task: TaskSnapshot
            switch intent {
            case .move(let destination):
                let response = try await client.tasks_period_move(path: .init(profile: profile, task: draft.id), body: .json(.init(from_version: draft.base.row_version, destination_profile: destination)))
                if case .conflict(let value) = response { try acceptConflict(value.body.json, intent: intent); return }
                task = try TaskSnapshot.decode(response.ok.body.json)
            case .copy(let destination):
                let response = try await client.tasks_period_copy(path: .init(profile: profile, task: draft.id), body: .json(.init(from_version: draft.base.row_version, destination_profile: destination)))
                if case .conflict(let value) = response { try acceptConflict(value.body.json, intent: intent); return }
                task = try TaskSnapshot.decode(response.ok.body.json)
            case .revert(let seq):
                let response = try await client.tasks_period_revert(path: .init(profile: profile, task: draft.id), body: .json(.init(from_version: draft.base.row_version, seq: Int(seq))))
                if case .conflict(let value) = response { try acceptConflict(value.body.json, intent: intent); return }
                task = try TaskSnapshot.decode(response.ok.body.json)
            case .skipOccurrence:
                let response = try await client.tasks_period_skipOccurrence(path: .init(profile: profile, task: draft.id), body: .json(.init(from_version: draft.base.row_version)))
                if case .conflict(let value) = response { try acceptConflict(value.body.json, intent: intent); return }
                task = try TaskSnapshot.decode(response.ok.body.json)
            case .editSeries(let recurrence):
                let payload = try JSONDecoder().decode(Operations.tasks_period_editSeries.Input.Body.jsonPayload.self, from: draft.seriesData(recurrence))
                let response = try await client.tasks_period_editSeries(path: .init(profile: profile, task: draft.id), body: .json(payload))
                if case .conflict(let value) = response { try acceptConflict(value.body.json, intent: intent); return }
                task = try TaskSnapshot.decode(response.ok.body.json)
            }
            writeIntent = nil
            conflict = nil
            showingSeries = false
            if case .editSeries(let recurrence) = intent, let definition = series {
                series = SeriesDefinition(id: definition.id, profile_id: task.profile_id, recurrence: recurrence, deleted_at: nil)
            } else { series = nil }
            recurrenceDraft = nil
            history = []
            showingHistory = false
            if let transfer = intent.transfer {
                let name = profiles.first { $0.id == transfer.destination }?.name ?? transfer.destination
                if transfer.kind == .move { editor = nil }
                await refreshAfterWrite("Task updated")
                if transfer.kind == .move {
                    tasks.removeAll { $0.id == task.id }
                    if let current = planning {
                        planning = PlanningResult(name: current.name, groups: current.groups.map { .init(name: $0.name, tasks: $0.tasks.filter { $0.id != task.id }) })
                    }
                }
                transferResult = TaskTransferResult(kind: transfer.kind, task: task, profileName: name)
                announce(transferResult?.message ?? "Task updated")
                return
            }
            if task.profile_id != profile {
                editor = nil
                activateProfile(task.profile_id)
                if task.deleted_at == nil {
                    var moved = task.id == draft.id ? draft.merging(task, choices: [:]) : TaskDraft(task)
                    moved.project = task.project_id
                    moved.projectName = nil
                    moved.tagNames = []
                    moved.tags = task.tags
                    editor = moved
                }
            } else {
                editor = task.deleted_at != nil ? nil : intent.mergesFields ? TaskDraft(task) : draft.merging(task, choices: [:])
                await refreshAfterWrite("Task updated")
            }
            announce("Task updated")
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            editorError = describe(error, at: .editor)
            if intent.transfer != nil { writeIntent = intent }
            handleAuthorization(error, credentialEpoch: credentialEpoch)
        }
    }

    private func acceptConflict(_ wire: Components.Schemas.ConflictEncoded, intent: TaskWriteIntent) throws {
        struct Payload: Decodable { let latest: TaskSnapshot? }
        let payload = try decode(Payload.self, wire)
        conflict = TaskConflict(latest: payload.latest)
        writeIntent = intent
        showingSeries = false
        showingHistory = false
        history = []
        editorError = intent.transfer != nil ? nil : payload.latest == nil ? "Conflict: this Task is unavailable. Your draft is preserved." : "Conflict: review the current Version before retrying the action."
        announce("Conflict. Review the current Version.")
    }

    @discardableResult
    func openTransferredTask() async -> Bool {
        guard let result = transferResult else { return false }
        return await navigate(.openTransfer(result))
    }

    func cancelTransferConflict() {
        guard writeIntent?.transfer != nil else { return }
        conflict = nil
        writeIntent = nil
        editorError = nil
    }

    func chooseAnotherTransferProfile() {
        guard canWrite, let transfer = writeIntent?.transfer, let draft = editor else { return }
        cancelTransferConflict()
        transferRequest = .init(kind: transfer.kind, task: draft.base)
    }

    func openSeries(presenting: Bool = true) async {
        let credentialEpoch = discovery.credentialEpoch
        guard outdatedServerBuild == nil else { return }
        guard canWrite, let draft = editor else { return }
        seriesGeneration += 1
        let request = seriesGeneration
        let requestedProfile = profile
        seriesLoading = true
        editorError = nil
        defer { if seriesGeneration == request { seriesLoading = false } }
        do {
            let tasks = try await client.tasks_period_list(path: .init(profile: requestedProfile)).ok.body.json.map(TaskSnapshot.decode)
            guard let current = tasks.first(where: { $0.id == draft.id }) else { throw DraftError.unavailable }
            var queue = current.seriesKey == nil ? [] : tasks.filter { $0.seriesKey == current.seriesKey }.map(\.id)
            var seen: Set<String> = []
            var entries: [HistoryEntry] = []
            while let id = queue.popLast() {
                guard seen.insert(id).inserted else { continue }
                let history = try await client.reads_period_history(path: .init(profile: requestedProfile, task: id)).ok.body.json
                let decoded = try decode([HistoryEntry].self, history)
                entries += decoded
                let committed = decoded.filter { $0.outcome == "committed" }
                queue += committed.flatMap { $0.event.relatedTasks }.filter { $0.seriesKey == current.seriesKey && !seen.contains($0.id) }.map(\.id)
                queue += committed.flatMap { $0.event.redactedTaskIDs }.filter { !seen.contains($0) }
            }
            guard !Task.isCancelled, seriesGeneration == request, profile == requestedProfile, editor?.id == draft.id else { return }
            let definition = HistoryEntry.series(for: current, entries: entries)
            guard current.occurrence == nil || definition != nil else { throw DraftError.missingSeries }
            series = definition
            showingSeries = presenting
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            guard !Task.isCancelled, seriesGeneration == request, profile == requestedProfile, editor?.id == draft.id else { return }
            editorError = describe(error, at: .editor)
            handleAuthorization(error, credentialEpoch: credentialEpoch)
        }
    }

    func saveSeries(_ recurrence: Recurrence) async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite else { return }
        recurrenceDraft = recurrence
        if series == nil, editor?.base.occurrence != nil {
            editorError = DraftError.missingSeries.localizedDescription
            return
        }
        if series != nil { await write(.editSeries(recurrence)); return }
        guard canWrite, let draft = editor else { return }
        busy = true
        editorError = nil
        defer { busy = false }
        do {
            let payload = try JSONDecoder().decode(Operations.tasks_period_createSeries.Input.Body.jsonPayload.self, from: draft.newSeriesData(recurrence))
            let response = try await client.tasks_period_createSeries(path: .init(profile: profile), body: .json(payload))
            if case .conflict = response { editorError = "Conflict: the Series was not created. Your draft is preserved."; return }
            let created = try TaskSnapshot.decode(response.ok.body.json)
            beginEditing(created)
            if let id = created.occurrence?.series_id {
                series = SeriesDefinition(id: id, profile_id: created.profile_id, recurrence: recurrence, deleted_at: nil)
            }
            await refreshAfterWrite("Series created")
            announce("Series created")
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            editorError = describe(error, at: .editor); handleAuthorization(error, credentialEpoch: credentialEpoch) }
    }

    private func discoverProfiles() async throws {
        let credentialEpoch = discovery.credentialEpoch
        let value = try await client.reads_period_profiles().ok.body.json
        guard isCurrentCredential(credentialEpoch) else { return }
        profiles = try decode([DiscoveryEntry].self, value)
        if !profiles.contains(where: { $0.id == profile }), let first = profiles.first { profile = first.id }
    }

    func refreshAfterWrite(_ accepted: String) async {
        switch await refresh(generation: generation) {
        case .applied:
            message = nil
        case .failed:
            if signedIn {
                message = accepted + ". The live view is reconnecting."
                connect()
            }
        case .superseded:
            break
        }
    }

    func selectView(_ name: String) {
        invalidateSearch()
        selectedView = name
        tasks = []
        planning = nil
        appliedSearchSnapshot = nil
        searchError = nil
        taskLoadError = nil
        loading = true
        selectedProject = nil
        selectedTag = nil
        taskFilters = .init()
        requestedTaskFilters = .init()
        matchingTaskIDs = nil
        searchPhase = .requesting
        let run = generation
        Task { await refresh(generation: run) }
    }

    func applyTaskFilters(_ filters: TaskListFilters) {
        guard requestedTaskFilters != filters || taskFilters != filters else { return }
        invalidateSearch()
        requestedTaskFilters = filters
        searchError = nil
        taskLoadError = nil
        loading = true
        searchPhase = .requesting
        let run = generation
        Task { await refresh(generation: run) }
    }

    func parseDraft() async {
        guard outdatedServerBuild == nil else { return }
        parseGeneration += 1
        let run = parseGeneration
        let text = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        parsedTask = nil
        parsedInput = ""
        removedQuickAddFields = []
        parseError = nil
        guard !text.isEmpty, signedIn else { return }
        do {
            try await Task.sleep(for: .milliseconds(250))
            let value = try await parse(text)
            guard run == parseGeneration, !Task.isCancelled else { return }
            parsedTask = value
            parsedInput = text
        } catch {
            guard run == parseGeneration, !Task.isCancelled else { return }
            parseError = describe(error, at: .parse)
        }
    }

    private func parse(_ text: String) async throws -> ParsedTask {
        let response = try await client.reads_period_quickAdd(path: .init(profile: profile), body: .json(.init(text: text, now: ISO8601DateFormatter().string(from: Date()), time_zone: TimeZone.current.identifier)))
        return try decode(ParsedTask.self, response.ok.body.json)
    }

    func loadDiagnostics() async {
        guard outdatedServerBuild == nil else { return }
        guard !diagnosticsLoading else { return }
        guard signedIn else {
            diagnostics = nil
            diagnosticsError = "Sign in to Todo with an owner Session."
            return
        }
        let run = generation
        diagnosticsLoading = true
        defer { diagnosticsLoading = false }
        do {
            let snapshot = try await client.diagnostics_period_snapshot().ok.body.json
            guard !Task.isCancelled, run == generation, signedIn else { return }
            diagnostics = snapshot
            diagnosticsError = nil
            diagnosticsRetrySeconds = 1
        } catch {
            guard !Task.isCancelled, run == generation, signedIn else { return }
            diagnosticsError = "Server unavailable; retrying when live."
            diagnosticsRetrySeconds = min(30, diagnosticsRetrySeconds * 2)
        }
    }

    func loadHistory() async {
        guard outdatedServerBuild == nil else { return }
        guard let task = editor else { return }
        historyGeneration += 1
        let request = historyGeneration
        let requestedProfile = profile
        let run = generation
        historyError = nil
        do {
            let value = try await client.reads_period_history(path: .init(profile: requestedProfile, task: task.id)).ok.body.json
            guard historyGeneration == request, generation == run, profile == requestedProfile, editor?.id == task.id else { return }
            history = try decode([HistoryEntry].self, value)
        } catch {
            guard historyGeneration == request, generation == run, profile == requestedProfile, editor?.id == task.id else { return }
            historyError = describe(error, at: .history)
        }
    }

    private func decode<Value: Decodable, Wire: Encodable>(_ type: Value.Type, _ wire: Wire) throws -> Value {
        try JSONDecoder().decode(type, from: JSONEncoder().encode(wire))
    }

    func loadSnapshots() async {
        let credentialEpoch = discovery.credentialEpoch
        guard outdatedServerBuild == nil else { return }
        snapshotError = nil
        do {
            let wire = try await client.snapshots_period_list().ok.body.json
            guard isCurrentCredential(credentialEpoch) else { return }
            ownerSnapshots = try decode(SnapshotCatalog.self, wire).snapshots
            snapshotsLoaded = true
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            snapshotError = describe(error, at: .snapshot) }
    }

    func createSnapshot() async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await client.snapshots_period_create(body: .json(.init(reason: "manual"))).ok
            guard isCurrentCredential(credentialEpoch) else { return }
            await loadSnapshots()
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            snapshotError = describe(error, at: .snapshot) }
    }

    func previewSnapshotRestore(_ snapshot: OwnerSnapshot) async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite else { return }
        busy = true
        defer { busy = false }
        do {
            let wire = try await client.snapshots_period_restore(path: .init(snapshot: snapshot.id), body: .json(.init(dry_run: true))).ok.body.json
            guard isCurrentCredential(credentialEpoch) else { return }
            snapshotRestore = try decode(SnapshotRestorePreview.self, wire)
            snapshotRestoreTarget = snapshot
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            snapshotError = describe(error, at: .snapshot) }
    }

    func confirmSnapshotRestore() async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite, let target = snapshotRestoreTarget, snapshotRestore != nil else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await client.snapshots_period_restore(path: .init(snapshot: target.id), body: .json(.init(dry_run: false))).ok
            guard isCurrentCredential(credentialEpoch) else { return }
            snapshotRestore = nil; snapshotRestoreTarget = nil
            await loadSnapshots()
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return }
            snapshotError = describe(error, at: .snapshot) }
    }

    private func expireSession(credentialEpoch: Int) {
        guard isCurrentCredential(credentialEpoch) else { return }
        disconnect()
        try? vault.delete()
        signedIn = false
        diagnostics = nil
        replaceCredential("")
        tasks = []
        appliedSearchSnapshot = nil
        searchError = nil
        searchPhase = .idle
        message = "Your Session ended. Sign in again."
    }

    func checkServerContract() async throws -> Bool {
        do {
            let health = try await client.system_period_health().ok.body.json
            guard health.contract == TodoContract.id else { throw OutdatedServer(serverBuild: health.build) }
            outdatedServerBuild = nil
            return true
        } catch {
            if let outdated = (error as? OutdatedServer) ?? (error as? ClientError)?.underlyingError as? OutdatedServer {
                outdatedServerBuild = outdated.serverBuild
                connection = .offline
                loading = false
                return false
            }
            throw error
        }
    }

    func reconnectAfterUpdate() async {
        do {
            guard try await checkServerContract() else { return }
            if signedIn { connect() }
            else { restored = false; await restore() }
        } catch { message = describe(error) }
    }

    func isCurrentCredential(_ credentialEpoch: Int) -> Bool {
        discovery.credentialEpoch == credentialEpoch && !Task.isCancelled
    }
    func handleAuthorization(_ error: Error, credentialEpoch: Int) {
        if failure(error)?.status == 401 { expireSession(credentialEpoch: credentialEpoch) }
    }
    private func failure(_ error: Error) -> RequestFailure? {
        (error as? RequestFailure) ?? (error as? ClientError)?.underlyingError as? RequestFailure
    }
    func describe(_ error: Error, at position: ClientErrorPosition = .message) -> String {
        let server = failure(error)?.body ?? (error as? ServerFailure)
        lookupErrors[position] = server?.isTaskLookup == true ? server : nil
        if let server { return server.humanMessage }
        if error is DecodingError { return "The server response could not be read. Your draft is preserved." }
        if let draft = error as? DraftError { return draft.localizedDescription }
        if let vault = error as? VaultError { return vault.localizedDescription }
        if error is StreamError { return "The live connection ended. Reconnecting…" }
        return "Couldn't reach the server or read its response. Your draft is preserved."
    }
    private func announce(_ text: String) {
        guard let application = NSApp else { return }
        NSAccessibility.post(element: application.mainWindow as Any, notification: .announcementRequested, userInfo: [.announcement: text, .priority: NSAccessibilityPriorityLevel.medium.rawValue])
    }
}

private enum DraftError: LocalizedError {
    case unavailable, missingSeries
    var errorDescription: String? {
        switch self {
        case .unavailable: "This Task is no longer available."
        case .missingSeries: "The Series definition could not be recovered from History. Your Task and recurrence draft are preserved."
        }
    }
}
