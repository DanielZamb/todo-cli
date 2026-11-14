import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

private actor SeatSurfaceGate:ClientTransport {
    let session:URLSession
    let base:URLSessionTransport
    var continuations:[AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.Continuation]=[]
    var mode:String?
    var holding=false
    var nextImmediateFailure=false
    private var completion:CheckedContinuation<Void,Never>?
    private var stopped=false
    init(){let s=URLSession(configuration:.ephemeral);session=s;base=URLSessionTransport(configuration:.init(session:s))}
    func arm(_ mode:String){self.mode=mode}
    func failNextShow(){nextImmediateFailure=true}
    func release(){completion?.resume();completion=nil}
    func stop(){stopped=true;release();continuations.forEach{$0.finish()};session.invalidateAndCancel()}
    func send(_ request:HTTPRequest,body:HTTPBody?,baseURL:URL,operationID:String) async throws -> (HTTPResponse,HTTPBody?) {
        if operationID == "tasks.show",let mode {
            self.mode=nil
            await withCheckedContinuation {completion=$0;holding=true}
            if mode == "failure" {throw RequestFailure(status:503,message:"OLD closed-surface follow-up failed",code:"unavailable")}
        } else if operationID == "tasks.show",nextImmediateFailure {
            nextImmediateFailure=false
            throw RequestFailure(status:404,message:"NEWER picker B follow-up failed",code:"not_found")
        }
        if operationID == "changes.stream" {
            let p=AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.makeStream();continuations.append(p.continuation)
            p.continuation.yield(Array("event: ready\ndata: {}\n\n".utf8)[...])
            return (HTTPResponse(status:.ok,headerFields:[.contentType:"text/event-stream",.cacheControl:"no-store"]),HTTPBody(p.stream,length:.unknown))
        }
        if stopped{throw CancellationError()}
        return try await base.send(request,body:body,baseURL:baseURL,operationID:operationID)
    }
}
@MainActor @Suite(.serialized) struct SeatSurfaceLifetimeTests {
    private var server:URL{URL(string:ProcessInfo.processInfo.environment["SEAT_SERVER"]!)!}
    private func wait(_ condition:() async -> Bool) async throws {for _ in 0..<2000{if await condition(){return};try await Task.sleep(for:.milliseconds(5))};throw URLError(.timedOut)}
    private func live() async throws -> (TodoModel,SeatSurfaceGate) {
        let owner=try await todoClient(server:server,credential:"").signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
        let gate=SeatSurfaceGate()
        let model=TodoModel(configuration:.init(server:server,initialProfile:"work",vaultService:"never-keychain-surface-"+UUID().uuidString),clientFactory:{url,token in Client(serverURL:url,transport:gate,middlewares:[BearerMiddleware(credential:token)])},clientDiagnostics:.disabled,catalogNotifications:NotificationCenter(),wakeNotifications:NotificationCenter())
        model.replaceCredential(owner);model.signedIn=true;model.selectedView="all";model.clientDiagnosticsUI.stop();model.connect()
        try await wait{model.canWrite && !model.loading && model.searchPhase == .showing && model.tasks.count>1}
        return(model,gate)
    }
    private func save(_ name:String,_ value:[String:Any]) throws {
        if let p=ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] {try JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:p).appendingPathComponent(name+".json"))}
    }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:["picker","import"])
    func aClosedSurfaceMustNotPublishItsPendingFollowUpFailure(surface:String) async throws {
        let(model,gate)=try await live()
        defer{model.signedIn=false;model.replaceCredential("")}
        if surface == "picker" {await model.openDependencyPicker(try #require(model.tasks.first))} else {model.showingImport=true}
        await gate.arm("failure")
        let pending=Task{await model.createDependencyFollowUp(UUID().uuidString)}
        try await wait{await gate.holding}
        if surface == "picker" {model.closeDependencyPicker()} else {model.showingImport=false}
        try #require(model.message == nil)
        await gate.release();await pending.value
        let after=model.message
        #expect(after == nil)
        try save("late-failure-after-"+surface+"-close",["surface":surface,"surface_closed":surface == "picker" ? model.dependencies.picker == nil:!model.showingImport,"message_after_late_reply":after ?? NSNull(),"message_surface":"\(String(describing:model.messageSurface))","writable":model.canWrite])
        model.signedIn=false;model.replaceCredential("");await gate.stop()
    }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func anOldPickerSuccessMustNotClearANewerPickersError() async throws {
        let(model,gate)=try await live()
        defer{model.signedIn=false;model.replaceCredential("")}
        let a=try #require(model.tasks.first),b=try #require(model.tasks.dropFirst().first)
        await model.openDependencyPicker(a)
        let firstID=try #require(model.dependencies.picker?.id)
        await gate.arm("success")
        let old=Task{await model.createDependencyFollowUp(a.id)}
        try await wait{await gate.holding}
        model.closeDependencyPicker()
        await model.openDependencyPicker(b)
        let secondID=try #require(model.dependencies.picker?.id);try #require(secondID != firstID)
        await gate.failNextShow();await model.createDependencyFollowUp(UUID().uuidString)
        let newer=try #require(model.message);try #require(newer.contains("NEWER picker B"))
        let sequence=model.messageSequence
        await gate.release();await old.value
        let after=model.message
        #expect(after == newer)
        try save("old-picker-success-clears-new-picker-error",["before_old_completion":newer,"after_old_completion":after ?? NSNull(),"newer_message_preserved":after == newer,"picker_b_closed_by_a":model.dependencies.picker == nil,"quick_add_opened_by_a":model.quickAdd,"sequence_before_completion":sequence,"sequence_after_completion":model.messageSequence,"writable":model.canWrite])
        model.signedIn=false;model.replaceCredential("");await gate.stop()
    }
}
