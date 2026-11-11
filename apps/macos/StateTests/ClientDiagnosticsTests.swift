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

@Suite(.serialized) struct ClientDiagnosticsTests {
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
        let recorder = ClientDiagnosticsRecorder(journalDirectory: root.appendingPathComponent("journal"))
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
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"] != nil))
    func fullAndCompactLocalPanelRenderWithoutAnAppOrSheet() async throws {
        let output = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_CLIENT_DIAGNOSTICS_EVIDENCE"]))
        let clock = DiagnosticTestClock()
        let recorder = ClientDiagnosticsRecorder(journalDirectory: output.appendingPathComponent("panel-journal"), clock: { clock.read() })
        let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-used-panel"), clientDiagnostics: recorder)
        model.replaceCredential("ses_synthetic-panel"); model.signedIn = true
        for (category, duration) in [(ClientDiagnosticAction.taskSelection, 12.0), (.complete, 340.0)] {
            clock.set(1000)
            let id = recorder.beginAction(category, inputMS: 1000, mode: .full, inputKind: .pointer)
            clock.set(1001); recorder.handlerStarted(id)
            clock.set(1010); recorder.resultPublished(id)
            clock.set(1000 + duration); recorder.layoutCommitted(id)
        }
        model.clientDiagnosticsUI.summary = await recorder.snapshot()
        _ = NSApplication.shared
        for compact in [true, false] {
            let width: CGFloat = compact ? 393 : 1100
            let appearance = try #require(NSAppearance(named: .aqua))
            NSApplication.shared.appearance = appearance
            let view = NSHostingView(rootView: ClientDiagnosticsView(model: model, compact: compact).padding(12).frame(width: width).environment(\.colorScheme, .light).background(Color(nsColor: .windowBackgroundColor)))
            view.appearance = appearance
            view.frame = NSRect(x: 0, y: 0, width: width, height: 1000)
            let window = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
            window.appearance = appearance
            window.contentView = view
            view.layoutSubtreeIfNeeded()
            try await Task.sleep(for: .milliseconds(120))
            view.layoutSubtreeIfNeeded()
            let bitmap = try #require(view.bitmapImageRepForCachingDisplay(in: view.bounds))
            view.cacheDisplay(in: view.bounds, to: bitmap)
            let data = try #require(bitmap.representation(using: .png, properties: [:]))
            try data.write(to: output.appendingPathComponent(compact ? "client-compact.png" : "client-full.png"))
            #expect(view.fittingSize.width <= width + 1)
            #expect(!window.isVisible)
            window.contentView = nil
        }
        model.signedIn = false; await recorder.flush()
        try? FileManager.default.removeItem(at: output.appendingPathComponent("panel-journal"))
    }
}
