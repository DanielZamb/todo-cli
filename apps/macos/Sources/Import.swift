import Foundation
import OpenAPIRuntime
import TodoAPI
import SwiftUI
import UniformTypeIdentifiers

struct ImportDocument: Sendable {
    let name: String
    let items: [OpenAPIValueContainer]

    init(data: Data, name: String) throws {
        self.name = name
        let text = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw ImportFileError.empty }
        if text.hasPrefix("[") {
            items = try JSONDecoder().decode([OpenAPIValueContainer].self, from: Data(text.utf8))
        } else {
            items = try text.split(whereSeparator: \.isNewline).map {
                try JSONDecoder().decode(OpenAPIValueContainer.self, from: Data($0.utf8))
            }
        }
    }

    func title(at index: Int) -> String? {
        guard items.indices.contains(index), let data = try? JSONEncoder().encode(items[index]) else { return nil }
        return (try? JSONDecoder().decode(ImportIdentity.self, from: data))?.title
    }

    func pinned(to preview: ImportSummary) throws -> [OpenAPIValueContainer] {
        let pinned = try items.enumerated().map { index, item in
            let data = try JSONEncoder().encode(item)
            guard var fields = try? JSONDecoder().decode([String: OpenAPIValueContainer].self, from: data),
                  preview.items.indices.contains(index)
            else { return item }
            let version = preview.items[index].from_version
            if fields["from_version"] == nil { fields["from_version"] = try JSONDecoder().decode(OpenAPIValueContainer.self, from: JSONEncoder().encode(version)) }
            if fields["task_id"] == nil { fields["task_id"] = try JSONDecoder().decode(OpenAPIValueContainer.self, from: JSONEncoder().encode(preview.items[index].task_id)) }
            return try JSONDecoder().decode(OpenAPIValueContainer.self, from: JSONEncoder().encode(fields))
        }
        return pinned
    }

    func cancellations(from preview: ImportSummary) -> Operations.tasks_period_importTasks.Input.Body.jsonPayload.close_missing_candidatesPayload {
        preview.items.dropFirst(items.count).compactMap { row in
            guard row.outcome == "updated", row.changed_fields.contains("status"), let task = row.task_id, let version = row.from_version else { return nil }
            return .init(external_id: row.external_id, task_id: task, from_version: version)
        }
    }
}
private struct ImportIdentity: Decodable { let title: String? }
enum ImportFileError: LocalizedError {
    case empty
    var errorDescription: String? { "Choose a JSON array or NDJSON file containing Tasks." }
}
struct ImportSummary: Codable, Sendable {
    struct Row: Codable, Identifiable, Sendable {
        struct Failure: Codable, Sendable {
            struct Details: Codable, Sendable { let current_version: Int? }
            let code: String
            let message: String
            let details: Details?
        }
        var id: String { external_id }
        let external_id: String
        let outcome: String
        let task_id: String?
        let from_version: Int?
        let changed_fields: [String]
        let error: Failure?
        var changesText: String {
            let names = ["project_name": "Project", "project_id": "Project", "tag_names": "Tags", "tags": "Tags", "external_id": "External id", "due_at": "Due", "scheduled_at": "Scheduled", "estimate_min": "Estimate"]
            let fields = changed_fields.filter { outcome != "created" || $0 != "external_id" }.map { names[$0] ?? $0.replacingOccurrences(of: "_", with: " ").capitalized }.joined(separator: ", ")
            return outcome == "created" ? "New Task" + (fields.isEmpty ? "" : " · \(fields)") : (fields.isEmpty ? "No changes" : fields)
        }
        var outcomeText: String { error?.code == "occ_conflict" ? "Conflict" : outcome.capitalized }
    }
    struct Totals: Codable, Equatable, Sendable {
        let created: Int
        let updated: Int
        let unchanged: Int
        let rejected: Int
        var nonzero: [(name: String, count: Int)] {
            [("created", created), ("updated", updated), ("unchanged", unchanged), ("rejected", rejected)].filter { $0.1 > 0 }
        }
    }
    let generated_at: String
    let dry_run: Bool
    let items: [Row]
    let totals: Totals
}

