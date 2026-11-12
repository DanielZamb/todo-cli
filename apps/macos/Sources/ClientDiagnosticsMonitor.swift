import AppKit
import Foundation
import Observation
import SwiftUI
import TodoAPI

enum ClientDiagnosticSurface: Hashable { case main, inspector, quickAdd, dependencyPicker, dependencies, batch, importPreview, settings, diagnostics }

final class ClientHeartbeatProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var pending: (at: Double, cpu: ClientCpuReading, traceID: UUID)?
    private var active = false
    private var lastRequest = 0.0
    private var lastResources = 0.0
    func setActivity(_ value: Bool) { lock.withLock { active = value; pending = nil; lastRequest = 0; lastResources = 0 } }
    func isActive() -> Bool { lock.withLock { active } }
    func request(_ now: Double, cpu: ClientCpuReading) -> Bool {
        lock.withLock {
            guard pending == nil, now - lastRequest >= (active ? 16 : 1000) else { return false }
            pending = (now, cpu, UUID()); lastRequest = now; return true
        }
    }
    func delivered(_ now: Double, active: Bool, cpu: ClientCpuReading) -> ClientStallObservation? {
        lock.withLock { let gap = observation(now, cpu: cpu); pending = nil; self.active = active; return active ? gap : nil }
    }
    func resourcesDue(_ now: Double) -> Bool { lock.withLock { guard now - lastResources >= 1000 else { return false }; lastResources = now; return true } }
    func currentGap(_ now: Double, cpu: ClientCpuReading) -> ClientStallObservation? { lock.withLock { active ? observation(now, cpu: cpu) : nil } }
    private func observation(_ now: Double, cpu: ClientCpuReading) -> ClientStallObservation? {
        pending.map { .init(traceID: $0.traceID, durationMS: now - $0.at, cpu: cpu.since($0.cpu)) }
    }
}

struct ClientDiagnosticInputReceipt {
    let time: Double
    let observedAt: Double
    let kind: ClientDiagnosticInputKind
    var consumed = false
    var releasedAt: Double?
    func isRecent(at now: Double) -> Bool { !consumed && time >= 0 && time <= observedAt && now >= (releasedAt ?? observedAt) && now - (releasedAt ?? observedAt) < 1000 }
}

@MainActor @Observable final class ClientDiagnosticsMonitor {
    @ObservationIgnored let recorder: ClientDiagnosticsRecorder
    @ObservationIgnored private let applicationActive: @MainActor @Sendable () -> Bool
    @ObservationIgnored private let notifications: NotificationCenter
    @ObservationIgnored private let watchdogTick: (@Sendable () -> Void)?
    var summary = ClientDiagnosticSummary()
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var mode = ClientDiagnosticMode.unknown
    @ObservationIgnored private var eventMonitor: Any?
    @ObservationIgnored private var observer: CFRunLoopObserver?
    @ObservationIgnored private var timer: (any DispatchSourceTimer)?
    @ObservationIgnored private var activityObservers: [NSObjectProtocol] = []
    @ObservationIgnored private var tableObservers: [NSObjectProtocol] = []
    @ObservationIgnored private var probe = ClientHeartbeatProbe()
    private struct Pending {
        let category: ClientDiagnosticAction
        let scope: Int
        var surface: ClientDiagnosticSurface
        var identity: String?
        var ready = false
        var waiting: (() -> Bool)?
        var validate: (() -> Bool)?
    }
    private final class Region {
        weak var view: ClientDiagnosticNativeView?
        init(_ view: ClientDiagnosticNativeView) { self.view = view }
    }
    @ObservationIgnored private var regions: [ObjectIdentifier: Region] = [:]
    @ObservationIgnored private var pending: [UUID: Pending] = [:]
    @ObservationIgnored private var lastInput: ClientDiagnosticInputReceipt?
    @ObservationIgnored private var lastInputScope: Int?
    @ObservationIgnored private var selection: (id: UUID, task: String?)?
    private struct PointerPress {
        let time: Double
        let window: Int
        let scope: Int
        var action: UUID?
        var released: Double?
        var recorded = false
    }
    private final class NativeSelectionTrace {
        let action: UUID
        let scope: Int
        let kind: ClientDiagnosticInputKind
        weak var table: NSTableView?
        var changing = false
        var committed = false
        var capabilities: ClientDiagnosticNativeSelectionNotifications { .init(changing: changing, committed: committed) }
        init(action: UUID, scope: Int, kind: ClientDiagnosticInputKind, table: NSTableView?) {
            self.action = action; self.scope = scope; self.kind = kind; self.table = table
        }
    }
    @ObservationIgnored private var pointer: PointerPress?
    @ObservationIgnored private var nativeSelection: NativeSelectionTrace?

