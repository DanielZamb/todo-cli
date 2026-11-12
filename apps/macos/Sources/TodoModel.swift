import AppKit
import Foundation
import Observation
import OpenAPIRuntime
import TodoAPI

private final class CatalogNotificationObservers: @unchecked Sendable {
    private let observers: [(NotificationCenter, NSObjectProtocol)]
    init(system: NotificationCenter, workspace: NotificationCenter, receive: @escaping @Sendable (ClientDiagnosticTrigger) -> Void) {
        let sources: [(NotificationCenter, Notification.Name, ClientDiagnosticTrigger)] = [
            (system, .NSCalendarDayChanged, .dayChange),
            (system, .NSSystemClockDidChange, .clockChange),
            (system, .NSSystemTimeZoneDidChange, .clockChange),
            (system, NSApplication.didBecomeActiveNotification, .activation),
            (workspace, NSWorkspace.didWakeNotification, .wake)
        ]
        observers = sources.map { center, name, trigger in
            (center, center.addObserver(forName: name, object: nil, queue: nil) { _ in receive(trigger) })
        }
    }
    deinit { for (center, token) in observers { center.removeObserver(token) } }
}

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
    /// A Profile change ends a failed sign-out's notice, whichever path changes it.
    var profile: String { didSet { if profile != oldValue { endMessage() } } }
    var tasks: [TaskSnapshot] = []
    var profiles: [DiscoveryEntry] = []
    var profileDeletion: ProfileDeletionPrompt?
    enum ProfileDeletionMessageKind: Hashable { case delete }
    /// The Delete Profile prompt's caption under the one message rule (SurfaceMessages); a new
    /// prompt is a new instance. Deletion is gated by busy.
    var profileDeletionMessages = SurfaceMessages<ProfileDeletionMessageKind, String>()
    var profileDeletionError: String? {
        get { profileDeletionMessages.value }
        set { if let newValue { profileDeletionMessages.publish(newValue, kind: .delete) } else { profileDeletionMessages.end() } }
    }
    var projects: [DiscoveryEntry] = []
    var tags: [DiscoveryEntry] = []
    private static let tagNameEdges = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}"))
    var planning: PlanningResult?
    var viewCounts: [String: Int] = [:]
    var profileName: String { profiles.first { $0.id == profile }?.name ?? "Profile" }
    var writeIntent: TaskWriteIntent?
    var batchEdit: BatchEditDraft?
    var attachmentBatch: AttachmentBatchDraft?
    var showingImport = false { didSet {
        if showingImport && !oldValue { importInstance = UUID() }
        if !showingImport && oldValue { endMessage(raisedBy: .importSheet(importInstance)); importMessages = .init() }
    } }
    enum ImportMessageKind: Hashable { case file, run, followUp }
    /// The Import report's messages, under the one message rule (SurfaceMessages): a file that
    /// cannot be read, a preview or apply failure, and a failed Dependency follow-up. A new or
    /// closed Import starts a new value.
    var importMessages = SurfaceMessages<ImportMessageKind, String>()
    /// A Dependency follow-up offered by the Import report that failed (ruling 3).
    var importFollowUpError: String? { importMessages.value(of: .followUp) }
    /// Identity of the current Import sheet; renewed each time it opens.
    @ObservationIgnored private(set) var importInstance = UUID()
    var importDocument: ImportDocument?
    var importReport: ImportSummary?
    /// The Import report's file or preview/apply message. A direct assignment is a synchronous
    /// producer (a file message); nil clears only a file or run message.
    var importError: String? {
        get { importMessages.kind == .followUp ? nil : importMessages.value }
        set { if let newValue { importMessages.publish(newValue, kind: .file) } else { importMessages.clear([.file, .run]) } }
    }
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
    @ObservationIgnored private var appliedCatalogGeneration: String?
    @ObservationIgnored private var appliedCatalogCursor: String?
    @ObservationIgnored private let catalogNow: () -> Date
    @ObservationIgnored private let catalogNotifications: NotificationCenter
    @ObservationIgnored private let wakeNotifications: NotificationCenter
    @ObservationIgnored private var catalogObservers: CatalogNotificationObservers?
    @ObservationIgnored private var lastCatalogReadAt: Date?
    @ObservationIgnored private var catalogSignalRevision = 0
    @ObservationIgnored private var catalogReadsInFlight = 0
    @ObservationIgnored private var pendingCatalogTrigger: ClientDiagnosticTrigger?
    @ObservationIgnored private var environmentRefreshTask: Task<Void, Never>?
    private var catalogReady = false
    private var catalogStale = true
    var searchError: TaskSearchFailure?
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
    var history: [HistoryEntry] = []
    var diagnostics: DiagnosticsSnapshot?
    var diagnosticsError: String?
    var diagnosticsLoading = false
    var diagnosticsLive = true
    var diagnosticsRetrySeconds = 1
    enum HistoryMessageKind: Hashable { case load }
    /// The editor's History error under the one message rule (SurfaceMessages); a newer load
    /// supersedes an older one (with `historyGeneration` for the data).
    var historyMessages = SurfaceMessages<HistoryMessageKind, String>()
    var historyError: String? {
        get { historyMessages.value }
        set { if let newValue { historyMessages.publish(newValue, kind: .load) } else { historyMessages.end() } }
    }
    var showingHistory = false
    private var importGeneration = 0
    private var parseGeneration = 0
    private var historyGeneration = 0
    var serverErrors: [ClientErrorPosition: ServerFailure] = [:]
    var dependencyErrorContexts: [ClientErrorPosition: DependencyActionContext] = [:]
    let discovery = DiscoveryState()
    let dependencies = DependencyState()
    @ObservationIgnored let clientDiagnostics: ClientDiagnosticsRecorder
    @ObservationIgnored lazy var clientDiagnosticsUI = ClientDiagnosticsMonitor(recorder: clientDiagnostics)
    var signedIn = false { didSet {
        if signedIn {
            clientDiagnostics.authorizeOwnerSession(credential.hasPrefix("ses_"))
            clientDiagnosticsUI.start()
        } else {
            discovery.credentialChanged(); dependencies.reset()
            clientDiagnosticsUI.stop(); clientDiagnostics.clear()
        }
        reportClientAvailability()
    } }
    var canRestore = false
    var busy = false { didSet { reportClientAvailability(); if !busy { scheduleEnvironmentRefresh() } } }
    var loading = false { didSet { reportClientAvailability() } }
    var connection = Connection.connecting { didSet { if connection == .offline { discoveryWentOffline(); dependenciesWentOffline() }; reportClientAvailability(); if connection == .live { scheduleEnvironmentRefresh() } } }
    var outdatedServerBuild: String?
    /// What produced the current `message`. See "Message ownership" in
    /// docs/decisions/mac-session-retirement.md for the rule and the per-kind table.
    enum MessageKind: Hashable {
        case general, connection, restore, signIn, sessionEnded, signOut, transition, delete, dependencyFollowUp, discoveryShow
        /// A link or unlink that failed after its picker closed, and a create that failed after its
        /// quick-add closed: the surface could be closed mid-write, so the main window is told.
        case dependencyLink, quickAdd
        /// What a successful restore or sign-in makes untrue.
        static let session: Set<MessageKind> = [.restore, .signIn, .sessionEnded, .connection]
        /// The banner's one control for a message of this kind. A reconnect clears only connection
        /// messages, so every other kind offers Dismiss instead.
        var bannerControl: MessageBannerControl { self == .connection ? .reconnect : .dismiss }
    }
    enum MessageBannerControl: Equatable { case reconnect, dismiss }
    /// The sheet or dialog instance that raised the message. Each opening is a new instance;
    /// the message ends when that instance closes. Discovery Show is not one: its dialog closes
    /// before the request, so its error belongs to the main window.
    enum MessageSurface: Hashable { case dependencyPicker(UUID), importSheet(UUID), deleteDialog(UUID), editor(UUID), quickAdd(UUID), batchEdit(UUID), attachmentBatch(UUID), dependencyBatch(UUID) }
    /// Whether the instance that started some work is still the one showing.
    func isShowing(_ surface: MessageSurface) -> Bool {
        switch surface {
        case .dependencyPicker(let id): dependencies.picker?.id == id
        case .importSheet(let id): showingImport && importInstance == id
        case .deleteDialog(let id): dependencies.deletion?.id == id
        case .editor(let opening): editor?.opening == opening
        case .quickAdd(let id): quickAdd && quickAddInstance == id
        case .batchEdit(let id): batchEdit?.id == id
        case .attachmentBatch(let id): attachmentBatch?.id == id
        case .dependencyBatch(let id): dependencies.batch?.id == id
        }
    }
    /// Steps 1 and 2 of the order every asynchronous completion follows (ownership, authorization,
    /// data, presentation). If the credential and Profile the work began under are still current,
    /// a 401 ends the Session whether or not the surface it came from is still showing.
    func authorize(_ error: Error, epoch: Int, profile expected: String) {
        guard discovery.credentialEpoch == epoch, profile == expected else { return }
        handleAuthorization(error, credentialEpoch: epoch)
    }

    /// The main window's messages, under the same rule as every surface (SurfaceMessages).
    /// Same-kind hand-offs for different Tasks merge into one message (D2); other kinds replace.
    private var mainMessages = SurfaceMessages<MessageKind, String>(merge: { kind, parts in
        switch kind {
        case .dependencyLink: "Couldn't change \(parts.count) Dependencies: \(MergedFailureWording.names(parts.map(\.subject))). Open each Task's Dependencies to see why."
        case .quickAdd: "Couldn't add \(parts.count) Tasks: \(MergedFailureWording.names(parts.map(\.subject)))."
        default: nil
        }
    })
    /// The newest message. Each one has a kind and a sequence number that only grows.
    var message: String? {
        get { mainMessages.value }
        set {
            if let newValue { mainMessages.publish(newValue, kind: pendingMessageKind); messageSurface = pendingMessageSurface }
            else { mainMessages.end(); messageSurface = nil }
            pendingMessageKind = .general; pendingMessageSurface = nil
        }
    }
    var messageKind: MessageKind? { mainMessages.kind }
    var messageSequence: Int { mainMessages.sequence }
    @ObservationIgnored private var pendingMessageKind = MessageKind.general
    @ObservationIgnored private(set) var messageSurface: MessageSurface?
    @ObservationIgnored private var pendingMessageSurface: MessageSurface?
    /// Noted by an action when it starts; its success may clear only messages up to this mark.
    var messageMark: Int { mainMessages.mark }
    /// Starts a main-window action of `kind` under the one message rule; an older pending one of
    /// the same kind is superseded.
    func beginMessage(_ kind: MessageKind) -> SurfaceMessages<MessageKind, String>.Ticket { mainMessages.begin(kind) }
    /// A main-window success: clears its kind's message from before it began; false if superseded.
    func succeedMessage(_ ticket: SurfaceMessages<MessageKind, String>.Ticket) -> Bool {
        let present = mainMessages.succeed(ticket)
        if mainMessages.value == nil { messageSurface = nil }
        return present
    }
    func isNewestMessage(_ ticket: SurfaceMessages<MessageKind, String>.Ticket) -> Bool { mainMessages.isNewest(ticket) }
    /// A ticket of any surface, type-erased; it can only be made from a real ticket, so it can never
    /// carry a decision taken earlier (MAC-C1-S1-17).
    struct PresentationTicket {
        private let ticket: any SurfaceTicket
        init<Kind, Value>(_ ticket: SurfaceMessages<Kind, Value>.Ticket) { self.ticket = ticket }
        var isNewest: Bool { ticket.isNewest }
    }
    /// Who may present a read-back's outcome, asked when it publishes.
    enum ReadBackOwner {
        /// The main window: a row action, or a surface action that closed its own surface on success.
        case mainWindow(PresentationTicket?)
        /// A surface instance: only while it is still showing.
        case surface(MessageSurface, PresentationTicket?)
        @MainActor func mayPresent(in model: TodoModel) -> Bool {
            switch self {
            case .mainWindow(let ticket): ticket?.isNewest ?? true
            case .surface(let surface, let ticket): (ticket?.isNewest ?? true) && model.isShowing(surface)
            }
        }
    }
    func publishMessage(_ text: String, kind: MessageKind, surface: MessageSurface? = nil) { pendingMessageKind = kind; pendingMessageSurface = surface; message = text }
    /// The only way a surface's completion reaches the main window after its surface closed
    /// (MAC-C1-S1-16): it hands off only if the action is still the newest of its kind in its
    /// instance. A superseded action presents nothing anywhere. Returns whether it handed off.
    @discardableResult
    func handOff<Kind, Value>(_ text: String, kind: MessageKind, from ticket: SurfaceMessages<Kind, Value>.Ticket, subject: String? = nil) -> Bool {
        guard ticket.isNewest else { return false }
        // Carries the action's target and subject so same-kind hand-offs for different Tasks merge (D2).
        mainMessages.publish(text, kind: kind, target: ticket.target, subject: subject)
        messageSurface = nil
        return true
    }
    /// A success started at `mark` clears the current message only if it is one of `kinds`
    /// and already existed when the action started. A newer message always survives.
    func clearMessage(_ kinds: Set<MessageKind>, since mark: Int, onlyTarget: AnyHashable? = nil) {
        mainMessages.clear(kinds, since: mark, onlyTarget: onlyTarget)
        if mainMessages.value == nil { messageSurface = nil }
    }
    /// Whether the banner should announce message `sequence` now: once per message, not per appearance.
    func takeAnnouncement(_ sequence: Int) -> Bool {
        guard sequence > lastAnnouncedMessage else { return false }
        lastAnnouncedMessage = sequence
        return true
    }
    @ObservationIgnored private var lastAnnouncedMessage = 0
    /// The person dismissed the message numbered `sequence` (the one the banner showed). Like the
    /// other ends, it ends that message and nothing newer.
    func dismissMessage(_ sequence: Int) { if message != nil, messageSequence == sequence { message = nil } }
    /// A credential or Profile change ends any message.
    func endMessage() { if message != nil { message = nil } }
    /// A closed sheet or dialog ends the message it raised.
    func endMessage(raisedBy surface: MessageSurface) { if message != nil, messageSurface == surface { message = nil } }
    var taskLoadError: String?
    var quickAdd = false { didSet { if quickAdd && !oldValue { quickAddInstance = UUID(); parseGeneration += 1; quickAddMessages = .init() } } }
    /// Identity of the current quick-add; renewed each time it opens.
    @ObservationIgnored private(set) var quickAddInstance = UUID()
    var newTitle = ""
    enum QuickAddMessageKind: Hashable { case create, parse }
    /// The quick-add instance's messages under the one message rule (SurfaceMessages): the create
    /// error and the parse caption share one sequence, so the newest of them shows.
    var quickAddMessages = SurfaceMessages<QuickAddMessageKind, String>()
    var quickAddError: String? {
        get { quickAddMessages.value(of: .create) }
        set { if let newValue { quickAddMessages.publish(newValue, kind: .create) } else { quickAddMessages.clear([.create]) } }
    }
    /// The parse caption under the draft (a newer parse supersedes an older one).
    var parseError: String? { quickAddMessages.value(of: .parse) }
    enum EditorNavigation {
        case edit(TaskSnapshot)
        case move(TaskSnapshot, to: String)
        case copy(TaskSnapshot, to: String)
        case profile(String)
        case openTransfer(TaskTransferResult)
        case showDiscovery(DiscoveryShowIntent)
    }
    var pendingNavigation: EditorNavigation?
    enum NoticeKind: Hashable { case notice }
    /// The main window's quiet confirmation ("Task added", "Task deleted", a Profile switch after
    /// deletion) under the one message rule: each notice has a sequence, and its timer ends only
    /// the notice that existed when it started, never a newer one that replaced it.
    var noticeMessages = SurfaceMessages<NoticeKind, String>()
    var deletionNotice: String? {
        get { noticeMessages.value }
        set { if let newValue { noticeMessages.publish(newValue, kind: .notice) } else { noticeMessages.end() } }
    }
    /// Ends the confirmation only if it is still the one shown at `mark` (its timer's start).
    func expireNotice(since mark: Int) { noticeMessages.clear([.notice], since: mark) }
    var focusEditorTitle = false
    /// The open editor. A different opening starts a new message surface.
    var editor: TaskDraft? { didSet { if editor?.opening != oldValue?.opening { editorMessages = .init(); attachmentInputMessages = .init() } } }
    enum AttachmentInputKind: Hashable { case open, paste, drop }
    /// The Attachments section's own caption (opening, pasting or dropping something the section
    /// itself refuses) under the one message rule, one instance per editor opening.
    var attachmentInputMessages = SurfaceMessages<AttachmentInputKind, String>()
    var attachmentInputError: String? { attachmentInputMessages.value }
    enum EditorMessageKind: Hashable { case general, save, conflict, write, series, seriesSave, attachment }
    /// The editor opening's messages under the one message rule (SurfaceMessages).
    var editorMessages = SurfaceMessages<EditorMessageKind, String>()
    var editorError: String? {
        get { editorMessages.value }
        set { if let newValue { editorMessages.publish(newValue, kind: .general) } else { editorMessages.end() } }
    }
    var conflict: TaskConflict?
    var reconnectCount = 0
    var lastSequence: String?
    var resumeSequence: String?
    var ownerSnapshots: [OwnerSnapshot] = []
    var snapshotsLoaded = false
    enum SnapshotMessageKind: Hashable { case list, write }
    /// Settings › Snapshots' error under the one message rule (SurfaceMessages). A list load is not
    /// gated (opening the tab, Retry, and the reload after a write), so a newer load supersedes an
    /// older one; create, preview and restore are gated by busy.
    var snapshotMessages = SurfaceMessages<SnapshotMessageKind, String>()
    var snapshotError: String? {
        get { snapshotMessages.value }
        set { if let newValue { snapshotMessages.publish(newValue, kind: .write) } else { snapshotMessages.end() } }
    }
    var snapshotRestore: SnapshotRestorePreview?
    var snapshotRestoreTarget: OwnerSnapshot?
    var restoreGeneration = "initial"
    var restoreReloadCount = 0
    private var credential = ""
    @ObservationIgnored private var clientSession: TodoClientSession?
    func replaceCredential(_ value: String) {
        clientSession?.invalidate()
        clientSession = nil
        clientDiagnosticsUI.stop()
        if !credential.isEmpty { clientDiagnostics.clear() } else { clientDiagnostics.authorizeOwnerSession(false) }
        discovery.credentialChanged()
        dependencies.reset()
        disconnect()
        importGeneration += 1
        parseGeneration += 1
        historyGeneration += 1
        seriesGeneration += 1
        serverErrors = [:]
        if credential != value {
            endMessage()
            // Import belongs to the credential that opened it, as the picker does (reset above).
            showingImport = false
        }
        credential = value
        busy = false
        diagnosticsLoading = false
        // Their completions are rejected by the new epoch or Series generation,
        // so the replacement releases their loading state here.
        seriesLoading = false
        attachmentBatch?.loading = false
        batchEdit?.loading = false
    }
    private var streamTask: Task<Void, Never>?
    private var restored = false
    private var generation = 0
    private var refreshGeneration = 0
    private var vault: SessionVault { SessionVault(service: configuration.vaultService, account: configuration.server.absoluteString) }
    private let clientFactory: ((URL, String) -> Client)?
    var client: Client {
        if let clientFactory { return clientFactory(configuration.server, credential) }
        if let clientSession { return clientSession.client }
        let session = TodoClientSession(server: configuration.server, credential: credential, diagnostics: clientDiagnostics)
        clientSession = session
        return session.client
    }
    private var cursorKey: String { "cursor.\(configuration.vaultService).\(configuration.server.absoluteString).\(profile)" }
    private var restoreCursorKey: String { "restore-cursor.\(configuration.server.absoluteString)" }
    var canWrite: Bool { signedIn && connection == .live && !busy && outdatedServerBuild == nil }

    init(configuration: ClientConfiguration, clientFactory: ((URL, String) -> Client)? = nil, clientDiagnostics: ClientDiagnosticsRecorder = .disabled, catalogNow: @escaping () -> Date = Date.init, catalogNotifications: NotificationCenter = .default, wakeNotifications: NotificationCenter? = nil) {
        self.clientDiagnostics = clientDiagnostics
        self.catalogNow = catalogNow
        self.catalogNotifications = catalogNotifications
        self.wakeNotifications = wakeNotifications ?? NSWorkspace.shared.notificationCenter
        self.configuration = configuration
        self.clientFactory = clientFactory
        profile = configuration.initialProfile
        if UserDefaults.standard.string(forKey: restoreCursorKey) != nil {
            restoreGeneration = UserDefaults.standard.string(forKey: "restore-generation.\(configuration.server.absoluteString)") ?? "initial"
        }
        catalogObservers = CatalogNotificationObservers(system: catalogNotifications, workspace: self.wakeNotifications) { [weak self] trigger in
            Task { @MainActor [weak self] in self?.catalogEnvironmentChanged(trigger) }
        }
    }

    private func catalogEnvironmentChanged(_ trigger: ClientDiagnosticTrigger) {
        guard signedIn, outdatedServerBuild == nil else { return }
        if trigger == .activation, let lastCatalogReadAt, catalogNow().timeIntervalSince(lastCatalogReadAt) <= 60 { return }
        catalogSignalRevision += 1
        catalogStale = true
        if pendingCatalogTrigger == nil { pendingCatalogTrigger = trigger }
        scheduleEnvironmentRefresh()
    }

    private func scheduleEnvironmentRefresh() {
        guard pendingCatalogTrigger != nil, signedIn, connection == .live, !busy, catalogReadsInFlight == 0, environmentRefreshTask == nil else { return }
        let run = generation
        environmentRefreshTask = Task { [weak self] in
            await Task.yield()
            guard let self else { return }
            defer {
                if generation == run { environmentRefreshTask = nil; scheduleEnvironmentRefresh() }
            }
            guard generation == run, !Task.isCancelled, signedIn, connection == .live, !busy, catalogReadsInFlight == 0, let trigger = pendingCatalogTrigger else { return }
            pendingCatalogTrigger = nil
            _ = await refresh(generation: run, trigger: trigger)
        }
    }

    private func reportClientAvailability() {
        guard clientDiagnostics.isOwnerSession else { return }
        let reason: ClientDiagnosticReason = !signedIn ? .signedOut : outdatedServerBuild != nil ? .outdatedServer : connection == .offline ? .offline : busy ? .write : loading ? (appliedSearchSnapshot == nil ? .initialLoad : .query) : .ready
        clientDiagnostics.availabilityChanged(.init(loading: loading, busy: busy, canWrite: canWrite, dataReady: appliedSearchSnapshot != nil, reason: reason))
    }

    func resetImport() {
        batchEdit = nil
        attachmentBatch = nil
        importGeneration += 1
        importDocument = nil
        importReport = nil
        importMessages = .init()
        importCloseMissing = false
    }

    func loadImport(data: Data, name: String) {
        resetImport()
        do { importDocument = try ImportDocument(data: data, name: name) }
        catch { importMessages.publish("Cannot read this file. Choose a JSON array or NDJSON file.", kind: .file) }
    }

    func previewImport() async { await runImport(dryRun: true) }
    func applyImport() async { await runImport(dryRun: false) }

    private func runImport(dryRun: Bool) async {
        var committed = false // the write's reply came back OK: its read-back cannot be skipped (S1-19)
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite, let document = importDocument else { return }
        if !dryRun && importReport?.dry_run != true { return }
        let requestedProfile = profile
        let requestedGeneration = importGeneration
        // The Import instance this preview or apply belongs to; its report and error show only there.
        let surface: MessageSurface? = showingImport ? .importSheet(importInstance) : nil
        busy = true
        // The newest run presents: a new preview or apply clears an earlier file or run message now.
        importMessages.clear([.file, .run])
        let ticket = importMessages.begin(.run)
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
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
            if !dryRun, case .ok = response { committed = true }
            let report = try decode(ImportSummary.self, response.ok.body.json)
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
            // A reopened Import has a new generation; the previous sheet's committed apply still reaches the list.
            guard importGeneration == requestedGeneration, surface.map(isShowing) ?? true else { if !dryRun { await refreshAfterWrite("Import applied", owner: .surface(surface ?? .importSheet(UUID()), .init(ticket))) }; return }
            if report.items.contains(where: { $0.error?.hasMalformedDependencyError == true }) {
                importReport = nil
                throw DependencyGraphReply.ProtocolError.incompatible
            }
            importMessages.succeed(ticket)
            importReport = report
            if !dryRun { await refreshAfterWrite("Import applied", owner: surface.map { .surface($0, .init(ticket)) } ?? .mainWindow(.init(ticket))) }
        } catch {
            authorize(error, epoch: credentialEpoch, profile: requestedProfile)
            guard isCurrentCredential(credentialEpoch) else { return }
            // A committed apply whose reply could not be used still reads the catalog back (S1-19).
            if !dryRun, committed || committedBeforeFailure(error), profile == requestedProfile {
                await refreshAfterWrite("Import applied", owner: surface.map { .surface($0, .init(ticket)) } ?? .mainWindow(.init(ticket)))
                guard isCurrentCredential(credentialEpoch) else { return }
            }
            guard profile == requestedProfile, importGeneration == requestedGeneration, surface.map(isShowing) ?? true else { return }
            importMessages.fail(describe(error, at: .importTasks), ticket)
        }
    }

    /// After an await in restore or sign-in. False when another credential took over:
    /// the caller returns without touching state it no longer owns. A cancelled task
    /// with the same epoch throws, so it reaches the caller's cancellation cleanup
    /// instead of an early return that skips it.
    private func stillOwns(_ credentialEpoch: Int) throws -> Bool {
        guard discovery.credentialEpoch == credentialEpoch else { return false }
        if Task.isCancelled { throw CancellationError() }
        return true
    }

    func restore() async {
        var credentialEpoch = discovery.credentialEpoch
        let mark = messageMark
        guard !restored, !busy, !signedIn else { return }
        busy = true
        canRestore = false
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        restored = true
        do {
            guard try await checkServerContract() else { return }
            if let value = try vault.load() {
                replaceCredential(value)
                credentialEpoch = discovery.credentialEpoch
                busy = true
                try await discoverProfiles()
                guard try stillOwns(credentialEpoch) else { return }
                signedIn = true
                clearMessage(MessageKind.session, since: mark)
                connect()
            }
        } catch {
            guard discovery.credentialEpoch == credentialEpoch else { return }
            if Task.isCancelled {
                // A cancelled restore retains its epoch, so it restores retry
                // eligibility just as a transport failure does.
                if !signedIn { restored = false; canRestore = true }
                return
            }
            if failure(error)?.status == 401 { expireSession(credentialEpoch: credentialEpoch) }
            else if error is VaultError { publishMessage(describe(error), kind: .restore) }
            else {
                restored = false
                canRestore = true
                publishMessage(describe(error), kind: .restore)
            }
        }
    }

    func signIn(_ passphrase: String) async -> Bool {
        var credentialEpoch = discovery.credentialEpoch
        let mark = messageMark
        guard !busy else { return false }
        busy = true
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            guard try await checkServerContract() else { return false }
            let response = try await client.signIn_period_signIn(body: .json(.init(passphrase: passphrase)))
            let session = try response.ok.body.json
            guard try stillOwns(credentialEpoch) else { return false }
            guard try await checkServerContract(), try stillOwns(credentialEpoch) else { return false }
            try vault.save(session.credential)
            replaceCredential(session.credential)
            credentialEpoch = discovery.credentialEpoch
            busy = true
            try await discoverProfiles()
            guard try stillOwns(credentialEpoch) else { return false }
            signedIn = true
            restored = true
            canRestore = false
            clearMessage(MessageKind.session, since: mark)
            connect()
            return true
        } catch {
            guard isCurrentCredential(credentialEpoch) else { return false }
            publishMessage(describe(error), kind: .signIn)
            return false
        }
    }

    func signOut() async {
        guard !busy else { return }
        // Sign-out keeps the credential epoch until the server has revoked the
        // credential. Closing Discovery and the stream retires their own work;
        // every other pending read still owns its cleanup if sign-out fails.
        closeDiscovery()
        disconnect()
        let credentialEpoch = discovery.credentialEpoch
        busy = true
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            // Only the documented 204 proves revocation; any other reply keeps the Session.
            _ = try await client.credentials_period_signOut().noContent
            // The server has revoked the credential, so cancellation must not
            // leave the model signed in with it.
            guard discovery.credentialEpoch == credentialEpoch else { return }
            try vault.delete()
            disconnect()
            replaceCredential("")
            signedIn = false
            diagnostics = nil
            tasks = []
            appliedSearchSnapshot = nil
            catalogReady = false
            catalogStale = true
            searchError = nil
            searchPhase = .idle
            editor = nil
            quickAdd = false
            newTitle = ""
        } catch {
            guard discovery.credentialEpoch == credentialEpoch else { return }
            if !Task.isCancelled {
                // Say what failed and leave out draft wording: a sign-out has no draft to preserve.
                let reason = describe(error).replacingOccurrences(of: " Your draft is preserved.", with: "")
                publishMessage("Couldn't sign out. " + reason, kind: .signOut)
                handleAuthorization(error, credentialEpoch: credentialEpoch)
            }
            if signedIn { connect() }
        }
    }

    func beginProfileDeletion() {
        guard profiles.count > 1, canWrite, editor == nil else { return }
        profileDeletionMessages = .init()
        profileDeletion = ProfileDeletionPrompt(name: profileName, count: profiles.first { $0.id == profile }?.visible_task_count ?? tasks.count)
    }

    func deleteProfile() async {
        let credentialEpoch = discovery.credentialEpoch
        guard let prompt = profileDeletion, canWrite, editor == nil else { return }
        let client = self.client
        let deleted = profile
        let run = generation
        busy = true
        let deleteTicket = profileDeletionMessages.begin(.delete)
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            do {
                let response = try await client.reads_period_deleteProfile(path: .init(profile: deleted), body: .json(.init(with_tasks: prompt.deleteTasks, dry_run: false)))
                _ = try response.ok.body.json
            } catch where committedBeforeFailure(error) {
                // Deleted, but its reply could not be read: the deletion stands (S1-19).
            }
            guard profile == deleted, generation == run, !Task.isCancelled else { return }
            profileDeletion = nil
            // The Profile is deleted. Reading the Profiles back is this write's read-back: its
            // failure is not a deletion failure; the connection recovery leaves the Profile when the
            // reload arrives (S1-19).
            do { try await leaveDeletedProfile(named: prompt.name) } catch {
                handleAuthorization(error, credentialEpoch: credentialEpoch)
                guard isCurrentCredential(credentialEpoch), signedIn, deleteTicket.isNewest else { return }
                publishMessage("\u{201C}\(prompt.name)\u{201D} was deleted. The live view is reconnecting.", kind: .connection)
                connect()
            }
        } catch {
            // A 401 for the current credential ends the Session even if this action is no longer wanted (S1-20).
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            guard isCurrentCredential(credentialEpoch) else { return }
            guard profile == deleted, generation == run, !Task.isCancelled else { return }
            if let values = try? await client.reads_period_profiles().ok.body.json,
               let latest = try? decode([DiscoveryEntry].self, values) {
                guard profile == deleted, generation == run, !Task.isCancelled else { return }
                profiles = latest
                if let count = latest.first(where: { $0.id == deleted })?.visible_task_count { profileDeletion?.count = count }
            }
            guard profile == deleted, generation == run, !Task.isCancelled else { return }
            if let caption = failure(error)?.code == "profile_not_empty" ? profileDeletion?.refusal : describe(error) {
                profileDeletionMessages.fail(caption, deleteTicket)
            }
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
        deletionNotice = "\"\(deletedName)\" was deleted. Switched to \(next.name)."
    }

    /// Whether choosing `value` starts a Profile switch.
    /// Choosing the Profile already shown starts nothing (and so is not timed).
    func profileSwitchStarts(_ value: String) -> Bool { value != profile }
    /// Whether a switch to `value` has finished: the new Profile's catalog has arrived and the
    /// stream is live. The state right after the switch (same connection, not yet loading) does not
    /// count; it used to complete the switch at once, timed at about 0 ms.
    func profileSwitchSettled(_ value: String) -> Bool { profile == value && catalogReady && connection == .live && !loading }

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
        dependencies.reset()
        resetImport()
        showingImport = false
        UserDefaults.standard.set(value, forKey: "profile")
        tasks = []
        appliedSearchSnapshot = nil
        catalogReady = false
        catalogStale = true
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
        catalogStale = true
        connection = .connecting
        loading = true
        lastSequence = UserDefaults.standard.string(forKey: cursorKey) ?? UserDefaults.standard.string(forKey: restoreCursorKey)
        let run = generation
        let action = ClientDiagnosticContext.actionID
        streamTask = Task {
            await ClientDiagnosticContext.$actionID.withValue(nil) {
                await ClientDiagnosticContext.$inputKind.withValue(.background) { await followChanges(generation: run, openingAction: action) }
            }
        }
    }

    private func disconnect() {
        generation += 1
        environmentRefreshTask?.cancel()
        environmentRefreshTask = nil
        streamTask?.cancel()
        streamTask = nil
        invalidateSearch()
    }

    private func refresh(generation run: Int, scope: TaskSearchRefreshScope = .full, trigger: ClientDiagnosticTrigger = .manual) async -> TaskSearchRefreshOutcome {
        let id = clientDiagnostics.refreshStarted(trigger)
        let start = ProcessInfo.processInfo.systemUptime
        let result = await ClientDiagnosticContext.$refreshID.withValue(id) { await performRefresh(generation: run, scope: scope) }
        let outcome: ClientDiagnosticOutcome = result == .applied ? .applied : result == .failed ? .failed : .superseded
        clientDiagnostics.refreshFinished(id, outcome: outcome, durationMS: (ProcessInfo.processInfo.systemUptime - start) * 1000)
        reportClientAvailability(); clientDiagnosticsUI.publishReadyActions()
        return result
    }

    private func performRefresh(generation run: Int, scope: TaskSearchRefreshScope) async -> TaskSearchRefreshOutcome {
        let credentialEpoch = discovery.credentialEpoch
        guard outdatedServerBuild == nil, generation == run, !Task.isCancelled else { return .superseded }
        let client = self.client
        if scope == .full { catalogStale = true }
        searchDebounce?.cancel()
        refreshGeneration += 1
        let request = refreshGeneration
        let identity = requestedIdentity
        searchPhase = .requesting
        var catalogRevision: Int?
        defer {
            if catalogRevision != nil { catalogReadsInFlight -= 1; scheduleEnvironmentRefresh() }
        }
        do {
            let full = scope == .full || catalogStale || !catalogReady
            let catalog: TaskSearchCatalog?
            let filteredResponse: [TaskSnapshot]
            let currentPlanning: PlanningResult?
            if full {
                catalogRevision = catalogSignalRevision
                catalogReadsInFlight += 1
                async let catalogRead = readSearchCatalog(identity, client: client)
                async let matchingRead: [TaskSnapshot]? = identity.filters.isEmpty && identity.text.isEmpty && identity.project == nil && identity.tag == nil ? nil : readSearchRows(identity, client: client)
                let (loaded, matching) = try await (catalogRead, matchingRead)
                catalog = loaded
                filteredResponse = matching ?? loaded.tasks
                currentPlanning = loaded.views[identity.view]
            } else {
                async let matchingRead = readSearchRows(identity, client: client)
                async let planningRead = readSearchPlanning(profile: identity.profile, view: identity.view, client: client)
                (filteredResponse, currentPlanning) = try await (matchingRead, planningRead)
                catalog = nil
            }
            let filtered = filteredResponse.filter {
                (identity.project == nil || $0.project_id == identity.project) && (identity.tag == nil || $0.tags.contains(identity.tag ?? ""))
            }
            guard canPublishSearch(run: run, request: request, identity: identity) else { return .superseded }
            let byID = Dictionary(uniqueKeysWithValues: filtered.map { ($0.id, $0) })
            let groups = currentPlanning?.groups.compactMap { group -> PlanningResult.Group? in
                let rows = group.tasks.compactMap { byID[$0.id] }
                return rows.isEmpty ? nil : .init(name: group.name, tasks: rows)
            } ?? []
            appliedSearchSnapshot = .init(appliedIdentity: identity, rows: identity.view == "all" ? filtered : groups.flatMap(\.tasks), groups: groups)
            matchingTaskIDs = identity.filters.isEmpty ? nil : Set(filtered.map(\.id))
            taskFilters = identity.filters
            planning = currentPlanning
            if let catalog {
                tasks = catalog.tasks
                profiles = catalog.profiles
                projects = catalog.projects.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                tags = catalog.tags.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                viewCounts = catalog.views.mapValues { $0.groups.flatMap(\.tasks).filter { $0.status == "open" }.count }
                viewCounts["all"] = catalog.tasks.filter { $0.status == "open" }.count
                catalogReady = true
                catalogStale = catalogRevision != catalogSignalRevision
                lastCatalogReadAt = catalogNow()
                if !catalogStale { pendingCatalogTrigger = nil }
            }
            loading = false
            taskLoadError = nil
            searchError = nil
            searchPhase = .showing
            appliedCatalogGeneration = restoreGeneration
            appliedCatalogCursor = lastSequence
            return .applied
        } catch {
            // A 401 for the current credential ends the Session even if this refresh was cancelled or
            // superseded by a newer one of the same scope (S1-20); publication below stays guarded.
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            guard isCurrentCredential(credentialEpoch) else { return .superseded }
            guard canPublishSearch(run: run, request: request, identity: identity) else { return .superseded }
            if let refusal = failure(error), refusal.code == "search_too_broad" {
                requestedTaskFilters = taskFilters
                taskLoadError = nil
                searchError = .tooBroad(refusal.humanMessage, context: TaskSearchPresentation.appliedContext(appliedSearchSnapshot?.appliedIdentity.text))
            } else if taskFilters != identity.filters {
                requestedTaskFilters = taskFilters
                taskLoadError = "Could not apply filters. Your previous filters are still active."
            } else if !identity.text.isEmpty || appliedSearchSnapshot?.appliedIdentity.text.isEmpty == false {
                searchError = .transient("Couldn't search. \(TaskSearchPresentation.appliedContext(appliedSearchSnapshot?.appliedIdentity.text))")
            } else {
                taskLoadError = describe(error, at: .taskLoad)
            }
            loading = false
            searchPhase = .error
            return .failed
        }
    }

    private func readSearchRows(_ identity: TaskSearchIdentity, client: Client, filtered: Bool = true) async throws -> [TaskSnapshot] {
        let recordingScope = clientDiagnostics.scopeToken
        var query = filtered ? identity.filters.query : .init()
        query.order = .init(rawValue: identity.filters.order)
        if filtered {
            query.text = identity.text.isEmpty ? nil : identity.text
            if query.project == nil { query.project = projects.first { $0.id == identity.project }?.name }
            if query.tag == nil, let name = tags.first(where: { $0.id == identity.tag })?.name,
               let first = name.unicodeScalars.first, let last = name.unicodeScalars.last,
               !Self.tagNameEdges.contains(first), !Self.tagNameEdges.contains(last) {
                query.tag = name
            }
        }
        let wire = try await client.tasks_period_list(path: .init(profile: identity.profile), query: query).ok.body.json
        let started = ProcessInfo.processInfo.systemUptime
        defer { recordClientDecode(started, scope: recordingScope) }
        return try wire.map(TaskSnapshot.decode)
    }

    private func readSearchPlanning(profile: String, view: String, client: Client) async throws -> PlanningResult? {
        guard let name = Operations.reads_period_view.Input.Path.viewPayload(rawValue: view) else { return nil }
        let recordingScope = clientDiagnostics.scopeToken
        let wire = try await client.reads_period_view(path: .init(profile: profile, view: name)).ok.body.json
        return try decode(PlanningResult.self, wire, recordingScope: recordingScope)
    }

    private func readSearchCatalog(_ identity: TaskSearchIdentity, client: Client) async throws -> TaskSearchCatalog {
        let recordingScope = clientDiagnostics.scopeToken
        async let tasks = readSearchRows(identity, client: client, filtered: false)
        async let profiles = client.reads_period_profiles().ok.body.json
        async let projects = client.reads_period_projects(path: .init(profile: identity.profile)).ok.body.json
        async let tags = client.reads_period_tags(path: .init(profile: identity.profile)).ok.body.json
        async let today = readSearchPlanning(profile: identity.profile, view: "today", client: client)
        async let overdue = readSearchPlanning(profile: identity.profile, view: "overdue", client: client)
        async let scheduled = readSearchPlanning(profile: identity.profile, view: "scheduled", client: client)
        async let inbox = readSearchPlanning(profile: identity.profile, view: "inbox", client: client)
        let (rows, profileValues, projectValues, tagValues, todayView, overdueView, scheduledView, inboxView) = try await (tasks, profiles, projects, tags, today, overdue, scheduled, inbox)
        return try .init(tasks: rows, profiles: decode([DiscoveryEntry].self, profileValues, recordingScope: recordingScope), projects: decode([DiscoveryEntry].self, projectValues, recordingScope: recordingScope), tags: decode([DiscoveryEntry].self, tagValues, recordingScope: recordingScope), views: ["today": todayView, "overdue": overdueView, "scheduled": scheduledView, "inbox": inboxView].compactMapValues { $0 })
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
        await refresh(generation: generation, scope: .query, trigger: .search)
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

    private func followChanges(generation run: Int, openingAction initialAction: UUID?) async {
        let credentialEpoch = discovery.credentialEpoch
        var attempt = 0, quietEnds = 0
        var openingAction = initialAction
        while !Task.isCancelled && generation == run {
            var sawReady = false
            // Ready after this attempt may clear only connection messages older than the attempt.
            let mark = messageMark
            let openedAt = ProcessInfo.processInfo.systemUptime
            do {
                let healthy = try await ClientDiagnosticContext.$actionID.withValue(openingAction) {
                    try await ClientDiagnosticContext.$periodicPoll.withValue(openingAction == nil) { try await checkServerContract() }
                }
                guard generation == run, !Task.isCancelled else { return }
                guard healthy else { loading = false; return }
                let response = try await ClientDiagnosticContext.$actionID.withValue(openingAction) {
                    try await client.changes_period_stream(path: .init(profile: profile), headers: .init(last_hyphen_event_hyphen_id: lastSequence, x_hyphen_todo_hyphen_client: .swiftui, x_hyphen_todo_hyphen_generation: restoreGeneration))
                }
                guard generation == run, !Task.isCancelled else { return }
                var streamConnected = ClientDiagnosticEvent(name: .streamConnected, run: clientDiagnostics.run)
                streamConnected.reason = .ready
                clientDiagnostics.record(streamConnected)
                resumeSequence = lastSequence
                let body = try response.ok.body.text_event_hyphen_stream
                var parser = EventStreamDecoder()
                for try await chunk in body {
                    for event in try parser.append(chunk) {
                        guard generation == run, !Task.isCancelled else { return }
                        if event.name == "ready" {
                            let recovering = connection != .live
                            let healthySnapshot = catalogReady && !catalogStale && appliedCatalogGeneration == restoreGeneration && appliedCatalogCursor == lastSequence
                                && appliedSearchSnapshot?.appliedIdentity == requestedIdentity && searchError == nil && taskLoadError == nil && searchPhase == .showing && !loading
                            if !healthySnapshot {
                                _ = await ClientDiagnosticContext.$actionID.withValue(openingAction) { await refresh(generation: run, trigger: .streamReady) }
                            }
                            guard generation == run, !Task.isCancelled else { return }
                            if connection != .live { connection = .live }
                            if !healthySnapshot || recovering {
                                await refreshDependencyReads()
                                guard generation == run, !Task.isCancelled else { return }
                                clearMessage([.connection], since: mark)
                            }
                            if discovery.phase == .offline { await requestDiscovery(retry: true) }
                            sawReady = true
                            openingAction = nil
                            attempt = 0
                        } else if event.name == "reload" {
                            let reload = try JSONDecoder().decode(SnapshotReload.self, from: Data(event.data.utf8))
                            // A Snapshot reload replaces the whole scope, so no message of the old one survives it.
                            endMessage()
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
                            dependencies.reset()
                            tasks = []; projects = []; tags = []; planning = nil; viewCounts = [:]
                            selectedProject = nil; selectedTag = nil
                            appliedSearchSnapshot = nil
                            catalogReady = false
                            catalogStale = true
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
                            quietEnds = 0
                            let wire = try JSONDecoder().decode(Components.Schemas.CommittedOperation.self, from: Data(event.data.utf8))
                            let operation = try decode(CommittedOperation.self, wire)
                            guard operation.outcome == "committed", operation.profile == profile,
                                  let id = event.id, Int64(id) == operation.seq else { throw StreamError.invalidUTF8 }
                            if let cursor = lastSequence.flatMap(Int64.init), operation.seq <= cursor { continue }
                            if operation.event.kind == "ProfileDeleted" {
                                try await leaveDeletedProfile(named: operation.event.profile?.name)
                                return
                            }
                            catalogStale = true
                            let applied = await refresh(generation: run, trigger: .streamOperation)
                            guard generation == run, !Task.isCancelled else { return }
                            await refreshDependencyReads(erased: operation.event.kind == "TaskPurged" || operation.event.original_kind == "TaskPurged")
                            guard generation == run, !Task.isCancelled else { return }
                            if operation.event.kind == "ReminderFired" {
                                try await reminders.deliver(operation, server: configuration.server.absoluteString, profile: profile)
                            }
                            guard generation == run, !Task.isCancelled else { return }
                            lastSequence = id
                            if applied == .applied { appliedCatalogCursor = id }
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
            publishMessage(describe(error), kind: .connection) }
                }
                let cause: ClientDiagnosticReason
                if case .closed? = error as? StreamError { cause = .cleanEnd } else { cause = ClientDiagnosticReason(error: error) }
                var streamDrop = ClientDiagnosticEvent(name: .streamDropped, run: clientDiagnostics.run)
                streamDrop.reason = cause
                clientDiagnostics.record(streamDrop)
                if sawReady && (cause == .cleanEnd || cause == .timeout || cause == .transport) {
                    reconnectCount += 1
                    if ProcessInfo.processInfo.systemUptime - openedAt > 1 { quietEnds = 0 }
                    quietEnds += 1
                    if quietEnds > 1 {
                        do { try await Task.sleep(for: .seconds(min(8, quietEnds - 1))) } catch { return }
                    }
                    continue
                }
                connection = .offline
                loading = false
                publishMessage(describe(error), kind: .connection)
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
        var committed = false // the write's reply came back OK: its read-back cannot be skipped (S1-19)
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite else { return false }
        let title = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return false }
        let client = self.client
        let creationProfile = profile
        let initialDependencies = dependencies.initial.map(\.id)
        let removedFields = removedQuickAddFields
        // The quick-add instance this creation belongs to; nil when created outside quick-add.
        let surface: MessageSurface? = quickAdd ? .quickAdd(quickAddInstance) : nil
        let mark = messageMark
        busy = true
        let createTicket = quickAddMessages.restart(.create)
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            let parsed = try await parse(title, client: client, profile: creationProfile).removing(removedFields)
            var value: [String: Any] = ["title": parsed.title]
            if let priority = parsed.priority { value["priority"] = priority }
            if let due = parsed.due_at { value["due_at"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(due)) }
            if let scheduled = parsed.scheduled_at { value["scheduled_at"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(scheduled)) }
            if let name = parsed.project { value["project_name"] = name }
            value["tag_names"] = parsed.tags
            if !initialDependencies.isEmpty { value["depends_on"] = initialDependencies }
            guard isCurrentCredential(credentialEpoch), profile == creationProfile else { return false }
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: value))
            let response = try await client.tasks_period_create(path: .init(profile: profile), body: .json(payload))
            if case .ok = response { committed = true }
            let wire = try response.ok.body.json
            guard isCurrentCredential(credentialEpoch), profile == creationProfile else { return false }
            let task = try TaskSnapshot.decode(wire)
            // A closed or reopened quick-add keeps the newer draft: the created Task reaches the
            // list, and nothing is cleared, closed, opened or announced for the old instance.
            // Only the newest create of this instance presents; an older one's Task still lands.
            let showing = (surface.map(isShowing) ?? true) && quickAddMessages.succeed(createTicket)
            if showing {
                dependencies.latestWarnings = try (wire.dependency_warnings ?? []).map { try decode(DependencyWarning.self, $0).notice }
                newTitle = ""
                removedQuickAddFields = []
                dependencies.initial = []
                quickAdd = false
                if openEditor {
                    if hasUnsavedEditor { pendingNavigation = .edit(task) }
                    else { beginEditing(task, focusTitle: true) }
                }
                announce("Task added to \(profileName)")
                // It closed its own quick-add, so its read-back belongs to the main window. Who may
                // present is asked after the read-back, never carried across it (S1-17).
                await refreshAfterWrite("Task added", owner: .mainWindow(.init(createTicket)))
            } else {
                await refreshAfterWrite("Task added", owner: surface.map { .surface($0, .init(createTicket)) } ?? .mainWindow(.init(createTicket)))
            }
            guard isCurrentCredential(credentialEpoch), profile == creationProfile else { return false }
            // Asked now, after the read-back: a superseded create presents nothing anywhere (S1-16):
            // no clearing of an earlier hand-off, no "Task added" capsule. Its Task still reached the list.
            guard createTicket.isNewest else { return false }
            clearMessage([.quickAdd], since: mark)
            // A Task the current view filters out (no date in Today, say) is confirmed quietly.
            if !showsInCurrentView(task.id) { deletionNotice = "Task added" }
            // The caller's view acts on true (dismisses itself or opens the Tasks window). Asked now:
            // the newest create of the quick-add instance that is current; the view checks its own
            // opening as well.
            return quickAddMessages.isNewest(createTicket)
        } catch {
            authorize(error, epoch: credentialEpoch, profile: creationProfile)
            guard isCurrentCredential(credentialEpoch), profile == creationProfile else { return false }
            // A committed create whose reply could not be used still reads the catalog back (S1-19).
            if committed || committedBeforeFailure(error) {
                await refreshAfterWrite("Task added", owner: surface.map { .surface($0, .init(createTicket)) } ?? .mainWindow(.init(createTicket)))
                guard isCurrentCredential(credentialEpoch), profile == creationProfile else { return false }
            }
            if surface.map(isShowing) ?? true { quickAddMessages.fail(describe(error, at: .quickAdd), createTicket); return false }
            // The quick-add that started this was closed during the create (Escape is not gated by
            // busy): the newest create of that instance hands one named message to the main window,
            // so the failure is not silent. A superseded create hands off nothing (S1-16).
            handOff("Couldn't add “\(title)”. " + describe(error), kind: .quickAdd, from: createTicket)
            return false }
    }

    @discardableResult
    func save() async -> TaskSnapshot? {
        var committed = false // the write's reply came back OK: its read-back cannot be skipped (S1-19)
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite, let draft = editor else { return nil }
        let requestedProfile = profile
        writeIntent = nil
        busy = true
        let saveTicket = editorMessages.beginClean(.save)
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            let payload = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: draft.changesData())
            let response = try await client.tasks_period_edit(path: .init(profile: profile, task: draft.id), body: .json(payload))
            if case .ok = response { committed = true }
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return nil }
            // Presentation belongs to the editor opening that started the Save, and to the newest Save.
            let showing = editor?.opening == draft.opening && editorMessages.isNewest(saveTicket)
            if case .conflict(let response) = response {
                guard showing else { return nil }
                struct Payload: Decodable { let latest: TaskSnapshot? }
                let payload = try JSONDecoder().decode(Payload.self, from: JSONEncoder().encode(response.body.json))
                conflict = TaskConflict(latest: payload.latest)
                announce("Conflict. Choose which changes to keep.")
                return nil
            }
            let saved = try TaskSnapshot.decode(response.ok.body.json)
            if showing {
                editor = nil
                conflict = nil
                writeIntent = nil
                announce("Task saved")
                // It closed its own editor, so its read-back belongs to the main window; who may present
                // is asked after the read-back (S1-17).
                await refreshAfterWrite("Task saved", owner: .mainWindow(.init(saveTicket)))
            } else {
                await refreshAfterWrite("Task saved", owner: .surface(.editor(draft.opening), .init(saveTicket)))
            }
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return nil }
            return saved
        } catch {
            authorize(error, epoch: credentialEpoch, profile: requestedProfile)
            // A committed Save whose reply could not be used still reads the catalog back (S1-19).
            if committed || committedBeforeFailure(error), isCurrentCredential(credentialEpoch), profile == requestedProfile {
                await refreshAfterWrite("Task saved", owner: .surface(.editor(draft.opening), .init(saveTicket)))
            }
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile, editor?.opening == draft.opening else { return nil }
            editorMessages.fail(describe(error, at: .editor), saveTicket); return nil }
    }

    func refreshConflictDefinitions() async {
        let credentialEpoch = discovery.credentialEpoch
        guard outdatedServerBuild == nil else { return }
        let requestedProfile = profile
        let client = self.client
        let conflictTicket = editorMessages.begin(.conflict)
        do {
            let projectValues = try await client.reads_period_projects(path: .init(profile: requestedProfile)).ok.body.json
            let tagValues = try await client.reads_period_tags(path: .init(profile: requestedProfile)).ok.body.json
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile, conflict != nil else { return }
            projects = try decode([DiscoveryEntry].self, projectValues).sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            tags = try decode([DiscoveryEntry].self, tagValues).sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            editorMessages.succeed(conflictTicket)
        } catch {
            // A 401 for the current credential ends the Session even if this action is no longer wanted (S1-20).
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            guard isCurrentCredential(credentialEpoch) else { return }
            let failureText = describe(error, at: .editor)
            editorMessages.fail(failureText, conflictTicket) }
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
        if case .showDiscovery(let intent) = target, !canShowDiscovery(intent) { return false }
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

    func dismissNavigationPrompt() {
        pendingNavigation = nil
    }

    func cancelNavigation() {
        dismissNavigationPrompt()
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
        clientDiagnosticsUI.inspectorPublished(task.id)
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
        var committed = false // the write's reply came back OK: its read-back cannot be skipped (S1-19)
        let credentialEpoch = discovery.credentialEpoch
        let mark = messageMark
        guard canWrite else { return }
        let requestedProfile = profile
        busy = true
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            let data = try JSONSerialization.data(withJSONObject: ["from_version": task.row_version, "action": action])
            let payload = try JSONDecoder().decode(Operations.tasks_period_transition.Input.Body.jsonPayload.self, from: data)
            let response = try await client.tasks_period_transition(path: .init(profile: profile, task: task.id), body: .json(payload))
            if case .ok = response { committed = true }
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
            if case .conflict = response {
                _ = await refresh(generation: generation)
                guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
                let text = "The Task changed. Close and reopen it before trying that action again."
                // Asked now: only an editor showing this Task carries the text too (S1-17).
                if editor?.id == task.id { editorError = text }
                publishMessage(text, kind: .transition)
                return
            }
            _ = try response.ok.body.json
            if editor?.id == task.id { editor = nil }
            await refreshAfterWrite("Task updated", clearing: .transition, since: mark)
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
            announce("Task updated")
        } catch {
            // A 401 for the current credential ends the Session even if this action is no longer wanted (S1-20).
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            guard isCurrentCredential(credentialEpoch) else { return }
            // A committed transition whose reply could not be used still reads the catalog back (S1-19).
            if committed || committedBeforeFailure(error), profile == requestedProfile {
                await refreshAfterWrite("Task updated")
                guard isCurrentCredential(credentialEpoch) else { return }
            }
            publishMessage(describe(error, dependencyContext: action == "complete" ? .complete : .reopen), kind: .transition)
            if editor?.id == task.id { editorError = describe(error, at: .editor, dependencyContext: action == "complete" ? .complete : .reopen) } }
    }

    func deleteTask(_ task: TaskSnapshot) async {
        var committed = false // the write's reply came back OK: its read-back cannot be skipped (S1-19)
        let credentialEpoch = discovery.credentialEpoch
        let mark = messageMark
        guard canWrite else { return }
        guard let preview = dependencies.deletion, preview.profile == profile, preview.task.id == task.id, preview.task.row_version == task.row_version, let fromVersion = preview.acceptedFromVersion, let fingerprint = preview.fingerprint else {
            await openDependencyDelete(task)
            return
        }
        let deletionProfile = profile
        guard let deleteTicket = dependencies.deletion?.messages.begin(.delete) else { return }
        busy = true
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            let response = try await client.tasks_period_delete(path: .init(profile: profile, task: task.id), query: .init(from_version: String(fromVersion), with_dependencies: ._true, dependency_fingerprint: fingerprint))
            if case .ok = response { committed = true }
            guard isCurrentCredential(credentialEpoch), profile == deletionProfile else { return }
            if case .conflict(let conflict) = response {
                // A closed confirmation shows nothing; there is no committed delete to apply.
                guard dependencies.deletion?.id == preview.id else { return }
                let failureNotice = try dependencyNotice(dependencyConflict(conflict.body.json), context: .delete)
                dependencies.deletion?.messages.fail(failureNotice, deleteTicket)
                await reloadDependencyDelete(changed: true)
                guard isCurrentCredential(credentialEpoch), profile == deletionProfile, dependencies.deletion?.id == preview.id else { return }
                if editor?.id == task.id { editorError = "The Task changed. Close and reopen it before deleting." }
                else { publishMessage("The task changed before it could be deleted.", kind: .delete, surface: .deleteDialog(preview.id)) }
                return
            }
            let wire = try response.ok.body.json
            let deleted = try TaskSnapshot.decode(wire)
            guard wire.dry_run != true, deleted.id == task.id, deleted.profile_id == deletionProfile,
                  wire.confirm_from_version == nil || wire.confirm_from_version == fromVersion,
                  deleted.row_version == fromVersion + 1, deleted.deleted_at != nil else { throw DependencyGraphReply.ProtocolError.incompatible }
            if editor?.id == task.id {
                editor = nil
                conflict = nil
                writeIntent = nil
                recurrenceDraft = nil
                series = nil
                pendingNavigation = nil
                deletionNotice = "Task deleted"
            }
            // The committed delete reaches the editor and the list even if this confirmation has closed.
            let showing = dependencies.deletion?.id == preview.id
            endMessage(raisedBy: .deleteDialog(preview.id))
            if showing {
                dependencies.deletion = nil
                // It closed its own confirmation, so its read-back belongs to the main window; who may
                // present is asked after the read-back (S1-17).
                await refreshAfterWrite("Task deleted", clearing: .delete, since: mark, owner: .mainWindow(.init(deleteTicket)))
            } else {
                await refreshAfterWrite("Task deleted", clearing: .delete, since: mark, owner: .surface(.deleteDialog(preview.id), .init(deleteTicket)))
            }
        } catch {
            authorize(error, epoch: credentialEpoch, profile: deletionProfile)
            guard isCurrentCredential(credentialEpoch) else { return }
            // A committed delete whose reply could not be used still reads the catalog back (S1-19).
            if committed || committedBeforeFailure(error), profile == deletionProfile {
                await refreshAfterWrite("Task deleted", clearing: .delete, since: mark, owner: .surface(.deleteDialog(preview.id), .init(deleteTicket)))
                guard isCurrentCredential(credentialEpoch) else { return }
            }
            guard profile == deletionProfile, dependencies.deletion?.id == preview.id else { return }
            if error is DependencyGraphReply.ProtocolError {
                dependencies.deletion?.messages.fail(.init(message: "The server response could not be read. Reload Dependencies before confirming again."), deleteTicket)
                dependencies.deletion?.fingerprint = nil
                dependencies.deletion?.acceptedFromVersion = nil
                dependencies.deletion?.changed = true
                return
            }
            let notice = dependencyNotice(error, context: .delete)
            dependencies.deletion?.messages.fail(notice, deleteTicket)
            if notice.failure?.code == "has_dependencies" || notice.failure?.code == "occ_conflict" { await reloadDependencyDelete(changed: true) }
        }
    }

    func write(_ intent: TaskWriteIntent) async {
        var committed = false // the write's reply came back OK: its read-back cannot be skipped (S1-19)
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite, let draft = editor else { return }
        let requestedProfile = profile
        transferResult = nil
        busy = true
        if case .editSeries(let recurrence) = intent { recurrenceDraft = recurrence }
        writeIntent = nil
        historyGeneration += 1
        seriesGeneration += 1
        seriesLoading = false
        let writeTicket = editorMessages.beginClean(.write)
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            let task: TaskSnapshot
            var removedDependencies: [DependencyEdge] = []
            switch intent {
            case .move(let destination):
                let response = try await client.tasks_period_move(path: .init(profile: profile, task: draft.id), body: .json(.init(from_version: draft.base.row_version, destination_profile: destination)))
                if case .ok = response { committed = true }
                guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
                if case .conflict(let value) = response { if editor?.opening == draft.opening && editorMessages.isNewest(writeTicket) { try acceptConflict(value.body.json, intent: intent) }; return }
                let wire = try response.ok.body.json
                task = try TaskSnapshot.decode(wire)
                removedDependencies = try (wire.removed_dependencies ?? []).map { try decode(DependencyEdge.self, $0) }
            case .copy(let destination):
                let response = try await client.tasks_period_copy(path: .init(profile: profile, task: draft.id), body: .json(.init(from_version: draft.base.row_version, destination_profile: destination)))
                if case .ok = response { committed = true }
                guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
                if case .conflict(let value) = response { if editor?.opening == draft.opening && editorMessages.isNewest(writeTicket) { try acceptConflict(value.body.json, intent: intent) }; return }
                task = try TaskSnapshot.decode(response.ok.body.json)
            case .revert(let seq):
                let response = try await client.tasks_period_revert(path: .init(profile: profile, task: draft.id), body: .json(.init(from_version: draft.base.row_version, seq: Int(seq))))
                if case .ok = response { committed = true }
                guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
                if case .conflict(let value) = response { if editor?.opening == draft.opening && editorMessages.isNewest(writeTicket) { try acceptConflict(value.body.json, intent: intent) }; return }
                task = try TaskSnapshot.decode(response.ok.body.json)
            case .skipOccurrence:
                let response = try await client.tasks_period_skipOccurrence(path: .init(profile: profile, task: draft.id), body: .json(.init(from_version: draft.base.row_version)))
                if case .ok = response { committed = true }
                guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
                if case .conflict(let value) = response { if editor?.opening == draft.opening && editorMessages.isNewest(writeTicket) { try acceptConflict(value.body.json, intent: intent) }; return }
                task = try TaskSnapshot.decode(response.ok.body.json)
            case .editSeries(let recurrence):
                let payload = try JSONDecoder().decode(Operations.tasks_period_editSeries.Input.Body.jsonPayload.self, from: draft.seriesData(recurrence))
                let response = try await client.tasks_period_editSeries(path: .init(profile: profile, task: draft.id), body: .json(payload))
                if case .ok = response { committed = true }
                guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
                if case .conflict(let value) = response { if editor?.opening == draft.opening && editorMessages.isNewest(writeTicket) { try acceptConflict(value.body.json, intent: intent) }; return }
                task = try TaskSnapshot.decode(response.ok.body.json)
            }
            // Presentation belongs to the editor opening that started the write; the data steps below
            // (the read-back, removing a moved Task from the list) run for any current owner.
            let showing = editor?.opening == draft.opening && editorMessages.isNewest(writeTicket)
            guard showing else {
                if let transfer = intent.transfer, transfer.kind == .move {
                    tasks.removeAll { $0.id == task.id }
                    if let current = planning { planning = PlanningResult(name: current.name, groups: current.groups.map { .init(name: $0.name, tasks: $0.tasks.filter { $0.id != task.id }) }) }
                }
                await refreshAfterWrite("Task updated", owner: .surface(.editor(draft.opening), .init(writeTicket)))
                return
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
                // A Move closes its own editor, so its read-back belongs to the main window; a Copy's
                // stays with its editor opening. Who may present is asked after the read-back (S1-17).
                if transfer.kind == .move {
                    editor = nil
                    await refreshAfterWrite("Task updated", owner: .mainWindow(.init(writeTicket)))
                } else {
                    await refreshAfterWrite("Task updated", owner: .surface(.editor(draft.opening), .init(writeTicket)))
                }
                guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
                if transfer.kind == .move {
                    tasks.removeAll { $0.id == task.id }
                    if let current = planning {
                        planning = PlanningResult(name: current.name, groups: current.groups.map { .init(name: $0.name, tasks: $0.tasks.filter { $0.id != task.id }) })
                    }
                }
                // Asked now: the newest write of this opening, and its surface. A Move closed its editor,
                // so no newer editor may have opened since; a Copy's editor must still be the one
                // showing (a Copy closed during its read-back reports nothing).
                guard writeTicket.isNewest, transfer.kind == .move ? editor == nil : editor?.opening == draft.opening else { return }
                transferResult = TaskTransferResult(kind: transfer.kind, task: task, profileName: name, removedDependencies: removedDependencies)
                announce(transferResult?.message ?? "Task updated")
                return
            }
            if task.profile_id != profile {
                editor = nil
                activateProfile(task.profile_id)
                if task.deleted_at == nil {
                    var moved = task.id == draft.id ? draft.merging(task, choices: [:]) : TaskDraft(task)
                    moved.opening = draft.opening
                    moved.project = task.project_id
                    moved.projectName = nil
                    moved.tagNames = []
                    moved.tags = task.tags
                    editor = moved
                }
            } else {
                editor = task.deleted_at != nil ? nil : intent.mergesFields ? TaskDraft(task) : draft.merging(task, choices: [:])
                editor?.opening = draft.opening
                await refreshAfterWrite("Task updated", owner: .surface(.editor(draft.opening), .init(writeTicket)))
                guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
            }
            guard isCurrentCredential(credentialEpoch) else { return }
            // Asked now, after any read-back: only the newest write of an opening that is still showing
            // (or whose Task was deleted by this write) announces.
            guard writeTicket.isNewest, editor == nil || editor?.opening == draft.opening else { return }
            announce("Task updated")
        } catch {
            authorize(error, epoch: credentialEpoch, profile: requestedProfile)
            // A committed write whose reply could not be used still reads the catalog back (S1-19).
            if committed || committedBeforeFailure(error), isCurrentCredential(credentialEpoch), profile == requestedProfile {
                await refreshAfterWrite("Task updated", owner: .surface(.editor(draft.opening), .init(writeTicket)))
            }
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile, editor?.opening == draft.opening else { return }
            let context: DependencyActionContext
            if case .revert = intent { context = .revert } else { context = .link }
            if editorMessages.fail(describe(error, at: .editor, dependencyContext: context), writeTicket), intent.transfer != nil { writeIntent = intent }
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

    /// Opens the Series sheet: loads the definition, then shows the sheet only if, at that moment,
    /// this load is still the newest of its editor opening (S1-17: nothing decided before the
    /// awaits is used after them).
    func openSeries() async {
        guard let ticket = await readSeries() else { return }
        if editorMessages.isNewest(ticket) { showingSeries = true }
    }
    /// Loads the Series definition in the background; never presents the sheet.
    func loadSeries() async { _ = await readSeries() }
    /// Returns the load's ticket when it applied a definition.
    private func readSeries() async -> SurfaceMessages<EditorMessageKind, String>.Ticket? {
        let credentialEpoch = discovery.credentialEpoch
        guard outdatedServerBuild == nil else { return nil }
        guard canWrite, let draft = editor else { return nil }
        let client = self.client
        seriesGeneration += 1
        let request = seriesGeneration
        let requestedProfile = profile
        seriesLoading = true
        let seriesTicket = editorMessages.restart(.series)
        defer { if seriesGeneration == request { seriesLoading = false } }
        do {
            let tasks = try await client.tasks_period_list(path: .init(profile: requestedProfile)).ok.body.json.map(TaskSnapshot.decode)
            guard let current = tasks.first(where: { $0.id == draft.id }) else { throw DraftError.unavailable }
            var queue = current.seriesKey == nil ? [] : tasks.filter { $0.seriesKey == current.seriesKey }.map(\.id)
            var seen: Set<String> = []
            var entries: [HistoryEntry] = []
            while let id = queue.popLast() {
                guard isCurrentCredential(credentialEpoch), seriesGeneration == request, profile == requestedProfile, editor?.id == draft.id else { return nil }
                guard seen.insert(id).inserted else { continue }
                let history = try await client.reads_period_history(path: .init(profile: requestedProfile, task: id)).ok.body.json
                let decoded = try decode([HistoryEntry].self, history)
                entries += decoded
                let committed = decoded.filter { $0.outcome == "committed" }
                queue += committed.flatMap { $0.event.relatedTasks }.filter { $0.seriesKey == current.seriesKey && !seen.contains($0.id) }.map(\.id)
                queue += committed.flatMap { $0.event.redactedTaskIDs }.filter { !seen.contains($0) }
            }
            guard !Task.isCancelled, seriesGeneration == request, profile == requestedProfile, editor?.id == draft.id else { return nil }
            let definition = HistoryEntry.series(for: current, entries: entries)
            guard current.occurrence == nil || definition != nil else { throw DraftError.missingSeries }
            series = definition
            return seriesTicket
        } catch {
            authorize(error, epoch: credentialEpoch, profile: requestedProfile)
            guard isCurrentCredential(credentialEpoch) else { return nil }
            guard !Task.isCancelled, seriesGeneration == request, profile == requestedProfile, editor?.opening == draft.opening else { return nil }
            let failureText = describe(error, at: .editor)
            editorMessages.fail(failureText, seriesTicket)
            return nil
        }
    }

    func saveSeries(_ recurrence: Recurrence) async {
        var committed = false // the write's reply came back OK: its read-back cannot be skipped (S1-19)
        let credentialEpoch = discovery.credentialEpoch
        let requestedProfile = profile
        guard canWrite else { return }
        recurrenceDraft = recurrence
        if series == nil, editor?.base.occurrence != nil {
            editorError = DraftError.missingSeries.localizedDescription
            return
        }
        if series != nil { await write(.editSeries(recurrence)); return }
        guard canWrite, let draft = editor else { return }
        busy = true
        let seriesSaveTicket = editorMessages.beginClean(.seriesSave)
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            let payload = try JSONDecoder().decode(Operations.tasks_period_createSeries.Input.Body.jsonPayload.self, from: draft.newSeriesData(recurrence, dependsOn: dependencies.firstOccurrenceInitial.map(\.id)))
            let response = try await client.tasks_period_createSeries(path: .init(profile: requestedProfile), body: .json(payload))
            if case .ok = response { committed = true }
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
            if case .conflict = response { editorMessages.fail("Conflict: the Series was not created. Your draft is preserved.", seriesSaveTicket); return }
            let wire = try response.ok.body.json
            let created = try TaskSnapshot.decode(wire)
            dependencies.latestWarnings = try (wire.dependency_warnings ?? []).map { try decode(DependencyWarning.self, $0).notice }
            dependencies.firstOccurrenceInitial = []
            beginEditing(created)
            if let id = created.occurrence?.series_id {
                series = SeriesDefinition(id: id, profile_id: created.profile_id, recurrence: recurrence, deleted_at: nil)
            }
            await refreshAfterWrite("Series created")
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
            announce("Series created")
        } catch {
            authorize(error, epoch: credentialEpoch, profile: requestedProfile)
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
            // A committed Series whose reply could not be used still reads the catalog back (S1-19).
            if committed || committedBeforeFailure(error) {
                await refreshAfterWrite("Series created", owner: .mainWindow(.init(seriesSaveTicket)))
                guard isCurrentCredential(credentialEpoch), profile == requestedProfile else { return }
            }
            editorMessages.fail(describe(error, at: .editor), seriesSaveTicket) }
    }

    private func discoverProfiles() async throws {
        let credentialEpoch = discovery.credentialEpoch
        let value = try await client.reads_period_profiles().ok.body.json
        guard isCurrentCredential(credentialEpoch) else { return }
        profiles = try decode([DiscoveryEntry].self, value)
        if !profiles.contains(where: { $0.id == profile }), let first = profiles.first { profile = first.id }
    }

    /// `kind` and `writeMark` name the write whose success this read-back confirms: its
    /// earlier error of that kind and older connection messages end; nothing newer does.
    ///
    /// `owner` says who may present the read-back's own outcome. It is asked at the moment of
    /// publishing, after the read-back's await, never before (MAC-C1-S1-17): no "may present",
    /// "is showing" or "is newest" value crosses the await. A superseded action, or one whose
    /// surface instance is no longer showing, raises no message and clears no message of its kind;
    /// a failed read-back is then left to the ordinary connection recovery.
    func refreshAfterWrite(_ accepted: String, clearing kind: MessageKind? = nil, since writeMark: Int? = nil, owner: ReadBackOwner = .mainWindow(nil)) async {
        let credentialEpoch = discovery.credentialEpoch
        let mark = writeMark ?? messageMark
        catalogStale = true
        let result = await refresh(generation: generation, trigger: .ownWrite)
        guard isCurrentCredential(credentialEpoch) else { return }
        switch result {
        case .applied:
            // A good read proves the connection; the write's own kind ends only for its owner.
            clearMessage([MessageKind.connection], since: mark)
            if let kind, owner.mayPresent(in: self) { clearMessage([kind], since: mark) }
        case .failed:
            if signedIn {
                if owner.mayPresent(in: self) { publishMessage(accepted + ". The live view is reconnecting.", kind: .connection) }
                connect()
            }
        case .superseded:
            break
        }
    }

    /// Whether a write failed after the server committed it: its reply was a success the client
    /// could not read (S1-19). Callers also note `committed` once a reply is the OK case, so a later
    /// step (a secondary read, a check on the reply) cannot skip the read-back either.
    func committedBeforeFailure(_ error: Error) -> Bool {
        guard let failure = error as? ClientError, let status = failure.response?.status else { return false }
        return status.kind == .successful
    }

    /// Whether the list as currently shown (view, search, Project, Tag and filters) includes `id`.
    func showsInCurrentView(_ id: String) -> Bool {
        let rows = appliedSearchSnapshot?.rows ?? (selectedView == "all" ? tasks : planning?.groups.flatMap(\.tasks) ?? [])
        return rows.contains { task in
            task.id == id && (selectedProject == nil || task.project_id == selectedProject) && (selectedTag == nil || task.tags.contains(selectedTag ?? ""))
                && (taskFilters.isEmpty || (matchingTaskIDs?.contains(task.id) ?? true))
        }
    }

    func selectView(_ name: String) {
        invalidateSearch()
        selectedView = name
        tasks = []
        planning = nil
        appliedSearchSnapshot = nil
        catalogReady = false
        catalogStale = true
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
        Task { await refresh(generation: run, scope: .query, trigger: .filterChange) }
    }

    func parseDraft() async {
        let credentialEpoch = discovery.credentialEpoch
        let requestedProfile = profile
        guard outdatedServerBuild == nil else { return }
        parseGeneration += 1
        let run = parseGeneration
        let text = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        parsedTask = nil
        parsedInput = ""
        removedQuickAddFields = []
        let parseTicket = quickAddMessages.restart(.parse)
        guard !text.isEmpty, signedIn else { return }
        let client = self.client
        do {
            try await Task.sleep(for: .milliseconds(250))
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile, run == parseGeneration else { return }
            let value = try await parse(text, client: client, profile: requestedProfile)
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile, run == parseGeneration else { return }
            parsedTask = value
            parsedInput = text
            quickAddMessages.succeed(parseTicket)
        } catch {
            authorize(error, epoch: credentialEpoch, profile: requestedProfile)
            guard isCurrentCredential(credentialEpoch), profile == requestedProfile, run == parseGeneration else { return }
            let failureText = describe(error, at: .parse)
            quickAddMessages.fail(failureText, parseTicket)
        }
    }

    private func parse(_ text: String, client: Client, profile: String) async throws -> ParsedTask {
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
        let credentialEpoch = discovery.credentialEpoch
        diagnosticsLoading = true
        defer { if discovery.credentialEpoch == credentialEpoch { diagnosticsLoading = false } }
        do {
            let snapshot = try await client.diagnostics_period_snapshot().ok.body.json
            guard !Task.isCancelled, run == generation, signedIn else { return }
            diagnostics = snapshot
            diagnosticsError = nil
            diagnosticsRetrySeconds = 1
        } catch {
            // A 401 for the current credential ends the Session even if this poll is no longer wanted (S1-20).
            handleAuthorization(error, credentialEpoch: credentialEpoch)
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
        let credentialEpoch = discovery.credentialEpoch
        let historyTicket = historyMessages.beginClean(.load)
        do {
            let value = try await client.reads_period_history(path: .init(profile: requestedProfile, task: task.id)).ok.body.json
            guard historyGeneration == request, generation == run, profile == requestedProfile, editor?.id == task.id else { return }
            history = try decode([HistoryEntry].self, value)
            historyMessages.succeed(historyTicket)
        } catch {
            // A 401 for the current credential ends the Session even if this action is no longer wanted (S1-20).
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            guard historyGeneration == request, generation == run, profile == requestedProfile, editor?.id == task.id else { return }
            let failureText = describe(error, at: .history)
            historyMessages.fail(failureText, historyTicket)
        }
    }

    func decode<Value: Decodable, Wire: Encodable>(_ type: Value.Type, _ wire: Wire, recordingScope: Int? = nil) throws -> Value {
        let scope = recordingScope ?? clientDiagnostics.scopeToken
        let started = ProcessInfo.processInfo.systemUptime
        defer { recordClientDecode(started, scope: scope) }
        return try JSONDecoder().decode(type, from: JSONEncoder().encode(wire))
    }
    private func recordClientDecode(_ started: Double, scope: Int) {
        var event = ClientDiagnosticEvent(name: .decodeFinished, run: clientDiagnostics.run)
        event.actionID = ClientDiagnosticContext.actionID; event.refreshID = ClientDiagnosticContext.refreshID
        event.durationMS = (ProcessInfo.processInfo.systemUptime - started) * 1000
        clientDiagnostics.record(event, ifScope: scope)
    }

    func loadSnapshots() async {
        let credentialEpoch = discovery.credentialEpoch
        guard outdatedServerBuild == nil else { return }
        let listTicket = snapshotMessages.beginClean(.list)
        do {
            let wire = try await client.snapshots_period_list().ok.body.json
            guard isCurrentCredential(credentialEpoch) else { return }
            ownerSnapshots = try decode(SnapshotCatalog.self, wire).snapshots
            snapshotsLoaded = true
            snapshotMessages.succeed(listTicket)
        } catch {
            // A 401 for the current credential ends the Session even if this action is no longer wanted (S1-20).
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            guard isCurrentCredential(credentialEpoch) else { return }
            let failureText = describe(error, at: .snapshot)
            snapshotMessages.fail(failureText, listTicket) }
    }

    func createSnapshot() async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite else { return }
        busy = true
        let writeTicket = snapshotMessages.begin(.write)
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            _ = try await client.snapshots_period_create(body: .json(.init(reason: "manual"))).ok
            guard isCurrentCredential(credentialEpoch) else { return }
            await loadSnapshots()
        } catch {
            // A 401 for the current credential ends the Session even if this action is no longer wanted (S1-20).
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            guard isCurrentCredential(credentialEpoch) else { return }
            let failureText = describe(error, at: .snapshot)
            snapshotMessages.fail(failureText, writeTicket) }
    }

    func previewSnapshotRestore(_ snapshot: OwnerSnapshot) async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite else { return }
        busy = true
        let writeTicket = snapshotMessages.begin(.write)
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            let wire = try await client.snapshots_period_restore(path: .init(snapshot: snapshot.id), body: .json(.init(dry_run: true))).ok.body.json
            guard isCurrentCredential(credentialEpoch) else { return }
            snapshotRestore = try decode(SnapshotRestorePreview.self, wire)
            snapshotRestoreTarget = snapshot
            snapshotMessages.succeed(writeTicket)
        } catch {
            // A 401 for the current credential ends the Session even if this action is no longer wanted (S1-20).
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            guard isCurrentCredential(credentialEpoch) else { return }
            let failureText = describe(error, at: .snapshot)
            snapshotMessages.fail(failureText, writeTicket) }
    }

    func confirmSnapshotRestore() async {
        let credentialEpoch = discovery.credentialEpoch
        guard canWrite, let target = snapshotRestoreTarget, snapshotRestore != nil else { return }
        busy = true
        let writeTicket = snapshotMessages.begin(.write)
        defer { if discovery.credentialEpoch == credentialEpoch { busy = false } }
        do {
            _ = try await client.snapshots_period_restore(path: .init(snapshot: target.id), body: .json(.init(dry_run: false))).ok
            guard isCurrentCredential(credentialEpoch) else { return }
            snapshotRestore = nil; snapshotRestoreTarget = nil
            await loadSnapshots()
        } catch {
            // A 401 for the current credential ends the Session even if this action is no longer wanted (S1-20).
            handleAuthorization(error, credentialEpoch: credentialEpoch)
            guard isCurrentCredential(credentialEpoch) else { return }
            let failureText = describe(error, at: .snapshot)
            snapshotMessages.fail(failureText, writeTicket) }
    }

    /// A 401 under the still-current credential ends the Session even if the task that received it
    /// was cancelled meanwhile (a reply already on its way); retiring a credential changes the epoch.
    private func expireSession(credentialEpoch: Int) {
        guard isCurrentEpoch(credentialEpoch) else { return }
        disconnect()
        try? vault.delete()
        signedIn = false
        diagnostics = nil
        replaceCredential("")
        tasks = []
        appliedSearchSnapshot = nil
        catalogReady = false
        catalogStale = true
        searchError = nil
        searchPhase = .idle
        publishMessage("Your Session ended. Sign in again.", kind: .sessionEnded)
    }

    func checkServerContract() async throws -> Bool {
        let credentialEpoch = discovery.credentialEpoch
        do {
            let health = try await client.system_period_health().ok.body.json
            guard isCurrentCredential(credentialEpoch) else { throw CancellationError() }
            guard health.contract == TodoContract.id else { throw OutdatedServer(serverBuild: health.build) }
            outdatedServerBuild = nil
            return true
        } catch {
            guard isCurrentCredential(credentialEpoch) else { throw CancellationError() }
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
        let credentialEpoch = discovery.credentialEpoch
        do {
            guard try await checkServerContract() else { return }
            if signedIn { connect() }
            else { restored = false; await restore() }
        } catch { if isCurrentCredential(credentialEpoch) { publishMessage(describe(error), kind: .connection) } }
    }

    /// The one credential-epoch comparison, shared by every ownership check and by expireSession.
    func isCurrentEpoch(_ credentialEpoch: Int) -> Bool { discovery.credentialEpoch == credentialEpoch }
    func isCurrentCredential(_ credentialEpoch: Int) -> Bool {
        isCurrentEpoch(credentialEpoch) && !Task.isCancelled
    }
    func handleAuthorization(_ error: Error, credentialEpoch: Int) {
        if failure(error)?.status == 401 { expireSession(credentialEpoch: credentialEpoch) }
    }
    private func failure(_ error: Error) -> RequestFailure? {
        (error as? RequestFailure) ?? (error as? ClientError)?.underlyingError as? RequestFailure
    }
    func describe(_ error: Error, at position: ClientErrorPosition = .message, dependencyContext: DependencyActionContext = .link) -> String {
        let server = failure(error)?.body ?? (error as? ServerFailure)
        serverErrors[position] = server
        dependencyErrorContexts[position] = dependencyContext
        if let server {
            if server.isDependencyFailure { let notice = DependencyNotice.project(server, context: dependencyContext); return [notice.message, notice.detail].compactMap { $0 }.joined(separator: "\n") }
            return server.nativeMessage
        }
        if error is DecodingError || error is DependencyGraphReply.ProtocolError { return "The server response could not be read. Your draft is preserved." }
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
