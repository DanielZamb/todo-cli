import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import Testing
import TodoAPI
@testable import TodoState

private actor SurfaceClassGate: ClientTransport {
    struct Rule: Sendable { let after: Bool; let status: Int?; let label: String }
    let session: URLSession
    let base: URLSessionTransport
    var rules: [String:[Rule]] = [:]
    var held: [String:CheckedContinuation<Void,Never>] = [:]
    var failNext: [String:Int] = [:]
    var counts: [String:Int] = [:]
    var streams: [AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.Continuation] = []
    var active = 0
    var drains: [CheckedContinuation<Void,Never>] = []
    var stopped = false
    init() { let s = URLSession(configuration:.ephemeral); session=s; base=URLSessionTransport(configuration:.init(session:s)) }
    func arm(_ op:String, after:Bool = false, status:Int? = nil, label:String = "surface") { rules[op,default:[]].append(.init(after:after,status:status,label:label)) }
    func fail(_ op:String, status:Int=503) { failNext[op]=status }
    func waiting(_ op:String)->Bool { held[op] != nil }
    func release(_ op:String) { held.removeValue(forKey:op)?.resume() }
    func resetCounts() { counts = [:] }
    func snapshot()->[String:Int] { counts }
    func stop() async {
        stopped=true
        for key in Array(held.keys) { release(key) }
        for c in streams { c.finish() }
        if active > 0 { await withCheckedContinuation { drains.append($0) } }
        session.invalidateAndCancel()
    }
    private func failure(_ status:Int,_ label:String)->RequestFailure { .init(status:status,message:"OLD "+label+" failed",code:status == 401 ? "unauthorized":"unavailable") }
    func send(_ request:HTTPRequest,body:HTTPBody?,baseURL:URL,operationID:String) async throws -> (HTTPResponse,HTTPBody?) {
        guard !stopped else { throw CancellationError() }
        active += 1
        defer { active -= 1; if active == 0 { for d in drains { d.resume() }; drains=[] } }
        counts[operationID,default:0] += 1
        if let status=failNext.removeValue(forKey:operationID) { throw failure(status,"read-back") }
        var rule:Rule?
        if rules[operationID]?.isEmpty == false { rule=rules[operationID]?.removeFirst() }
        if let rule, !rule.after {
            await withCheckedContinuation { held[operationID]=$0 }
            if let status=rule.status { throw failure(status,rule.label) }
        }
        if operationID == "changes.stream" {
            let p=AsyncThrowingStream<HTTPBody.ByteChunk,any Error>.makeStream(); streams.append(p.continuation)
            // Keep the reconnect pending, so a published read-back message cannot disappear in ready.
            return(HTTPResponse(status:.ok,headerFields:[.contentType:"text/event-stream"]),HTTPBody(p.stream,length:.unknown))
        }
        guard !stopped else { throw CancellationError() }
        let value=try await base.send(request,body:body,baseURL:baseURL,operationID:operationID)
        if let rule, rule.after { await withCheckedContinuation { held[operationID]=$0 }; if let status=rule.status { throw failure(status,rule.label) } }
        return value
    }
}