    init(recorder: ClientDiagnosticsRecorder, applicationActive: @escaping @MainActor @Sendable () -> Bool = { NSApplication.shared.isActive && !NSApplication.shared.isHidden }, notifications: NotificationCenter = .default, watchdogTick: (@Sendable () -> Void)? = nil) {
        self.recorder = recorder; self.applicationActive = applicationActive; self.notifications = notifications; self.watchdogTick = watchdogTick
    }
    isolated deinit {
        timer?.cancel()
        for token in activityObservers { notifications.removeObserver(token) }
        for token in tableObservers { notifications.removeObserver(token) }
        if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }
        if let observer { CFRunLoopRemoveObserver(CFRunLoopGetMain(), observer, .commonModes) }
    }
    func start() {
        guard recorder.isOwnerSession, observer == nil else { return }
        generation += 1
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp, .leftMouseDragged, .keyDown]) { [weak self] event in
            MainActor.assumeIsolated { self?.input(event) }
            return event
        }
        observer = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, true, Int.max) { [weak self] _, _ in
            MainActor.assumeIsolated { self?.commitOpportunity() }
        }
        if let observer { CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes) }
        let source = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "local.todo.client-diagnostics-watchdog", qos: .utility))
        let recorder = recorder, probe = probe, run = generation, scope = recorder.scopeToken, tick = watchdogTick, activity = applicationActive, cpu = ClientCpuSampler()
        source.setEventHandler { @Sendable [weak self] in
            tick?()
            let now = ProcessInfo.processInfo.systemUptime * 1000
            if probe.request(now, cpu: cpu.read()) {
                DispatchQueue.main.async {
                    if let gap = probe.delivered(ProcessInfo.processInfo.systemUptime * 1000, active: activity(), cpu: cpu.read()), gap.durationMS > 100 {
                        recorder.record(gap.event(run: recorder.run, hostLoad1m: ClientCpuSampler.hostLoad1m()), ifScope: scope)
                    }
                }
            }
            guard probe.resourcesDue(now) else { return }
            if let gap = probe.currentGap(now, cpu: cpu.read()), gap.durationMS > 100 {
                recorder.record(gap.event(run: recorder.run, hostLoad1m: ClientCpuSampler.hostLoad1m()), ifScope: scope)
            }
            var event = ClientDiagnosticEvent(name: .resourcesSampled, run: recorder.run)
            event.applicationActive = probe.isActive()
            event.resources = ClientProcessResources.read(); event.incomplete = recorder.incompleteSnapshot(); recorder.record(event, ifScope: scope)
            Task { @MainActor [weak self] in
                let snapshot = await recorder.snapshot()
                guard let self, generation == run else { return }
                summary = snapshot
            }
        }
        timer = source
        updateActivity()
        activityObservers = [NSApplication.didBecomeActiveNotification, NSApplication.didResignActiveNotification, NSApplication.didHideNotification, NSApplication.didUnhideNotification].map { name in
            notifications.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in MainActor.assumeIsolated { self?.updateActivity() } }
        }
        tableObservers = [NSTableView.selectionIsChangingNotification, NSTableView.selectionDidChangeNotification,
                          NSOutlineView.selectionIsChangingNotification, NSOutlineView.selectionDidChangeNotification].map { name in
            notifications.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
                let tableID = (notification.object as? NSTableView).map(ObjectIdentifier.init)
                let changing = notification.name == NSTableView.selectionIsChangingNotification || notification.name == NSOutlineView.selectionIsChangingNotification
                MainActor.assumeIsolated { self?.nativeSelectionChanged(tableID: tableID, changing: changing) }
            }
        }
        source.resume()
    }
    private func updateActivity() {
        let active = applicationActive()
        probe.setActivity(active)
        timer?.schedule(deadline: .now(), repeating: .milliseconds(active ? 16 : 1000), leeway: .milliseconds(active ? 2 : 100))
    }
    func stop() {
        generation += 1; timer?.cancel(); timer = nil; probe = ClientHeartbeatProbe()
        for token in activityObservers { notifications.removeObserver(token) }; activityObservers.removeAll()
        for token in tableObservers { notifications.removeObserver(token) }; tableObservers.removeAll()
        if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }; eventMonitor = nil
        if let observer { CFRunLoopRemoveObserver(CFRunLoopGetMain(), observer, .commonModes) }; observer = nil
        pending.removeAll(); selection = nil; nativeSelection = nil; pointer = nil; lastInput = nil; lastInputScope = nil; summary = .init(); mode = .unknown
        regions = regions.filter { $0.value.view != nil }
    }
    func register(_ view: ClientDiagnosticNativeView) {
        guard recorder.isEnabled else { return }
        regions[ObjectIdentifier(view)] = Region(view)
        if let value = view.mode { mode = value }
    }
    func attached(_ view: ClientDiagnosticNativeView) {
        register(view)
        let category: ClientDiagnosticAction?
        switch view.surface { case .settings: category = .openSettings; case .diagnostics: category = .openDiagnostics; default: category = nil }
        if let category, let surface = view.surface { let id = begin(category, surface: surface); publish(id) }
    }
    func unregister(_ view: ClientDiagnosticNativeView) { regions.removeValue(forKey: ObjectIdentifier(view)) }
    private func table(_ view: NSView?) -> NSTableView? {
        var current = view
        while let candidate = current { if let table = candidate as? NSTableView { return table }; current = candidate.superview }
        return nil
    }
    func input(_ event: NSEvent) {
        guard recorder.isOwnerSession else { return }
        if event.type == .leftMouseUp {
            guard let press = pointer, press.scope == recorder.scopeToken, press.window == event.windowNumber, press.released == nil else { return }
            let now = ProcessInfo.processInfo.systemUptime * 1000, released = event.timestamp * 1000
            guard released >= press.time, released <= now else { return }
            pointer?.released = released
            lastInput?.releasedAt = now
            recordRelease()
            return
        }
        if event.type == .leftMouseDragged {
            if let selected = selection { recorder.endAction(selected.id, outcome: .drag); pending.removeValue(forKey: selected.id); selection = nil }
            return
        }
        let kind: ClientDiagnosticInputKind = event.type == .keyDown ? .keyboard : .pointer
        nativeSelection = nil; pointer = nil
        mode = regions.values.compactMap { region -> ClientDiagnosticMode? in
            guard let view = region.view, view.window === event.window else { return nil }
            return view.mode
        }.first ?? .unknown
        lastInput = ClientDiagnosticInputReceipt(time: event.timestamp * 1000, observedAt: ProcessInfo.processInfo.systemUptime * 1000, kind: kind)
        lastInputScope = recorder.scopeToken
        if event.type == .leftMouseDown { pointer = PointerPress(time: event.timestamp * 1000, window: event.windowNumber, scope: recorder.scopeToken) }
        regions = regions.filter { $0.value.view != nil }
        if event.type == .leftMouseDown {
            for region in regions.values {
                guard let view = region.view, let task = view.task, view.window === event.window else { continue }
                let point = view.convert(event.locationInWindow, from: nil)
                guard view.bounds.contains(point), point.x >= 36 else { continue }
                if let table = table(view) {
                    let row = table.row(at: table.convert(event.locationInWindow, from: nil))
                    if row >= 0 && row == table.selectedRow {
                        if let selected = selection { recorder.endAction(selected.id, outcome: .superseded); pending.removeValue(forKey: selected.id); selection = nil }
                        return
                    }
                }
                if let selected = selection { recorder.endAction(selected.id, outcome: .superseded); pending.removeValue(forKey: selected.id) }
                if let id = begin(.taskSelection, surface: .inspector, identity: task, startHandler: false) {
                    selection = (id, task)
                    nativeSelection = NativeSelectionTrace(action: id, scope: recorder.scopeToken, kind: .pointer, table: table(view))
                }
                if hasSurface(.inspector, identity: task) { selected(task) }
                return
            }
        } else if event.type == .keyDown && [125, 126].contains(event.keyCode) {
            guard let table = table(event.window?.firstResponder as? NSView), regions.values.contains(where: { $0.view?.task != nil && self.table($0.view) === table }) else { return }
            guard table.isEnabled, table.selectedRow >= 0 else { return }
            let direction = event.keyCode == 125 ? 1 : -1
            var next = table.selectedRow + direction
            while next >= 0 && next < table.numberOfRows {
                let group = table.delegate?.tableView?(table, isGroupRow: next) ?? false
                if !group && (table.delegate?.tableView?(table, shouldSelectRow: next) ?? true) { break }
                next += direction
            }
            guard next >= 0 && next < table.numberOfRows else { return }
            if let selected = selection { recorder.endAction(selected.id, outcome: .superseded); pending.removeValue(forKey: selected.id) }
            if let id = begin(.keyboardSelection, surface: .inspector, startHandler: false) {
                selection = (id, nil)
                nativeSelection = NativeSelectionTrace(action: id, scope: recorder.scopeToken, kind: .keyboard, table: table)
            }
        }
    }
    private func recordRelease() {
        guard let press = pointer, let id = press.action, let released = press.released, !press.recorded, press.scope == recorder.scopeToken else { return }
        var event = ClientDiagnosticEvent(name: .inputReleased, run: recorder.run)
        event.actionID = id; event.traceID = id; event.inputKind = .pointer; event.mode = mode
        event.inputMS = released; event.durationMS = released - press.time
        if nativeSelection?.action == id { event.nativeSelectionNotifications = nativeSelection?.capabilities }
        recorder.record(event, ifScope: press.scope); pointer?.recorded = true
        if press.scope == recorder.scopeToken { recorder.inputReleased(id, atMS: released) }
    }
    private func nativeSelectionChanged(tableID: ObjectIdentifier?, changing: Bool) {
        guard recorder.isOwnerSession, let trace = nativeSelection, trace.scope == recorder.scopeToken,
              let table = trace.table, tableID == ObjectIdentifier(table),
              pending[trace.action] != nil || (pointer?.action == trace.action && pointer?.released == nil) else { return }
        let name: ClientDiagnosticName
        if changing { trace.changing = true; name = .nativeSelectionChanging }
        else { trace.committed = true; name = .nativeSelectionCommitted }
        var event = ClientDiagnosticEvent(name: name, run: recorder.run)
        event.actionID = trace.action; event.traceID = trace.action; event.inputKind = trace.kind; event.mode = mode
        recorder.record(event, ifScope: trace.scope)
    }
    @discardableResult func begin(_ category: ClientDiagnosticAction, surface: ClientDiagnosticSurface = .main, identity: String? = nil, startHandler: Bool = true) -> UUID? {
        guard recorder.isOwnerSession else { return nil }
        for (id, item) in pending where item.category == category { recorder.endAction(id, outcome: .superseded); pending.removeValue(forKey: id) }
        let input = lastInput.flatMap { value in lastInputScope == recorder.scopeToken && value.isRecent(at: ProcessInfo.processInfo.systemUptime * 1000) ? value : nil }
        lastInput?.consumed = true
        guard let id = recorder.beginAction(category, inputMS: input?.time, mode: mode, inputKind: input?.kind ?? .unknown) else { return nil }
        pending[id] = Pending(category: category, scope: recorder.scopeToken, surface: surface, identity: identity)
        if let input, input.kind == .pointer, pointer?.time == input.time, pointer?.scope == recorder.scopeToken, pointer?.action == nil {
            pointer?.action = id; recordRelease()
        }
        if startHandler { recorder.handlerStarted(id) }
        return id
    }
    func selected(_ task: String) {
        if selection == nil, lastInputScope == recorder.scopeToken, let input = lastInput, input.kind == .keyboard, input.isRecent(at: ProcessInfo.processInfo.systemUptime * 1000), let id = begin(.keyboardSelection, surface: .inspector, identity: task, startHandler: false) { selection = (id, task) }
        guard let selected = selection, pending[selected.id]?.scope == recorder.scopeToken, selected.task == nil || selected.task == task else { return }
        pending[selected.id]?.identity = task; selection?.task = task
        recorder.handlerStarted(selected.id)
        var event = ClientDiagnosticEvent(name: .selectionCommitted, run: recorder.run); event.actionID = selected.id; recorder.record(event, ifScope: pending[selected.id]?.scope)
        if hasSurface(.inspector, identity: task) { publish(selected.id) }
    }
    var selectionAction: UUID? { selection?.id }
    func inspectorPublished(_ task: String) {
        for (id, item) in pending where item.surface == .inspector && item.identity == task { publish(id) }
    }
    func publish(_ id: UUID?, validate: (() -> Bool)? = nil) {
        guard let id, pending[id] != nil else { return }
        pending[id]?.ready = true; pending[id]?.validate = validate
        recorder.resultPublished(id)
    }
    func awaitResult(_ id: UUID?, predicate: @escaping () -> Bool) { if let id { pending[id]?.waiting = predicate } }
    func publishReadyActions() {
        for (id, item) in pending where !item.ready { if item.waiting?() == true { publish(id) } }
    }
    func perform(_ category: ClientDiagnosticAction, surface: ClientDiagnosticSurface = .main, ready: (() -> Bool)? = nil, operation: @escaping @MainActor () async -> Void) {
        let id = begin(category, surface: surface, startHandler: false), mode = mode, input = lastInput?.kind ?? .unknown
        Task { @MainActor [weak self] in
            self?.recorder.handlerStarted(id)
            await ClientDiagnosticContext.$mode.withValue(mode) {
                await ClientDiagnosticContext.$inputKind.withValue(input) {
                    await ClientDiagnosticContext.$actionID.withValue(id) { await operation() }
                }
            }
            if let ready { self?.awaitResult(id, predicate: ready); self?.publishReadyActions() } else { self?.publish(id) }
        }
    }
    func performSync(_ category: ClientDiagnosticAction, surface: ClientDiagnosticSurface = .main, operation: () -> Void) {
        let id = begin(category, surface: surface)
        ClientDiagnosticContext.$mode.withValue(mode) {
            ClientDiagnosticContext.$inputKind.withValue(lastInput?.kind ?? .unknown) {
                ClientDiagnosticContext.$actionID.withValue(id) { operation() }
            }
        }
        publish(id)
    }
    func deferred(_ category: ClientDiagnosticAction, surface: ClientDiagnosticSurface = .main, predicate: @escaping () -> Bool, operation: () -> Void) {
        let id = begin(category, surface: surface)
        awaitResult(id, predicate: predicate)
        ClientDiagnosticContext.$mode.withValue(mode) {
            ClientDiagnosticContext.$inputKind.withValue(lastInput?.kind ?? .unknown) {
                ClientDiagnosticContext.$actionID.withValue(id) { operation() }
            }
        }
        publishReadyActions()
    }
    private func hasSurface(_ surface: ClientDiagnosticSurface, identity: String?) -> Bool {
        regions.values.contains {
            guard let view = $0.view, view.surface == surface, identity == nil || view.identity == identity, view.window?.isVisible == true, !view.isHiddenOrHasHiddenAncestor, view.bounds.width > 0, view.bounds.height > 0 else { return false }
            var ancestor: NSView? = view
            while let current = ancestor { if current.needsLayout { return false }; ancestor = current.superview }
            return true
        }
    }
    private func commitOpportunity() {
        guard recorder.isOwnerSession else { return }
        publishReadyActions()
        for (id, item) in pending where item.ready && item.validate?() != false {
            guard item.scope == recorder.scopeToken else { continue }
            guard hasSurface(item.surface, identity: item.identity) else { continue }
            if item.surface == .inspector {
                var event = ClientDiagnosticEvent(name: .inspectorCommitted, run: recorder.run); event.actionID = id
                if nativeSelection?.action == id { event.nativeSelectionNotifications = nativeSelection?.capabilities }
                recorder.record(event)
            }
            recorder.layoutCommitted(id); pending.removeValue(forKey: id)
            if selection?.id == id { selection = nil }
        }
    }
}

