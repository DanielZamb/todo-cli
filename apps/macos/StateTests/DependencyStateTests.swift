import Foundation
import Testing
import TodoAPI
@testable import TodoState

@MainActor struct DependencyStateTests {
    private func model(server: URL = URL(string: "http://127.0.0.1:1")!) -> TodoModel {
        TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-dependency-state"))
    }
    private func task(_ id: String, status: String = "open", blockers: [String] = [], ready: Bool = false, blocked: Bool = false) -> TaskSnapshot {
        .init(id: id, profile_id: "work", row_version: 1, depends_on: blockers, ready: ready, blocked: blocked, title: id, description: nil, priority: "P3", source: "manual", status: status, project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }
    @Test func badgesUseDirectBlockersAndHideForTerminalAndUnlinkedTasks() {
        let catalog = [task("open"), task("snoozed", status: "snoozed"), task("done", status: "done"), task("cancelled", status: "cancelled")]
        #expect(task("root", blockers: ["open", "snoozed", "cancelled"], blocked: true).dependencyBadge(catalog: catalog) == "Blocked · 2")
        #expect(task("root", status: "snoozed", blockers: ["done", "cancelled"], ready: true).dependencyBadge(catalog: catalog) == "Ready")
        #expect(task("root", ready: true).dependencyBadge(catalog: catalog) == nil)
        #expect(task("root", status: "done", blockers: ["done"], ready: true).dependencyBadge(catalog: catalog) == nil)
        #expect(task("root", status: "cancelled", blockers: ["open"], blocked: true).dependencyBadge(catalog: catalog) == nil)
    }
    @Test func trueOnlyFilterBoundaryAndOrderAreLiteral() {
        #expect(TaskListFilters().query.ready == nil)
        #expect(TaskListFilters().query.blocked == nil)
        #expect(TaskListFilters(ready: true).query.ready?.rawValue == "true")
        #expect(TaskListFilters(blocked: true).query.blocked?.rawValue == "true")
        #expect(TaskListFilters(order: "topo").query.order?.rawValue == "topo")
        #expect(TaskListFilters(order: "lightest").query.order?.rawValue == "lightest")
        let value = model()
        value.selectedView = "all"
        value.taskFilters.order = "topo"
        value.tasks = [task("P3 first"), task("P1 second")]
        #expect(TaskListView(model: value).taskGroups.map(\.name) == ["Dependency order"])
        #expect(TaskListView(model: value).taskGroups.flatMap(\.tasks).map(\.id) == ["P3 first", "P1 second"])
    }
    @Test func closeCredentialAndProfileResetInvalidateRetainedDependencyData() async {
        let value = model()
        value.signedIn = true
        value.dependencies.picker = .init(profile: "work", root: task("root"), direction: .dependsOn, linked: [task("linked")])
        let run = value.dependencies.generation
        value.closeDependencyPicker()
        #expect(value.dependencies.picker == nil)
        #expect(value.dependencies.generation == run + 1)
        value.dependencies.initial = [task("seed")]
        value.replaceCredential("replacement")
        #expect(value.dependencies.initial.isEmpty)
        #expect(!value.currentDependencyScope(profile: "work", epoch: 0, run: run))
    }
    @Test func structuredErrorsNeverProjectAgentCopyAndRejectMalformedPairs() throws {
        let cycle = #"{"generated_at":"2026-11-10T00:00:00Z","message":"todo secret-agent-copy HTTP /do-not-show","exit_code":2,"exit_meaning":"validation or usage","code":"dependency_cycle","details":{"dependent_id":"a","blocker_id":"b","path":["a","b","a"]}}"#
        let failure = try JSONDecoder().decode(ServerFailure.self, from: Data(cycle.utf8))
        let notice = DependencyNotice.project(failure, context: .link)
        #expect(notice.message == "This Dependency would create a loop.")
        #expect(notice.detail == "error 2 - validation or usage")
        #expect(notice.path == ["a", "b", "a"])
        let selfCycle = cycle.replacingOccurrences(of: #""blocker_id":"b""#, with: #""blocker_id":"a""#)
        #expect(DependencyNotice.project(try JSONDecoder().decode(ServerFailure.self, from: Data(selfCycle.utf8)), context: .link).message == "A Task can't depend on itself.")
        let malformed = cycle.replacingOccurrences(of: #""exit_code":2"#, with: #""exit_code":4"#)
        let bad = try JSONDecoder().decode(ServerFailure.self, from: Data(malformed.utf8))
        #expect(bad.dependencyError == nil)
        #expect(DependencyNotice.project(bad, context: .link).detail == nil)
        #expect(DependencyNotice.countAdvice(14) == "This Task depends on 14 Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.")
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func livePickerDirectionsVersionsSearchDraftAndReviewedDelete() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        func create(_ title: String) async throws -> TaskSnapshot {
            let payload = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: ["title": title]))
            return try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(payload)).ok.body.json)
        }
        let root = try await create("DAG native root")
        let blocker = try await create("DAG native blocker")
        let dependent = try await create("DAG native dependent")
        let value = model(server: server)
        value.replaceCredential(session.credential)
        value.signedIn = true
        value.connection = .live
        value.beginEditing(root)
        value.editor?.title = "Keep this unsaved draft"
        await value.openDependencyPicker(root)
        await value.toggleDependency(blocker)
        #expect(value.dependencies.picker?.failure == nil)
        #expect(value.dependencies.picker?.root.row_version == 2)
        #expect(value.dependencies.picker?.linked.map(\.id) == [blocker.id])
        #expect(value.editor?.title == "Keep this unsaved draft")
        #expect(value.editor?.base.row_version == 1)
        await value.readDependencyGraph(root: root.id)
        #expect(value.dependencies.graph?.report?.ancestors == [blocker.id])
        #expect(value.dependencies.graph?.report?.lightest_next == [blocker.id])
        value.dependencies.graph?.viewport = .init(x: 12, y: -8, scale: 1.5)
        value.dependencies.graph?.focused = blocker.id
        value.dependencies.graph?.selected = blocker.id
        value.dependencies.graph?.expanded = [blocker.id]
        value.dependencies.picker?.text = "no matching words zzzzz"
        await value.searchDependencyCandidates()
        #expect(value.dependencies.picker?.rows.map(\.id) == [blocker.id])
        await value.setDependencyDirection(.blocks)
        await value.toggleDependency(dependent)
        #expect(value.dependencies.picker?.failure == nil)
        let changed = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: dependent.id)).ok.body.json)
        #expect(changed.row_version == 2)
        #expect(changed.depends_on == [root.id])
        let rootNow = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: root.id)).ok.body.json)
        #expect(rootNow.row_version == 2)
        await value.readDependencyGraph()
        #expect(value.dependencies.graph?.viewport == .init(x: 12, y: -8, scale: 1.5))
        #expect(value.dependencies.graph?.focused == blocker.id)
        #expect(value.dependencies.graph?.selected == blocker.id)
        #expect(value.dependencies.graph?.expanded == [blocker.id])
        let batchExtra = try await create("DAG native batch extra")
        let done = try await create("DAG native batch done")
        _ = try await api.tasks_period_transition(path: .init(profile: "work", task: done.id), body: .json(.init(from_version: 1, action: .complete))).ok.body.json
        await value.beginDependencyBatch()
        value.dependencies.batch?.selected = [dependent.id, batchExtra.id, done.id]
        await value.previewDependencyBatch()
        #expect(value.dependencies.batch?.report?.dry_run == true)
        let previewExtra = try await api.tasks_period_show(path: .init(profile: "work", task: batchExtra.id)).ok.body.json
        #expect(previewExtra.row_version == 1)
        let previewRows = try #require(value.dependencies.batch?.report?.results)
        #expect(previewRows.compactMap(\.result).map(\.outcome).sorted() == ["added", "unchanged"])
        #expect(previewRows.compactMap(\.error).map(\.code) == ["blocked"])
        #expect(previewRows.compactMap(\.error).map(\.exit_code) == [2])
        await value.applyDependencyBatch()
        #expect(value.dependencies.batch?.report?.dry_run == false)
        let appliedExtra = try await api.tasks_period_show(path: .init(profile: "work", task: batchExtra.id)).ok.body.json
        #expect(appliedExtra.row_version == 2)
        #expect(appliedExtra.depends_on == [root.id])
        value.dependencies.batch = nil
        await value.createDependencyFollowUp(done.id)
        #expect(value.dependencies.initial.map(\.id) == [done.id])
        value.newTitle = "DAG native follow-up"
        #expect(await value.create(openEditor: false))
        let followUps = try await api.tasks_period_list(path: .init(profile: "work"), query: .init(text: "DAG native follow-up")).ok.body.json
        let followUp = try #require(followUps.first { $0.title == "DAG native follow-up" })
        #expect(followUp.depends_on == [done.id])
        #expect(followUp.row_version == 1)
        let doneAfter = try await api.tasks_period_show(path: .init(profile: "work", task: done.id)).ok.body.json
        #expect(doneAfter.status.rawValue == "done")
        #expect(doneAfter.row_version == 2)
        value.closeDependencyPicker()
        await value.openDependencyDelete(rootNow)
        #expect(value.dependencies.deletion?.edges.count == 3)
        #expect(value.dependencies.deletion?.fingerprint?.isEmpty == false)
        let newcomer = try await create("DAG native new dependency")
        _ = try await api.tasks_period_depend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: newcomer.id, from_version: 2))).ok.body.json
        await value.confirmDependencyDelete()
        #expect(value.dependencies.deletion?.changed == true)
        #expect(value.dependencies.deletion?.edges.count == 4)
        #expect(value.dependencies.deletion?.task.row_version == 3)
        let stillVisible = try await api.tasks_period_show(path: .init(profile: "work", task: root.id)).ok.body.json
        #expect(stillVisible.id == root.id)
        await value.confirmDependencyDelete()
        #expect(value.dependencies.deletion == nil)
        let dependentAfter = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: dependent.id)).ok.body.json)
        #expect(dependentAfter.row_version == 3)
        #expect(dependentAfter.depends_on?.isEmpty ?? true)
    }
}

