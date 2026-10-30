import Foundation
import SwiftUI
import TodoAPI

struct TaskListFilters: Equatable {
    var status = ""
    var priority = ""
    var due = ""
    var scheduled = ""
    var attachment = ""
    var energy = ""
    var estimate = ""
    var count: Int { [status, priority, due, scheduled, attachment, energy, estimate].filter { !$0.isEmpty }.count }
    var isEmpty: Bool { count == 0 }
    private func optional(_ value: String) -> String? { value.isEmpty ? nil : value }
    var query: Operations.tasks_period_list.Input.Query {
        .init(status: .init(rawValue: status), priority: .init(rawValue: priority), due: optional(due), scheduled: optional(scheduled),
              attachment: optional(attachment), energy: .init(rawValue: energy), estimate: optional(estimate))
    }
    var summary: String {
        [status.capitalized, priority,
         due.isEmpty ? "" : due == "none" ? "No due date" : "Due \(due)",
         scheduled.isEmpty ? "" : scheduled == "none" ? "Not scheduled" : "Scheduled \(scheduled)",
         attachment.isEmpty ? "" : "Attachment: \(attachment)",
         energy.isEmpty ? "" : energy == "none" ? "No Energy" : "Energy \(energy)",
         estimate.isEmpty ? "" : estimate == "none" ? "No estimate" : "\(estimate) min"].filter { !$0.isEmpty }.joined(separator: " · ")
    }
    var isValid: Bool {
        estimate.isEmpty || estimate == "none" || estimate.range(of: "^[1-9][0-9]*$", options: .regularExpression) != nil
    }
}

struct TaskFilterView: View {
    @State var draft: TaskListFilters
    var compact = false
    var planning = false
    var apply: (TaskListFilters) -> Void
    var close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Filter tasks").font(.headline)
            Text("Tasks must match every selected filter.").foregroundStyle(.secondary)
            Form {
                Picker("Status", selection: $draft.status) {
                    Text("Any").tag("")
                    ForEach(["open", "closed", "done", "cancelled", "snoozed"], id: \.self) { Text($0.capitalized).tag($0) }
                }.accessibilityIdentifier("filter-status")
                    .disabled(planning)
                    .accessibilityHint(planning ? "Planning views show open Tasks only." : "")
                if planning { Text("Planning views show open Tasks only.").font(.caption).foregroundStyle(.secondary) }
                Picker("Priority", selection: $draft.priority) {
                    Text("Any").tag("")
                    ForEach(["P1", "P2", "P3", "P4"], id: \.self) { Text($0).tag($0) }
                }.accessibilityIdentifier("filter-priority")
                dateFilter("Due date", value: $draft.due)
                dateFilter("Scheduled date", value: $draft.scheduled)
                TextField("Attachment contains", text: $draft.attachment, prompt: Text("Name, label, path or URL"))
                    .accessibilityIdentifier("filter-attachment")
                Picker("Energy", selection: $draft.energy) {
                    Text("Any").tag("")
                    ForEach(1...5, id: \.self) { Text(String($0)).tag(String($0)) }
                    Text("No Energy").tag("none")
                }.accessibilityIdentifier("filter-energy")
                TextField("Estimated time, minutes", text: Binding(get: { draft.estimate == "none" ? "" : draft.estimate }, set: { draft.estimate = $0 }), prompt: Text("Any"))
                    .accessibilityIdentifier("filter-estimate")
                Toggle("No estimate", isOn: Binding(get: { draft.estimate == "none" }, set: { draft.estimate = $0 ? "none" : "" }))
            }.formStyle(.grouped)
            if !draft.isValid { Text("Enter a positive whole number of minutes.").foregroundStyle(TodoColors.color("destructive")) }
            HStack {
                Button("Clear all") { draft = .init() }
                Spacer()
                Button("Cancel", action: close).keyboardShortcut(.cancelAction)
                Button("Apply filters") { var value = draft; if planning { value.status = "" }; apply(value); close() }.keyboardShortcut(.defaultAction).disabled(!draft.isValid)
                    .accessibilityIdentifier("apply-task-filters")
            }
        }.padding(16).frame(width: compact ? 360 : 460, height: compact ? 390 : 540)
    }

    private func dateFilter(_ label: String, value: Binding<String>) -> some View {
        let onDate = !value.wrappedValue.isEmpty && value.wrappedValue != "none"
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return Group {
            Picker(label, selection: Binding(get: { onDate ? "on" : value.wrappedValue }, set: { value.wrappedValue = $0 == "on" ? formatter.string(from: Date()) : $0 })) {
                Text("Any date").tag("")
                Text("No date").tag("none")
                Text("On date").tag("on")
            }
            if onDate {
                DatePicker("\(label) on", selection: Binding(get: { formatter.date(from: value.wrappedValue) ?? Date() }, set: { value.wrappedValue = formatter.string(from: $0) }), displayedComponents: .date)
            }
        }
    }
}
