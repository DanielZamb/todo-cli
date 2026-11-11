import AppKit
import SwiftUI
import Darwin
import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
@testable import TodoState

private final class DiagnosticTestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 1000.0
    func read() -> Double { lock.withLock { value } }
    func set(_ value: Double) { lock.withLock { self.value = value } }
}

@MainActor private final class DiagnosticSelectionRows: NSObject, NSTableViewDataSource {
    func numberOfRows(in tableView: NSTableView) -> Int { 3 }
    func tableView(_ tableView: NSTableView, objectValueFor tableColumn: NSTableColumn?, row: Int) -> Any? { "Synthetic Task \(row)" }
}

private final class DiagnosticTickCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    func tick() { lock.withLock { value += 1 } }
    func read() -> Int { lock.withLock { value } }
}
@MainActor private final class DiagnosticActivity { var active = false }

@Suite(.serialized) struct ClientDiagnosticsTests {
    @Test func routinePollsAreAggregatedButFailuresAndSlowRepliesKeepTheirPhases() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let clock = DiagnosticTestClock(), recorder = ClientDiagnosticsRecorder(journalDirectory: root, clock: { clock.read() })
        recorder.authorizeOwnerSession(true)
        await ClientDiagnosticContext.$periodicPoll.withValue(true) { () async in
            for (operation, duration, status, handler) in [("system.health", 10.0, 200, 2.0), ("system.health", 20.0, 200, 4.0), ("diagnostics.snapshot", 15.0, 200, 3.0), ("system.health", 5.0, 503, 1.0), ("system.health", 400.0, 200, 80.0)] {
                let request = recorder.requestStarted(operation: operation)
                clock.set(clock.read() + duration)
                recorder.requestHeaders(request, status: status, serverSpans: ClientServerTiming.spans("todo-handler;dur=\(handler)"))
                recorder.requestFinished(request, status: status)
            }
        }
        clock.set(62_000)
        let summary = await recorder.snapshot(); await recorder.flush()
        let files = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        let records = try files.flatMap { try Data(contentsOf: $0).split(separator: 10).map { try JSONDecoder().decode(ClientDiagnosticEvent.self, from: Data($0)) } }
        #expect(summary.requests == 5)
        #expect(summary.recentRequests.count == 5)
        #expect(records.filter { $0.name == .pollsAggregated }.count == 2)
        #expect(records.filter { $0.name == .requestStarted }.count == 2)
        #expect(records.filter { $0.name == .requestHeaders }.count == 2)
        #expect(records.filter { $0.name == .requestFinished }.count == 2)
        let health = try #require(summary.polls.first { $0.operation == "system.health" })
        #expect(health.routeTemplate == "/health")
        #expect(health.count == 4 && health.failures == 1)
        #expect(health.p50MS == 10 && health.maxMS == 400)
        #expect(health.handlerCount == 4 && health.handlerP50MS == 2 && health.handlerMaxMS == 80)
        recorder.clear(); await recorder.flush()
    }
    @Test func routineRecordsCannotRotateOutCriticalEvidence() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root, journalFileLimit: 32768); recorder.authorizeOwnerSession(true)
        var serial = 0
        func critical(_ count: Int) async {
            for _ in 0..<count {
                serial += 1
                let action = recorder.beginAction(.search, inputMS: 1); recorder.handlerStarted(action); recorder.resultPublished(action); recorder.layoutCommitted(action)
                let refresh = recorder.refreshStarted(.manual); recorder.refreshFinished(refresh, outcome: .applied, durationMS: 1)
                var stream = ClientDiagnosticEvent(name: .streamDropped, run: recorder.run); stream.reason = .cleanEnd; recorder.record(stream)
                recorder.availabilityChanged(.init(loading: serial.isMultiple(of: 2), busy: false, canWrite: !serial.isMultiple(of: 2), dataReady: true, reason: .ready))
                var stall = ClientDiagnosticEvent(name: .stall, run: recorder.run); stall.durationMS = Double(serial); recorder.record(stall)
                await recorder.flush()
            }
        }
        func storedCounts() throws -> [String: Int] {
            let records = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).flatMap { try Data(contentsOf: $0).split(separator: 10).map { try JSONDecoder().decode(ClientDiagnosticEvent.self, from: Data($0)) } }
            return Dictionary(grouping: records, by: { $0.name.rawValue }).mapValues(\.count)
        }
        await critical(2)
        for index in 0..<256 {
            var sample = ClientDiagnosticEvent(name: .resourcesSampled, run: recorder.run, now: Double(index))
            sample.resources = .init(descriptors: 64 + index * 16, sockets: index * 16, softLimit: 2560, hardLimit: UInt64.max, samplerDescriptors: 1, sampleMS: 0.2)
            recorder.record(sample); await recorder.flush()
        }
        let first = try storedCounts()
        for name in ["ui.layout.committed", "refresh.finished", "stream.dropped", "availability.changed", "ui.stall"] { #expect(first[name] == 2) }
        #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == ["current.ndjson"])
        await critical(10)
        let final = try storedCounts()
        for name in ["ui.layout.committed", "refresh.finished", "stream.dropped", "availability.changed", "ui.stall"] { #expect(final[name] == 12) }
        #expect((await recorder.snapshot()).routineRecordsThinned > 0)
        recorder.clear(); await recorder.flush()
    }
    @Test func aPollMarkerCannotHideARequestStartedByAnInteraction() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root); recorder.authorizeOwnerSession(true)
        let action = recorder.beginAction(.openDiagnostics, inputMS: 1)
        await ClientDiagnosticContext.$periodicPoll.withValue(true) { () async in
            await ClientDiagnosticContext.$actionID.withValue(action) { () async in
                let request = recorder.requestStarted(operation: "system.health"); recorder.requestHeaders(request, status: 200); recorder.requestFinished(request, status: 200)
            }
        }
        await recorder.flush()
        let records = try Data(contentsOf: root.appendingPathComponent("current.ndjson")).split(separator: 10).map { try JSONDecoder().decode(ClientDiagnosticEvent.self, from: Data($0)) }
        #expect(records.filter { $0.requestID != nil }.count == 3)
        #expect((await recorder.snapshot()).polls.isEmpty)
        recorder.clear(); await recorder.flush()
    }
    @Test func anUnobservedHandlerDoesNotClaimAnIncompleteInput() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root); recorder.authorizeOwnerSession(true)
        let action = recorder.beginAction(.openDiagnostics); recorder.handlerStarted(action)
        let pending = try #require((await recorder.snapshot()).actions.first)
        #expect(pending.unprovenCount == 1)
        #expect(pending.incompleteCount == 0)
        #expect(recorder.incompleteSnapshot().isEmpty)
        recorder.endAction(action, outcome: .failed)
        let ended = try #require((await recorder.snapshot()).actions.first)
        #expect(ended.unprovenCount == 1)
        #expect(ended.incompleteCount == 0)
        recorder.clear(); await recorder.flush()
    }
    @Test @MainActor func anInactiveOrHiddenWatchdogHasOneSecondTicks() async throws {
        _ = NSApplication.shared
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root); recorder.authorizeOwnerSession(true)
        let activity = DiagnosticActivity(), source = NotificationCenter(), ticks = DiagnosticTickCounter()
        let monitor = ClientDiagnosticsMonitor(recorder: recorder, applicationActive: { activity.active }, notifications: source, watchdogTick: { ticks.tick() })
        monitor.start(); defer { monitor.stop() }
        let idleStart = ticks.read()
        try await Task.sleep(for: .milliseconds(1200))
        let inactive = ticks.read() - idleStart
        #expect((await recorder.snapshot()).recent.filter { $0.name == .stall }.isEmpty)
        activity.active = true; source.post(name: NSApplication.didBecomeActiveNotification, object: nil)
        let activeStart = ticks.read()
        try await Task.sleep(for: .milliseconds(1200))
        let active = ticks.read() - activeStart
        let beforeHiddenStalls = (await recorder.snapshot()).recent.filter { $0.name == .stall }.count
        activity.active = false; source.post(name: NSApplication.didHideNotification, object: nil)
        let hiddenStart = ticks.read()
        try await Task.sleep(for: .milliseconds(1200))
        let hidden = ticks.read() - hiddenStart
        #expect(inactive <= 3)
        #expect(active >= 10)
        #expect(hidden <= 3)
        let snapshot = await recorder.snapshot()
        #expect(snapshot.applicationActive == false)
        #expect(snapshot.recent.filter { $0.name == .stall }.count == beforeHiddenStalls)
        monitor.stop(); recorder.clear(); await recorder.flush()
        if let path = ProcessInfo.processInfo.environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            try JSONSerialization.data(withJSONObject: ["window_ms": 1200, "inactive_ticks": inactive, "active_ticks": active, "hidden_ticks": hidden], options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent("watchdog-rate.json"))
        }
    }
    @Test func unchangedResourceSamplesStayInMemoryAndJournalAtMostOnceAMinute() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let clock = DiagnosticTestClock(), recorder = ClientDiagnosticsRecorder(journalDirectory: root, clock: { clock.read() })
        recorder.authorizeOwnerSession(true)
        func sample(_ descriptors: Int = 64, soft: UInt64 = 2560) {
            var event = ClientDiagnosticEvent(name: .resourcesSampled, run: recorder.run, now: clock.read())
            event.resources = .init(descriptors: descriptors, sockets: 8, softLimit: soft, hardLimit: UInt64.max, samplerDescriptors: 1, sampleMS: 0.2)
            recorder.record(event)
        }
        for second in 0..<3600 {
            clock.set(1000 + Double(second) * 1000); sample()
            if second.isMultiple(of: 64) { await recorder.flush() }
        }
        await recorder.flush()
        func lines() throws -> Int {
            try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { $0.pathExtension == "ndjson" }.reduce(0) { try $0 + Data(contentsOf: $1).split(separator: 10).count }
        }
        let idle = await recorder.snapshot()
        #expect(try lines() == 60)
        #expect(idle.dropped == 0)
        clock.set(3_600_500); sample(65); await recorder.flush()
        #expect(try lines() == 60)
        #expect((await recorder.snapshot()).resources?.descriptors == 65)
        clock.set(3_600_600); sample(80); await recorder.flush()
        #expect(try lines() == 61)
        clock.set(3_600_700); sample(80, soft: 4608); await recorder.flush()
        #expect(try lines() == 62)
        if let path = ProcessInfo.processInfo.environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            try JSONSerialization.data(withJSONObject: ["simulated_seconds": 3600, "samples": 3600, "journal_bytes_per_idle_hour": idle.journalBytesWritten, "dropped": idle.dropped], options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent("idle-journal-rate.json"))
        }
        recorder.clear(); await recorder.flush()
    }
    @Test(arguments: [false, true]) func anOrdinaryMetadataHourAndTwelveIdleHoursRetainTheEveningInteraction(_ diagnosticsOpen: Bool) async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let clock = DiagnosticTestClock(), recorder = ClientDiagnosticsRecorder(journalDirectory: root, clock: { clock.read() })
        recorder.authorizeOwnerSession(true)
        let evening = try #require(recorder.beginAction(.openInspector, inputMS: clock.read(), mode: .full, inputKind: .pointer))
        recorder.handlerStarted(evening); recorder.resultPublished(evening); recorder.layoutCommitted(evening)
        await recorder.flush()
        let initialBytes = (await recorder.snapshot()).journalBytesWritten
        func resource() {
            var event = ClientDiagnosticEvent(name: .resourcesSampled, run: recorder.run, now: clock.read())
            event.resources = .init(descriptors: 64, sockets: 8, softLimit: 2560, hardLimit: UInt64.max, samplerDescriptors: 1, sampleMS: 0.2)
            recorder.record(event)
        }
        func finish(_ id: UUID?) { recorder.handlerStarted(id); recorder.resultPublished(id); recorder.layoutCommitted(id) }
        let phases = ClientDiagnosticRequestPhases(fetchToRequestMS: 0.1, dnsMS: nil, connectMS: 0.1, sendMS: 0.05, firstByteMS: 0.4, transferMS: 0.3, connectionReused: false, receivedBytes: 370_000, serverSpans: ClientServerTiming.spans("todo-handler;dur=0.2"))
        func refresh(_ trigger: ClientDiagnosticTrigger) async {
            let id = recorder.refreshStarted(trigger)
            await ClientDiagnosticContext.$refreshID.withValue(id) { () async in
                for operation in ["tasks.list", "reads.profiles", "reads.projects", "reads.tags", "reads.view", "reads.view", "reads.view", "reads.view"] {
                    let request = recorder.requestStarted(operation: operation)
                    clock.set(clock.read() + 1)
                    recorder.requestHeaders(request, status: 200, serverSpans: ClientServerTiming.spans("todo-handler;dur=0.2"), acceptedRequestID: request)
                    recorder.requestFinished(request, status: 200, phases: phases)
                    var decode = ClientDiagnosticEvent(name: .decodeFinished, run: recorder.run, now: clock.read())
                    decode.refreshID = id; decode.actionID = ClientDiagnosticContext.actionID; decode.durationMS = 0.3; recorder.record(decode)
                }
            }
            recorder.refreshFinished(id, outcome: .applied, durationMS: 8)
        }
        for second in 0..<3600 {
            let base = 1000 + Double(second) * 1000
            clock.set(base); resource()
            if second.isMultiple(of: 60) {
                var search: UUID?
                for index in 0..<6 {
                    clock.set(base + Double(index))
                    if let search { recorder.endAction(search, outcome: .superseded) }
                    search = recorder.beginAction(.search, inputMS: clock.read(), mode: .full, inputKind: .keyboard); recorder.handlerStarted(search)
                }
                recorder.resultPublished(search); recorder.layoutCommitted(search)
                for _ in 0..<2 { finish(recorder.beginAction(.taskSelection, inputMS: clock.read(), mode: .full, inputKind: .pointer)) }
                let complete = recorder.beginAction(.complete, inputMS: clock.read(), mode: .full, inputKind: .pointer)
                recorder.handlerStarted(complete)
                await ClientDiagnosticContext.$actionID.withValue(complete) { () async in await refresh(.ownWrite) }
                await refresh(.streamOperation)
                recorder.resultPublished(complete); recorder.layoutCommitted(complete)
                if diagnosticsOpen {
                    for (index, operation) in (Array(repeating: "system.health", count: 93) + Array(repeating: "diagnostics.snapshot", count: 52)).enumerated() {
                        await ClientDiagnosticContext.$periodicPoll.withValue(true) { () async in
                            let request = recorder.requestStarted(operation: operation)
                            clock.set(clock.read() + 1)
                            recorder.requestHeaders(request, status: 200, serverSpans: ClientServerTiming.spans("todo-handler;dur=0.2"), acceptedRequestID: request)
                            recorder.requestFinished(request, status: 200, phases: phases)
                        }
                        if index.isMultiple(of: 32) { await recorder.flush() }
                    }
                }
            }
            if second.isMultiple(of: 64) { await recorder.flush() }
        }
        await recorder.flush()
        clock.set(3_661_000)
        _ = await recorder.snapshot(); await recorder.flush()
        let active = await recorder.snapshot(), activeBytes = active.journalBytesWritten - initialBytes
        #expect(active.refreshes == 120)
        #expect(active.requests == (diagnosticsOpen ? 9660 : 960))
        #expect(active.actions.reduce(0) { $0 + $1.supersededCount } == 300)
        #expect(active.actions.reduce(0) { $0 + $1.count } == 241)
        #expect(active.actions.reduce(0) { $0 + $1.incompleteCount } == 0)
        #expect(activeBytes * 24 <= ClientDiagnosticsRecorder.journalFileLimit)
        for second in 0..<43_200 {
            clock.set(3_662_000 + Double(second) * 1000); resource()
            if second.isMultiple(of: 64) { await recorder.flush() }
        }
        await recorder.flush()
        let final = await recorder.snapshot()
        let journal = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { $0.pathExtension == "ndjson" }
        let preserved = try journal.contains { String(decoding: try Data(contentsOf: $0), as: UTF8.self).contains(evening.uuidString) }
        #expect(preserved)
        #expect(final.dropped == 0)
        #expect(final.journalFailures == 0)
        if let path = ProcessInfo.processInfo.environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] {
            let receipt: [String: Any] = ["workload": "synthetic metadata replay, not UI latency or an observed owner hour", "diagnostics_open": diagnosticsOpen, "health_polls_per_minute": diagnosticsOpen ? 93 : 0, "diagnostics_polls_per_minute": diagnosticsOpen ? 52 : 0, "active_seconds": 3600, "idle_seconds": 43_200, "active_hour_bytes": activeBytes, "idle_hour_bytes": Double(final.journalBytesWritten - active.journalBytesWritten) / 12, "refreshes": active.refreshes, "requests": active.requests, "completed_actions": 241, "superseded": 300, "evening_interaction_preserved": preserved, "journal_limit_per_file": ClientDiagnosticsRecorder.journalFileLimit, "dropped": final.dropped]
            try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: path).appendingPathComponent(diagnosticsOpen ? "journal-day-retention-open.json" : "journal-day-retention.json"))
        }
        recorder.clear(); await recorder.flush()
    }
    @Test @MainActor func sixFindInputsHaveFiveSupersededAndOneCompletedWithNoIncomplete() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root)
        recorder.authorizeOwnerSession(true)
        let monitor = ClientDiagnosticsMonitor(recorder: recorder)
        var last: UUID?
        for character in "review" {
            let event = try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: 0, context: nil, characters: String(character), charactersIgnoringModifiers: String(character), isARepeat: false, keyCode: 15))
            monitor.input(event)
            last = monitor.begin(.search)
        }
        monitor.publish(last); recorder.layoutCommitted(last)
        let summary = await recorder.snapshot(), row = try #require(summary.actions.first { $0.action == .search })
        #expect(row.count == 1)
        #expect(row.supersededCount == 5)
        #expect(row.incompleteCount == 0)
        #expect(row.oldestIncompleteMS == 0)
        #expect(summary.recent.filter { $0.name == .actionEnded && $0.outcome == .superseded }.count == 5)
        #expect(summary.recent.filter { $0.name == .layoutCommitted && $0.outcome == .applied }.count == 1)
        recorder.clear(); await recorder.flush()
    }
    @Test func resourceSamplingDoesNotEvictInteractionAndRequestDisclosures() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let clock = DiagnosticTestClock(), recorder = ClientDiagnosticsRecorder(journalDirectory: root, clock: { clock.read() })
        recorder.authorizeOwnerSession(true)
        var actions: [UUID] = [], requests: [UUID] = []
        for _ in 0..<20 {
            let action = try #require(recorder.beginAction(.complete, inputMS: clock.read()))
            actions.append(action); recorder.handlerStarted(action); recorder.resultPublished(action); recorder.layoutCommitted(action)
            let request = try #require(recorder.requestStarted(operation: "tasks.list"))
            requests.append(request); recorder.requestHeaders(request, status: 200); recorder.requestFinished(request, status: 200)
            await recorder.flush()
        }
        for _ in 0..<40 { recorder.record(.init(name: .decodeFinished, run: recorder.run, now: clock.read())) }
        for second in 0..<3600 {
            clock.set(1000 + Double(second) * 1000)
            var event = ClientDiagnosticEvent(name: .resourcesSampled, run: recorder.run, now: clock.read())
            event.resources = .init(descriptors: 64, sockets: 8, softLimit: 2560, hardLimit: UInt64.max, samplerDescriptors: 1, sampleMS: 0.2)
            recorder.record(event)
        }
        let result = await recorder.snapshot()
        #expect(result.recentInteractions.map(\.actionID) == Array(actions[4..<20]).map(Optional.some))
        #expect(result.recentRequests.map(\.requestID) == Array(requests[4..<20]).map(Optional.some))
        #expect(result.recent.count == 32)
        #expect(result.recent.allSatisfy { $0.name == .decodeFinished })
        #expect(result.dropped == 0)
        recorder.clear(); recorder.authorizeOwnerSession(true)
        let clean = await recorder.snapshot()
        #expect(clean.recent.isEmpty && clean.recentInteractions.isEmpty && clean.recentRequests.isEmpty)
        recorder.clear(); await recorder.flush()
    }
    @Test(arguments: ["refresh", "request", "layout", "ended", "callback"])
    func oldScopeFinishesAreDroppedAndCannotEnterTheNewJournal(_ kind: String) async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root)
        recorder.authorizeOwnerSession(true)
        let scope = recorder.scopeToken
        let id: UUID?
        if kind == "refresh" { id = recorder.refreshStarted(.manual) }
        else if kind == "request" { id = recorder.requestStarted(operation: "tasks.list") }
        else { id = recorder.beginAction(.search, inputMS: 1); recorder.handlerStarted(id); recorder.resultPublished(id) }
        recorder.clear(); recorder.authorizeOwnerSession(true)
        switch kind {
        case "refresh": recorder.refreshFinished(id, outcome: .superseded, durationMS: 10)
        case "request": recorder.requestFinished(id, status: 200)
        case "layout": recorder.layoutCommitted(id)
        case "ended": recorder.endAction(id, outcome: .superseded)
        default: recorder.record(.init(name: .stall, run: recorder.run), ifScope: scope)
        }
        await recorder.flush()
        let result = await recorder.snapshot()
        #expect(result.recorded == 0)
        #expect(result.recent.isEmpty)
        #expect(result.dropped == 1)
        let records = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { $0.pathExtension == "ndjson" }
        #expect(records.isEmpty)
        recorder.clear(); await recorder.flush()
    }
    @Test @MainActor func nonMovingSelectionInputsDoNotBeginAnAction() async throws {
        _ = NSApplication.shared
        for (row, key) in [(0, UInt16(126)), (2, UInt16(125)), (1, UInt16(36))] {
            let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
            let recorder = ClientDiagnosticsRecorder(journalDirectory: root); recorder.authorizeOwnerSession(true)
            let monitor = ClientDiagnosticsMonitor(recorder: recorder), rows = DiagnosticSelectionRows()
            let table = NSTableView(frame: NSRect(x: 0, y: 0, width: 320, height: 140))
            table.addTableColumn(NSTableColumn(identifier: .init("task"))); table.dataSource = rows; table.headerView = nil; table.rowHeight = 28; table.reloadData()
            let window = NSWindow(contentRect: table.frame, styleMask: [.borderless], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false; window.contentView = table
            defer { window.contentView = nil; window.close() }
            let marker = ClientDiagnosticNativeView(frame: table.bounds); marker.monitor = monitor; marker.task = "synthetic-selection"; table.addSubview(marker); monitor.register(marker)
            try #require(table.numberOfRows == 3)
            try #require(window.makeFirstResponder(table))
            func press(_ key: UInt16) throws {
                let event = try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, characters: "", charactersIgnoringModifiers: "", isARepeat: false, keyCode: key))
                try #require(event.window === window)
                monitor.input(event)
            }
            table.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false); try press(key)
            #expect((await recorder.snapshot()).actions.isEmpty)
            let before = (await recorder.snapshot()).recent.filter { $0.name == .inputObserved }.count
            table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false); try press(125)
            #expect((await recorder.snapshot()).recent.filter { $0.name == .inputObserved }.count == before + 1)
            #expect(!window.isVisible)
            recorder.clear(); await recorder.flush()
            withExtendedLifetime(rows) {}
        }
    }
    @Test @MainActor func aPointerOnTheSelectedRowDoesNotBeginASelection() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root); recorder.authorizeOwnerSession(true)
        let monitor = ClientDiagnosticsMonitor(recorder: recorder), rows = DiagnosticSelectionRows()
        let table = NSTableView(frame: NSRect(x: 0, y: 0, width: 320, height: 140))
        table.addTableColumn(NSTableColumn(identifier: .init("task"))); table.dataSource = rows; table.headerView = nil; table.rowHeight = 28; table.reloadData()
        let window = NSWindow(contentRect: table.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentView = table
        defer { window.contentView = nil; window.close() }
        let marker = ClientDiagnosticNativeView(frame: table.bounds); marker.monitor = monitor; marker.task = "synthetic-selection"; table.addSubview(marker); monitor.register(marker)
        func click(_ row: Int) throws {
            let rect = table.rect(ofRow: row), point = table.convert(NSPoint(x: 70, y: rect.midY), to: nil)
            let event = try #require(NSEvent.mouseEvent(with: .leftMouseDown, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: 1))
            try #require(event.window === window)
            try #require(table.row(at: table.convert(event.locationInWindow, from: nil)) == row)
            monitor.input(event)
        }
        table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
        try click(0)
        #expect((await recorder.snapshot()).actions.isEmpty)
        let before = (await recorder.snapshot()).recent.filter { $0.name == .inputObserved }.count
        try click(1)
        #expect((await recorder.snapshot()).recent.filter { $0.name == .inputObserved }.count == before + 1)
        #expect(!window.isVisible)
        recorder.clear(); await recorder.flush()
        withExtendedLifetime(rows) {}
    }
    private func directory() throws -> URL {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-client-diagnostics-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: path, withIntermediateDirectories: false)
        return path
    }
    @Test func inventoryPairsAndServerTimingMatchTheSharedDesign() throws {
        let category = try JSONSerialization.jsonObject(with: JSONEncoder().encode(ClientDiagnosticAction.keyboardSelection)) as? [String: String]
        #expect(category == ["inventory_id": "I07", "subtype": "task.selection.keyboard"])
        let invalid = Data(#"{"inventory_id":"I05","subtype":"task.selection.pointer"}"#.utf8)
        #expect(throws: DecodingError.self) { try JSONDecoder().decode(ClientDiagnosticAction.self, from: invalid) }
        let spans = try #require(ClientServerTiming.spans("todo-handler;dur=14.2, todo-auth;dur=0.4, todo-db;dur=6.1"))
        #expect(spans.handler == 14.2)
        #expect(spans.auth == 0.4)
        #expect(spans.database == 6.1)
        #expect(spans.queue == nil)
        #expect(ClientServerTiming.spans(nil) == nil)
        #expect(ClientServerTiming.spans("todo-handler;dur=NaN, todo-db;dur=-1") == nil)
    }
    @Test func everyRequestCarriesOnlyOpaqueCorrelationIds() async throws {
        let action = UUID()
        let response = try await ClientDiagnosticContext.$actionID.withValue(action) {
            try await ClientRequestCorrelation().intercept(.init(method: .get, scheme: nil, authority: nil, path: "/profiles/private-profile/tasks?text=PRIVATE"), body: nil, baseURL: URL(string: "http://127.0.0.1:1")!, operationID: "tasks.list") { request, _, _ in
                let trace = request.headerFields[HTTPField.Name("X-Todo-Trace")!]
                let id = request.headerFields[HTTPField.Name("X-Todo-Request")!]
                let source = request.headerFields[HTTPField.Name("X-Todo-Action")!]
                #expect(trace == action.uuidString.lowercased())
                #expect(source == action.uuidString.lowercased())
                #expect(id.flatMap(UUID.init(uuidString:)) != nil)
                #expect(id != source)
                #expect(request.path == "/profiles/private-profile/tasks?text=PRIVATE")
                return (HTTPResponse(status: .ok), nil)
            }
        }
        #expect(response.0.status == .ok)
    }
    @Test func ownerGateDeniesCollectionAndExportUntilAuthorized() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let journal = root.appendingPathComponent("journal")
        let recorder = ClientDiagnosticsRecorder(journalDirectory: journal)
        recorder.record(.init(name: .stall, run: recorder.run))
        await recorder.flush()
        #expect(try await recorder.exportMetadata() == nil)
        #expect(!FileManager.default.fileExists(atPath: journal.path))
        recorder.authorizeOwnerSession(true)
        recorder.record(.init(name: .stall, run: recorder.run))
        await recorder.flush()
        #expect(FileManager.default.fileExists(atPath: journal.appendingPathComponent("current.ndjson").path))
        recorder.clear(); await recorder.flush()
        #expect(try await recorder.exportMetadata() == nil)
        #expect((try FileManager.default.contentsOfDirectory(atPath: journal.path)).isEmpty)
    }
    @Test func actionPhasesPercentilesAndIncompleteAgeAreLiteral() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let clock = DiagnosticTestClock()
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root, clock: clock.read)
        recorder.authorizeOwnerSession(true)
        for duration in [10.0, 20.0, 220.0] {
            clock.set(1000)
            let action = try #require(recorder.beginAction(.taskSelection, inputMS: 1000))
            clock.set(1002); recorder.handlerStarted(action)
            clock.set(1005); recorder.resultPublished(action)
            clock.set(1000 + duration); recorder.layoutCommitted(action)
        }
        clock.set(2000); _ = recorder.beginAction(.taskSelection, inputMS: 2000)
        clock.set(2500)
        let snapshot = await recorder.snapshot()
        let selection = try #require(snapshot.actions.first { $0.action == .taskSelection })
        #expect(selection.count == 3)
        #expect(selection.p50MS == 20)
        #expect(selection.p90MS == 220)
        #expect(selection.p99MS == 220)
        #expect(selection.maxMS == 220)
        #expect(selection.incompleteCount == 1)
        #expect(selection.oldestIncompleteMS == 500)
        let event = try #require(snapshot.recent.last { $0.name == .layoutCommitted })
        #expect(event.actionPhases?.inputQueueMS == 2)
        #expect(event.actionPhases?.handlerWallMS == 3)
        #expect(event.actionPhases?.publicationToLayoutMS == 215)
        #expect(event.actionPhases?.requestUnionMS == 0)
    }
    @Test func refreshRequestCorrelationStaysLocal() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root)
        recorder.authorizeOwnerSession(true)
        let refresh = recorder.refreshStarted(.streamOperation)
        await ClientDiagnosticContext.$refreshID.withValue(refresh) { () async in
            for _ in 0..<3 {
                let request = recorder.requestStarted(operation: "tasks.list")
                recorder.requestHeaders(request, status: 200)
                recorder.requestFinished(request, status: 200)
            }
        }
        recorder.refreshFinished(refresh, outcome: .applied, durationMS: 10)
        let summary = await recorder.snapshot()
        let finish = try #require(summary.recent.last { $0.name == .refreshFinished })
        #expect(finish.requestCount == 3)
        #expect(summary.requests == 3)
        #expect(summary.recent.filter { $0.name == .requestFinished }.allSatisfy { $0.refreshID == refresh })
        let data = try #require(try await recorder.exportMetadata())
        let text = String(decoding: data, as: UTF8.self)
        #expect(!text.contains("Authorization"))
        #expect(!text.contains("http://"))
        #expect(!text.contains(root.path))
    }
    @Test func anOutstandingMetricsCallbackDoesNotBecomeZeroRequestTime() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root)
        recorder.authorizeOwnerSession(true)
        let action = try #require(recorder.beginAction(.complete, inputMS: 1000))
        recorder.handlerStarted(action)
        let request = await ClientDiagnosticContext.$actionID.withValue(action) { () async in recorder.requestStarted(operation: "tasks.transition") }
        recorder.resultPublished(action); recorder.layoutCommitted(action)
        let event = try #require((await recorder.snapshot()).recent.last { $0.name == .layoutCommitted })
        #expect(event.actionPhases?.requestUnionMS == nil)
        #expect(event.actionPhases?.handlerWallMS != nil)
        recorder.requestFinished(request, status: 200)
    }
    @Test func clearDoesNotDeleteTheNextOwnerScopesWrites() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root)
        recorder.authorizeOwnerSession(true)
        for index in 0..<200 {
            var event = ClientDiagnosticEvent(name: .stall, run: recorder.run); event.durationMS = Double(index)
            recorder.record(event)
        }
        recorder.clear()
        recorder.authorizeOwnerSession(true)
        var event = ClientDiagnosticEvent(name: .stall, run: recorder.run); event.durationMS = 123456
        recorder.record(event)
        await recorder.flush()
        let data = try Data(contentsOf: root.appendingPathComponent("current.ndjson"))
        let lines = data.split(separator: 10)
        #expect(lines.count == 1)
        let decoded = try JSONDecoder().decode(ClientDiagnosticEvent.self, from: Data(try #require(lines.first)))
        #expect(decoded.durationMS == 123456)
    }
    @Test func journalRotatesWithinTwoMiBAndUsesPrivatePermissions() async throws {
        let root = try directory(); defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root.appendingPathComponent("journal"), journalFileLimit: 1_048_576)
        recorder.authorizeOwnerSession(true)
        for index in 0..<12000 {
            var event = ClientDiagnosticEvent(name: .stall, run: recorder.run)
            event.durationMS = Double(index)
            recorder.record(event)
            if index % 64 == 0 { await recorder.flush() }
        }
        await recorder.flush()
        let journal = root.appendingPathComponent("journal")
        let files = try FileManager.default.contentsOfDirectory(at: journal, includingPropertiesForKeys: nil)
        #expect(Set(files.map(\.lastPathComponent)) == ["current.ndjson", "previous.ndjson"])
        var total = 0
        for file in files {
            let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
            let bytes = try #require(attributes[.size] as? Int)
            #expect(bytes <= 1_048_576)
            #expect((attributes[.posixPermissions] as? Int) == 0o600)
            total += bytes
        }
        #expect(total <= 2_097_152)
        #expect((try FileManager.default.attributesOfItem(atPath: journal.path)[.posixPermissions] as? Int) == 0o700)
        let summary = await recorder.snapshot()
        #expect(summary.dropped == 0)
        #expect(summary.journalFailures == 0)
        recorder.clear(); await recorder.flush()
        #expect((try FileManager.default.contentsOfDirectory(atPath: journal.path)).isEmpty)
        #expect((await recorder.snapshot()).recorded == 0)
    }
}