@MainActor struct DependencyErrorProjectionTests {
    @Test func nestedImportAndBatchErrorsUseTheSameTypedProjector() throws {
        let value = #"{"message":"agent recovery HTTP route must remain hidden","code":"validation","exit_code":2,"exit_meaning":"validation or usage","details":{"dependency_error":{"generated_at":"2026-11-10T00:00:00Z","message":"agent command must remain hidden","code":"too_many_dependencies","exit_code":2,"exit_meaning":"validation or usage","details":{"dependent_id":"a","count":14,"limit":13}}}}"#
        let failure = try JSONDecoder().decode(ServerFailure.self, from: Data(value.utf8))
        let notice = DependencyNotice.project(failure, context: .link)
        #expect(notice.message == "A Task can have at most 13 direct Dependencies.\nThis Task depends on 14 Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.")
        #expect(notice.detail == "error 2 - validation or usage")
        #expect(!failure.nativeMessage.contains("HTTP"))
        #expect(!failure.nativeMessage.contains("agent"))
    }
}

@MainActor struct DependencyBoundaryStateTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func liveNoOpsWarningsLimitsCycleAndFollowUpRecovery() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-dependency-boundary"))
        model.replaceCredential(session.credential)
        model.signedIn = true
        model.connection = .live
        func create(_ title: String) async throws -> TaskSnapshot {
            try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: title))).ok.body.json)
        }
        func show(_ task: TaskSnapshot) async throws -> TaskSnapshot {
            try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: task.id)).ok.body.json)
        }
        let root = try await create("DAG boundary limit root")
        var blockers: [TaskSnapshot] = []
        for index in 1...14 { blockers.append(try await create("DAG boundary blocker \(index)")) }
        await model.openDependencyPicker(root)
        _ = try await api.tasks_period_depend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: blockers[0].id, from_version: 1))).ok.body.json
        let beforeNoOp = try await api.reads_period_history(path: .init(profile: "work", task: root.id)).ok.body.json
        await model.toggleDependency(blockers[0])
        #expect(model.dependencies.picker?.feedback == "Already linked")
        #expect(model.dependencies.picker?.root.row_version == 2)
        #expect(try await api.reads_period_history(path: .init(profile: "work", task: root.id)).ok.body.json.count == beforeNoOp.count)
        _ = try await api.tasks_period_undepend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: blockers[0].id, from_version: 2))).ok.body.json
        let beforeRemoveNoOp = try await api.reads_period_history(path: .init(profile: "work", task: root.id)).ok.body.json
        await model.toggleDependency(blockers[0])
        #expect(model.dependencies.picker?.feedback == "Already removed")
        #expect(model.dependencies.picker?.root.row_version == 3)
        #expect(try await api.reads_period_history(path: .init(profile: "work", task: root.id)).ok.body.json.count == beforeRemoveNoOp.count)
        for index in 0..<13 {
            await model.toggleDependency(blockers[index])
            #expect(model.dependencies.picker?.failure == nil)
            #expect(model.dependencies.picker?.linked.count == index + 1)
            if index == 8 || index == 12 {
                #expect(model.dependencies.picker?.warnings.first?.message == (index == 8 ? "This Task depends on 9 Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks." : "This Task depends on 13 Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks."))
            }
        }
        #expect(model.dependencies.picker?.root.row_version == 16)
        await model.toggleDependency(blockers[13])
        #expect(model.dependencies.picker?.failure?.message == "A Task can have at most 13 direct Dependencies.\nThis Task depends on 14 Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.")
        #expect(model.dependencies.picker?.failure?.detail == "error 2 - validation or usage")
        #expect(model.dependencies.picker?.linked.count == 13)
        #expect(model.dependencies.picker?.root.row_version == 16)
        let loadedRoot = try await show(root)
        await model.transition(loadedRoot, action: "complete")
        #expect(model.message == "Finish or cancel these Dependencies before marking this Task done.\nerror 2 - validation or usage")
        #expect(try await show(root).status == "open")
        await model.openDependencyPicker(blockers[0])
        await model.toggleDependency(loadedRoot)
        #expect(model.dependencies.picker?.failure?.message == "This Dependency would create a loop.")
        let loop = try #require(model.dependencies.picker?.failure?.path)
        #expect(loop == (root.id < blockers[0].id ? [root.id, blockers[0].id, root.id] : [blockers[0].id, root.id, blockers[0].id]))
        let source = try await create("DAG boundary implied source")
        let middle = try await create("DAG boundary implied middle")
        let goal = try await create("DAG boundary implied goal")
        _ = try await api.tasks_period_depend(path: .init(profile: "work", task: middle.id), body: .json(.init(blocker_id: source.id, from_version: 1))).ok.body.json
        _ = try await api.tasks_period_depend(path: .init(profile: "work", task: goal.id), body: .json(.init(blocker_id: middle.id, from_version: 1))).ok.body.json
        await model.openDependencyPicker(try await show(goal))
        await model.toggleDependency(source)
        #expect(model.dependencies.picker?.failure == nil)
        #expect(model.dependencies.picker?.warnings.first?.message == "This Dependency is already implied by the path below. The Dependency was kept.")
        #expect(model.dependencies.picker?.warnings.first?.path == [source.id, middle.id, goal.id])
        #expect(model.dependencies.picker?.linked.map(\.id).contains(source.id) == true)
        let resolved = try await create("DAG boundary resolved blocker")
        await model.transition(resolved, action: "complete")
        let resolvedNow = try await show(resolved)
        let doneGoal = try await create("DAG boundary done goal")
        _ = try await api.tasks_period_depend(path: .init(profile: "work", task: doneGoal.id), body: .json(.init(blocker_id: resolved.id, from_version: 1))).ok.body.json
        await model.transition(try await show(doneGoal), action: "complete")
        await model.openDependencyPicker(try await show(doneGoal))
        await model.toggleDependency(source)
        #expect(model.dependencies.picker?.failure?.message == "A done Task can only depend on done or cancelled Tasks.")
        #expect(model.dependencies.picker?.linked.map(\.id) == [resolved.id])
        await model.transition(resolvedNow, action: "reopen")
        // No editor shows this Task, so its refusal is the main window's message only: the editor's
        // error is set only for an editor showing the Task (MAC-C1-S1-17, ruled).
        #expect(model.serverErrors[.editor] == nil)
        let reopening = try #require(model.serverErrors[.message])
        let reopeningNotice = DependencyNotice.project(reopening, context: .reopen)
        #expect(reopeningNotice.message == "This Task blocks done Tasks and can't be reopened.")
        #expect(reopeningNotice.tasks.map(\.id) == [doneGoal.id])
        #expect(reopeningNotice.followUp == doneGoal.id)
        let events = try await api.reads_period_history(path: .init(profile: "work", task: resolved.id)).ok.body.json
        let history = try JSONDecoder().decode([HistoryEntry].self, from: JSONEncoder().encode(events))
        let completion = try #require(history.first { $0.event.kind == "TaskCompleted" })
        model.beginEditing(resolvedNow)
        await model.write(.revert(completion.seq))
        #expect(model.editorError == "This completion can't be reverted while these Tasks are done.\nerror 2 - validation or usage")
        let revertFailure = try #require(model.serverErrors[.editor])
        #expect(DependencyNotice.project(revertFailure, context: .revert).followUp == doneGoal.id)
        #expect(try await show(resolved).status == "done")
        model.signedIn = false
        model.connect()
    }
}

