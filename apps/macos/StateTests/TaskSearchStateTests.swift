import AppKit
import Foundation
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
@testable import TodoState

private actor SearchTransport: ClientTransport {
    private let live = URLSessionTransport()
    private var failNext = false
    private var holdNext = false
    private var held: [Int: CheckedContinuation<Void, Never>] = [:]
    private var streamContinuation: AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation?
    private var shouldFailHeld = false
    private(set) var heldCount = 0
    private(set) var filteredRequests: [String] = []

    func fail() { failNext = true }
    func hold(failing: Bool) { holdNext = true; shouldFailHeld = failing }
    func release(_ index: Int? = nil) {
        guard let key = index ?? held.keys.min() else { return }
        held.removeValue(forKey: key)?.resume()
    }
    func disconnectStream() { streamContinuation?.finish(throwing: URLError(.networkConnectionLost)) }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if operationID == "tasks.list", request.path?.contains("text=") == true {
            filteredRequests.append(request.path ?? "")
            let failing = failNext
            failNext = false
            if holdNext {
                holdNext = false
                let failure = shouldFailHeld
                heldCount += 1
                let index = heldCount
                let response = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
                await withCheckedContinuation { held[index] = $0 }
                if failure { throw URLError(.notConnectedToInternet) }
                return response
            }
            if failing { throw URLError(.notConnectedToInternet) }
        }
        let response = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        if operationID == "changes.stream", let body = response.1 {
            let pair = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            streamContinuation = pair.continuation
            let reader = Task {
                do {
                    for try await chunk in body { pair.continuation.yield(chunk) }
                    pair.continuation.finish()
                } catch { pair.continuation.finish(throwing: error) }
            }
            pair.continuation.onTermination = { _ in reader.cancel() }
            return (response.0, HTTPBody(pair.stream, length: .unknown))
        }
        return response
    }
}