enum ImportLayoutRegion: Hashable { case viewport, footer, summary, fileChange, fileChoose, primary, cancel, row(Int) }
struct ImportLayoutFrames: PreferenceKey {
    static let defaultValue: [ImportLayoutRegion: CGRect] = [:]
    static func reduce(value: inout [ImportLayoutRegion: CGRect], nextValue: () -> [ImportLayoutRegion: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, next in next }) }
}
private extension View {
    func importFrame(_ region: ImportLayoutRegion) -> some View {
        background(GeometryReader { geometry in Color.clear.preference(key: ImportLayoutFrames.self, value: [region: geometry.frame(in: .named("import-layout"))]) })
    }
}
struct ImportView: View {
    @Bindable var model: TodoModel
    var compact = false
    @State private var choosingFile = false
    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 8 : 16) {
            Text(model.importReport.map { $0.dry_run ? "Preview import" : "Import results" } ?? "Import Tasks")
                .font(.title2.weight(.semibold))
            if let document = model.importDocument {
                HStack(spacing: 4) {
                    Text("\(document.name) · \(model.profileName) ·")
                        .font(.callout).foregroundStyle(.secondary).lineLimit(1).help(document.name)
                    Button { choosingFile = true } label: { Text("Change…").frame(minHeight: 28) }
                        .buttonStyle(.borderless).foregroundStyle(.secondary).disabled(model.busy).importFrame(.fileChange)
                }
            } else {
                Text("Choose a JSON array or NDJSON file to match Tasks by external id.")
                    .font(.callout).foregroundStyle(.secondary)
            }
            if let report = model.importReport {
                if compact {
                    HStack(spacing: 0) {
                        ForEach(Array(report.totals.nonzero.enumerated()), id: \.offset) { index, outcome in
                            if index > 0 { Text(" · ").foregroundStyle(.secondary) }
                            Text("\(outcome.count) \(outcome.name)")
                                .foregroundStyle(outcome.name == "rejected" ? TodoColors.color("destructive") : .secondary)
                        }
                        if report.totals.nonzero.isEmpty { Text("No changes").foregroundStyle(.secondary) }
                    }.font(.caption).lineLimit(1).importFrame(.summary)
                } else {
                    HStack(spacing: 24) {
                        count(report.totals.created, "created")
                        count(report.totals.updated, "updated")
                        count(report.totals.unchanged, "unchanged")
                        count(report.totals.rejected, "rejected")
                    }.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 8)).importFrame(.summary)
                }
                if report.items.isEmpty {
                    ContentUnavailableView("No Tasks in this file", systemImage: "doc", description: Text("Choose another file to import Tasks."))
                        .frame(maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {
                            if !compact { HStack { Text("Task"); Spacer(); Text("Outcome") }.font(.caption).foregroundStyle(.secondary).padding(.bottom, 8) }
                            ForEach(Array(report.items.enumerated()), id: \.offset) { index, row in
                                let title = model.importDocument?.title(at: index) ?? (index >= (model.importDocument?.items.count ?? 0) ? "Cancel missing Task" : "Untitled Task")
                                HStack(alignment: .top, spacing: 8) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(title).fontWeight(.medium).lineLimit(compact ? 1 : nil).help(title)
                                        Text(row.external_id.isEmpty ? "Missing external id" : row.external_id)
                                            .font(.caption).foregroundStyle(.secondary).textSelection(.enabled).lineLimit(1).help(row.external_id)
                                        if let error = row.error {
                                            Text(error.message).font(.caption).foregroundStyle(TodoColors.color("destructive").opacity(0.85)).lineLimit(compact ? 1 : nil).help(error.message)
                                        } else {
                                            Text(row.changesText).font(.caption).foregroundStyle(.secondary).lineLimit(compact ? 1 : nil).help(row.changesText)
                                        }
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                    Text(row.outcomeText).font(.callout).foregroundStyle(row.outcome == "rejected" ? TodoColors.color("destructive") : .primary).fixedSize()
                                }.padding(.top, compact ? 0 : 12).padding(.bottom, compact ? 8 : 12)
                                    .frame(height: compact ? 56 : nil, alignment: .top).importFrame(.row(index))
                                    .overlay(alignment: .bottom) { if compact { Divider() } }
                                if !compact { Divider() }
                            }
                        }.padding(.trailing, 8)
                    }.scrollIndicators(.visible)
                        .frame(minHeight: compact ? 224 : 240, maxHeight: compact ? 224 : .infinity).clipped()
                        .importFrame(.viewport).accessibilityIdentifier("import-preview-table")
                }
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: "square.and.arrow.down").font(.system(size: 30)).foregroundStyle(.secondary)
                    Button { choosingFile = true } label: { Text("Choose file…").frame(minHeight: 28) }
                        .disabled(model.busy).accessibilityIdentifier("import-choose-file").importFrame(.fileChoose)
                    if let file = model.importDocument { Text("\(TaskCount.text(file.items.count, capitalized: true)) ready to preview").foregroundStyle(.secondary) }
                }.frame(maxWidth: .infinity, minHeight: compact ? 80 : 140).padding(16)
                    .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 12))
                Toggle("Cancel missing Tasks with external ids", isOn: $model.importCloseMissing).disabled(model.busy).frame(minHeight: 28).accessibilityIdentifier("import-close-missing")
                Spacer(minLength: 0)
            }
            if compact && model.importReport != nil { Spacer(minLength: 0) }
            if let error = model.importError { Text(error).foregroundStyle(TodoColors.color("destructive")).font(.callout).accessibilityIdentifier("import-error") }
            if !model.canWrite && !model.busy { Text("Offline. Reconnect to preview or apply.").font(.callout).foregroundStyle(.secondary) }
            VStack(alignment: .leading, spacing: compact ? 8 : 12) {
                if let report = model.importReport {
                    Divider()
                    if report.totals.rejected > 0 {
                        let rejected = report.totals.rejected
                        Text("\(rejected) rejected \(rejected == 1 ? "item" : "items") \(report.dry_run ? "will be skipped." : rejected == 1 ? "was skipped." : "were skipped.")")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                HStack(spacing: compact ? 8 : 12) {
                    Spacer(minLength: 0)
                    if model.importReport?.dry_run == false {
                        Button { model.showingImport = false } label: { Text("Done").frame(minHeight: 28) }
                            .buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction).disabled(model.busy).importFrame(.primary)
                    } else {
                        Button { model.showingImport = false } label: { Text("Cancel").frame(minHeight: 28) }
                            .keyboardShortcut(.cancelAction).disabled(model.busy).importFrame(.cancel)
                    }
                    if model.importReport == nil {
                        Button { Task { await model.previewImport() } } label: { Text(model.busy ? "Previewing…" : "Preview changes").frame(minHeight: 28) }
                            .buttonStyle(.borderedProminent).disabled(model.importDocument == nil || !model.canWrite)
                            .keyboardShortcut(.defaultAction).accessibilityIdentifier("import-preview").importFrame(.primary)
                    } else if let report = model.importReport, report.dry_run {
                        let changes = report.totals.created + report.totals.updated
                        Button { Task { await model.applyImport() } } label: { Text(model.busy ? "Applying…" : "Apply \(changes) \(changes == 1 ? "change" : "changes")").frame(minHeight: 28) }
                            .buttonStyle(.borderedProminent).disabled(!model.canWrite || changes == 0)
                            .keyboardShortcut(.defaultAction).accessibilityIdentifier("import-apply").importFrame(.primary)
                    }
                }.controlSize(compact ? .small : .regular)
            }.fixedSize(horizontal: false, vertical: true).importFrame(.footer)
        }.padding(compact ? 12 : 24)
            .frame(width: compact ? 393 : 720, height: compact ? 426 : 620)
            .coordinateSpace(name: "import-layout")
            .fileImporter(isPresented: $choosingFile, allowedContentTypes: [.json, .plainText, .data]) { result in
                do {
                    let url = try result.get()
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    model.loadImport(data: try Data(contentsOf: url), name: url.lastPathComponent)
                } catch { model.importError = "Cannot read this file. Choose a JSON array or NDJSON file." }
            }
    }
    private func count(_ value: Int, _ name: String) -> some View {
        VStack(alignment: .leading, spacing: 2) { Text("\(value)").font(.headline); Text(name).font(.caption).foregroundStyle(.secondary) }
    }
}