extension DependencyStateTests {
    @Test func dragDirectionAndAlreadyLinkedSelfAndForeignTargets() async {
        let value = model()
        value.signedIn = true
        value.connection = .live
        let source = task("source")
        let target = task("target")
        value.tasks = [source, target]
        let hover = value.dependencyDropStatus(source: .init(profile: "work", task: source.id), target: target)
        #expect(hover.text == "Will depend on source")
        #expect(hover.accessibilityValue == "target will depend on source")
        #expect(value.dependencyDropStatus(source: .init(profile: "work", task: target.id), target: target).text == "A Task can't depend on itself.")
        #expect(value.dependencyDropStatus(source: .init(profile: "foreign", task: source.id), target: target).text == "Tasks must be in the same Profile.")
        await value.commitDependencyDrop(.init(profile: "work", task: target.id), target: target)
        #expect(value.dependencies.picker == nil)
        await value.commitDependencyDrop(.init(profile: "foreign", task: source.id), target: target)
        #expect(value.dependencies.picker == nil)
        var linked = target
        linked.depends_on = [source.id]
        await value.commitDependencyDrop(.init(profile: "work", task: source.id), target: linked)
        #expect(value.dependencies.dropStatus?.text == "Already depends on source")
        #expect(value.dependencies.dropStatus?.accessibilityValue == "target already depends on source")
        #expect(value.dependencies.picker == nil)
    }
}