@MainActor final class ClientDiagnosticNativeView: NSView {
    weak var monitor: ClientDiagnosticsMonitor?
    var surface: ClientDiagnosticSurface?
    var identity: String?
    var task: String?
    var mode: ClientDiagnosticMode?
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil { monitor?.unregister(self) } else { monitor?.attached(self) }
    }
}
struct ClientDiagnosticSurfaceView: View {
    let monitor: ClientDiagnosticsMonitor
    var surface: ClientDiagnosticSurface? = nil
    var identity: String? = nil
    var task: String? = nil
    var mode: ClientDiagnosticMode? = nil
    var body: some View {
        if monitor.recorder.isEnabled { ClientDiagnosticNativeMarker(monitor: monitor, surface: surface, identity: identity, task: task, mode: mode) }
    }
}
private struct ClientDiagnosticNativeMarker: NSViewRepresentable {
    let monitor: ClientDiagnosticsMonitor
    var surface: ClientDiagnosticSurface? = nil
    var identity: String? = nil
    var task: String? = nil
    var mode: ClientDiagnosticMode? = nil
    func makeNSView(context: Context) -> ClientDiagnosticNativeView { let view = ClientDiagnosticNativeView(); updateNSView(view, context: context); return view }
    func updateNSView(_ view: ClientDiagnosticNativeView, context: Context) {
        view.monitor = monitor; view.surface = surface; view.identity = identity; view.task = task; view.mode = mode
        monitor.register(view)
    }
    static func dismantleNSView(_ view: ClientDiagnosticNativeView, coordinator: ()) { view.monitor?.unregister(view) }
}
