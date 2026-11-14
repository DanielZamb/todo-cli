import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

private actor SeatMessageGate: ClientTransport {
    let session: URLSession
    let base: URLSessionTransport
    var streams: [AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.Continuation] = []
    var catalogArmed = false
    var showArmed = false
    var catalogHeld = false
    var showHeld = false
    var failHealthOnce = false
    private var catalogCompletion: CheckedContinuation<Void, Never>?
    private var showCompletion: CheckedContinuation<Void, Never>?
    init() { let s = URLSession(configuration: .ephemeral); session = s; base = URLSessionTransport(configuration: .init(session: s)) }
    func arm() { catalogArmed = true; showArmed = true }
    func failHealth() { failHealthOnce = true }
    func releaseShow() { showCompletion?.resume(); showCompletion = nil }
    func releaseCatalog() { catalogCompletion?.resume(); catalogCompletion = nil }
    func stop() { releaseShow(); releaseCatalog(); streams.forEach { $0.finish() }; session.invalidateAndCancel() }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if operationID == "system.health", failHealthOnce {
            failHealthOnce = false
            throw RequestFailure(status:503,message:"OLD restore could not reach server",code:"unavailable")
        }
        if operationID == "tasks.show", showArmed {
            showArmed = false
            await withCheckedContinuation { showCompletion = $0; showHeld = true }
            throw RequestFailure(status:404,message:"NEWER dependency follow-up failed",code:"not_found")
        }
        if operationID == "tasks.list", catalogArmed {
            catalogArmed = false
            await withCheckedContinuation { catalogCompletion = $0; catalogHeld = true }
        }
        if operationID == "changes.stream" {
            let p = AsyncThrowingStream<HTTPBody.ByteChunk, any Error>.makeStream()
            streams.append(p.continuation)
            p.continuation.yield(Array("event: ready\ndata: {}\n\n".utf8)[...])
            return (HTTPResponse(status:.ok,headerFields:[.contentType:"text/event-stream",.cacheControl:"no-store"]),HTTPBody(p.stream,length:.unknown))
        }
        return try await base.send(request,body:body,baseURL:baseURL,operationID:operationID)
    }
}
@MainActor @Suite(.serialized) struct SeatMessageInterleavingTests {
    private var server: URL { URL(string:ProcessInfo.processInfo.environment["SEAT_SERVER"]!)! }
    private func wait(_ condition: () async -> Bool) async throws {
        for _ in 0..<2000 { if await condition() { return }; try await Task.sleep(for:.milliseconds(5)) }
        throw URLError(.timedOut)
    }
    private func save(_ name: String, _ result: [String:Any]) throws {
        guard let p=ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] else { return }
        try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:p).appendingPathComponent(name+".json"))
    }
    private func make(_ gate: SeatMessageGate) -> TodoModel {
        TodoModel(configuration:.init(server:server,initialProfile:"work",vaultService:"never-keychain-message-"+UUID().uuidString),clientFactory:{url,token in Client(serverURL:url,transport:gate,middlewares:[BearerMiddleware(credential:token)])},clientDiagnostics:.disabled,catalogNotifications:NotificationCenter(),wakeNotifications:NotificationCenter())
    }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func olderWriteReadbackMustNotEraseANewerFollowUpError() async throws {
        let owner=try await todoClient(server:server,credential:"").signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
        let gate=SeatMessageGate(),model=make(gate)
        model.replaceCredential(owner);model.signedIn=true;model.selectedView="all";model.clientDiagnosticsUI.stop();model.connect()
        defer {model.signedIn=false;model.replaceCredential("")}
        try await wait {model.canWrite && !model.loading && model.searchPhase == .showing && !model.tasks.isEmpty}
        let row=try #require(model.tasks.first(where:{$0.status == "open"}))
        await gate.arm()
        let followUp=Task {await model.createDependencyFollowUp(UUID().uuidString)}
        try await wait {await gate.showHeld}
        let complete=Task {await model.transition(row,action:"complete")}
        try await wait {await gate.catalogHeld}
        await gate.releaseShow();await followUp.value
        let newer=try #require(model.message)
        try #require(newer.contains("NEWER dependency follow-up failed"))
        await gate.releaseCatalog();await complete.value
        let final=model.message
        let current=try await todoClient(server:server,credential:owner).tasks_period_show(path:.init(profile:"work",task:row.id)).ok.body.json
        #expect(current.status == .done)
        #expect(model.message == newer)
        try save("older-write-clears-newer-message",["before_readback":newer,"after_readback":final ?? NSNull(),"newer_message_preserved":final == newer,"server_status":current.status.rawValue,"signed_in":model.signedIn,"busy":model.busy,"writable":model.canWrite])
        await gate.stop()
    }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func successfulSessionRestoreMustClearItsEarlierRestoreError() async throws {
        let owner=try await todoClient(server:server,credential:"").signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
        let gate=SeatMessageGate(),model=make(gate)
        let vault=SessionVault(service:model.configuration.vaultService,account:server.absoluteString)
        try vault.save(owner)
        defer {model.signedIn=false;model.replaceCredential("");try? vault.delete()}
        await gate.failHealth();await model.restore()
        try #require(model.canRestore && !model.busy && !model.signedIn)
        let failed=try #require(model.message)
        await model.restore()
        try await wait {model.signedIn && model.canWrite && !model.loading && model.searchPhase == .showing}
        try await Task.sleep(for:.milliseconds(30))
        let after=model.message
        #expect(after == nil)
        try save("stale-restore-message",["failed_restore_message":failed,"after_successful_restore":after ?? NSNull(),"signed_in":model.signedIn,"writable":model.canWrite,"busy":model.busy])
        await gate.stop()
    }
}