extension DependencyStateTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func liveInitialOccurrenceSuccessorChangedEmptyDeleteAndTransfer() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        func create(_ title: String) async throws -> TaskSnapshot { try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: title))).ok.body.json) }
        func show(_ id: String, profile: String = "work") async throws -> TaskSnapshot { try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: profile, task: id)).ok.body.json) }
        let blocker = try await create("DAG Occurrence resolved blocker")
        let original = try await create("DAG Occurrence original")
        let value = model(server: server)
        value.replaceCredential(session.credential)
        value.signedIn = true
        value.connection = .live
        defer { value.signedIn = false; value.connect() }
        await value.transition(blocker, action: "complete")
        let resolved = try await show(blocker.id)
        value.beginEditing(original)
        value.editor?.title = "DAG Occurrence initial links"
        value.dependencies.initial = [original]
        await value.openInitialDependencyPicker(firstOccurrence: true)
        await value.toggleDependency(resolved)
        #expect(value.dependencies.firstOccurrenceInitial.map(\.id) == [blocker.id])
        #expect(value.dependencies.initial.map(\.id) == [original.id])
        await value.setDependencyDirection(.blocks)
        #expect(value.dependencies.picker?.direction == .dependsOn)
        value.closeDependencyPicker()
        await value.saveSeries(.init(dtstart: .init(kind: "date", date: "2026-11-01"), rrule: "FREQ=DAILY", exdate: []))
        let first = try #require(value.editor?.base)
        #expect(first.id != original.id)
        #expect(first.row_version == 1)
        #expect(try await show(first.id).depends_on == [blocker.id])
        #expect(try await show(original.id).depends_on == [])
        await value.transition(first, action: "complete")
        let occurrences = try await api.tasks_period_list(path: .init(profile: "work")).ok.body.json.map(TaskSnapshot.decode)
        let next = try #require(occurrences.first { $0.id != first.id && $0.seriesKey == first.seriesKey })
        #expect(next.depends_on == [])
        #expect(next.row_version == 1)
        let firstHistory = try await api.reads_period_history(path: .init(profile: "work", task: first.id)).ok.body.json
        let entries = try JSONDecoder().decode([HistoryEntry].self, from: JSONEncoder().encode(firstHistory))
        let created = try #require(entries.first { $0.event.kind == "TaskCreated" })
        let lines = try #require(created.event.dependencyDelta).lines(profile: "work")
        #expect(lines.map(\.prefix) == ["Added"])
        #expect(lines.map { $0.edge.blocker_id } == [blocker.id])
        let root = try await create("DAG changed empty root")
        _ = try await api.tasks_period_depend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: blocker.id, from_version: 1))).ok.body.json
        await value.openDependencyDelete(try await show(root.id))
        let fingerprint = try #require(value.dependencies.deletion?.fingerprint)
        _ = try await api.tasks_period_undepend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: blocker.id, from_version: 2))).ok.body.json
        await value.confirmDependencyDelete()
        #expect(value.dependencies.deletion?.changed == true)
        #expect(value.dependencies.deletion?.edges.isEmpty == true)
        #expect(value.dependencies.deletion?.reviewMessage == "This Task has no Dependencies now. Confirm again to delete it.")
        #expect(value.dependencies.deletion?.fingerprint != fingerprint)
        #expect(try await show(root.id).deleted_at == nil)
        await value.confirmDependencyDelete()
        #expect(value.dependencies.deletion == nil)
        let source = try await create("DAG transfer linked source")
        _ = try await api.tasks_period_depend(path: .init(profile: "work", task: source.id), body: .json(.init(blocker_id: blocker.id, from_version: 1))).ok.body.json
        value.beginEditing(try await show(source.id))
        await value.write(.copy("personal"))
        let copy = try #require(value.transferResult?.task)
        let copiedRead = try await show(copy.id, profile: "personal")
        #expect(copiedRead.depends_on == nil)
        let copiedGraph = try await api.tasks_period_graph(path: .init(profile: "personal", task: copy.id)).ok.body.json
        #expect(try JSONDecoder().decode(DependencyGraphReport.self, from: JSONEncoder().encode(copiedGraph)).edges.isEmpty)
        #expect(try await show(source.id).depends_on == [blocker.id])
        value.beginEditing(try await show(source.id))
        await value.write(.move("personal"))
        let move = try #require(value.transferResult)
        #expect(move.removedDependencies.map(\.blocker_id) == [blocker.id])
        let movedRead = try await show(source.id, profile: "personal")
        #expect(movedRead.depends_on == nil)
        let movedGraph = try await api.tasks_period_graph(path: .init(profile: "personal", task: source.id)).ok.body.json
        #expect(try JSONDecoder().decode(DependencyGraphReport.self, from: JSONEncoder().encode(movedGraph)).edges.isEmpty)
        #expect(try await show(blocker.id).blocks == [first.id])
    }
}

