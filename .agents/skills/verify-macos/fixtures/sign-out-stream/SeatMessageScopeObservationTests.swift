import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

private actor SeatSheetMessageGate:ClientTransport {
    let session:URLSession
    let base:URLSessionTransport
    var continuations:[AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.Continuation]=[]
    var failShow=false
    init(){let s=URLSession(configuration:.ephemeral);session=s;base=URLSessionTransport(configuration:.init(session:s))}
    func failNextShow(){failShow=true}
    func stop(){continuations.forEach{$0.finish()};session.invalidateAndCancel()}
    func send(_ request:HTTPRequest,body:HTTPBody?,baseURL:URL,operationID:String) async throws -> (HTTPResponse,HTTPBody?) {
        if operationID == "tasks.show",failShow {failShow=false;throw RequestFailure(status:404,message:"Old closed-sheet follow-up failed",code:"not_found")}
        if operationID == "changes.stream" {
            let p=AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.makeStream();continuations.append(p.continuation)
            p.continuation.yield(Array("event: ready\ndata: {}\n\n".utf8)[...])
            return(HTTPResponse(status:.ok,headerFields:[.contentType:"text/event-stream",.cacheControl:"no-store"]),HTTPBody(p.stream,length:.unknown))
        }
        return try await base.send(request,body:body,baseURL:baseURL,operationID:operationID)
    }
}
@MainActor @Suite(.serialized) struct SeatMessageScopeObservationTests {
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil))
    func observeWhichActionsClearAGeneralSheetError() async throws {
        let url=URL(string:ProcessInfo.processInfo.environment["SEAT_SERVER"]!)!
        let owner=try await todoClient(server:url,credential:"").signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
        let gate=SeatSheetMessageGate()
        let model=TodoModel(configuration:.init(server:url,initialProfile:"work",vaultService:"never-keychain-scope-observe-"+UUID().uuidString),clientFactory:{url,token in Client(serverURL:url,transport:gate,middlewares:[BearerMiddleware(credential:token)])},clientDiagnostics:.disabled,catalogNotifications:NotificationCenter(),wakeNotifications:NotificationCenter())
        model.replaceCredential(owner);model.signedIn=true;model.selectedView="all";model.clientDiagnosticsUI.stop();model.connect()
        defer {model.signedIn=false;model.replaceCredential("")}
        func wait(_ predicate:() -> Bool) async throws {for _ in 0..<2000{if predicate(){return};try await Task.sleep(for:.milliseconds(5))};throw URLError(.timedOut)}
        try await wait {model.canWrite && !model.loading && !model.tasks.isEmpty}
        let row=try #require(model.tasks.first(where:{$0.status == "open"}))
        await model.openDependencyPicker(row)
        try #require(model.dependencies.picker != nil)
        await gate.failNextShow();await model.createDependencyFollowUp(UUID().uuidString)
        let error=try #require(model.message)
        model.closeDependencyPicker()
        #expect(model.dependencies.picker == nil)
        let afterClose=model.message
        model.changeProfile("personal")
        try await wait {model.profile == "personal" && model.canWrite && !model.loading && model.searchPhase == .showing}
        let afterProfile=model.message
        let next=try await todoClient(server:url,credential:"").signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
        model.replaceCredential(next);model.connect()
        try await wait {model.canWrite && !model.loading && model.searchPhase == .showing}
        let afterCredential=model.message
        model.newTitle="New scope write clears the old general error"
        #expect(await model.create(openEditor:false))
        #expect(model.message == nil)
        if let p=ProcessInfo.processInfo.environment["SEAT_EVIDENCE"] {
            let result:[String:Any]=["original":error,"after_sheet_close":afterClose ?? NSNull(),"after_profile_change":afterProfile ?? NSNull(),"after_credential_change":afterCredential ?? NSNull(),"after_successful_write":model.message ?? NSNull(),"signed_in":model.signedIn,"writable":model.canWrite]
            try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:p).appendingPathComponent("general-error-lifetime-observation.json"))
        }
        model.signedIn=false;model.replaceCredential("");await gate.stop()
    }
}
