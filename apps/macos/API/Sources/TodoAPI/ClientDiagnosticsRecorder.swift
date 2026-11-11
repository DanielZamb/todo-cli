import Foundation
import Darwin

public final class ClientDiagnosticsRecorder: @unchecked Sendable {
    public static let disabled = ClientDiagnosticsRecorder(enabled: false)
    public static let historyLimit = 512
    public static let journalFileLimit = 1_048_576
    public let isEnabled: Bool
    public let run = UUID()
    private let lock = NSLock()
    private let writer = DispatchQueue(label: "local.todo.client-diagnostics", qos: .utility)
    private let directory: URL?
    private let clock: @Sendable () -> Double
    private var directoryPrepared = false
    private var authorized = false
    private var events: [ClientDiagnosticEvent] = []
    private var pending: [ClientDiagnosticEvent] = []
    private var draining = false
    private var epoch = 0
    private var dropped = 0
    private var journalFailures = 0
    private var recorded = 0
    private var refreshCounts: [UUID: Int] = [:]
    private struct Request: Sendable { let trace: UUID; let operation: String; let refresh: UUID?; let action: UUID?; let started: Double }
    private struct ActionKey: Sendable, Hashable {
        let category: ClientDiagnosticAction
        let mode: ClientDiagnosticMode
        let inputKind: ClientDiagnosticInputKind
    }
    private struct Action: Sendable {
        let key: ActionKey
        let observedInput: Bool
        let started: Double
        var handler: Double?
        var publication: Double?
        var requests: [(Double, Double)] = []
    }
    private var requests: [UUID: Request] = [:]
    private var actions: [UUID: Action] = [:]
    private var incomplete: [ActionKey: Int] = [:]
    private var superseded: [ActionKey: Int] = [:]
    private var incompleteAge: [ActionKey: Double] = [:]
    private var availability: ClientDiagnosticAvailability?
    private var latencies: [ActionKey: [Double]] = [:]
    private var unproven: [ActionKey: Int] = [:]
    private var refreshTotal = 0
    private var requestTotal = 0
    private var longestStallMS = 0.0
    private var resources: ClientDiagnosticResources?