extension DependencyStateTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func liveWholeProfileOrderAndTrueOnlyFiltersSurviveReload() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        func create(_ title: String, energy: Int, blockers: [String] = []) async throws -> TaskSnapshot {
            let value: [String: Any] = ["title": title, "energy": energy, "depends_on": blockers, "project_name": "DAG proof Project", "tag_names": ["dagproof"]]
            let body = try JSONDecoder().decode(Operations.tasks_period_create.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: value))
            return try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(body)).ok.body.json)
        }
        let a = try await create("DAG ordered fixture A", energy: 2)
        let b = try await create("DAG ordered fixture B", energy: 3, blockers: [a.id])
        let c = try await create("DAG ordered fixture C", energy: 1, blockers: [b.id])
        let d = try await create("DAG ordered fixture D", energy: 1)
        let value = model(server: server)
        value.replaceCredential(session.credential)
        value.signedIn = true
        value.connection = .live
        value.selectedView = "all"
        value.searchText = "DAG ordered fixture"
        value.applyTaskFilters(.init(order: "topo"))
        defer { value.signedIn = false; value.connect() }
        func settled() async throws {
            for _ in 0..<1000 {
                if !value.loading && !value.searchPending && !value.searchStale && value.appliedSearchSnapshot != nil { return }
                try await Task.sleep(for: .milliseconds(10))
            }
            Issue.record("The production filter request did not settle: \(value.searchError?.message ?? value.taskLoadError ?? "no published snapshot")")
        }
        try await settled()
        let order = value.appliedSearchSnapshot?.rows.map(\.id) ?? []
        #expect(order.filter { [a.id, b.id, c.id].contains($0) } == [a.id, b.id, c.id])
        value.applyTaskFilters(.init(order: "lightest"))
        try await settled()
        #expect(value.appliedSearchSnapshot?.rows.map(\.id) == [d.id, a.id, b.id, c.id])
        await value.transition(a, action: "complete")
        value.applyTaskFilters(.init(ready: true, order: "topo"))
        value.selectedProject = value.projects.first { $0.name == "DAG proof Project" }?.id
        value.selectedTag = value.tags.first { $0.name == "dagproof" }?.id
        try await settled()
        #expect(Set(value.appliedSearchSnapshot?.rows.map(\.id) ?? []) == [b.id, d.id])
        #expect(value.tasks.first { $0.id == d.id }?.dependencyBadge(catalog: value.tasks) == nil)
        #expect(value.tasks.first { $0.id == b.id }?.dependencyBadge(catalog: value.tasks) == "Ready")
        value.applyTaskFilters(.init(blocked: true, order: "topo"))
        try await settled()
        #expect(value.appliedSearchSnapshot?.rows.map(\.id) == [c.id])
        #expect(value.tasks.first { $0.id == c.id }?.dependencyBadge(catalog: value.tasks) == "Blocked · 1")
        value.applyTaskFilters(.init(prefix: String(c.id.prefix(8)), blocked: true, order: "topo"))
        try await settled()
        #expect(value.appliedSearchSnapshot?.rows.map(\.id) == [c.id])
        value.applyTaskFilters(.init(prefix: String(a.id.prefix(8)), blocked: true, order: "topo"))
        try await settled()
        #expect(value.appliedSearchSnapshot?.rows.isEmpty == true)
    }
}