@MainActor @Suite(.serialized) struct SeatSurfaceClassTests {
    private var server:URL { URL(string:ProcessInfo.processInfo.environment["SEAT_SERVER"]!)! }
    private func wait(_ test:() async ->Bool) async throws { for _ in 0..<2000 { if await test(){ return }; try await Task.sleep(for:.milliseconds(5)) }; throw URLError(.timedOut) }
    private func save(_ name:String,_ value:[String:Any]) throws {
        let p=URL(fileURLWithPath:ProcessInfo.processInfo.environment["SEAT_EVIDENCE"]!).appendingPathComponent(name+".json")
        try JSONSerialization.data(withJSONObject:value,options:[.prettyPrinted,.sortedKeys]).write(to:p)
    }
    private func live() async throws -> (TodoModel,SurfaceClassGate,TaskSnapshot,Client,TodoClientSession) {
        let auth=TodoClientSession(server:server,credential:"")
        let token=try await auth.client.signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
        auth.invalidate()
        let owner=TodoClientSession(server:server,credential:token)
        let task=try TaskSnapshot.decode(await owner.client.tasks_period_create(path:.init(profile:"work"),body:.json(.init(title:"Seat surface class "+UUID().uuidString))).ok.body.json)
        let gate=SurfaceClassGate()
        let model=TodoModel(configuration:.init(server:server,initialProfile:"work",vaultService:"memory-surface-class-"+UUID().uuidString),clientFactory:{url,token in Client(serverURL:url,transport:gate,middlewares:[BearerMiddleware(credential:token)])},clientDiagnostics:.disabled,catalogNotifications:NotificationCenter(),wakeNotifications:NotificationCenter())
        try SessionVault(service:model.configuration.vaultService,account:server.absoluteString).save(token)
        model.replaceCredential(token);model.signedIn=true;model.connection = .live;model.clientDiagnosticsUI.stop();model.selectedView="all"
        await model.refreshAfterWrite("Initial")
        try #require(model.canWrite && model.tasks.contains{$0.id == task.id})
        return(model,gate,task,owner.client,owner)
    }
    private func finish(_ model:TodoModel,_ gate:SurfaceClassGate,_ owner:TodoClientSession) async {
        model.signedIn=false;model.replaceCredential("");await gate.stop();owner.invalidate()
    }
    private func batch(_ model:TodoModel,_ task:TaskSnapshot) {
        var d=BatchEditDraft(profile:task.profile_id);d.targets=[task];d.selected=[task.id];d.loading=false;d.field = .priority;d.value="P1";model.batchEdit=d
    }

    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:["picker","import","batch","attachment-batch"])
    func aClosedSurfaceStillExpiresItsCurrentUnauthorizedSession(surface:String) async throws {
        let(m,g,t,_,owner)=try await live()
        var operation="tasks.show"
        if surface == "picker" { await m.openDependencyPicker(t) }
        else if surface == "import" { m.showingImport=true }
        else if surface == "batch" { batch(m,t);operation="tasks.batchEdit" }
        else { var d=AttachmentBatchDraft(profile:"work",reference:AttachmentSnapshot(id:"reference",location:.link(URL(string:"https://example.test/surface")!),label:nil,added_at:"2026-11-12T00:00:00Z"));d.targets=[t];d.selected=[t.id];d.loading=false;m.attachmentBatch=d;operation="tasks.attachMany" }
        await g.arm(operation,status:401,label:"closed "+surface)
        let pending=Task {
            if surface == "batch" { await m.applyBatchEdit(dryRun:false) }
            else if surface == "attachment-batch" { await m.applyAttachmentBatch(dryRun:false) }
            else { await m.createDependencyFollowUp(t.id) }
        }
        try await wait { await g.waiting(operation) }
        if surface == "picker" { m.closeDependencyPicker() }
        else if surface == "import" { m.showingImport=false }
        else if surface == "batch" { m.batchEdit=nil }
        else {m.attachmentBatch=nil}
        await g.release(operation);await pending.value
        let stored=try SessionVault(service:m.configuration.vaultService,account:server.absoluteString).load()
        try save("closed-401-"+surface,["signed_in":m.signedIn,"stored_session_present":stored != nil,"message":m.message ?? NSNull(),"busy":m.busy])
        #expect(!m.signedIn && stored == nil)
        await finish(m,g,owner)
    }

    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:[false,true])
    func aClosedBatchReadbackFailureMustNotPublishItsMessage(reopen:Bool) async throws {
        let(m,g,t,api,owner)=try await live();batch(m,t)
        await g.arm("tasks.batchEdit",after:true)
        let pending=Task { await m.applyBatchEdit(dryRun:false) }
        try await wait { await g.waiting("tasks.batchEdit") }
        m.batchEdit=nil
        if reopen {batch(m,t);m.batchEdit?.value="P4"}
        await g.fail("tasks.list")
        await g.release("tasks.batchEdit");await pending.value
        let after=m.message
        let canonical=try TaskSnapshot.decode(await api.tasks_period_show(path:.init(profile:"work",task:t.id)).ok.body.json)
        try save("closed-batch-failed-readback-"+String(reopen),["message":after ?? NSNull(),"server_priority":canonical.priority,"reopened_value":m.batchEdit?.value ?? NSNull(),"new_report":m.batchEdit?.report != nil,"requests":await g.snapshot()])
        #expect(canonical.priority == "P1")
        #expect(after == nil)
        if reopen {#expect(m.batchEdit?.value == "P4" && m.batchEdit?.report == nil)}
        await finish(m,g,owner)
    }

    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:["closed","same-task","other-task"])
    func anAttachmentErrorMustBelongToTheOpeningThatStartedIt(reopen:String) async throws {
        let(m,g,t,api,owner)=try await live();m.beginEditing(t)
        await g.arm("tasks.attach",status:503,label:"editor A Attachment")
        let pending=Task{await m.attachLink("https://example.test/old-editor")}
        try await wait {await g.waiting("tasks.attach")}
        m.editor=nil
        if reopen == "same-task" {m.beginEditing(t);m.editor?.title="NEW editor B draft"}
        if reopen == "other-task" {let b=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"work"),body:.json(.init(title:"Other editor B"))).ok.body.json);m.beginEditing(b);m.editor?.title="NEW editor B draft"}
        await g.release("tasks.attach");await pending.value
        try save("attachment-editor-instance-"+reopen,["editor_error":m.editorError ?? NSNull(),"editor_title":m.editor?.title ?? NSNull(),"editor_task_id_equal":m.editor?.id == t.id])
        #expect(m.editorError == nil)
        if reopen != "closed" {#expect(m.editor?.title == "NEW editor B draft")}
        await finish(m,g,owner)
    }

    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:[false,true])
    func anOldQuickAddMustNotChangeAReopenedQuickAdd(fails:Bool) async throws {
        let(m,g,_,api,owner)=try await live();m.quickAdd=true;m.newTitle="Committed quick-add A "+UUID().uuidString
        let oldTitle=m.newTitle
        await g.arm("tasks.create",after:!fails,status:fails ? 503:nil,label:"quick-add A")
        let pending=Task{await m.create(openEditor:true)}
        try await wait {await g.waiting("tasks.create")}
        m.quickAdd=false;m.quickAdd=true;m.newTitle="NEW quick-add B draft";m.quickAddError=nil
        await g.release("tasks.create");_ = await pending.value
        let rows=try await api.tasks_period_list(path:.init(profile:"work")).ok.body.json.map(TaskSnapshot.decode)
        try save("quick-add-instance-"+String(fails),["new_title":m.newTitle,"quick_add":m.quickAdd,"error":m.quickAddError ?? NSNull(),"editor_opened":m.editor != nil,"committed_rows":rows.filter{$0.title == oldTitle}.count])
        #expect(m.quickAdd && m.newTitle == "NEW quick-add B draft" && m.quickAddError == nil && m.editor == nil)
        await finish(m,g,owner)
    }

    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:[false,true])
    func aClosedAndOpenBatchEachRunOneCatalogReadback(closed:Bool) async throws {
        let(m,g,t,api,owner)=try await live();batch(m,t)
        await g.resetCounts();await g.arm("tasks.batchEdit",after:true)
        let pending=Task{await m.applyBatchEdit(dryRun:false)}
        try await wait{await g.waiting("tasks.batchEdit")}
        if closed {m.batchEdit=nil}
        await g.release("tasks.batchEdit");await pending.value
        let counts=await g.snapshot()
        let canonical=try TaskSnapshot.decode(await api.tasks_period_show(path:.init(profile:"work",task:t.id)).ok.body.json)
        try save("batch-readback-counts-"+String(closed),["requests":counts,"model_priority":m.tasks.first{$0.id == t.id}?.priority ?? NSNull(),"canonical_priority":canonical.priority,"message":m.message ?? NSNull()])
        #expect(counts["tasks.batchEdit"] == 1 && counts["tasks.list"] == 1)
        #expect(counts.values.reduce(0,+) == 9)
        #expect(m.tasks.first{$0.id == t.id} == canonical && m.message == nil)
        await finish(m,g,owner)
    }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:["credential","profile"])
    func aCommittedOldImportCannotReadBackInANewScope(change:String) async throws {
        let(m,g,_,api,owner)=try await live()
        m.showingImport=true
        let title="Import scope "+UUID().uuidString
        m.loadImport(data:try JSONSerialization.data(withJSONObject:[["title":title,"external_id":"scope-"+UUID().uuidString]]),name:"scope.json")
        await m.previewImport();try #require(m.importReport?.dry_run == true)
        await g.arm("tasks.importTasks",after:true)
        let pending=Task{await m.applyImport()}
        try await wait{await g.waiting("tasks.importTasks")}
        if change == "credential" {
            let token=try await api.signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
            m.replaceCredential(token);m.signedIn=true;m.connection = .live;m.clientDiagnosticsUI.stop()
        } else {m.profile="personal"}
        m.importReport=nil;m.importError="NEW scope import error"
        let before=await g.snapshot()
        await g.release("tasks.importTasks");await pending.value
        let after=await g.snapshot()
        let rows=try await api.tasks_period_list(path:.init(profile:"work")).ok.body.json.map(TaskSnapshot.decode)
        try save("import-scope-"+change,["no_late_requests":before==after,"committed_rows":rows.filter{$0.title==title}.count,"report_published":m.importReport != nil,"error":m.importError ?? NSNull()])
        #expect(before == after && m.importReport == nil && m.importError == "NEW scope import error")
        #expect(rows.filter{$0.title==title}.count == 1)
        await finish(m,g,owner)
    }

    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_SERVER"] != nil),arguments:[false,true])
    func anImportPreviewMustNotPublishAfterItsOpeningClosed(reopen:Bool) async throws {
        let(m,g,_,_,owner)=try await live();m.showingImport=true
        m.loadImport(data:Data("[{\"title\":\"Import A\"}]".utf8),name:"a.json")
        await g.arm("tasks.importTasks",after:true)
        let pending=Task{await m.previewImport()}
        try await wait{await g.waiting("tasks.importTasks")}
        m.showingImport=false
        if reopen {m.resetImport();m.showingImport=true;m.importError="NEW Import B error"}
        await g.release("tasks.importTasks");await pending.value
        try save("import-preview-instance-"+String(reopen),["showing_import":m.showingImport,"report_published":m.importReport != nil,"error":m.importError ?? NSNull()])
        #expect(m.importReport == nil)
        if reopen {#expect(m.importError == "NEW Import B error")}
        await finish(m,g,owner)
    }

}
