import Foundation

public enum ClientDiagnosticName: String, Codable, Sendable {
    case pollsAggregated = "request.polls.aggregated"
    case actionStarted = "ui.action.started", resultPublished = "model.published", layoutCommitted = "ui.layout.committed"
    case inputObserved = "ui.input.observed", selectionCommitted = "ui.selection.committed", inspectorCommitted = "ui.inspector.committed"
    case inputReleased = "ui.input.released", nativeSelectionChanging = "ui.selection.nativeChanging", nativeSelectionCommitted = "ui.selection.nativeCommitted"
    case actionEnded = "ui.action.ended", refreshStarted = "refresh.started", refreshFinished = "refresh.finished"
    case requestStarted = "request.started", requestHeaders = "request.headers", requestFinished = "request.finished", decodeFinished = "decode.finished"
    case streamConnected = "stream.connected", streamDropped = "stream.dropped", availabilityChanged = "availability.changed", stall = "ui.stall", resourcesSampled = "resources.sampled"
    /// Coalesced passive observations (scroll, window resize, split resize, timeline ticks).
    case observed = "ui.observed"
}
public enum ClientDiagnosticTrigger: String, Codable, Sendable {
    case startup, profileSwitch, viewChange, filterChange, search, ownWrite, streamOperation, streamReady, reconnect, manual
    case dayChange, clockChange, wake, activation
}
public enum ClientDiagnosticOutcome: String, Codable, Sendable { case applied, superseded, failed, cancelled, refused, drag }
public enum ClientDiagnosticReason: String, Codable, Sendable {
    case signedOut, outdatedServer, initialLoad, query, write, offline, ready, cancelled, cleanEnd, timeout, transport, authorization, deletedProfile, reload, contractMismatch, other
}
public enum ClientDiagnosticAction: String, Codable, Sendable, CaseIterable {
    case signIn
    case restoreSession
    case retrySession
    case signOut
    case sessionExpiry
    case profileSwitch
    case discoveryShow
    case viewSwitch
    case filters
    case openFilters
    case applyFilters
    case cancelFilters
    case clearFilters
    case order
    case projectFilter
    case tagFilter
    case search
    case searchEcho
    case pasteSearch
    case clearSearch
    case focusSearch
    case retrySearch
    case taskSelection = "task.selection.pointer"
    case keyboardSelection = "task.selection.keyboard"
    case openInspector
    case closeInspector
    case compactBack
    case scrollFrame
    case scrollSettled
    case resizeFrame
    case resizeSettled
    case moveDivider
    case toggleCompact
    case toggleGroup
    case toggleMetadata
    case editTitle
    case editDescription
    case editPriority
    case editProject
    case editTags
    case editDates
    case editEnergy
    case editEstimate
    case editSource
    case editExternalId
    case newProject
    case newTag
    case dateChooser
    case copyTaskId
    case cancelDraft
    case draftNavigate
    case draftSave
    case draftDiscard
    case draftCancel
    case quickAdd
    case sheetAdd
    case openQuickAdd
    case closeQuickAdd
    case editQuickAdd
    case parseQuickAdd
    case removeChip
    case adjustQuickAdd
    case addAndEdit
    case save
    case taskTransition
    case complete
    case cancel
    case reopen
    case snooze
    case saveDates
    case openMove
    case openCopy
    case transferDestination
    case previewTransfer
    case confirmMove
    case confirmCopy
    case openTransferredTask
    case dismissTransfer
    case delete
    case openDelete
    case reviewDelete
    case cancelDelete
    case purge
    case openHistory
    case retryHistory
    case expandHistory
    case revert
    case revertRefusal
    case openLatest
    case resolveField
    case saveResolution
    case retryAction
    case cancelConflict
    case openSeries
    case editRule
    case editWeekdays
    case editTimeZone
    case editExclusions
    case initialDependencies
    case createSeries
    case saveSeries
    case skipOccurrence
    case closeSeries
    case attachFile
    case attachLink
    case pasteImage
    case dropImage
    case labelAttachment
    case detach
    case previewAttachments
    case applyAttachments
    case openAttachment
    case revealAttachment
    case previewImage
    case openBatch
    case chooseBatchTasks
    case editBatchChange
    case batchPreview
    case applyBatch
    case reloadBatch
    case cancelBatch
    case openImport
    case chooseImport
    case editImport
    case importPreview
    case applyImport
    case inspectImport
    case retryImport
    case openDependencyPicker
    case toggleDependency
    case openDependencies
    case dependencySearch
    case dependencyPrefix
    case initialEdge
    case closeDependencyPicker
    case dependencyDrag
    case dependencyDrop
    case reviewDependency
    case cancelDependency
    case confirmDependency
    case previewDependencyBatch
    case applyDependencyBatch
    case showDependencyDiagram
    case graphSelect
    case graphMenu
    case graphExpand
    case graphGroup
    case graphPan
    case graphZoom
    case graphReset
    case retryGraph
    case closeGraph
    case openDiscovery
    case expandDiscovery
    case copyDiscovery
    case editLookup
    case findTask
    case retryLookup
    case showDiscoveredTask
    case closeDiscovery
    case deleteProfile
    case confirmDeleteProfileTasks
    case cancelDeleteProfile
    case retryDeleteProfile
    case listSnapshots
    case retrySnapshots
    case createSnapshot
    case showSnapshot
    case previewRestore
    case restoreSnapshot
    case cancelRestore
    case pruneSnapshots
    case revealSnapshot
    case openDiagnostics
    case closeDiagnostics
    case diagnosticsPane
    case diagnosticsRow
    case pauseDiagnostics
    case resumeDiagnostics
    case followDiagnostics
    case exportRecording
    case compareRecordings
    case openSettings
    case closeSettings
    case theme
    case serverURL
    case defaultProfile
    case notificationPermission
    case testNotification
    case openNotification
    case checkCompatibility
    case serverStatus
    case installServer
    case updateServer
    case repairServer
    case restartServer
    case uninstallServer
    case reconnect
    case retryLoad
    case serverMismatch
    case offlineView
    case disabledWriteIntent
}
extension ClientDiagnosticAction {
    public var inventoryID: String {
        switch self {
        case .signIn, .restoreSession, .retrySession: "I01"
        case .signOut, .sessionExpiry: "I02"
        case .profileSwitch, .discoveryShow: "I03"
        case .viewSwitch: "I04"
        case .filters, .openFilters, .applyFilters, .cancelFilters, .clearFilters, .order, .projectFilter, .tagFilter: "I05"
        case .search, .searchEcho, .pasteSearch, .clearSearch, .focusSearch, .retrySearch: "I06"
        case .taskSelection, .keyboardSelection, .openInspector, .closeInspector, .compactBack: "I07"
        case .scrollFrame, .scrollSettled, .resizeFrame, .resizeSettled, .moveDivider, .toggleCompact, .toggleGroup, .toggleMetadata: "I08"
        case .editTitle, .editDescription, .editPriority, .editProject, .editTags, .editDates, .editEnergy, .editEstimate, .editSource, .editExternalId, .newProject, .newTag, .dateChooser, .copyTaskId, .cancelDraft: "I09"
        case .draftNavigate, .draftSave, .draftDiscard, .draftCancel: "I10"
        case .quickAdd, .sheetAdd, .openQuickAdd, .closeQuickAdd, .editQuickAdd, .parseQuickAdd, .removeChip, .adjustQuickAdd, .addAndEdit: "I11"
        case .save, .taskTransition, .complete, .cancel, .reopen, .snooze, .saveDates: "I12"
        case .openMove, .openCopy, .transferDestination, .previewTransfer, .confirmMove, .confirmCopy, .openTransferredTask, .dismissTransfer: "I13"
        case .delete, .openDelete, .reviewDelete, .cancelDelete, .purge: "I14"
        case .openHistory, .retryHistory, .expandHistory, .revert, .revertRefusal: "I15"
        case .openLatest, .resolveField, .saveResolution, .retryAction, .cancelConflict: "I16"
        case .openSeries, .editRule, .editWeekdays, .editTimeZone, .editExclusions, .initialDependencies, .createSeries, .saveSeries, .skipOccurrence, .closeSeries: "I17"
        case .attachFile, .attachLink, .pasteImage, .dropImage, .labelAttachment, .detach, .previewAttachments, .applyAttachments, .openAttachment, .revealAttachment, .previewImage: "I18"
        case .openBatch, .chooseBatchTasks, .editBatchChange, .batchPreview, .applyBatch, .reloadBatch, .cancelBatch: "I19"
        case .openImport, .chooseImport, .editImport, .importPreview, .applyImport, .inspectImport, .retryImport: "I20"
        case .openDependencyPicker, .toggleDependency, .openDependencies, .dependencySearch, .dependencyPrefix, .initialEdge, .closeDependencyPicker: "I21"
        case .dependencyDrag, .dependencyDrop, .reviewDependency, .cancelDependency, .confirmDependency, .previewDependencyBatch, .applyDependencyBatch: "I22"
        case .showDependencyDiagram, .graphSelect, .graphMenu, .graphExpand, .graphGroup, .graphPan, .graphZoom, .graphReset, .retryGraph, .closeGraph: "I23"
        case .openDiscovery, .expandDiscovery, .copyDiscovery, .editLookup, .findTask, .retryLookup, .showDiscoveredTask, .closeDiscovery: "I24"
        case .deleteProfile, .confirmDeleteProfileTasks, .cancelDeleteProfile, .retryDeleteProfile: "I25"
        case .listSnapshots, .retrySnapshots, .createSnapshot, .showSnapshot, .previewRestore, .restoreSnapshot, .cancelRestore, .pruneSnapshots, .revealSnapshot: "I26"
        case .openDiagnostics, .closeDiagnostics, .diagnosticsPane, .diagnosticsRow, .pauseDiagnostics, .resumeDiagnostics, .followDiagnostics, .exportRecording, .compareRecordings: "I27"
        case .openSettings, .closeSettings, .theme, .serverURL, .defaultProfile, .notificationPermission, .testNotification, .openNotification, .checkCompatibility: "I28"
        case .serverStatus, .installServer, .updateServer, .repairServer, .restartServer, .uninstallServer: "I29"
        case .reconnect, .retryLoad, .serverMismatch, .offlineView, .disabledWriteIntent: "I30"
        }
    }
    private enum CodingKeys: String, CodingKey { case inventoryID = "inventory_id", subtype }
    public init(from decoder: any Decoder) throws {
        let fields = try decoder.container(keyedBy: CodingKeys.self)
        let inventory = try fields.decode(String.self, forKey: .inventoryID), subtype = try fields.decode(String.self, forKey: .subtype)
        guard let value = Self(rawValue: subtype), value.inventoryID == inventory else {
            throw DecodingError.dataCorruptedError(forKey: .subtype, in: fields, debugDescription: "Unknown interaction category")
        }
        self = value
    }
    public func encode(to encoder: any Encoder) throws {
        var fields = encoder.container(keyedBy: CodingKeys.self)
        try fields.encode(inventoryID, forKey: .inventoryID)
        try fields.encode(rawValue, forKey: .subtype)
    }
}
public enum ClientDiagnosticMode: String, Codable, Sendable { case full, compact, terminal, headless, unknown }
public enum ClientDiagnosticInputKind: String, Codable, Sendable { case pointer, keyboard, menu, accessibility, notification, command, background, unknown }
public struct ClientDiagnosticIncomplete: Codable, Sendable {
    public let action: ClientDiagnosticAction
    public let count: Int
    public let ageMS: Double
}
public struct ClientDiagnosticActionPhases: Codable, Sendable {
    public let inputQueueMS: Double?
    public let handlerWallMS: Double
    public let requestUnionMS: Double?
    public let publicationToLayoutMS: Double
    /// Press to release for an action the platform performs on release. The action itself is
    /// measured from the release; this is the person's hold, not the app's time.
    public var holdMS: Double? = nil
}
public struct ClientDiagnosticActionSummary: Codable, Sendable, Identifiable {
    public var id: String { "\(action.rawValue)/\(mode.rawValue)/\(inputKind.rawValue)" }
    public let action: ClientDiagnosticAction
    public let mode: ClientDiagnosticMode
    public let inputKind: ClientDiagnosticInputKind
    public let unprovenCount: Int
    public let p50MS: Double?
    public let p90MS: Double?
    public let p99MS: Double?
    public let maxMS: Double?
    public let count: Int
    public let supersededCount: Int
    public let incompleteCount: Int
    public let oldestIncompleteMS: Double
}
public struct ClientDiagnosticAvailability: Codable, Sendable, Equatable {
    public let loading: Bool
    public let busy: Bool
    public let canWrite: Bool
    public let dataReady: Bool
    public let reason: ClientDiagnosticReason
    public init(loading: Bool, busy: Bool, canWrite: Bool, dataReady: Bool, reason: ClientDiagnosticReason) {
        self.loading = loading; self.busy = busy; self.canWrite = canWrite; self.dataReady = dataReady; self.reason = reason
    }
}
public struct ClientDiagnosticResources: Codable, Sendable {
    public let descriptors: Int
    public let sockets: Int
    public let softLimit: UInt64
    public let hardLimit: UInt64
    public let samplerDescriptors: Int
    public let sampleMS: Double
    public init(descriptors: Int, sockets: Int, softLimit: UInt64, hardLimit: UInt64, samplerDescriptors: Int, sampleMS: Double) {
        self.descriptors = descriptors; self.sockets = sockets; self.softLimit = softLimit; self.hardLimit = hardLimit; self.samplerDescriptors = samplerDescriptors; self.sampleMS = sampleMS
    }
}
public struct ClientDiagnosticRequestPhases: Codable, Sendable {
    public let fetchToRequestMS: Double?
    public let dnsMS: Double?
    public let connectMS: Double?
    public let sendMS: Double?
    public let firstByteMS: Double?
    public let transferMS: Double?
    public let connectionReused: Bool
    public let receivedBytes: Int64
    public let serverHandlerMS: Double?
    public let serverSpans: ClientDiagnosticServerSpans?
    public init(fetchToRequestMS: Double?, dnsMS: Double?, connectMS: Double?, sendMS: Double?, firstByteMS: Double?, transferMS: Double?, connectionReused: Bool, receivedBytes: Int64, serverSpans: ClientDiagnosticServerSpans? = nil) {
        self.fetchToRequestMS = fetchToRequestMS; self.dnsMS = dnsMS; self.connectMS = connectMS; self.sendMS = sendMS; self.firstByteMS = firstByteMS; self.transferMS = transferMS; self.connectionReused = connectionReused; self.receivedBytes = receivedBytes; self.serverHandlerMS = serverSpans?.handler; self.serverSpans = serverSpans
    }
}
public struct ClientDiagnosticPollSummary: Codable, Sendable, Identifiable {
    public var id: String { operation }
    public let operation: String
    public let routeTemplate: String
    public let count: Int
    public let failures: Int
    public let sampleCount: Int
    public let p50MS: Double?
    public let maxMS: Double
    public let handlerCount: Int
    public let handlerP50MS: Double?
    public let handlerMaxMS: Double?
}
public struct ClientDiagnosticNativeSelectionNotifications: Codable, Sendable {
    public enum Capability: String, Codable, Sendable { case observed, unavailable }
    public let changing: Capability
    public let committed: Capability
    public init(changing: Bool, committed: Bool) {
        self.changing = changing ? .observed : .unavailable
        self.committed = committed ? .observed : .unavailable
    }
}
/// Where a pointer release time came from. SwiftUI's list (an NSOutlineView) selects on release
/// inside its own tracking loop, which takes the mouse-up, so a row click's release is the first
/// native selection notification of that click rather than an observed mouse-up.
public enum ClientDiagnosticReleaseSource: String, Codable, Sendable { case mouseUp, nativeSelection }
/// Carried by each selection's layout record so the owner's journal can be compared with the
/// measurement harness rows.
public struct ClientDiagnosticSelectionContext: Codable, Sendable {
    public var releaseSource: ClientDiagnosticReleaseSource?
    /// Rows in the list the selection was made in, group headers included.
    public var listRows: Int?
    /// A catalog refresh was running at some point between the input and the layout.
    public var refreshInFlight: Bool
    public var processUptimeMS: Double?
    /// Size of the current journal file as last written, and bytes this process has written.
    public var journalFileBytes: Int
    public var journalBytesWritten: Int
}
/// What happened on screen without being an action, counted passively and coalesced: at most one
/// record a second, none while nothing happens. Hover is not observed: it would need mouse-moved
/// events or tracking areas, which change event delivery.
public struct ClientDiagnosticObserved: Codable, Sendable, Equatable {
    public var scrollEvents = 0
    public var windowResizes = 0
    public var splitResizes = 0
    public var timelineTicks = 0
    public var windowMS = 0.0
    public init(scrollEvents: Int = 0, windowResizes: Int = 0, splitResizes: Int = 0, timelineTicks: Int = 0, windowMS: Double = 0) {
        self.scrollEvents = scrollEvents; self.windowResizes = windowResizes; self.splitResizes = splitResizes; self.timelineTicks = timelineTicks; self.windowMS = windowMS
    }
    public var isEmpty: Bool { scrollEvents == 0 && windowResizes == 0 && splitResizes == 0 && timelineTicks == 0 }
}