extension DependencyErrorProjectionTests {
    @Test func malformedNestedDependencyErrorUsesCompatibilityCopyWithoutOuterAgentMessage() throws {
        let value = #"{"message":"agent recovery HTTP route must remain hidden","code":"validation","exit_code":2,"exit_meaning":"validation or usage","details":{"dependency_error":{"generated_at":"2026-11-10T00:00:00Z","message":"agent command must remain hidden","code":"dependency_cycle","details":{"dependent_id":"a","blocker_id":"b","path":["a","b","a"]}}}}"#
        let failure = try JSONDecoder().decode(ServerFailure.self, from: Data(value.utf8))
        #expect(failure.isDependencyFailure)
        let notice = DependencyNotice.project(failure, context: .link)
        #expect(notice.message == "The server response could not be read. Your draft is preserved.")
        #expect(notice.detail == nil)
        #expect(!failure.nativeMessage.contains("agent"))
        #expect(!failure.nativeMessage.contains("HTTP"))
    }
}

extension DependencyStateTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func livePickerConflictRequiresReloadAndKeepsTheDraftAndSelection() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        let root = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "DAG native Conflict root"))).ok.body.json)
        let blocker = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "DAG native Conflict blocker"))).ok.body.json)
        let value = model(server: server)
        value.replaceCredential(session.credential); value.signedIn = true; value.connection = .live
        defer { value.signedIn = false; value.connect() }
        value.beginEditing(root); value.editor?.title = "Keep the Conflict draft"
        await value.openDependencyPicker(root)
        value.dependencies.picker?.text = "Conflict blocker"
        await value.searchDependencyCandidates()
        let edit = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"changes":{"title":"DAG native Conflict remote title"}}"#.utf8))
        _ = try await api.tasks_period_edit(path: .init(profile: "work", task: root.id), body: .json(edit)).ok.body.json
        await value.toggleDependency(blocker)
        #expect(value.dependencies.picker?.requiresReload == true)
        #expect(value.dependencies.picker?.failure?.message == "The Tasks changed since this list loaded.")
        #expect(value.dependencies.picker?.failure?.detail == "error 4 - Conflict")
        #expect(value.dependencies.picker?.text == "Conflict blocker")
        #expect(value.dependencies.picker?.checked(blocker.id) == false)
        #expect(value.editor?.title == "Keep the Conflict draft")
        #expect(value.editor?.base.row_version == 1)
        await value.toggleDependency(blocker)
        #expect(value.dependencies.picker?.root.row_version == 1)
        await value.reloadDependencyPicker()
        #expect(value.dependencies.picker?.requiresReload == false)
        #expect(value.dependencies.picker?.root.row_version == 2)
        await value.toggleDependency(blocker)
        #expect(value.dependencies.picker?.checked(blocker.id) == true)
        #expect(value.dependencies.picker?.root.row_version == 3)
        #expect(value.editor?.base.row_version == 1)
    }
}
