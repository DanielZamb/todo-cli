import SwiftUI

struct SeriesView: View {
    @Bindable var model: TodoModel
    @State private var draft: RecurrenceDraft
    @State private var start: TaskTime?
    private let original: SeriesDefinition?
    private var custom: Bool { original.map { RecurrenceDraft(rule: $0.recurrence.rrule).preset == .custom } ?? false }

    init(model: TodoModel) {
        self.model = model
        original = model.series
        _draft = State(initialValue: RecurrenceDraft(rule: model.recurrenceDraft?.rrule ?? model.series?.recurrence.rrule ?? "FREQ=DAILY"))
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        _start = State(initialValue: model.recurrenceDraft?.dtstart ?? model.series?.recurrence.dtstart ?? model.editor?.scheduled ?? model.editor?.due ?? TaskTime(kind: "date", date: formatter.string(from: Date())))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(original == nil ? "Create Series" : "Series recurrence").font(.title2.weight(.semibold))
            Text(original == nil ? "Create a new Series using these task details. The current Task stays in this Profile." : "Changes apply to this Occurrence and future Occurrences.").foregroundStyle(.secondary)
            Form {
                Picker("Repeat", selection: $draft.preset) {
                    ForEach(RecurrencePreset.allCases.filter { $0 != .custom || custom }, id: \.self) { Text($0.rawValue).tag($0) }
                }
                if draft.preset == .weekly {
                    HStack {
                        ForEach(Weekday.allCases, id: \.self) { day in
                            Toggle(day.title, isOn: Binding(get: { draft.days.contains(day) }, set: { selected in
                                if selected { draft.days.insert(day) } else { draft.days.remove(day) }
                            })).toggleStyle(.button)
                        }
                    }
                }
                if draft.preset == .monthlyDate { Stepper("Day of month: \(String(draft.day))", value: $draft.day, in: 1...31) }
                if draft.preset == .monthlyPosition {
                    Picker("Position", selection: $draft.position) {
                        ForEach([1, 2, 3, 4, -1], id: \.self) { Text($0 == -1 ? "Last" : String($0)).tag($0) }
                    }
                    Picker("Weekday", selection: $draft.weekday) {
                        ForEach(Weekday.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                }
                TimeField(title: "Starts", value: $start)
            }.formStyle(.grouped).scrollDisabled(true).scrollContentBackground(.hidden).disabled(custom || model.busy)
            Text(custom ? original?.recurrence.rrule ?? "" : draft.rule).font(.caption.monospaced())
            if custom { Text("This custom rule is preserved. Preset editing is unavailable.").foregroundStyle(.secondary) }
            if let dates = original?.recurrence.exdate, !dates.isEmpty {
                Text("Excluded: " + dates.map(\.display).joined(separator: ", ")).font(.caption)
            }
            if let error = model.editorError { Text(error).foregroundStyle(TodoColors.color("destructive")) }
            HStack {
                if original != nil {
                    Button("Skip Occurrence") { Task { await model.write(.skipOccurrence) } }.disabled(!model.canWrite)
                }
                Spacer()
                Button("Close") { model.recurrenceDraft = nil; model.showingSeries = false }.disabled(model.busy).keyboardShortcut(.cancelAction)
                Button(original == nil ? "Create Series" : "Save Series") {
                    if let start { Task { await model.saveSeries(Recurrence(dtstart: start, rrule: draft.rule, exdate: model.recurrenceDraft?.exdate ?? original?.recurrence.exdate ?? [])) } }
                }.buttonStyle(.glassProminent).disabled(!model.canWrite || custom || !draft.valid || start == nil)
            }
        }.padding(24).frame(width: 580).fixedSize(horizontal: false, vertical: true)
            .interactiveDismissDisabled(model.busy)
    }
}