@MainActor
struct TaskSearchStateTests {
    private func wait(line: Int = #line, _ predicate: () async -> Bool) async throws {
        for _ in 0..<1000 {
            if await predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw SearchProofError.timeout(line)
    }
    enum SearchProofError: Error { case timeout(Int) }

    @Test func prefixConstraintsAndUTF16Presentation() throws {
        #expect(TaskListFilters(prefix: "6AA2-").isValid)
        for value in ["zz", " 6a", "6a\n", String(repeating: "a", count: 37)] { #expect(!TaskListFilters(prefix: value).isValid) }
        let text = "🎵 Cancio\u{301}n de cuna"
        let spans = [TaskSearchMatch(field: .title, start: 3, end: 11)]
        let rendered = TaskSearchPresentation.highlighted(text, spans: spans, field: .title)
        #expect(String(rendered.characters) == "🎵 Cancio\u{301}n de cuna")
        #expect(rendered.runs.filter { $0.backgroundColor != nil }.map { String(rendered[$0.range].characters) } == ["Cancio\u{301}n"])
        let invalid = TaskSearchPresentation.highlighted(text, spans: [.init(field: .title, start: 1, end: 2), .init(field: .title, start: -1, end: 900)], field: .title)
        #expect(invalid.runs.allSatisfy { $0.backgroundColor == nil })
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func productionSearchOrderingRecoveryAndReload() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let credential = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: credential)
        let profile = "search-\(UUID().uuidString.lowercased())"
        let initialize = Process()
        initialize.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_F10_CLI"]))
        initialize.arguments = ["init", "--profile", profile]
        initialize.environment = ProcessInfo.processInfo.environment
        initialize.standardOutput = Pipe()
        initialize.standardError = Pipe()
        try initialize.run()
        initialize.waitUntilExit()
        #expect(initialize.terminationStatus == 0)
        var created: [TaskSnapshot] = []
        for (title, description) in [("Renovar el pasaporte", "Ready for travel"), ("Canción de cuna", "Soft evening song"), ("Receipt", "Pay rent today before Friday") ] {
            let data = try JSONSerialization.data(withJSONObject: ["title": title, "description": description, "priority": "P1", "energy": 3, "estimate_min": 45, "project_name": "Search Project", "tag_names": ["search-tag"]])
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: data)
            created.append(try await TaskSnapshot.decode(direct.tasks_period_create(path: .init(profile: profile), body: .json(payload)).ok.body.json))
        }
        let transport = SearchTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: profile, vaultService: "unused-search-\(UUID())"), clientFactory: { url, _ in
            Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
        })
        model.selectedView = "all"
        model.signedIn = true
        model.connection = .live
        await model.retrySearch()
        #expect(model.appliedSearchSnapshot?.rows.count == 3)
        model.setSearchText("reno")
        #expect(model.searchPhase == .debouncing)
        #expect(model.searchStale)
        #expect(model.appliedSearchSnapshot?.rows.count == 3)
        try await wait { model.searchPhase == .showing }
        #expect(TaskListView(model: model).visibleTasks.map(\.title) == ["Renovar el pasaporte"])
        #expect(TaskListView(model: model, compactMode: true).visibleTasks.map(\.title) == ["Renovar el pasaporte"])
        #expect(model.appliedSearchSnapshot?.rows.first?.search_matches == [.init(field: .title, start: 0, end: 7)])
        #expect(!model.searchStale)

        await transport.hold(failing: true)
        model.applyTaskFilters(.init(priority: "P2"))
        try await wait { await transport.heldCount == 1 }
        model.setSearchText("cancion")
        await transport.hold(failing: false)
        model.applyTaskFilters(.init(priority: "P1", energy: "3", estimate: "45"))
        try await wait { await transport.heldCount == 2 }
        await transport.release(1)
        try await Task.sleep(for: .milliseconds(40))
        #expect(model.searchError == nil)
        #expect(model.taskLoadError == nil)
        #expect(model.requestedTaskFilters == .init(priority: "P1", energy: "3", estimate: "45"))
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "reno")
        await transport.release(2)
        try await wait { model.searchPhase == .showing }
        #expect(model.searchError == nil)
        #expect(model.taskLoadError == nil)
        #expect(model.requestedTaskFilters == .init(priority: "P1", energy: "3", estimate: "45"))
        #expect(model.taskFilters == .init(priority: "P1", energy: "3", estimate: "45"))
        #expect(model.searchText == "cancion")
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Canción de cuna"])
        await model.retrySearch()
        #expect(model.requestedTaskFilters.priority == "P1")
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Canción de cuna"])

        await transport.hold(failing: false)
        model.setSearchText("reno")
        try await wait { await transport.heldCount == 3 }
        model.setSearchText("rent")
        model.setSearchText("reno")
        #expect(model.searchPhase == .debouncing)
        await transport.release()
        try await Task.sleep(for: .milliseconds(40))
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "cancion")
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "reno")

        await transport.fail()
        model.setSearchText("rent")
        try await wait { model.searchPhase == .error }
        #expect(model.searchText == "rent")
        #expect(model.searchError == "Couldn't search. Showing results for \"reno\".")
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Renovar el pasaporte"])
        await model.retrySearch()
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Receipt"])
        #expect(model.appliedSearchSnapshot?.rows.first?.search_matches == [.init(field: .description, start: 4, end: 8)])
        let excerpt = try #require(model.appliedSearchSnapshot?.rows.first.flatMap(TaskSearchPresentation.descriptionExcerpt))
        #expect(String(excerpt.characters) == "Pay rent today before Friday")
        #expect(!model.searchStale)

        let receipt = try #require(created.last)
        model.applyTaskFilters(.init(priority: "P1", energy: "3", estimate: "45", prefix: String(receipt.id.prefix(8)).uppercased()))
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.rows.map(\.id) == [receipt.id])
        model.selectedProject = receipt.project_id
        model.selectedTag = receipt.tags.first
        await model.retrySearch()
        #expect(model.appliedSearchSnapshot?.rows.map(\.id) == [receipt.id])
        #expect(model.appliedSearchSnapshot?.appliedIdentity.project == receipt.project_id)
        #expect(model.appliedSearchSnapshot?.appliedIdentity.tag == receipt.tags.first)
        let board = NSPasteboard(name: .init("todo-search-proof-\(UUID())"))
        defer { board.releaseGlobally() }
        model.copyTaskID(receipt.id, pasteboard: board)
        #expect(board.string(forType: .string) == receipt.id)
        #expect(model.taskIDCopyFeedback == "Copied")
        #expect(model.appliedSearchSnapshot?.rows.first?.row_version == 1)
        try await wait { model.taskIDCopyFeedback == nil }

        model.applyTaskFilters(.init())
        try await wait { model.searchPhase == .showing }
        let latestHistory = try await direct.reads_period_history(path: .init(profile: profile, task: receipt.id)).ok.body.json
        let entries = try JSONDecoder().decode([HistoryEntry].self, from: JSONEncoder().encode(latestHistory))
        let latestSequence = try #require(entries.last?.seq)
        model.connect()
        try await wait { model.connection == .live && model.searchPhase == .showing && model.lastSequence == String(latestSequence) }
        await transport.fail()
        model.setSearchText("reno")
        try await wait { model.searchPhase == .error }
        await transport.disconnectStream()
        try await wait { model.reconnectCount > 0 && model.connection == .live && model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "reno")
        #expect(model.searchError == nil)
        await transport.fail()
        model.setSearchText("cancion")
        try await wait { model.searchPhase == .error }
        let edit = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"changes":{"description":"SSE recovery"}}"#.utf8))
        _ = try await direct.tasks_period_edit(path: .init(profile: profile, task: created[0].id), body: .json(edit)).ok
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "cancion")
        #expect(model.searchError == nil)
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Canción de cuna"])

        await transport.hold(failing: false)
        let clearCount = await transport.heldCount + 1
        model.setSearchText("reno")
        try await wait { await transport.heldCount == clearCount }
        model.setSearchText("")
        await transport.release()
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "")
        #expect(model.appliedSearchSnapshot?.rows.count == 3)
        model.setSearchText("cancion")
        try await wait { model.searchPhase == .showing }
        await transport.hold(failing: true)
        let viewCount = await transport.heldCount + 1
        let oldViewRequest = Task { await model.retrySearch() }
        try await wait { await transport.heldCount == viewCount }
        model.selectView("inbox")
        #expect(model.searchText == "cancion")
        #expect(model.appliedSearchSnapshot == nil)
        await transport.release()
        await oldViewRequest.value
        try await wait { model.searchPhase == .showing }
        #expect(model.taskLoadError == nil)
        #expect(model.searchError == nil)
        #expect(model.appliedSearchSnapshot?.appliedIdentity.view == "inbox")
        #expect(model.appliedSearchSnapshot?.rows.map(\.title) == ["Canción de cuna"])
        await transport.hold(failing: false)
        let profileCount = await transport.heldCount + 1
        let oldProfileRequest = Task { await model.retrySearch() }
        try await wait { await transport.heldCount == profileCount }
        _ = await model.navigate(.profile("personal"))
        #expect(model.searchText == "cancion")
        #expect(model.appliedSearchSnapshot == nil)
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.profile == "personal")
        #expect(model.appliedSearchSnapshot?.rows.isEmpty == true)
        await transport.release()
        await oldProfileRequest.value
        #expect(model.appliedSearchSnapshot?.appliedIdentity.profile == "personal")
        #expect(model.appliedSearchSnapshot?.rows.isEmpty == true)
        #expect(model.searchError == nil)
        model.setSearchText("")
        try await wait { model.searchPhase == .showing }
        #expect(model.appliedSearchSnapshot?.appliedIdentity.text == "")
        model.signedIn = false
        model.connect()
        let output = try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"]).replacingOccurrences(of: "http-receipt.json", with: "task-search-http.json")
        try JSONSerialization.data(withJSONObject: ["status": "PASS", "lateError": true, "aba": true, "retry": true, "sseReadyRecovery": true, "sseOperationRecovery": true, "copy": receipt.id]).write(to: URL(fileURLWithPath: output))
    }
}
