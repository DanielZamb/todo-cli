import SwiftUI

struct SeriesView: View {
    @Bindable var model: TodoModel
    var compact = false
    @State private var draft: RecurrenceDraft
    @State private var start: TaskTime?
    private let original: SeriesDefinition?
    private var custom: Bool { original.map { RecurrenceDraft(rule: $0.recurrence.rrule).preset == .custom } ?? false }

    init(model: TodoModel, compact: Bool = false) {
        self.model = model
        self.compact = compact
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
            ScrollView {
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
            if original == nil {
                VStack(alignment: .leading, spacing: 8) {
                    Text("First Occurrence Dependencies").font(.subheadline.weight(.semibold))
                    Text("Later Occurrences start without Dependencies.").font(.caption).foregroundStyle(.secondary)
                    InitialDependencySelection(tasks: Binding(get: { model.dependencies.firstOccurrenceInitial }, set: { model.dependencies.firstOccurrenceInitial = $0 }), enabled: model.canWrite) { Task { await model.openInitialDependencyPicker(firstOccurrence: true) } }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            // The raw rule only describes a custom rule; a preset is already named in the Repeat row.
            if custom { Text(original?.recurrence.rrule ?? "").font(.caption.monospaced()).compactBounds("series-raw-rule") }
            if custom { Text("This custom rule is preserved. Preset editing is unavailable.").foregroundStyle(.secondary) }
            if let dates = original?.recurrence.exdate, !dates.isEmpty {
                Text("Excluded: " + dates.map(\.display).joined(separator: ", ")).font(.caption)
            }
            if let error = model.editorError { Text(error).foregroundStyle(TodoColors.color("destructive")) }
            }.compactBounds("series-scroll")
            HStack {
                if original != nil {
                    Button("Skip Occurrence") { Task { await model.write(.skipOccurrence) } }.disabled(!model.canWrite)
                }
                Spacer()
                Button("Close") { model.recurrenceDraft = nil; model.showingSeries = false }.disabled(model.busy).keyboardShortcut(.cancelAction)
                Button(original == nil ? "Create Series" : "Save Series") {
                    if let start { Task { await model.saveSeries(Recurrence(dtstart: start, rrule: draft.rule, exdate: model.recurrenceDraft?.exdate ?? original?.recurrence.exdate ?? [])) } }
                }.buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction).compactBounds("series-primary").disabled(!model.canWrite || custom || !draft.valid || start == nil)
            }.compactBounds("series-actions")
        }.padding(compact ? 16 : 24).frame(width: compact ? 393 : 580, height: compact ? 426 : 600)
            .interactiveDismissDisabled(model.busy)
            .sheet(item: Binding(get: { model.dependencies.picker }, set: { if $0 == nil { model.closeDependencyPicker() } })) { _ in DependencyPickerView(model: model, compact: compact) }
    }
}
