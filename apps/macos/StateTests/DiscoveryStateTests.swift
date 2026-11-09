import AppKit
import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

private actor DiscoveryTransport: ClientTransport {
    private let live = URLSessionTransport()
    private var holdOperation: String?
    private var failHeld = false
    private var waiting: CheckedContinuation<Void, Never>?
    private(set) var heldCount = 0
    private(set) var requests: [String] = []
    func hold(_ operation: String, failing: Bool = false) { holdOperation = operation; failHeld = failing }
    func release() { waiting?.resume(); waiting = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        requests.append(operationID)
        let shouldHold = operationID == holdOperation
        let failing = failHeld
        if shouldHold { holdOperation = nil }
        let response = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        if shouldHold {
            heldCount += 1
            await withCheckedContinuation { waiting = $0 }
            if failing { throw RequestFailure(status: 404, message: "Task not found in Profile Work (work).", exitCode: 3, exitMeaning: "not found or auth missing") }
        }
        return response
    }
}

@MainActor struct DiscoveryStateTests {
    private func wait(_ predicate: () async -> Bool) async throws {
        for _ in 0..<6000 {
            if await predicate() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw URLError(.timedOut)
    }

    @Test func errorDetailUsesActualServerPairAndPreservesContext() {
        let error = RequestFailure(status: 404, message: "Task missing in Profile Work (work). Try GET /tasks/lookup?prefix=aa.", exitCode: 3, exitMeaning: "not found or auth missing", details: .init(profile: .init(id: "work", name: "Work"), taskID: "aa"))
        #expect(error.humanMessage == "Task not found in Work.\nerror 3 - not found or auth missing")
        #expect(RequestFailure(status: 422, message: "Bad prefix", exitCode: 2, exitMeaning: "validation or usage").exitDetail == "error 2 - validation or usage")
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func discoveryPublicationDraftDecisionsAndCompletedTaskReveal() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json.credential
        let direct = todoClient(server: server, credential: session)
        let create = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: Data(#"{"title":"D discovery completed Task"}"#.utf8))
        let open = try await TaskSnapshot.decode(direct.tasks_period_create(path: .init(profile: "personal"), body: .json(create)).ok.body.json)
        let done = try await TaskSnapshot.decode(direct.tasks_period_transition(path: .init(profile: "personal", task: open.id), body: .json(.init(from_version: 1, action: .complete))).ok.body.json)
        #expect(done.status == "done")
        let transport = DiscoveryTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-discovery-\(UUID())"), clientFactory: { url, _ in
            Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: session)])
        })
        model.replaceCredential(session)
        model.signedIn = true
        model.connection = .live
        model.searchText = "keep toolbar text"
        let draft = try await TaskSnapshot.decode(direct.tasks_period_create(path: .init(profile: "work"), body: .json(create)).ok.body.json)
        model.beginEditing(draft)
        model.editor?.title = "Keep unsaved D draft"
        await model.openDiscovery(.directory)
        #expect(model.discovery.appliedSnapshot?.profiles.map(\.id).contains("personal") == true)
        #expect(model.profile == "work")
        #expect(model.selectedView == "today")
        #expect(model.searchText == "keep toolbar text")
        #expect(model.editor?.title == "Keep unsaved D draft")
        await model.openDiscovery(.lookup)
        let beforeInvalid = await transport.requests.count
        model.editDiscoveryPrefix("invalid!")
        await model.requestDiscovery()
        #expect(model.discovery.phase == .invalid)
        #expect(await transport.requests.count == beforeInvalid)
        model.editDiscoveryPrefix(done.id)
        await model.requestDiscovery()
        let match = try #require(model.discovery.appliedSnapshot?.matches.first)
        #expect(match.task_id == done.id)
        #expect(match.profile.id == "personal")
        #expect(await model.showDiscoveryMatch(match) == false)
        #expect(model.profile == "work")
        #expect(model.discovery.dialog == .lookup)
        let cancelledTarget = try #require(model.pendingNavigation)
        model.cancelNavigation()
        #expect(await model.discardAndNavigate(cancelledTarget) == false)
        #expect(model.editor?.title == "Keep unsaved D draft")
        #expect(await model.showDiscoveryMatch(match) == false)
        let target = try #require(model.pendingNavigation)
        #expect(await model.discardAndNavigate(cancelledTarget) == false)
        #expect(model.editor?.title == "Keep unsaved D draft")
        #expect(await model.discardAndNavigate(target))
        try await wait { model.searchPhase == .showing && !model.loading }
        #expect(model.profile == "personal")
        #expect(model.selectedView == "all")
        #expect(model.taskFilters.prefix == done.id)
        #expect(model.searchText == "")
        #expect(model.editor?.id == done.id)
        #expect(model.appliedSearchSnapshot?.rows.map(\.id) == [done.id])
        #expect(model.editor?.base.status == "done")
        #expect(model.discovery.dialog == nil)
        #expect(model.discovery.appliedSnapshot == nil)
        #expect(await model.retrySearch() == .applied)
        #expect(model.appliedSearchSnapshot?.rows.map(\.id) == [done.id])
        let board = NSPasteboard(name: .init("discovery-copy-\(UUID())"))
        model.copyTaskID(done.id, pasteboard: board)
        #expect(board.string(forType: .string) == done.id)
        #expect(model.taskIDCopyFeedback == "Copied")

        var held = 0
        for failing in [false, true] {
            for reset in ["aba", "close", "credential", "signout", "offline"] {
                model.signedIn = true
                model.connection = .live
                await model.openDiscovery(.lookup)
                model.editDiscoveryPrefix(done.id)
                await transport.hold("reads.lookup", failing: failing)
                let pending = Task { await model.requestDiscovery() }
                held += 1
                try await wait { await transport.heldCount == held }
                #expect(model.discovery.phase == .requesting)
                let requestCount = await transport.requests.count
                await model.requestDiscovery()
                #expect(await transport.requests.count == requestCount)
                switch reset {
                case "aba": model.editDiscoveryPrefix("b"); model.editDiscoveryPrefix(done.id)
                case "close": model.closeDiscovery(); await model.openDiscovery(.lookup)
                case "credential": model.replaceCredential(session)
                case "signout": model.signedIn = false
                default: model.connection = .offline
                }
                await transport.release()
                await pending.value
                #expect(model.discovery.appliedSnapshot == nil)
                #expect(model.discovery.error == nil)
                #expect(model.discovery.phase != .showing && model.discovery.phase != .error)
            }
        }
        for failing in [false, true] {
            for reset in ["close", "credential", "signout", "offline"] {
                model.signedIn = true
                model.connection = .live
                await transport.hold("reads.profiles", failing: failing)
                let pending = Task { await model.openDiscovery(.directory) }
                held += 1
                try await wait { await transport.heldCount == held }
                switch reset {
                case "close": model.closeDiscovery(); await model.openDiscovery(.lookup)
                case "credential": model.replaceCredential(session)
                case "signout": model.signedIn = false
                default: model.connection = .offline
                }
                await transport.release(); await pending.value
                #expect(model.discovery.appliedSnapshot == nil)
                #expect(model.discovery.error == nil)
            }
        }
        model.signedIn = true
        model.connection = .live
        await model.openDiscovery(.lookup)
        model.editDiscoveryPrefix(done.id)
        await transport.hold("reads.lookup", failing: true)
        let failure = Task { await model.requestDiscovery() }
        held += 1
        try await wait { await transport.heldCount == held }
        await transport.release(); await failure.value
        #expect(model.discovery.phase == .error)
        #expect(model.discovery.error == "Task not found in Profile Work (work).\nerror 3 - not found or auth missing")
        await model.requestDiscovery(retry: true)
        #expect(model.discovery.appliedSnapshot?.matches.map(\.task_id) == [done.id])

        for failing in [false, true] {
            model.signedIn = true
            model.connection = .live
            await model.openDiscovery(.lookup)
            model.editDiscoveryPrefix(done.id)
            await model.requestDiscovery()
            let current = try #require(model.discovery.appliedSnapshot?.matches.first)
            model.editor = nil
            await transport.hold("tasks.show", failing: failing)
            let showing = Task { await model.showDiscoveryMatch(current) }
            held += 1
            try await wait { await transport.heldCount == held }
            #expect(model.discovery.dialog == nil)
            model.replaceCredential(session)
            await transport.release()
            #expect(await showing.value == false)
            #expect(model.editor == nil)
            #expect(model.message == nil)
        }
        model.profile = "work"
        model.beginEditing(draft)
        model.editor?.title = "D saved before Show"
        await model.openDiscovery(.lookup)
        model.editDiscoveryPrefix(done.id)
        await model.requestDiscovery()
        let current = try #require(model.discovery.appliedSnapshot?.matches.first)
        #expect(await model.showDiscoveryMatch(current) == false)
        let saveTarget = try #require(model.pendingNavigation)
        await transport.hold("tasks.edit")
        let saving = Task { await model.saveAndNavigate(saveTarget) }
        held += 1
        try await wait { await transport.heldCount == held }
        model.replaceCredential(session)
        await transport.release()
        #expect(await saving.value == false)
        #expect(model.editor?.id != done.id)
        model.editor = nil
        let gone = try await TaskSnapshot.decode(direct.tasks_period_create(path: .init(profile: "personal"), body: .json(create)).ok.body.json)
        await model.openDiscovery(.lookup)
        model.editDiscoveryPrefix(gone.id)
        await model.requestDiscovery()
        let goneMatch = try #require(model.discovery.appliedSnapshot?.matches.first)
        _ = try await direct.tasks_period_delete(path: .init(profile: "personal", task: gone.id), query: .init(from_version: "1")).ok
        #expect(await model.showDiscoveryMatch(goneMatch) == false)
        #expect(model.message == "Task not found in Personal.\nerror 3 - not found or auth missing")
        let recovery = try #require(model.lookupError(at: .message, text: model.message))
        let requestsBeforeRecovery = await transport.requests.count
        await model.findTaskAfterLookupError(recovery)
        #expect(model.discovery.prefix == gone.id)
        #expect(model.discovery.phase == .editing)
        #expect(model.discovery.appliedSnapshot == nil)
        #expect(await transport.requests.count == requestsBeforeRecovery)
        #expect(model.profile == "work")
        model.closeDiscovery()
        let unavailable = try await TaskSnapshot.decode(direct.tasks_period_create(path: .init(profile: "work"), body: .json(create)).ok.body.json)
        _ = try await direct.tasks_period_delete(path: .init(profile: "work", task: unavailable.id), query: .init(from_version: "1")).ok
        model.beginEditing(unavailable)
        model.editor?.title = "Keep missing Task draft"
        #expect(await model.save() == nil)
        #expect(model.editorError == "Task not found in Work.\nerror 3 - not found or auth missing")
        let editorFailure = try #require(model.lookupError(at: .editor, text: model.editorError))
        let beforeEditorRecovery = await transport.requests.count
        await model.findTaskAfterLookupError(editorFailure)
        #expect(model.discovery.prefix == unavailable.id)
        #expect(await transport.requests.count == beforeEditorRecovery)
        #expect(model.editor?.title == "Keep missing Task draft")
        model.closeDiscovery()
        await model.loadHistory()
        #expect(model.historyError == nil)
        #expect(model.history.map { $0.event.kind }.contains("TaskDeleted"))
        model.closeDiscovery()
        model.signedIn = false
        model.connect()
        let receipt = try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"]).replacingOccurrences(of: "http-receipt.json", with: "discovery-http.json")
        try Data(#"{"status":"PASS","completedTaskRevealed":true,"reload":true,"invalidRequests":0,"lateSuccessAndErrorResets":10,"showCredentialResets":2,"savedDraftCredentialReset":true,"cancelledShowCallbackRejectedAfterReclick":true,"showGoneRecoveryPrefillsWithoutRequest":true,"missingEditorDraftPreserved":true,"deletedTaskHistoryRemainsReadable":true}"#.utf8).write(to: URL(fileURLWithPath: receipt))
    }
}
