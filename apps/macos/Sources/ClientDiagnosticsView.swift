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
    @State private var exportError: String?
    private var snapshot: ClientDiagnosticSummary { model.clientDiagnosticsUI.summary }
    private func overBudget(_ row: ClientDiagnosticActionSummary) -> Bool {
        (row.p50MS ?? 0) > 20 || (row.p99MS ?? 0) > 300 || row.incompleteCount > 0
    }
    private var rows: [ClientDiagnosticActionSummary] {
        snapshot.actions.sorted {
            if overBudget($0) != overBudget($1) { return overBudget($0) }
            return ClientDiagnosticDisplay.action($0.action) < ClientDiagnosticDisplay.action($1.action)
        }
    }
    private func milliseconds(_ value: Double?) -> String { value.map { String(format: "%.1f", $0) } ?? "Unknown" }
    var body: some View {
        GroupBox("This client") {
            VStack(alignment: .leading, spacing: 12) {
                if rows.isEmpty { Text("No measured interactions yet.").foregroundStyle(.secondary) }
                else if compact {
                    ForEach(rows) { row in
                        VStack(alignment: .leading, spacing: 6) {
                            category(row)
                            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
                                GridRow { Text("p50 (ms)"); Text(milliseconds(row.p50MS)); Text("p99 (ms)"); Text(milliseconds(row.p99MS)) }
                                GridRow { Text("p90 (ms)"); Text(milliseconds(row.p90MS)); Text("Max (ms)"); Text(milliseconds(row.maxMS)) }
                            }.monospacedDigit()
                            total("Completed", row.count); total("Incomplete", row.incompleteCount); total("Unverified input", row.unprovenCount)
                            if row.incompleteCount > 0 { pair("Oldest incomplete (ms)", milliseconds(row.oldestIncompleteMS)) }
                        }.padding(8).frame(maxWidth: .infinity, alignment: .leading).diagnosticsBounds("client-card-\(row.id)").background(.quaternary.opacity(0.3), in: .rect(cornerRadius: 8))
                    }
                } else {
                    Grid(alignment: .trailing, horizontalSpacing: 12, verticalSpacing: 8) {
                        GridRow { Text("Interaction").gridColumnAlignment(.leading); Text("p50 (ms)"); Text("p90 (ms)"); Text("p99 (ms)"); Text("Max (ms)"); Text("Count"); Text("Incomplete") }.foregroundStyle(.secondary)
                        ForEach(rows) { row in
                            GridRow { category(row); Text(milliseconds(row.p50MS)); Text(milliseconds(row.p90MS)); Text(milliseconds(row.p99MS)); Text(milliseconds(row.maxMS)); Text("\(row.count)"); Text("\(row.incompleteCount)") }
                        }
                    }.monospacedDigit()
                }
                Text("Target: median 20 ms, p99 300 ms. Percentiles cover the last 512 verified completions per row. Timings end after layout. Screen presentation is not measured.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).diagnosticsBounds("client-target")
                total("Refreshes", snapshot.refreshes)
                total("Requests", snapshot.requests)
                total("Dropped records", snapshot.dropped)
                total("Journal errors", snapshot.journalFailures)
                pair("Longest main-thread stall (ms)", milliseconds(snapshot.longestStallMS))
                if let resources = snapshot.resources {
                    total("Open descriptors", resources.descriptors)
                    total("TCP sockets", resources.sockets)
                    pair("Descriptor limit", "\(resources.softLimit)")
                }
                DisclosureGroup("Interaction phases") {
                    ForEach(snapshot.recent.filter { $0.name == .layoutCommitted }.reversed()) { event in
                        if let category = event.action, let phases = event.actionPhases {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(ClientDiagnosticDisplay.action(category)).fontWeight(.medium)
                                pair("Input queue (ms)", milliseconds(phases.inputQueueMS))
                                pair("Handler, including waits (ms)", milliseconds(phases.handlerWallMS))
                                pair("Requests, overlapping (ms)", milliseconds(phases.requestUnionMS))
                                pair("Publication to layout (ms)", milliseconds(phases.publicationToLayoutMS))
                            }.padding(.vertical, 4)
                        }
                    }
                }
                DisclosureGroup("Request timings") {
                    ForEach(snapshot.recent.filter { $0.name == .requestFinished }.reversed()) { event in
                        VStack(alignment: .leading, spacing: 4) {
                            pair("Request (ms)", milliseconds(event.durationMS))
                            pair("Connect (ms)", milliseconds(event.phases?.connectMS))
                            pair("First byte (ms)", milliseconds(event.phases?.firstByteMS))
                            pair("Server handler (ms)", milliseconds(event.phases?.serverHandlerMS))
                            pair("Transfer (ms)", milliseconds(event.phases?.transferMS))
                            pair("Connection", event.phases.map { $0.connectionReused ? "Reused" : "New" } ?? "Unknown")
                        }.padding(.vertical, 4)
                    }
                }
                DisclosureGroup("Recent activity") {
                    ForEach(snapshot.recent.reversed()) { event in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(ClientDiagnosticDisplay.event(event.name))
                                if let trigger = event.trigger, let label = ClientDiagnosticDisplay.environmentTrigger(trigger) { Text(label).foregroundStyle(.secondary) }
                            }
                            Spacer(minLength: 8)
                            if let duration = event.durationMS { Text("\(milliseconds(duration)) ms").monospacedDigit() }
                        }
                    }
                }
                HStack {
                    Button("Export client metadata…") {
                        Task {
                            do {
                                guard let data = try await model.clientDiagnostics.exportMetadata(), model.clientDiagnostics.isOwnerSession else { return }
                                document = .init(data: data); exporting = true
                            } catch { exportError = "Client metadata could not be exported." }
                        }
                    }.disabled(!model.clientDiagnostics.isOwnerSession).accessibilityIdentifier("client-diagnostics-export")
                    Spacer(minLength: 0)
                }
                if let exportError { Text(exportError).foregroundStyle(.red) }
                Text("Metadata only. Saved on this Mac. Two rotating files, at most 1 MiB each. Cleared on sign out.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }.font(.caption).padding(4).frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityIdentifier("client-diagnostics")
        .fileExporter(isPresented: $exporting, document: document, contentType: .json, defaultFilename: "Todo-client-diagnostics") { result in
            if case .failure = result { exportError = "Client metadata could not be exported." }
            document = nil
        }
        .onChange(of: model.signedIn) { _, signedIn in if !signedIn { exporting = false; document = nil; exportError = nil } }
    }
    private func category(_ row: ClientDiagnosticActionSummary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(ClientDiagnosticDisplay.action(row.action)).fontWeight(.medium)
            Text("\(ClientDiagnosticDisplay.input(row.inputKind)) · \(ClientDiagnosticDisplay.mode(row.mode))").foregroundStyle(.secondary)
            if overBudget(row) { Text(row.incompleteCount > 0 ? "Incomplete" : "Over budget").foregroundStyle(.red) }
            if !compact && row.incompleteCount > 0 { Text("Oldest incomplete: \(milliseconds(row.oldestIncompleteMS)) ms").foregroundStyle(.secondary) }
            if !compact && row.unprovenCount > 0 { Text("\(row.unprovenCount) with unverified input").foregroundStyle(.secondary) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func total(_ label: String, _ value: Int) -> some View { pair(label, "\(value)") }
    private func pair(_ label: String, _ value: String) -> some View { HStack { Text(label).foregroundStyle(.secondary); Spacer(minLength: 8); Text(value).monospacedDigit() } }
}