@Suite(.serialized) @MainActor struct ClientDiagnosticsLiveTests {
    @Test func synchronousUiHandlersCarryContextInAnOptimizedBuild() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-client-ui-context-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root)
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-ui-context"), clientDiagnostics: recorder)
        model.replaceCredential("ses_synthetic-context"); model.signedIn = true
        var values: [UUID?] = []
        for _ in 0..<3 {
            model.clientDiagnosticsUI.performSync(.toggleCompact) { values.append(ClientDiagnosticContext.actionID) }
        }
        #expect(values.count == 3)
        #expect(values.allSatisfy { $0 != nil })
        #expect(Set(values.compactMap { $0 }).count == 3)
        #expect(ClientDiagnosticContext.actionID == nil)
        #expect((await recorder.snapshot()).recent.filter { $0.name == .resultPublished }.count == 3)
        model.signedIn = false; await recorder.flush()
    }
    @Test func queueDelayDoesNotMakeAnObservedInputDisappear() {
        let input = ClientDiagnosticInputReceipt(time: 1000, observedAt: 16000, kind: .pointer)
        #expect(input.isRecent(at: 16010))
        #expect(input.time == 1000)
        #expect(!input.isRecent(at: 17000))
        let stale = ClientDiagnosticInputReceipt(time: 20000, observedAt: 16000, kind: .keyboard)
        #expect(!stale.isRecent(at: 16010))
    }
    @Test func staleBackgroundScopeCannotWriteIntoTheNextOwnerSession() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("todo-s01-verify-client-scope-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root)
        recorder.authorizeOwnerSession(true)
        let old = recorder.scopeToken
        recorder.clear(); recorder.authorizeOwnerSession(true)
        recorder.record(.init(name: .stall, run: recorder.run), ifScope: old)
        #expect((await recorder.snapshot()).recorded == 0)
        let sample = try #require(ClientProcessResources.read())
        var limit = rlimit(); #expect(getrlimit(RLIMIT_NOFILE, &limit) == 0)
        #expect(sample.softLimit == limit.rlim_cur)
        #expect(sample.descriptors >= 3)
        #expect(sample.samplerDescriptors == 1)
        await recorder.flush()
        #expect(!FileManager.default.fileExists(atPath: root.path))
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_CLIENT_DIAGNOSTICS_SERVER"] != nil))
    func productionTransportAndModelOnOwnerShapedData() async throws {
        let environment = ProcessInfo.processInfo.environment
        let server = try #require(environment["TODO_CLIENT_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
        let output = URL(fileURLWithPath: try #require(environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"]))
        let journal = URL(fileURLWithPath: try #require(environment["TODO_CLIENT_DIAGNOSTICS_JOURNAL"]))
        let owner = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let token = try #require(environment["TODO_CLIENT_DIAGNOSTICS_TOKEN"])
        let recorder = ClientDiagnosticsRecorder(journalDirectory: journal)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-client-diagnostics"), clientDiagnostics: recorder)
        model.selectedView = "all"
        model.replaceCredential(token); model.signedIn = true; model.connection = .live
        _ = try await model.client.tasks_period_list(path: .init(profile: "work")).ok.body.json
        #expect(!recorder.isOwnerSession)
        #expect(try await recorder.exportMetadata() == nil)
        model.replaceCredential(owner); model.signedIn = true; model.connection = .live
        #expect(recorder.isOwnerSession)
        var timings: [[String: Double]] = []
        var completed = 0
        for iteration in 0..<5 {
            for enabled in (iteration.isMultiple(of: 2) ? [false, true] : [true, false]) {
                let current = enabled ? model : TodoModel(configuration: model.configuration)
                if !enabled { current.selectedView = "all"; current.replaceCredential(owner); current.signedIn = true; current.connection = .live }
                let start = ProcessInfo.processInfo.systemUptime
                for _ in 0..<3 {
                    await current.refreshAfterWrite("Verification refresh")
                    #expect(current.tasks.count == 178)
                    #expect(current.appliedSearchSnapshot?.rows.count == 178)
                    #expect(current.searchPhase == .showing)
                    #expect(current.taskLoadError == nil)
                    completed += 1
                }
                var loads = [Double](repeating: 0, count: 3)
                _ = getloadavg(&loads, 3)
                let refreshMS = (ProcessInfo.processInfo.systemUptime - start) * 1000
                let layoutStart = ProcessInfo.processInfo.systemUptime
                let content = HStack(spacing: 0) { TaskListView(model: current).sidebar.frame(width: 220); TaskListView(model: current).taskContent }
                let view = NSHostingView(rootView: content.frame(width: 1280, height: 820))
                let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: 1280, height: 820), styleMask: [.titled], backing: .buffered, defer: false)
                window.isReleasedWhenClosed = false; window.contentView = view
                view.frame = .init(x: 0, y: 0, width: 1280, height: 820); view.layoutSubtreeIfNeeded()
                let layoutMS = (ProcessInfo.processInfo.systemUptime - layoutStart) * 1000
                #expect(!window.isVisible)
                window.contentView = nil
                timings.append(["iteration": Double(iteration), "enabled": enabled ? 1 : 0, "ms": refreshMS, "layout_ms": layoutMS, "load": loads[0]])
            }
        }
        for _ in 0..<200 {
            if (await recorder.snapshot()).recent.contains(where: { $0.name == .requestFinished && $0.phases != nil }) { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        var sample = ClientDiagnosticEvent(name: .resourcesSampled, run: recorder.run); sample.resources = ClientProcessResources.read(); recorder.record(sample)
        let summary = await recorder.snapshot()
        #expect(summary.refreshes == 15)
        #expect(summary.requests == 120)
        #expect(summary.recent.contains { $0.name == .requestFinished && $0.phases?.firstByteMS != nil })
        #expect(summary.recent.contains { $0.name == .decodeFinished })
        #expect(summary.resources?.softLimit != nil)
        let data = try #require(try await recorder.exportMetadata())
        let text = String(decoding: data, as: UTF8.self)
        #expect(!text.contains(owner)); #expect(!text.contains(token)); #expect(!text.contains("Measurement Task")); #expect(!text.contains("Planning notes")); #expect(!text.contains(server.absoluteString)); #expect(!text.contains(journal.path))
        for task in model.tasks { #expect(!text.contains(task.id)) }
        try data.write(to: output.appendingPathComponent("metadata.json"))
        let receipt: [String: Any] = ["errors": 0, "refreshes": completed, "enabled_refreshes": summary.refreshes, "enabled_requests": summary.requests, "tasks": model.tasks.count, "timings": timings, "ui_input_proven": false, "keychain_called": false]
        try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("live.json"))
        model.signedIn = false
        await recorder.flush()
        #expect(try await recorder.exportMetadata() == nil)
        #expect(try FileManager.default.contentsOfDirectory(atPath: journal.path).isEmpty)
    }
}

@MainActor @Suite struct ClientDiagnosticsPanelTests {
    @Test func labelsNeverExposeRegistryIds() {
        for category in ClientDiagnosticAction.allCases {
            let label = ClientDiagnosticDisplay.action(category)
            #expect(!label.contains(category.inventoryID))
            #expect(!label.contains(category.rawValue + "."))
            #expect(!label.contains("."))
        }
        #expect(ClientDiagnosticDisplay.action(.taskSelection) == "Select a Task")
        #expect(ClientDiagnosticDisplay.action(.editDescription) == "Type in the description")
        #expect(ClientDiagnosticDisplay.event(.layoutCommitted) == "Layout committed")
        #expect(ClientDiagnosticDisplay.environmentTrigger(.dayChange) == "Day changed")
        #expect(ClientDiagnosticDisplay.environmentTrigger(.clockChange) == "Clock or time zone changed")
        #expect(ClientDiagnosticDisplay.environmentTrigger(.wake) == "Woke from sleep")
        #expect(ClientDiagnosticDisplay.environmentTrigger(.activation) == "App became active")
        #expect(ClientDiagnosticDisplay.age(999) == "999 ms")
        #expect(ClientDiagnosticDisplay.age(1000) == "1.0 s")
        #expect(ClientDiagnosticDisplay.age(12_300) == "12.3 s")
        #expect(ClientDiagnosticDisplay.age(120_000) == "2.0 min")
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] != nil && ProcessInfo.processInfo.environment["TODO_CLIENT_DIAGNOSTICS_SERVER"] != nil))
    func fullAndCompactLocalPanelRenderWithoutAnAppOrSheet() async throws {
        let environment = ProcessInfo.processInfo.environment
        let output = URL(fileURLWithPath: try #require(environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"]))
        let server = try #require(environment["TODO_CLIENT_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let serverSnapshot = try await todoClient(server: server, credential: credential).diagnostics_period_snapshot().ok.body.json
        let clock = DiagnosticTestClock()
        let recorder = ClientDiagnosticsRecorder(journalDirectory: output.appendingPathComponent("panel-journal"), clock: { clock.read() })
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used-panel"), clientDiagnostics: recorder)
        model.replaceCredential(credential); model.signedIn = true; model.clientDiagnosticsUI.stop()
        model.diagnostics = serverSnapshot; model.diagnosticsLive = false
        for (category, duration) in [(ClientDiagnosticAction.taskSelection, 12.0), (.complete, 340.0)] {
            clock.set(1000)
            let id = recorder.beginAction(category, inputMS: 1000, mode: .full, inputKind: .pointer)
            clock.set(1001); recorder.handlerStarted(id)
            clock.set(1010); recorder.resultPublished(id)
            clock.set(1000 + duration); recorder.layoutCommitted(id)
        }
        clock.set(2000)
        let request = recorder.requestStarted(operation: "tasks.list")
        recorder.requestHeaders(request, status: 200, serverSpans: ClientServerTiming.spans("todo-handler;dur=1.2"))
        clock.set(2008)
        recorder.requestFinished(request, status: 200, phases: .init(fetchToRequestMS: 0.2, dnsMS: nil, connectMS: 0.4, sendMS: 0.1, firstByteMS: 2, transferMS: 1, connectionReused: false, receivedBytes: 369398, serverSpans: ClientServerTiming.spans("todo-handler;dur=1.2")))
        await ClientDiagnosticContext.$periodicPoll.withValue(true) { () async in
            let poll = recorder.requestStarted(operation: "system.health")
            clock.set(2011); recorder.requestHeaders(poll, status: 200); recorder.requestFinished(poll, status: 200)
        }
        clock.set(62000)
        _ = await recorder.snapshot()
        let pending = recorder.beginAction(.search, inputMS: 62000, mode: .full, inputKind: .keyboard); recorder.handlerStarted(pending)
        clock.set(74300)
        var stall = ClientDiagnosticEvent(name: .stall, run: recorder.run, now: clock.read()); stall.durationMS = 12300; recorder.record(stall)
        var resource = ClientDiagnosticEvent(name: .resourcesSampled, run: recorder.run, now: clock.read()); resource.applicationActive = false
        resource.resources = .init(descriptors: 64, sockets: 8, softLimit: 2560, hardLimit: UInt64.max, samplerDescriptors: 1, sampleMS: 0.2); recorder.record(resource)
        let fixture = await recorder.snapshot()
        model.clientDiagnosticsUI.summary = fixture
        #expect(ClientDiagnosticDisplay.sectionSummary(fixture) == "2 over budget · 1 incomplete")
        let complete = try #require(fixture.actions.first { $0.action == .complete })
        #expect(ClientDiagnosticDisplay.accessibility(complete).contains("Median 340.0 milliseconds"))
        #expect(ClientDiagnosticDisplay.accessibility(complete).contains("p99 340.0 milliseconds"))
        _ = NSApplication.shared
        let priorAppearance = NSApplication.shared.appearance
        defer { NSApplication.shared.appearance = priorAppearance }
        for dark in [false, true] {
            for compact in [true, false] {
                let width: CGFloat = compact ? 393 : 1100, height: CGFloat = compact ? 2300 : 1700
                let appearance = try #require(NSAppearance(named: dark ? .darkAqua : .aqua))
                NSApplication.shared.appearance = appearance
                let root = DiagnosticsView(model: model, live: false, initiallyExpanded: ["This client", "Background requests", "Interaction phases", "Request timings", "Recent activity"])
                let view = NSHostingView(rootView: root.frame(width: width, height: height).environment(\.colorScheme, dark ? .dark : .light).background(Color(nsColor: .windowBackgroundColor)))
                view.appearance = appearance; view.frame = NSRect(x: 0, y: 0, width: width, height: height)
                let window = NSWindow(contentRect: view.frame, styleMask: [.titled, .closable], backing: .buffered, defer: false)
                window.title = "Diagnostics"; window.appearance = appearance; window.isReleasedWhenClosed = false; window.contentView = view
                view.layoutSubtreeIfNeeded()
                try await Task.sleep(for: .milliseconds(150)); view.layoutSubtreeIfNeeded()
                let bitmap = try #require(view.bitmapImageRepForCachingDisplay(in: view.bounds))
                view.cacheDisplay(in: view.bounds, to: bitmap)
                let data = try #require(bitmap.representation(using: .png, properties: [:]))
                try data.write(to: output.appendingPathComponent("client-" + (compact ? "compact" : "full") + (dark ? "-dark.png" : "-light.png")))
                #expect(view.fittingSize.width <= width + 1)
                #expect(!window.isVisible && window.attachedSheet == nil)
                window.contentView = nil; window.close()
            }
        }
        model.signedIn = false; await recorder.flush()
        try? FileManager.default.removeItem(at: output.appendingPathComponent("panel-journal"))
    }
}
