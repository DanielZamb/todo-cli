import SwiftUI
import TodoAPI

typealias DiagnosticsSnapshot = Operations.diagnostics_period_snapshot.Output.Ok.Body.jsonPayload

struct DiagnosticsBounds: PreferenceKey {
    static var defaultValue: [String: CGRect] { [:] }
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, new in new }) }
}
extension View {
    func diagnosticsBounds(_ name: String) -> some View {
        background(GeometryReader { proxy in Color.clear.preference(key: DiagnosticsBounds.self, value: [name: proxy.frame(in: .named("diagnostics"))]) })
    }
}
struct DiagnosticsView: View {
    @Bindable var model: TodoModel
    var live = true
    var initiallyExpanded: Set<String> = []
    var body: some View {
        GeometryReader { geometry in DiagnosticsContent(model: model, compact: geometry.size.width < 700, initiallyExpanded: initiallyExpanded) }
            .coordinateSpace(name: "diagnostics")
            .frame(minWidth: 360, minHeight: 380)
            .accessibilityIdentifier("diagnostics-window")
            .task(id: "\(model.signedIn)-\(model.diagnosticsLive)") {
                guard live, model.signedIn, model.diagnosticsLive else { return }
                while !Task.isCancelled {
                    await model.loadDiagnostics()
                    do { try await Task.sleep(for: .seconds(model.diagnosticsRetrySeconds)) } catch { return }
                }
            }
    }
}
private struct DiagnosticsContent: View {
    @Bindable var model: TodoModel
    let compact: Bool
    @State private var profile = ""
    @State private var expanded: Set<String> = []
    @State private var allRows: Set<String> = []
    init(model: TodoModel, compact: Bool, initiallyExpanded: Set<String>) {
        self.model = model
        self.compact = compact
        self._expanded = State(initialValue: initiallyExpanded)
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: compact ? 8 : 16) {
                heading
                if let error = model.diagnosticsError { Label(error, systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.red).accessibilityIdentifier("diagnostics-error") }
                if let snapshot = model.diagnostics {
                    summary(snapshot)
                    if compact {
                        latency(snapshot); operations(snapshot); errors(snapshot); storage(snapshot); scheduler(snapshot); clients(snapshot); credentials(snapshot); entities(snapshot)
                    } else {
                        HStack(alignment: .top, spacing: 16) {
                            VStack(spacing: 16) { latency(snapshot); operations(snapshot) }.frame(maxWidth: .infinity)
                            VStack(spacing: 16) { storage(snapshot); scheduler(snapshot) }.frame(width: 300)
                        }
                        HStack(alignment: .top, spacing: 16) {
                            clients(snapshot).frame(maxWidth: .infinity); credentials(snapshot).frame(maxWidth: .infinity); entities(snapshot).frame(maxWidth: .infinity)
                        }
                        errors(snapshot)
                    }
                    Text("\(model.diagnosticsLive ? "Live" : "Paused") · \(DiagnosticsFormatting.time(snapshot.generated_at))").font(.caption2).foregroundStyle(.secondary)
                    if !compact { Text("Read only · latency and totals cover all Profiles · last use covers this server process").font(.caption2).foregroundStyle(.secondary) }
                } else if model.diagnosticsLoading { ProgressView("Reading diagnostics…").frame(maxWidth: .infinity, minHeight: 160) }
                else { ContentUnavailableView("No diagnostics", systemImage: "waveform.path.ecg", description: Text(model.signedIn ? "Waiting for the server." : "Sign in to Todo with an owner Session.")) }
            }.padding(compact ? 12 : 24)
        }.background(.background).onChange(of: model.diagnostics?.profiles.map(\.id)) { _, ids in if !(ids ?? []).contains(profile) { profile = "" } }
    }
    private func name(_ id: String?, fallback: String = "Owner") -> String {
        guard let id else { return fallback }
        if let name = model.diagnostics?.profiles.first(where: { $0.id == id })?.name { return name }
        if let name = model.diagnostics?.deleted_profiles.first(where: { $0.id == id })?.name { return "\(name) (deleted)" }
        return "Deleted Profile"
    }
    private var heading: some View {
        HStack(spacing: compact ? 8 : 16) {
            Text("Diagnostics").font(compact ? .system(size: 16, weight: .semibold) : .title2.weight(.semibold)).lineLimit(1)
            Spacer(minLength: 0)
            Picker("Profile", selection: $profile) {
                Text("All Profiles").tag("")
                ForEach(model.diagnostics?.profiles ?? [], id: \.id) { Text($0.name).tag($0.id) }
            }.labelsHidden().frame(width: compact ? 112 : 180, height: 28).accessibilityLabel("Diagnostics Profile").diagnosticsBounds("target:profile")
            Button { model.diagnosticsLive.toggle() } label: { Text(model.diagnosticsLive ? "● Live" : "Paused") }
                .buttonStyle(.borderedProminent).controlSize(.regular).frame(minHeight: 28)
                .keyboardShortcut("l", modifiers: [.command, .shift]).accessibilityLabel("Live updates").accessibilityValue(model.diagnosticsLive ? "Live" : "Paused").diagnosticsBounds("target:live")
            if !model.diagnosticsLive {
                Button { Task { await model.loadDiagnostics() } } label: { Image(systemName: "arrow.clockwise") }
                    .frame(minWidth: 28, minHeight: 28).disabled(model.diagnosticsLoading || !model.signedIn).accessibilityLabel("Refresh diagnostics").accessibilityIdentifier("diagnostics-refresh")
            }
        }.frame(minHeight: 28)
    }
    @ViewBuilder private func section<Content: View>(_ title: String, summary: String, defaultOpen: Bool = false, @ViewBuilder content: @escaping () -> Content) -> some View {
        if compact {
            DisclosureGroup(isExpanded: Binding(get: { expanded.contains(title) }, set: { if $0 { expanded.insert(title) } else { expanded.remove(title) } })) {
                VStack(alignment: .leading, spacing: 8, content: content).frame(maxWidth: .infinity, alignment: .leading).diagnosticsBounds("content:\(title)").padding(.leading, 12).padding(.vertical, 8)
            } label: {
                HStack(spacing: 8) { Text(title).fontWeight(.medium).diagnosticsBounds("title:\(title)"); Spacer(minLength: 0); Text(summary).foregroundStyle(.secondary).lineLimit(1) }.font(.system(size: 11)).frame(minHeight: 28).diagnosticsBounds("summary:\(title)")
            }.padding(.horizontal, 8).background(.quaternary.opacity(0.35), in: .rect(cornerRadius: 8)).onAppear { if defaultOpen { expanded.insert(title) } }.diagnosticsBounds("section:\(title)")
        } else {
            GroupBox { VStack(alignment: .leading, spacing: 8, content: content).frame(maxWidth: .infinity, alignment: .leading).padding(4) } label: { Text(title).font(.headline) }.diagnosticsBounds("section:\(title)")
        }
    }
    private func limit(_ key: String, _ count: Int, short: Int = 5) -> Int { allRows.contains(key) ? count : min(short, count) }
    @ViewBuilder private func showAll(_ key: String, _ count: Int, short: Int = 5) -> some View {
        if count > short { Button(allRows.contains(key) ? "Show fewer" : "Show all (\(count))") { if allRows.contains(key) { allRows.remove(key) } else { allRows.insert(key) } }.frame(minHeight: 28) }
    }
    private func summary(_ s: DiagnosticsSnapshot) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: compact ? 2 : 4), spacing: compact ? 8 : 16) {
            metric("Operations / second", String(format: "%.2f", s.operations.per_second), detail: "60-second window")
            metric("Database + WAL", DiagnosticsFormatting.bytes(s.storage.database_bytes + s.storage.wal_bytes), detail: "\(s.storage.tables.count) tables")
            metric("SSE subscribers", "\(s.clients.filter { profile.isEmpty || $0.profile == profile }.count)", detail: "All Profiles")
            metric("Rejected attempts", "\(Int(s.operations.rejected))", detail: "\(Int(s.operations.total)) operations total")
        }.padding(compact ? 8 : 0).background(compact ? AnyShapeStyle(.quaternary.opacity(0.4)) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 8)).diagnosticsBounds("kpis")
    }
    private func metric(_ title: String, _ value: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.system(size: compact ? 10 : 12)).foregroundStyle(.secondary)
            Text(value).font(.system(size: compact ? 20 : 27, weight: .medium, design: .rounded)).monospacedDigit()
            if !compact { Text(detail).font(.caption2).foregroundStyle(.secondary) }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(compact ? 0 : 12).background(compact ? AnyShapeStyle(.clear) : AnyShapeStyle(.quaternary.opacity(0.5)), in: .rect(cornerRadius: 10))
    }
    private func pair(_ title: String, _ value: String) -> some View { HStack(alignment: .firstTextBaseline) { Text(title).foregroundStyle(.secondary); Spacer(); Text(value).monospacedDigit() }.font(.caption) }
    private func latency(_ s: DiagnosticsSnapshot) -> some View {
        section("Latency", summary: String(format: "p95 %.1f ms · %d routes", s.latency.routes.map(\.p95_ms).max() ?? 0, s.latency.routes.count)) {
            DiagnosticsSparkline(values: s.latency.samples).frame(height: 24)
            Grid(alignment: .trailing, horizontalSpacing: 12, verticalSpacing: 8) {
                GridRow { Text("Route").frame(maxWidth: .infinity, alignment: .leading).gridColumnAlignment(.leading); Text("Count"); Text("p50"); Text("p95"); Text("p99") }.foregroundStyle(.secondary)
                ForEach(Array(s.latency.routes.prefix(limit("Latency", s.latency.routes.count))), id: \.route) { r in
                    GridRow { Text(r.route).lineLimit(1).truncationMode(.middle).frame(maxWidth: .infinity, alignment: .leading).diagnosticsBounds("row:Latency:\(r.route)"); Text("\(Int(r.count))"); Text(String(format: "%.2f", r.p50_ms)); Text(String(format: "%.2f", r.p95_ms)); Text(String(format: "%.2f", r.p99_ms)) }
                }
            }.font(.system(size: 11, design: .monospaced)).monospacedDigit()
            showAll("Latency", s.latency.routes.count)
        }
    }
    private func operations(_ s: DiagnosticsSnapshot) -> some View {
        let entries = s.operations.recent.filter { profile.isEmpty || $0.profile == profile }
        return section("Operations", summary: "\(entries.count) recent · \(Int(s.operations.rejected)) rejected") {
            DiagnosticsSparkline(values: s.operations.samples).frame(height: 24)
            if entries.isEmpty { Text("No operations in this Profile.").font(.caption).foregroundStyle(.secondary) }
            ForEach(Array(entries.prefix(limit("Operations", entries.count))), id: \.seq) { e in
                HStack(spacing: 8) { Text("#\(Int(e.seq))").foregroundStyle(.secondary); Text(e._type.rawValue).lineLimit(1); Spacer(minLength: 0); Text(name(e.profile)).foregroundStyle(.secondary); Text(e.outcome.rawValue == "rejected" ? "Rejected" : "Accepted").foregroundStyle(e.outcome.rawValue == "rejected" ? .red : .primary); if !compact { Text(DiagnosticsFormatting.time(e.time)).foregroundStyle(.secondary) } }.font(.system(size: 11, design: .monospaced)).diagnosticsBounds("row:Operations:\(e.seq)")
            }
            showAll("Operations", entries.count)
        }
    }
    private func storage(_ s: DiagnosticsSnapshot) -> some View {
        section("Storage", summary: "\(DiagnosticsFormatting.bytes(s.storage.database_bytes + s.storage.wal_bytes)) · \(s.storage.tables.count) tables") {
            pair("Database", DiagnosticsFormatting.bytes(s.storage.database_bytes)).diagnosticsBounds("row:Storage:Database"); pair("WAL", DiagnosticsFormatting.bytes(s.storage.wal_bytes)); pair("Attachments", "\(Int(s.storage.attachments))"); pair("Attachment store", DiagnosticsFormatting.bytes(s.storage.attachment_store_bytes)); pair("Tasks with external ID", "\(Int(s.storage.external_id_tasks))"); pair("Snapshots", DiagnosticsFormatting.bytes(s.storage.snapshot_bytes)); pair("Last Snapshot", DiagnosticsFormatting.time(s.storage.last_snapshot?.created_at)); pair("Restore generation", String(s.storage.restore_generation.prefix(8)))
            DisclosureGroup("\(s.storage.tables.count) tables") { ForEach(s.storage.tables, id: \.name) { pair($0.name, "\(Int($0.count))") } }.font(.caption)
        }
    }
    private func scheduler(_ s: DiagnosticsSnapshot) -> some View {
        section("Scheduler", summary: "\(Int(s.scheduler.pending_reminders)) pending reminders") { pair("Pending reminders", "\(Int(s.scheduler.pending_reminders))").diagnosticsBounds("row:Scheduler:Pending"); pair("Next wake", DiagnosticsFormatting.stamp(s.scheduler.next_wake_at)); pair("Last ReminderFired", DiagnosticsFormatting.time(s.scheduler.last_reminder_fired?.time)); pair("Version", s.runtime.version); pair("Uptime", "\(Int(s.runtime.uptime_seconds))s") }
    }
    private func clients(_ s: DiagnosticsSnapshot) -> some View {
        let entries = s.clients.filter { profile.isEmpty || $0.profile == profile }
        return section("Clients", summary: "\(entries.count) connected") {
            if entries.isEmpty { Text("No connected clients.").font(.caption).foregroundStyle(.secondary).diagnosticsBounds("row:Clients:Empty") }
            ForEach(Array(entries.prefix(limit("Clients", entries.count))), id: \.id) { c in VStack(alignment: .leading, spacing: 4) { Text("\(c.kind.rawValue) · \(name(c.profile))"); Text("Since \(DiagnosticsFormatting.time(c.connected_since)) · event \(c.last_event_id ?? "none")").foregroundStyle(.secondary) }.font(.caption).diagnosticsBounds("row:Clients:\(c.id)") }
            showAll("Clients", entries.count)
        }
    }
    private func credentials(_ s: DiagnosticsSnapshot) -> some View {
        let entries = s.credentials.filter { profile.isEmpty || $0.profile == nil || $0.profile == profile }
        return section("Sessions", summary: "\(entries.count) active credentials") {
            ForEach(Array(entries.prefix(limit("Sessions", entries.count))), id: \.id) { c in VStack(alignment: .leading, spacing: 4) { Text(c.kind.rawValue == "session" ? "Owner Session" : c.name ?? "Access Token"); Text("\(c.scope.rawValue) · \(name(c.profile, fallback: "All Profiles"))").foregroundStyle(.secondary); Text("Expires \(c.expires_at.prefix(10)) · \(c.last_used_at.map { "last used \(DiagnosticsFormatting.time($0))" } ?? "never used")").foregroundStyle(.secondary) }.font(.caption).diagnosticsBounds("row:Sessions:\(c.id)") }
            showAll("Sessions", entries.count)
        }
    }
    private func entities(_ s: DiagnosticsSnapshot) -> some View {
        let entries = s.storage.entities.filter { profile.isEmpty || $0.profile == profile }
        return section("Profiles", summary: "\(entries.count) Profiles") {
            ForEach(entries, id: \.profile) { e in VStack(alignment: .leading, spacing: 4) { Text(name(e.profile)); Text("\(Int(e.tasks)) Tasks · \(Int(e.projects)) Projects · \(Int(e.tags)) Tags").foregroundStyle(.secondary); Text("\(Int(e.series)) Series · \(Int(e.occurrences)) Occurrences").foregroundStyle(.secondary) }.font(.caption).diagnosticsBounds("row:Profiles:\(e.profile)") }
        }
    }
    private func errors(_ s: DiagnosticsSnapshot) -> some View {
        section("Errors", summary: "\(s.errors.count) recent", defaultOpen: !s.errors.isEmpty) {
            if s.errors.isEmpty { Text("No recent errors.").font(.caption).foregroundStyle(.secondary) }
            ForEach(Array(s.errors.prefix(limit("Errors", s.errors.count, short: compact ? 1 : 5))), id: \.id) { e in
                HStack { Text(e.code).foregroundStyle(.red); Text(e.route).lineLimit(1).truncationMode(.middle) }.font(.system(size: 11, design: .monospaced)).diagnosticsBounds("row:Errors:\(e.id)")
            }
            showAll("Errors", s.errors.count, short: compact ? 1 : 5)
        }
    }
}
struct DiagnosticsSparkline: View {
    let values: [Double]
    var body: some View {
        GeometryReader { geometry in
            Path { path in
                let maximum = max(1, values.max() ?? 0)
                for (index, value) in values.enumerated() {
                    let point = CGPoint(x: geometry.size.width * Double(index) / Double(max(1, values.count - 1)), y: geometry.size.height * (1 - value / maximum))
                    if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
                }
            }.stroke(.tint, lineWidth: 1.5)
        }.accessibilityLabel("Recent samples")
    }
}

enum DiagnosticsFormatting {
    static func bytes(_ value: Double) -> String { value < 1024 ? "\(Int(value)) B" : value < 1048576 ? String(format: "%.1f KiB", value / 1024) : String(format: "%.1f MiB", value / 1048576) }
    static func stamp(_ value: String?) -> String {
        guard let value else { return "None" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
        return date?.formatted(date: .abbreviated, time: .shortened) ?? value
    }
    static func time(_ value: String?) -> String {
        guard let value else { return "None" }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
        return date?.formatted(date: .omitted, time: .standard) ?? value
    }
}
