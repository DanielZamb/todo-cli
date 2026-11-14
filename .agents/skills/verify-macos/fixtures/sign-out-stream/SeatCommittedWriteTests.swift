import Foundation
import Testing
import TodoAPI
@testable import TodoState

@MainActor @Suite(.serialized) struct SeatCommittedWriteTests {
    private var output: URL { URL(fileURLWithPath:ProcessInfo.processInfo.environment["SEAT_EVIDENCE"]!) }
    private var server: URL { URL(string:ProcessInfo.processInfo.environment["SEAT_SERVER"]!)! }
    private var proxy: URL { URL(string:ProcessInfo.processInfo.environment["SEAT_PROXY"]!)! }
    private func control(_ op:String = "status", _ payload:[String:Any] = [:]) async throws -> [String:Int] {
        let s = URLSession(configuration:.ephemeral); defer { s.invalidateAndCancel() }
        var r = URLRequest(url:proxy.appendingPathComponent("__control/"+op)); r.httpMethod="POST"; r.httpBody=try JSONSerialization.data(withJSONObject:payload)
        let (data,response) = try await s.data(for:r); try #require((response as? HTTPURLResponse)?.statusCode == 200)
        return try JSONDecoder().decode([String:Int].self,from:data)
    }
    private func wait(_ predicate:() async throws -> Bool) async throws { for _ in 0..<1000 { if try await predicate() { return }; try await Task.sleep(for:.milliseconds(10)) }; throw URLError(.timedOut) }
    private func history(_ api:Client,_ profile:String,_ id:String) async throws -> Int { try await api.reads_period_history(path:.init(profile:profile,task:id)).ok.body.json.count }
    @Test(.enabled(if:ProcessInfo.processInfo.environment["SEAT_PROXY"] != nil))
    func eightKindsOfCommittedWriteSurviveRetirementWithoutRetryOrNewScopePublication() async throws {
        let auth = TodoClientSession(server:server,credential:""); defer { auth.invalidate() }
        let old = try await auth.client.signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
        let new = try await auth.client.signIn_period_signIn(body:.json(.init(passphrase:"scratch verification passphrase"))).ok.body.json.credential
        let read = TodoClientSession(server:server,credential:new); defer { read.invalidate() }
        let api=read.client
        var results:[[String:Any]]=[]
        for kind in ["save","complete","copy","quick-add","attachment","dependency-add","dependency-remove","batch-edit"] {
            let title="Seat retirement "+kind+" "+UUID().uuidString
            var target=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"personal"),body:.json(.init(title:title))).ok.body.json)
            let blocker=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"personal"),body:.json(.init(title:"Blocker "+kind))).ok.body.json)
            let canary=try TaskSnapshot.decode(await api.tasks_period_create(path:.init(profile:"personal"),body:.json(.init(title:"New scope draft "+kind))).ok.body.json)
            if kind == "dependency-remove" { _ = try await api.tasks_period_depend(path:.init(profile:"personal",task:target.id),body:.json(.init(blocker_id:blocker.id,from_version:target.row_version))).ok; target=try TaskSnapshot.decode(await api.tasks_period_show(path:.init(profile:"personal",task:target.id)).ok.body.json) }
            let before=try await history(api,"personal",target.id)
            let model=TodoModel(configuration:.init(server:proxy,initialProfile:"personal",vaultService:"never-keychain-held-write-"+UUID().uuidString),clientDiagnostics:.disabled,catalogNotifications:NotificationCenter(),wakeNotifications:NotificationCenter())
            model.replaceCredential(old); model.signedIn=true; model.connection = .live; model.clientDiagnosticsUI.stop(); model.selectedView="all"
            await model.refreshAfterWrite("Initial write view"); model.beginEditing(target)
            if kind.hasPrefix("dependency-") { await model.openDependencyPicker(target); try #require(model.dependencies.picker?.failure == nil) }
            if kind == "batch-edit" { var draft=BatchEditDraft(profile:"personal"); draft.targets=[target]; draft.selected=[target.id]; draft.loading=false; draft.field = .priority; draft.value="P1"; model.batchEdit=draft }
            if kind == "save" { model.editor?.title = title+" edited" }
            if kind == "quick-add" { model.newTitle = title+" created"; model.quickAdd=true }
            let route:String
            switch kind {
            case "save": route="/profiles/personal/tasks/"+target.id
            case "complete": route="/profiles/personal/tasks/"+target.id+"/transition"
            case "copy": route="/profiles/personal/tasks/"+target.id+"/copy"
            case "quick-add": route="/profiles/personal/tasks"
            case "attachment": route="/profiles/personal/tasks/"+target.id+"/attachments"
            case "dependency-add": route="/profiles/personal/tasks/"+target.id+"/dependencies"
            case "dependency-remove": route="/profiles/personal/tasks/"+target.id+"/dependencies/remove"
            default: route="/profiles/personal/batch-edit"
            }
            _ = try await control("arm",["path":route,"credential":old])
            let pending=Task {
                switch kind {
                case "save": _ = await model.save()
                case "complete": await model.transition(target,action:"complete")
                case "copy": await model.write(.copy("work"))
                case "quick-add": _ = await model.create(openEditor:false)
                case "attachment": await model.attachLink("https://example.test/seat-retirement")
                case "dependency-add","dependency-remove": await model.toggleDependency(blocker)
                default: await model.applyBatchEdit(dryRun:false)
                }
            }
            try await wait { try await control()["committedHeld"] == 1 }
            model.replaceCredential(new); model.signedIn=true; model.connection = .live; model.clientDiagnosticsUI.stop(); model.beginEditing(canary)
            model.editor?.title="Keep this new draft"; model.newTitle="Keep quick-add text"; model.quickAdd=true; model.message="Keep new message"; model.editorError="Keep new error"; model.busy=true
            await pending.value
            #expect(model.signedIn && model.connection == .live && model.busy)
            #expect(model.editor?.title == "Keep this new draft" && model.newTitle == "Keep quick-add text" && model.quickAdd)
            #expect(model.message == "Keep new message" && model.editorError == "Keep new error" && model.conflict == nil && model.transferResult == nil)
            _ = try await control("release")
            let stats=try await control(); #expect(stats["matchedWrites"] == 1)
            model.busy=false; await model.refreshAfterWrite("Read committed old write")
            #expect(model.canWrite && model.editor?.title == "Keep this new draft")
            let latest=try TaskSnapshot.decode(await api.tasks_period_show(path:.init(profile:"personal",task:target.id)).ok.body.json)
            var delta=0
            if kind == "copy" || kind == "quick-add" {
                let destination=kind == "copy" ? "work":"personal"
                let rows=try await api.tasks_period_list(path:.init(profile:destination)).ok.body.json.map(TaskSnapshot.decode)
                let created=try #require(rows.first { $0.title == (kind == "copy" ? title:title+" created") })
                #expect(rows.filter { $0.title == created.title }.count == 1)
                delta=try await history(api,destination,created.id); #expect(delta == 1)
                if destination == "personal" { #expect(model.tasks.contains { $0.id == created.id }) }
            } else {
                delta=try await history(api,"personal",target.id)-before; #expect(delta == 1)
                let visible=try #require(model.tasks.first { $0.id == latest.id }); #expect(visible == latest)
                if kind == "save" { #expect(latest.title == title+" edited") }
                if kind == "complete" { #expect(latest.status == "done") }
                if kind == "attachment" { #expect(latest.attachments?.count == 1) }
                if kind == "dependency-add" { #expect(latest.depends_on == [blocker.id]) }
                if kind == "dependency-remove" { #expect(latest.depends_on?.isEmpty == true) }
                if kind == "batch-edit" { #expect(latest.priority == "P1") }
            }
            results.append(["kind":kind,"write_requests":stats["matchedWrites"]!,"history_records":delta,"old_reply_changed_new_scope":false,"refreshed_writable":model.canWrite])
            model.signedIn=false; model.replaceCredential(""); _ = try await control("reset")
        }
        try JSONSerialization.data(withJSONObject:results,options:.prettyPrinted).write(to:output.appendingPathComponent("eight-committed-write-kinds.json"))
    }
}