public struct ClientDiagnosticEvent: Codable, Sendable, Identifiable {
    public let id: UUID
    public let run: UUID
    public let monotonicMS: Double
    public let epochMS: Double
    public let name: ClientDiagnosticName
    public var traceID: UUID?
    public var actionID: UUID?
    public var refreshID: UUID?
    public var requestID: UUID?
    public var action: ClientDiagnosticAction?
    public var mode: ClientDiagnosticMode?
    public var inputKind: ClientDiagnosticInputKind?
    public var trigger: ClientDiagnosticTrigger?
    public var outcome: ClientDiagnosticOutcome?
    public var reason: ClientDiagnosticReason?
    public var operation: String?
    public var serverHandlerMS: Double?
    public var serverSpans: ClientDiagnosticServerSpans?
    public var renderStage: String?
    public var acceptedRequestID: UUID?
    public var status: Int?
    public var requestCount: Int?
    public var durationMS: Double?
    public var mainThreadCpuMS: Double?
    public var processCpuMS: Double?
    public var hostLoad1m: Double?
    public var inputMS: Double?
    public var nativeSelectionNotifications: ClientDiagnosticNativeSelectionNotifications?
    public var releaseSource: ClientDiagnosticReleaseSource?
    public var selectionContext: ClientDiagnosticSelectionContext?
    public var availability: ClientDiagnosticAvailability?
    public var actionPhases: ClientDiagnosticActionPhases?
    public var phases: ClientDiagnosticRequestPhases?
    public var resources: ClientDiagnosticResources?
    public var applicationActive: Bool?
    /// A stall's main-thread attribution (ui.stall only): image base names and code symbols only.
    public var stallAttribution: ClientStallAttribution?
    /// ui.observed only.
    public var observed: ClientDiagnosticObserved?
    public var polls: ClientDiagnosticPollSummary?
    public var incomplete: [ClientDiagnosticIncomplete]?
    public init(name: ClientDiagnosticName, run: UUID, now: Double = ProcessInfo.processInfo.systemUptime * 1000) {
        id = UUID(); self.run = run; monotonicMS = now; epochMS = Date().timeIntervalSince1970 * 1000; self.name = name
    }
}
public struct ClientDiagnosticSummary: Codable, Sendable {
    public var recorded = 0
    public var dropped = 0
    public var journalFailures = 0
    public var journalBytesWritten = 0
    public var refreshes = 0
    public var requests = 0
    public var completedSelections = 0
    public var incompleteSelections = 0
    public var oldestIncompleteMS = 0.0
    public var selectionP99MS: Double?
    public var longestStallMS = 0.0
    public var resources: ClientDiagnosticResources?
    public var applicationActive: Bool?
    public var actions: [ClientDiagnosticActionSummary] = []
    public var recent: [ClientDiagnosticEvent] = []
    public var recentInteractions: [ClientDiagnosticEvent] = []
    public var recentRequests: [ClientDiagnosticEvent] = []
    public var polls: [ClientDiagnosticPollSummary] = []
    public var routineRecordsThinned = 0
    public init() {}
}
public enum ClientDiagnosticContext {
    @TaskLocal public static var periodicPoll = false
    @TaskLocal public static var mode: ClientDiagnosticMode = .unknown
    @TaskLocal public static var inputKind: ClientDiagnosticInputKind = .unknown
    @TaskLocal public static var traceID: UUID?
    @TaskLocal public static var actionID: UUID?
    @TaskLocal public static var refreshID: UUID?
    @TaskLocal public static var requestID: UUID?
}
