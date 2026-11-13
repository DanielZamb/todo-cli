import SwiftUI
import TodoAPI
import UniformTypeIdentifiers

struct ClientDiagnosticsDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct ClientDiagnosticsView: View {
    let model: TodoModel
    let compact: Bool
    @State private var document: ClientDiagnosticsDocument?
    @State private var exporting = false
    private enum ExportKind: Hashable { case export }
    /// The export caption under the one message rule: each export takes a ticket; a newer export
    /// supersedes an older one; a success ends an earlier failure; signing out ends it.
    @State private var exportMessages = SurfaceMessages<ExportKind, String>()
    @State private var exportTicket: SurfaceMessages<ExportKind, String>.Ticket?
    @State private var expanded: Set<String>
    init(model: TodoModel, compact: Bool, initiallyExpanded: Set<String> = []) {
        self.model = model; self.compact = compact; _expanded = State(initialValue: initiallyExpanded)
    }
    private var snapshot: ClientDiagnosticSummary { model.clientDiagnosticsUI.summary }
    private func overBudget(_ row: ClientDiagnosticActionSummary) -> Bool {
        ClientDiagnosticDisplay.overBudget(row)
    }
    private var rows: [ClientDiagnosticActionSummary] {
        ClientDiagnosticDisplay.sortedActions(snapshot.actions)
    }
    private func milliseconds(_ value: Double?) -> String { value.map { String(format: "%.1f", $0) } ?? "Unknown" }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
                if rows.isEmpty { Text("No interactions measured yet.").foregroundStyle(.secondary) }
                else if compact {
                    ForEach(rows) { row in
                        VStack(alignment: .leading, spacing: 6) {
                            category(row)
                            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
                                GridRow { Text("p50 (ms)"); Text(milliseconds(row.p50MS)); Text("p99 (ms)"); Text(milliseconds(row.p99MS)) }
                                GridRow { Text("p90 (ms)"); Text(milliseconds(row.p90MS)); Text("Max (ms)"); Text(milliseconds(row.maxMS)) }
                            }.monospacedDigit()
                            total("Completed", row.count); total("Incomplete this session", row.incompleteCount); total("Unverified input", row.unprovenCount)
                            if row.incompleteCount > 0 { pair("Longest incomplete wait", ClientDiagnosticDisplay.age(row.oldestIncompleteMS)) }
                        }.padding(8).frame(maxWidth: .infinity, alignment: .leading).diagnosticsBounds("client-card-\(row.id)").background(.quaternary.opacity(0.3), in: .rect(cornerRadius: 8))
                            .accessibilityElement(children: .ignore).accessibilityLabel(ClientDiagnosticDisplay.accessibility(row))
                    }
                } else {
                    Grid(alignment: .trailing, horizontalSpacing: 12, verticalSpacing: 8) {
                        GridRow { Text("Interaction").gridColumnAlignment(.leading); Text("p50 (ms)"); Text("p90 (ms)"); Text("p99 (ms)"); Text("Max (ms)"); Text("Count"); Text("Incomplete") }.foregroundStyle(.secondary)
                        ForEach(rows) { row in
                            // A GridRow is not one accessibility container: a modifier on it lands on every
                            // cell, so the row was read seven times. The first cell carries the row's label.
                            GridRow {
                                category(row).accessibilityElement(children: .ignore).accessibilityLabel(ClientDiagnosticDisplay.accessibility(row))
                                Group { Text(milliseconds(row.p50MS)); Text(milliseconds(row.p90MS)); Text(milliseconds(row.p99MS)); Text(milliseconds(row.maxMS)); Text("\(row.count)"); Text("\(row.incompleteCount)") }
                                    .accessibilityHidden(true)
                            }
                        }
                    }.monospacedDigit()
                }
                Text(ClientDiagnosticDisplay.timingNote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).diagnosticsBounds("client-target")
                Text("Incomplete, superseded and unverified totals cover this recording session. Incomplete wait is the longest pending or ended wait.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                total("Refreshes", snapshot.refreshes)
                total("Requests", snapshot.requests)
                total("Dropped records", snapshot.dropped)
                total("Routine records thinned", snapshot.routineRecordsThinned)
                total("Journal errors", snapshot.journalFailures)
                pair("Longest main-thread stall", ClientDiagnosticDisplay.age(snapshot.longestStallMS))
                pair("Heartbeat", snapshot.applicationActive.map { $0 ? "Active" : "Inactive" } ?? "Unknown")
                if let resources = snapshot.resources {
                    total("Open descriptors", resources.descriptors)
                    total("TCP sockets", resources.sockets)
                    pair("Descriptor limit", "\(resources.softLimit)")
                }
                if !snapshot.polls.isEmpty {
                    DisclosureGroup("Background requests", isExpanded: disclosure("Background requests")) {
                        ForEach(snapshot.polls) { poll in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(ClientDiagnosticDisplay.requestOperation(poll.operation)).fontWeight(.medium)
                                total("Requests", poll.count); total("Failures", poll.failures)
                                pair("p50 (ms)", milliseconds(poll.p50MS)); pair("Max (ms)", milliseconds(poll.maxMS))
                                pair("Server handler p50 (ms)", milliseconds(poll.handlerP50MS))
                            }.padding(.vertical, 4)
                        }
                    }
                }
                DisclosureGroup("Interaction phases", isExpanded: disclosure("Interaction phases")) {
                    if snapshot.recentInteractions.isEmpty { Text("No interactions measured yet.").foregroundStyle(.secondary) }
                    ForEach(snapshot.recentInteractions.reversed()) { event in
                        if let category = event.action, let phases = event.actionPhases {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(ClientDiagnosticDisplay.action(category)).fontWeight(.medium)
                                if let hold = ClientDiagnosticDisplay.hold(event) { pair(hold.label, hold.value) }
                                pair("Input queue (ms)", milliseconds(phases.inputQueueMS))
                                pair("Handler, including waits (ms)", milliseconds(phases.handlerWallMS))
                                pair("Requests, overlapping (ms)", milliseconds(phases.requestUnionMS))
                                pair("Publication to layout (ms)", milliseconds(phases.publicationToLayoutMS))
                            }.padding(.vertical, 4)
                        }
                    }
                }
                DisclosureGroup("Request timings", isExpanded: disclosure("Request timings")) {
                    if snapshot.recentRequests.isEmpty { Text("No requests yet.").foregroundStyle(.secondary) }
                    ForEach(snapshot.recentRequests.reversed()) { event in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(ClientDiagnosticDisplay.requestOperation(event.operation ?? "")).fontWeight(.medium)
                            if let status = event.status { pair("HTTP status", "\(status)") }
                            pair("Request (ms)", milliseconds(event.durationMS))
                            pair("Connect (ms)", milliseconds(event.phases?.connectMS))
                            pair("First byte (ms)", milliseconds(event.phases?.firstByteMS))
                            pair("Server handler (ms)", milliseconds(event.phases?.serverHandlerMS))
                            pair("Transfer (ms)", milliseconds(event.phases?.transferMS))
                            pair("Connection", event.phases.map { $0.connectionReused ? "Reused" : "New" } ?? "Unknown")
                        }.padding(.vertical, 4)
                    }
                }
                DisclosureGroup("Recent activity", isExpanded: disclosure("Recent activity")) {
                    if snapshot.recent.isEmpty { Text("No activity yet.").foregroundStyle(.secondary) }
                    ForEach(snapshot.recent.reversed()) { event in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(ClientDiagnosticDisplay.event(event.name) + (event.releaseSource == .nativeSelection ? ", from selection" : ""))
                                if let trigger = event.trigger, let label = ClientDiagnosticDisplay.environmentTrigger(trigger) { Text(label).foregroundStyle(.secondary) }
                                // What the main thread was doing (stall attribution): our deepest frame or the system entry.
                                if let label = event.stallAttribution?.inLabel { Text("In " + label).font(.caption).foregroundStyle(.secondary).lineLimit(2).textSelection(.enabled) }
                                if let cost = ClientDiagnosticDisplay.samplerCost(event.stallAttribution) { Text(cost).font(.caption).foregroundStyle(.secondary).monospacedDigit() }
                                if let capability = event.nativeSelectionNotifications {
                                    if capability.changing == .unavailable { Text("Row highlight started: unavailable").foregroundStyle(.secondary) }
                                    if capability.committed == .unavailable { Text("Row highlight settled: unavailable").foregroundStyle(.secondary) }
                                }
                            }
                            Spacer(minLength: 8)
                            if let duration = event.durationMS { Text(ClientDiagnosticDisplay.age(duration)).monospacedDigit() }
                        }
                    }
                }
                HStack {
                    Button("Export client metadata…") {
                        let ticket = exportMessages.begin(.export)
                        exportTicket = ticket
                        Task {
                            do {
                                guard let data = try await model.clientDiagnostics.exportMetadata(), model.clientDiagnostics.isOwnerSession, exportMessages.isNewest(ticket) else { return }
                                document = .init(data: data); exporting = true
                            } catch { exportMessages.fail("Client metadata could not be exported.", ticket) }
                        }
                    }.disabled(!model.clientDiagnostics.isOwnerSession).accessibilityIdentifier("client-diagnostics-export")
                    Spacer(minLength: 0)
                }
                if let exportError = exportMessages.value { Text(exportError).foregroundStyle(.red) }
                Text("Metadata only. Saved on this Mac. Two rotating files, at most \(ClientDiagnosticsRecorder.journalFileLimit / 1_048_576) MiB each. Cleared on sign out.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }.font(.caption).padding(4).frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("client-diagnostics")
        .fileExporter(isPresented: $exporting, document: document, contentType: .json, defaultFilename: "Todo-client-diagnostics") { result in
            if let ticket = exportTicket {
                if case .failure = result { exportMessages.fail("Client metadata could not be exported.", ticket) } else { exportMessages.succeed(ticket) }
            }
            document = nil
        }
        .onChange(of: model.signedIn) { _, signedIn in if !signedIn { exporting = false; document = nil; exportMessages = .init(); exportTicket = nil } }
    }
    private func category(_ row: ClientDiagnosticActionSummary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(ClientDiagnosticDisplay.action(row.action)).fontWeight(.medium)
            Text("\(ClientDiagnosticDisplay.input(row.inputKind)) · \(ClientDiagnosticDisplay.mode(row.mode))").foregroundStyle(.secondary)
            if row.incompleteCount > 0 { Text("Incomplete").foregroundStyle(.red) }
            else if overBudget(row) { Text("Over budget").foregroundStyle(.red) }
            if !compact && row.incompleteCount > 0 { Text("Longest incomplete wait: \(ClientDiagnosticDisplay.age(row.oldestIncompleteMS))").foregroundStyle(.secondary) }
            if !compact && row.unprovenCount > 0 { Text("\(row.unprovenCount) with unverified input").foregroundStyle(.secondary) }
            if row.supersededCount > 0 { Text("\(row.supersededCount) superseded").foregroundStyle(.secondary) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func total(_ label: String, _ value: Int) -> some View { pair(label, "\(value)") }
    private func disclosure(_ title: String) -> Binding<Bool> { Binding(get: { expanded.contains(title) }, set: { if $0 { expanded.insert(title) } else { expanded.remove(title) } }) }
    private func pair(_ label: String, _ value: String) -> some View { HStack { Text(label).foregroundStyle(.secondary); Spacer(minLength: 8); Text(value).monospacedDigit() } }
}
