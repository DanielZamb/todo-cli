import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

private actor SeatNoticeGate:ClientTransport {
    let session:URLSession
    let base:URLSessionTransport
    var operations:[String]=[]
    var showStarted=false
    var streamStarted=false
    var showContinuation:CheckedContinuation<Void,Never>?
    var streamContinuation:AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.Continuation?
    init() { let s=URLSession(configuration:.ephemeral);session=s;base=URLSessionTransport(configuration:.init(session:s)) }
    func releaseShow() { showContinuation?.resume();showContinuation=nil }
    func ready() { streamContinuation?.yield(Array("event: ready\ndata: {}\n\n".utf8)[...]) }
    func stop() { streamContinuation?.finish();session.invalidateAndCancel() }
    func send(_ request:HTTPRequest,body:HTTPBody?,baseURL:URL,operationID:String) async throws -> (HTTPResponse,HTTPBody?) {
        operations.append(operationID)
        if operationID == "tasks.show" {
            await withCheckedContinuation { showContinuation=$0;showStarted=true }
            throw RequestFailure(status:404,message:"NEWER dependency follow-up failed",code:"not_found")
        }
        if operationID == "credentials.signOut" { throw RequestFailure(status:503,message:"OLDER sign-out failed",code:"unavailable") }
        if operationID == "changes.stream" {
            let pair=AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.makeStream();streamContinuation=pair.continuation;streamStarted=true
            return (HTTPResponse(status:.ok,headerFields:[.contentType:"text/event-stream",.cacheControl:"no-store"]),HTTPBody(pair.stream,length:.unknown))
        }
        return try await base.send(request,body:body,baseURL:baseURL,operationID:operationID)
    }
}
@MainActor @Suite(.serialized) struct SeatSignOutNoticeTests {
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func signOutReconnectMustNotReplaceANewerPendingReadError() async throws {
        let url=URL(string:ProcessInfo.processInfo.environment["SEAT_SERVER"]!)!
        let owner=try await todoClient(server:url,credential:"").signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
        let gate=SeatNoticeGate(),model=TodoModel(configuration:.init(server:url,initialProfile:"work",vaultService:"never-keychain-notice-"+UUID().uuidString),clientFactory:{url,token in Client(serverURL:url,transport:gate,middlewares:[BearerMiddleware(credential:token)])},clientDiagnostics:.disabled,catalogNotifications:NotificationCenter(),wakeNotifications:NotificationCenter())
        model.replaceCredential(owner);model.signedIn=true;model.connection = .live;model.selectedView="all";model.clientDiagnosticsUI.stop()
        defer { model.signedIn=false;model.replaceCredential("") }
        func wait(_ stage:String,_ predicate:() async -> Bool) async throws {
            for _ in 0..<2000 { if await predicate() { return };try await Task.sleep(for:.milliseconds(5)) }
            let state:[String:Any]=["stage":stage,"connection":"\(model.connection)","loading":model.loading,"busy":model.busy,"signedIn":model.signedIn,"message":model.message ?? NSNull(),"search_error":model.searchError ?? NSNull(),"task_load_error":model.taskLoadError ?? NSNull(),"operations":await gate.operations]
            if let p=ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] {try JSONSerialization.data(withJSONObject:state,options:.prettyPrinted).write(to:URL(fileURLWithPath:p).appendingPathComponent("notice-timeout-stage.json"))}
            throw URLError(.timedOut)
        }
        let followUp=Task { await model.createDependencyFollowUp(UUID().uuidString) }
        try await wait("show") { await gate.showStarted }
        await model.signOut()
        try #require(model.message?.contains("OLDER sign-out failed") == true)
        try await wait("stream") { await gate.streamStarted }
        await gate.releaseShow();await followUp.value
        let newer=try #require(model.message)
        try #require(newer.contains("NEWER dependency follow-up failed"))
        await gate.ready()
        try await wait("ready") { model.canWrite && !model.loading }
        try await Task.sleep(for:.milliseconds(50))
        let after=model.message
        #expect(after == newer)
        if let p=ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] {
            let value:[String:Any]=["before_ready":newer,"after_ready":after ?? NSNull(),"signed_in":model.signedIn,"writable":model.canWrite,"newer_error_survived":after == newer]
            try JSONSerialization.data(withJSONObject:value,options:.prettyPrinted).write(to:URL(fileURLWithPath:p).appendingPathComponent("notice-overwrites-newer-error.json"))
        }
        await gate.stop()
    }
}