    public init(enabled: Bool = true, journalDirectory: URL? = nil, clock: @escaping @Sendable () -> Double = { ProcessInfo.processInfo.systemUptime * 1000 }) {
        isEnabled = enabled; self.clock = clock
        directory = enabled ? journalDirectory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("Todo/Diagnostics", isDirectory: true) : nil
    }
    public var isOwnerSession: Bool { isEnabled && lock.withLock { authorized } }
    public func authorizeOwnerSession(_ owner: Bool) { lock.withLock { authorized = owner && isEnabled } }
    public func clear() {
        guard isEnabled else { return }
        lock.withLock {
            authorized = false; epoch += 1; draining = false; events.removeAll(keepingCapacity: true); pending.removeAll(keepingCapacity: true)
            requests.removeAll(); refreshCounts.removeAll(); actions.removeAll(); availability = nil
            recorded = 0; dropped = 0; journalFailures = 0; incomplete.removeAll(); incompleteAge.removeAll(); superseded.removeAll()
            latencies.removeAll(); unproven.removeAll(); refreshTotal = 0; requestTotal = 0; longestStallMS = 0; resources = nil
            writer.async { [self] in
                directoryPrepared = false
                guard let directory else { return }
                for name in ["current.ndjson", "previous.ndjson"] { try? FileManager.default.removeItem(at: directory.appendingPathComponent(name)) }
            }
        }
    }
    private func event(_ name: ClientDiagnosticName) -> ClientDiagnosticEvent {
        var value = ClientDiagnosticEvent(name: name, run: run, now: clock())
        value.traceID = ClientDiagnosticContext.traceID; value.mode = ClientDiagnosticContext.mode; value.inputKind = ClientDiagnosticContext.inputKind
        return value
    }
    public var scopeToken: Int { lock.withLock { epoch } }
    public func record(_ event: ClientDiagnosticEvent, ifScope scope: Int? = nil) {
        guard isEnabled else { return }
        lock.withLock {
            guard authorized else { return }
            guard scope == nil || scope == epoch else { dropped += 1; return }
            appendLocked(event)
        }
    }
    private func appendLocked(_ event: ClientDiagnosticEvent) {
        guard authorized else { return }
        recorded += 1
        if event.name == .refreshStarted { refreshTotal += 1 }
        if event.name == .requestStarted { requestTotal += 1 }
        if event.name == .stall { longestStallMS = max(longestStallMS, event.durationMS ?? 0) }
        if let sample = event.resources { resources = sample }
        if events.count == Self.historyLimit { events.removeFirst() }
        events.append(event)
        if pending.count < Self.historyLimit { pending.append(event) } else { dropped += 1 }
        if !draining { draining = true; let scope = epoch; writer.async { [self] in drain(scope: scope) } }
    }
    private func drain(scope: Int) {
        let encoder = JSONEncoder()
        while true {
            let batch: (Int, [ClientDiagnosticEvent])? = lock.withLock {
                guard epoch == scope else { return nil }
                if !authorized { draining = false; return nil }
                if pending.isEmpty { draining = false; return nil }
                let batch = pending; pending.removeAll(keepingCapacity: true)
                return (epoch, batch)
            }
            guard let (batchEpoch, batch) = batch else { return }
            for event in batch {
                guard lock.withLock({ authorized && epoch == batchEpoch }) else { break }
                do {
                    var line = try encoder.encode(event)
                    guard line.count <= 4096 else { lock.withLock { dropped += 1 }; continue }
                    line.append(10); try appendJournal(line)
                } catch { lock.withLock { if epoch == batchEpoch { journalFailures += 1 } } }
            }
        }
    }
    private func appendJournal(_ line: Data) throws {
        guard let directory else { return }
        if !directoryPrepared {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
            directoryPrepared = true
        }
        let current = directory.appendingPathComponent("current.ndjson"), previous = directory.appendingPathComponent("previous.ndjson")
        let size = (try? FileManager.default.attributesOfItem(atPath: current.path)[.size] as? NSNumber)?.intValue ?? 0
        if size + line.count > Self.journalFileLimit {
            try? FileManager.default.removeItem(at: previous)
            try FileManager.default.moveItem(at: current, to: previous)
        }
        let descriptor = open(current.path, O_WRONLY | O_CREAT | O_APPEND | O_NOFOLLOW, 0o600)
        guard descriptor >= 0 else { throw CocoaError(.fileWriteUnknown) }
        defer { close(descriptor) }
        guard fchmod(descriptor, 0o600) == 0 else { throw CocoaError(.fileWriteNoPermission) }
        try line.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let written = Darwin.write(descriptor, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                if written < 0 && errno == EINTR { continue }
                guard written > 0 else { throw CocoaError(.fileWriteUnknown) }
                offset += written
            }
        }
    }
    public func flush() async { await withCheckedContinuation { continuation in writer.async { continuation.resume() } } }
    public func beginAction(_ category: ClientDiagnosticAction, inputMS: Double? = nil, mode: ClientDiagnosticMode = .unknown, inputKind: ClientDiagnosticInputKind = .unknown) -> UUID? {
        guard isEnabled else { return nil }
        return lock.withLock {
            guard authorized else { return nil }
            let now = clock(), id = UUID()
            if actions.count >= 256, let oldest = actions.min(by: { $0.value.started < $1.value.started }) {
                actions.removeValue(forKey: oldest.key)
                incomplete[oldest.value.key, default: 0] += 1
                incompleteAge[oldest.value.key] = max(incompleteAge[oldest.value.key] ?? 0, now - oldest.value.started)
                dropped += 1
            }
            let start = inputMS.map { min(now, max(0, $0)) } ?? now
            actions[id] = Action(key: .init(category: category, mode: mode, inputKind: inputKind), observedInput: inputMS != nil, started: start)
            var record = event(.inputObserved); record.actionID = id; record.action = category; record.mode = mode; record.inputKind = inputKind; record.inputMS = inputMS == nil ? nil : start; record.traceID = id
            appendLocked(record)
            return id
        }
    }
    public func handlerStarted(_ id: UUID?) {
        guard let id else { return }
        lock.withLock {
            guard let action = actions[id], action.handler == nil else { return }
            actions[id]?.handler = clock()
            var record = event(.actionStarted); record.actionID = id; record.action = action.key.category; record.mode = action.key.mode; record.inputKind = action.key.inputKind; record.traceID = id; record.durationMS = clock() - action.started
            appendLocked(record)
        }
    }
    public func resultPublished(_ id: UUID?) {
        guard let id else { return }
        lock.withLock {
            guard let action = actions[id], action.handler != nil, action.publication == nil else { return }
            actions[id]?.publication = clock()
            var record = event(.resultPublished); record.actionID = id; record.action = action.key.category; record.mode = action.key.mode; record.inputKind = action.key.inputKind; record.traceID = id
            appendLocked(record)
        }
    }
    private static func union(_ intervals: [(Double, Double)]) -> Double {
        var end = -Double.infinity, total = 0.0
        for (start, finish) in intervals.sorted(by: { $0.0 < $1.0 }) { total += max(0, finish - max(start, end)); end = max(end, finish) }
        return total
    }
    public func layoutCommitted(_ id: UUID?) {
        guard let id else { return }
        lock.withLock {
            guard authorized else { return }
            guard let action = actions[id] else { dropped += 1; return }
            guard let handler = action.handler, let publication = action.publication else { return }
            actions.removeValue(forKey: id)
            let now = clock(), duration = max(0, now - action.started)
            if latencies[action.key, default: []].count == 512 { latencies[action.key]?.removeFirst() }
            if action.observedInput { latencies[action.key, default: []].append(duration) } else { unproven[action.key, default: 0] += 1 }
            var record = event(.layoutCommitted); record.actionID = id; record.action = action.key.category; record.mode = action.key.mode; record.inputKind = action.key.inputKind; record.traceID = id; record.outcome = .applied; record.durationMS = duration
            record.renderStage = "layout_complete"
            record.actionPhases = .init(inputQueueMS: action.observedInput ? handler - action.started : nil, handlerWallMS: publication - handler, requestUnionMS: requests.values.contains(where: { $0.action == id }) ? nil : Self.union(action.requests), publicationToLayoutMS: now - publication)
            appendLocked(record)
        }
    }
    public func endAction(_ id: UUID?, outcome: ClientDiagnosticOutcome) {
        guard let id else { return }
        lock.withLock {
            guard authorized else { return }
            guard let action = actions.removeValue(forKey: id) else { dropped += 1; return }
            let age = max(0, clock() - action.started)
            if outcome == .superseded { superseded[action.key, default: 0] += 1 }
            else if outcome != .drag {
                incomplete[action.key, default: 0] += 1
                incompleteAge[action.key] = max(incompleteAge[action.key] ?? 0, age)
            }
            var record = event(.actionEnded); record.actionID = id; record.action = action.key.category; record.mode = action.key.mode; record.inputKind = action.key.inputKind; record.traceID = id; record.outcome = outcome; record.durationMS = age
            appendLocked(record)
        }
    }
    public func refreshStarted(_ trigger: ClientDiagnosticTrigger) -> UUID? {
        guard isEnabled else { return nil }
        return lock.withLock {
            guard authorized else { return nil }
            if refreshCounts.count >= 256 { refreshCounts.removeAll(); dropped += 1 }
            let id = UUID(); refreshCounts[id] = 0
            var record = event(.refreshStarted); record.refreshID = id; record.actionID = ClientDiagnosticContext.actionID; record.trigger = trigger
            appendLocked(record)
            return id
        }
    }
    public func refreshFinished(_ id: UUID?, outcome: ClientDiagnosticOutcome, durationMS: Double) {
        guard let id else { return }
        lock.withLock {
            guard authorized else { return }
            guard let count = refreshCounts.removeValue(forKey: id) else { dropped += 1; return }
            var record = event(.refreshFinished); record.refreshID = id; record.actionID = ClientDiagnosticContext.actionID; record.outcome = outcome; record.durationMS = durationMS; record.requestCount = count
            appendLocked(record)
        }
    }
    public func requestStarted(operation: String) -> UUID? {
        guard isEnabled else { return nil }
        return lock.withLock {
            guard authorized else { return nil }
            guard requests.count < 1024 else { dropped += 1; return nil }
            let id = ClientDiagnosticContext.requestID ?? UUID(), refresh = ClientDiagnosticContext.refreshID, action = ClientDiagnosticContext.actionID
            requests[id] = Request(trace: ClientDiagnosticContext.traceID ?? id, operation: operation, refresh: refresh, action: action, started: clock())
            if let refresh { refreshCounts[refresh, default: 0] += 1 }
            var record = event(.requestStarted); record.requestID = id; record.refreshID = refresh; record.actionID = action; record.operation = operation
            appendLocked(record)
            return id
        }
    }
    public func requestHeaders(_ id: UUID?, status: Int, serverSpans: ClientDiagnosticServerSpans? = nil, acceptedRequestID: UUID? = nil) {
        guard let id else { return }
        lock.withLock {
            guard let request = requests[id] else { return }
            var record = event(.requestHeaders); record.requestID = id; record.traceID = request.trace; record.refreshID = request.refresh; record.actionID = request.action; record.operation = request.operation; record.status = status; record.serverHandlerMS = serverSpans?.handler; record.serverSpans = serverSpans; record.acceptedRequestID = acceptedRequestID; record.durationMS = clock() - request.started
            appendLocked(record)
        }
    }
    public func requestFinished(_ id: UUID?, status: Int?, reason: ClientDiagnosticReason? = nil, phases: ClientDiagnosticRequestPhases? = nil) {
        guard let id else { return }
        lock.withLock {
            guard authorized else { return }
            guard let request = requests.removeValue(forKey: id) else { dropped += 1; return }
            if let action = request.action, actions[action] != nil {
                if (actions[action]?.requests.count ?? 0) < 512 { actions[action]?.requests.append((request.started, clock())) } else { dropped += 1 }
             }
            var record = event(.requestFinished); record.requestID = id; record.traceID = request.trace; record.refreshID = request.refresh; record.actionID = request.action; record.operation = request.operation; record.status = status; record.reason = reason; record.phases = phases; record.durationMS = clock() - request.started
            appendLocked(record)
        }
    }
    public func availabilityChanged(_ value: ClientDiagnosticAvailability) {
        guard isEnabled else { return }
        lock.withLock {
            guard value != availability else { return }
            availability = value
            var record = event(.availabilityChanged); record.availability = value; appendLocked(record)
        }
    }
    private func summary() -> ClientDiagnosticSummary {
        lock.withLock {
            guard authorized else { return .init() }
            let now = clock()
            var result = ClientDiagnosticSummary()
            result.recorded = recorded; result.dropped = dropped; result.journalFailures = journalFailures; result.refreshes = refreshTotal; result.requests = requestTotal
            let keys = Set(latencies.keys).union(incomplete.keys).union(superseded.keys).union(unproven.keys).union(actions.values.map(\.key))
            result.actions = keys.map { key in
                let samples = (latencies[key] ?? []).sorted(), pending = actions.values.filter { $0.key == key }
                func quantile(_ q: Double) -> Double? { samples.isEmpty ? nil : samples[max(0, Int(ceil(Double(samples.count) * q)) - 1)] }
                return .init(action: key.category, mode: key.mode, inputKind: key.inputKind, unprovenCount: unproven[key] ?? 0, p50MS: quantile(0.5), p90MS: quantile(0.9), p99MS: quantile(0.99), maxMS: samples.last, count: samples.count, supersededCount: superseded[key] ?? 0, incompleteCount: pending.count + (incomplete[key] ?? 0), oldestIncompleteMS: max(incompleteAge[key] ?? 0, pending.map { max(0, now - $0.started) }.max() ?? 0))
            }.sorted { $0.id < $1.id }
            let selection = result.actions.filter { $0.action == .taskSelection || $0.action == .keyboardSelection }
            result.completedSelections = selection.reduce(0) { $0 + $1.count }; result.incompleteSelections = selection.reduce(0) { $0 + $1.incompleteCount }
            result.oldestIncompleteMS = selection.map(\.oldestIncompleteMS).max() ?? 0
            let selectionSamples = latencies.filter { $0.key.category == .taskSelection || $0.key.category == .keyboardSelection }.values.flatMap { $0 }.sorted()
            if !selectionSamples.isEmpty { result.selectionP99MS = selectionSamples[max(0, Int(ceil(Double(selectionSamples.count) * 0.99)) - 1)] }
            result.longestStallMS = longestStallMS; result.resources = resources; result.recent = Array(events.suffix(32))
            return result
        }
    }
    public func incompleteSnapshot() -> [ClientDiagnosticIncomplete] {
        lock.withLock {
            guard authorized else { return [] }
            let now = clock()
            let keys = Set(incomplete.keys).union(actions.values.map(\.key))
            return keys.compactMap { key in
                let current = actions.values.filter { $0.key == key }
                let count = current.count + (incomplete[key] ?? 0)
                guard count > 0 else { return nil }
                return .init(action: key.category, count: count, ageMS: max(incompleteAge[key] ?? 0, current.map { max(0, now - $0.started) }.max() ?? 0))
            }
        }
    }
    public func snapshot() async -> ClientDiagnosticSummary {
        await withCheckedContinuation { continuation in writer.async { [self] in continuation.resume(returning: summary()) } }
    }
    public func exportMetadata() async throws -> Data? {
        await flush()
        return try await withCheckedThrowingContinuation { continuation in
            writer.async { [self] in
                let copy = lock.withLock { authorized ? (epoch, events) : nil }
                guard let (scope, records) = copy else { continuation.resume(returning: nil); return }
                struct Export: Encodable { let version: Int; let run: UUID; let generatedEpochMS: Double; let summary: ClientDiagnosticSummary; let events: [ClientDiagnosticEvent] }
                do {
                    let data = try JSONEncoder().encode(Export(version: 1, run: run, generatedEpochMS: Date().timeIntervalSince1970 * 1000, summary: summary(), events: records))
                    let allowed = lock.withLock { authorized && epoch == scope }
                    continuation.resume(returning: allowed ? data : nil)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }
}
