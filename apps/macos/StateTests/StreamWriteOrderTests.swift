import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
@testable import TodoState

private actor WriteOrderTransport: ClientTransport {
    private let session: URLSession
    private let live: URLSessionTransport
    init() {
        let session = URLSession(configuration: .ephemeral)
        self.session = session
        live = URLSessionTransport(configuration: .init(session: session))
    }
    private(set) var requestsBeforeInvalidation: [String] = []
    private var requestsAfterInvalidation = -1
    private func tasks() async -> [URLSessionTask] {
        await withCheckedContinuation { continuation in
            session.getAllTasks { continuation.resume(returning: $0) }
        }
    }
    private var continuation: AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation?
    private var reader: Task<Void, Never>?
    private var paused = false
    private var buffered: [HTTPBody.ByteChunk] = []
    private var holdNextWrite = false
    private var writeContinuation: CheckedContinuation<Void, Never>?
    private var holdNextRead = false
    private var readContinuation: CheckedContinuation<Void, Never>?
    private(set) var writeReplyHeld = false
    private(set) var heldCount = 0
    var closed: Bool { reader == nil && continuation == nil && buffered.isEmpty && readContinuation == nil && writeContinuation == nil && requestsAfterInvalidation == 0 }
    func pauseStream() { paused = true }
    func releaseStream() {
        paused = false
        for chunk in buffered { continuation?.yield(chunk) }
        buffered = []
    }
    func holdWriteReply() { holdNextWrite = true }
    func releaseWriteReply() { writeContinuation?.resume(); writeContinuation = nil }
    func holdRead() { holdNextRead = true }
    func release() { readContinuation?.resume(); readContinuation = nil }
    private func emit(_ chunk: HTTPBody.ByteChunk) {
        if paused { buffered.append(chunk) }
        else { continuation?.yield(chunk) }
    }
    func close() async {
        releaseStream(); releaseWriteReply(); release()
        continuation?.finish()
        continuation = nil
        let finishing = reader
        reader = nil
        finishing?.cancel()
        await finishing?.value
        requestsBeforeInvalidation = await tasks().map { "\($0.state.rawValue):\($0.originalRequest?.url?.path ?? "unknown")" }
        session.invalidateAndCancel()
        for _ in 0..<100 {
            requestsAfterInvalidation = await tasks().count
            if requestsAfterInvalidation == 0 { break }
            try? await Task.sleep(for: .milliseconds(10))
        }
    }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let blockRead = operationID == "tasks.list" && holdNextRead
        if blockRead { holdNextRead = false }
        let blockWrite = operationID == "tasks.edit" && holdNextWrite
        if blockWrite { holdNextWrite = false }
        let response = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        if blockRead {
            heldCount += 1
            await withCheckedContinuation { readContinuation = $0 }
        }
        if blockWrite {
            writeReplyHeld = true
            await withCheckedContinuation { writeContinuation = $0 }
        }
        if operationID == "changes.stream", let body = response.1 {
            let pair = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            continuation = pair.continuation
            let forwarding = Task {
                do {
                    for try await chunk in body { await self.emit(chunk) }
                    pair.continuation.finish()
                } catch { pair.continuation.finish(throwing: error) }
            }
            reader = forwarding
            pair.continuation.onTermination = { _ in forwarding.cancel() }
            return (response.0, HTTPBody(pair.stream, length: .unknown))
        }
        return response
    }
}

@MainActor
struct StreamWriteOrderTests {
    private func wait(line: Int = #line, _ predicate: () async -> Bool) async throws {
        for _ in 0..<1000 {
            if await predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw OrderProofError.timeout(line)
    }
    enum OrderProofError: Error { case timeout(Int) }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func ownWriteReplyAndStreamOrdersKeepTheSavedTask() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: credential)
        for order in ["reply-first", "stream-first", "refresh-in-flight"] {
            let profile = "wake-\(UUID().uuidString.lowercased())"
            let initialize = Process()
            initialize.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_F10_CLI"]))
            initialize.arguments = ["init", "--profile", profile]
            initialize.environment = ProcessInfo.processInfo.environment
            initialize.standardOutput = Pipe(); initialize.standardError = Pipe()
            try initialize.run(); initialize.waitUntilExit()
            #expect(initialize.terminationStatus == 0)
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: Data(#"{"title":"Before wake"}"#.utf8))
            _ = try await direct.tasks_period_create(path: .init(profile: profile), body: .json(payload)).ok
            let transport = WriteOrderTransport()
            let model = TodoModel(configuration: .init(server: server, initialProfile: profile, vaultService: "unused-wake-\(UUID())"), clientFactory: { url, _ in
                Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
            })
            model.selectedView = "all"; model.signedIn = true; model.connect()
            do {
                try await wait { model.connection == .live && model.lastSequence != nil && model.tasks.count == 1 }
                let oldSequence = model.lastSequence
                model.beginEditing(try #require(model.tasks.first))
                model.editor?.title = "Saved \(order)"
                if order == "stream-first" { await transport.holdWriteReply() }
                else { await transport.pauseStream() }
                if order == "refresh-in-flight" { await transport.holdRead() }
                let saving = Task { await model.save() }
                if order == "stream-first" {
                    try await wait { await transport.writeReplyHeld && model.tasks.first?.title == "Saved \(order)" }
                    #expect(model.busy)
                    #expect(model.editor?.title == "Saved stream-first")
                    await transport.releaseWriteReply()
                } else if order == "refresh-in-flight" {
                    try await wait { await transport.heldCount == 1 }
                    await transport.releaseStream()
                    try await wait { model.lastSequence != oldSequence && model.tasks.first?.title == "Saved refresh-in-flight" }
                    await transport.release()
                } else {
                    #expect(await saving.value?.title == "Saved reply-first")
                    #expect(model.lastSequence == oldSequence)
                    await transport.releaseStream()
                }
                #expect(await saving.value?.title == "Saved \(order)")
                try await wait { model.lastSequence != oldSequence && model.searchPhase == .showing }
                #expect(model.tasks.map(\.title) == ["Saved \(order)"])
                #expect(model.tasks.first?.row_version == 2)
                #expect(model.editor == nil)
                #expect(model.editorError == nil)
                #expect(model.message == nil)
                #expect(model.connection == .live)
            } catch {
                model.signedIn = false; model.connect()
                await transport.close()
                throw error
            }
            model.signedIn = false; model.connect()
            await transport.close()
            #expect(await transport.closed)
            print("Stream order \(order) remaining native requests before invalidation: \(await transport.requestsBeforeInvalidation)")
        }
    }

}
