import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

private enum PendingCredentialRead: String, CaseIterable {
    case diagnostics, attachmentTargets, batchTargets, graph, picker, dependencyBatch, dependencyToggle, deletePreview, series, discovery
}

private actor FailedCredentialTransitionTransport: ClientTransport {
    let signIn: Bool
    let cancelled: Bool
    let holdSignOut: Bool
    let holdHealth: Bool
    private var continuation: CheckedContinuation<Void, Never>?
    private var signOutContinuation: CheckedContinuation<Void, Never>?
    private var healthContinuation: CheckedContinuation<Void, Never>?
    private(set) var holding = false
    private(set) var signOutCalls = 0
    private(set) var healthCalls = 0
    init(signIn: Bool = false, cancelled: Bool = false, holdSignOut: Bool = false, holdHealth: Bool = false) { self.signIn = signIn; self.cancelled = cancelled; self.holdSignOut = holdSignOut; self.holdHealth = holdHealth }
    func finish() { continuation?.resume(); continuation = nil }
    func finishSignOut() { signOutContinuation?.resume(); signOutContinuation = nil }
    func finishHealth() { healthContinuation?.resume(); healthContinuation = nil }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        if operationID == "system.health" {
            healthCalls += 1
            if holdHealth, healthCalls == 1 { await withCheckedContinuation { healthContinuation = $0 } }
        }
        if operationID == "system.health", signIn {
            return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(#"{"service":"todo-server","contract":"\#(TodoContract.id)","build":"scratch"}"#))
        }
        if operationID == "credentials.signOut" {
            signOutCalls += 1
            if holdSignOut { await withCheckedContinuation { signOutContinuation = $0 } }
        }
        if !["system.health", "credentials.signOut", "signIn.signIn"].contains(operationID) {
            await withCheckedContinuation { continuation = $0; holding = true }
        }
        if cancelled { throw CancellationError() }
        throw URLError(.notConnectedToInternet)
    }
}

@MainActor @Suite(.serialized) struct FailedCredentialTransitionTests {
    private func model(_ transport: FailedCredentialTransitionTransport) -> TodoModel {
        TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "never-keychain-failed-transition"), clientFactory: { url, _ in Client(serverURL: url, transport: transport) }, clientDiagnostics: .disabled, catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter())
    }
    private func task(_ id: String = "scratch-task") -> TaskSnapshot {
        TaskSnapshot(id: id, profile_id: "work", row_version: 1, title: "Scratch Task", description: nil, priority: "P3", source: "manual", status: "open", project_id: nil, tags: [], due_at: nil, scheduled_at: nil, energy: nil, estimate_min: nil, occurrence: nil, legacy_series_detached: nil, deleted_at: nil)
    }
    private func waitForRead(_ transport: FailedCredentialTransitionTransport) async throws {
        for _ in 0..<500 {
            if await transport.holding { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw URLError(.timedOut)
    }
    private func read(_ kind: PendingCredentialRead, model: TodoModel) async {
        switch kind {
        case .diagnostics: await model.loadDiagnostics()
        case .attachmentTargets:
            model.attachmentBatch = .init(profile: "work", reference: .init(id: "scratch-link", location: .link(URL(string: "https://example.test/scratch")!), added_at: "2026-11-11T00:00:00Z"))
            await model.reloadAttachmentTargets()
        case .batchTargets:
            model.batchEdit = .init(profile: "work")
            await model.reloadBatchEditTargets()
        case .graph: await model.readDependencyGraph(root: "scratch-task")
        case .picker:
            model.dependencies.picker = .init(profile: "work", root: task(), direction: .dependsOn)
            await model.reloadDependencyPicker()
        case .dependencyBatch:
            model.dependencies.batch = .init(profile: "work", root: task(), direction: .dependsOn)
            await model.reloadDependencyBatch()
        case .dependencyToggle:
            model.dependencies.picker = .init(profile: "work", root: task(), direction: .dependsOn)
            await model.toggleDependency(task("scratch-blocker"))
        case .deletePreview: await model.openDependencyDelete(task())
        case .series:
            model.beginEditing(task())
            await model.openSeries()
        case .discovery: await model.openDiscovery(.directory)
        }
    }
    private func pending(_ kind: PendingCredentialRead, model: TodoModel) -> Bool {
        switch kind {
        case .diagnostics: model.diagnosticsLoading
        case .attachmentTargets: model.attachmentBatch?.loading == true
        case .batchTargets: model.batchEdit?.loading == true
        case .graph: model.dependencies.graph?.loading == true
        case .picker: model.dependencies.picker?.loading == true
        case .dependencyBatch: model.dependencies.batch?.loading == true
        case .dependencyToggle: !model.dependencies.pendingDependents.isEmpty || model.dependencies.picker?.pending.isEmpty == false
        case .deletePreview: model.dependencies.deletion?.loading == true
        case .series: model.seriesLoading
        case .discovery: model.discovery.phase == .requesting
        }
    }

    @Test func failedOrCancelledAuthenticationPreservesCleanupOwnership() async throws {
        for signIn in [false, true] {
            for cancelled in [false, true] {
                for kind in PendingCredentialRead.allCases {
                    let transport = FailedCredentialTransitionTransport(signIn: signIn, cancelled: cancelled)
                    let model = model(transport)
                    model.replaceCredential("ses_scratch_old"); model.signedIn = true; model.connection = .live
                    model.clientDiagnosticsUI.stop()
                    defer { model.signedIn = false; model.replaceCredential("") }
                    let epoch = model.discovery.credentialEpoch
                    let pendingRead = Task { await read(kind, model: model) }
                    try await waitForRead(transport)
                    #expect(pending(kind, model: model), "\(kind.rawValue) started")
                    if signIn { #expect(await model.signIn("scratch") == false) }
                    else { await model.signOut() }
                    #expect(model.signedIn)
                    #expect(!model.busy)
                    #expect(model.discovery.credentialEpoch == epoch)
                    await transport.finish(); await pendingRead.value
                    #expect(!pending(kind, model: model), "\(kind.rawValue) finished; signIn=\(signIn), cancelled=\(cancelled)")
                }
            }
        }
    }

    @Test func failedOrCancelledRestoreReleasesBusyAndAllowsRetryBeforeTheVault() async {
        for cancelled in [false, true] {
            let transport = FailedCredentialTransitionTransport(cancelled: cancelled)
            let model = model(transport)
            let epoch = model.discovery.credentialEpoch
            await model.restore()
            #expect(!model.busy && !model.signedIn && model.canRestore)
            #expect(model.discovery.credentialEpoch == epoch)
            model.message = nil
            await model.restore()
            #expect(!model.busy && model.canRestore && model.message != nil)
            model.replaceCredential("")
        }
    }

    @Test func replacementReleasesOldPendingReadsWithoutReleasingNewBusyWork() async throws {
        for kind in PendingCredentialRead.allCases {
            let transport = FailedCredentialTransitionTransport()
            let model = model(transport)
            model.replaceCredential("ses_scratch_old"); model.signedIn = true; model.connection = .live
            defer { model.signedIn = false; model.replaceCredential("") }
            let pendingRead = Task { await read(kind, model: model) }
            try await waitForRead(transport)
            #expect(pending(kind, model: model))
            model.replaceCredential("ses_scratch_new")
            #expect(!pending(kind, model: model), "\(kind.rawValue) released at replacement")
            model.busy = true
            await transport.finish(); await pendingRead.value
            #expect(!pending(kind, model: model))
            #expect(model.busy)
        }
    }

    @Test func cancellingSignOutRestartsTheStillSignedInConnection() async throws {
        let transport = FailedCredentialTransitionTransport(holdSignOut: true)
        let model = model(transport)
        model.replaceCredential("ses_scratch_old"); model.signedIn = true; model.connection = .live
        defer { model.signedIn = false; model.replaceCredential("") }
        let epoch = model.discovery.credentialEpoch
        let signOut = Task { await model.signOut() }
        for _ in 0..<500 {
            if await transport.signOutCalls == 1 { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(await transport.signOutCalls == 1)
        signOut.cancel()
        await transport.finishSignOut(); await signOut.value
        #expect(model.signedIn && !model.busy)
        #expect(model.discovery.credentialEpoch == epoch)
        for _ in 0..<100 {
            if await transport.healthCalls > 0 { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(await transport.healthCalls == 1)
    }

    @Test func cancellingRestoreBeforeTheVaultAllowsAnotherRestore() async throws {
        let transport = FailedCredentialTransitionTransport(holdHealth: true)
        let model = model(transport)
        let epoch = model.discovery.credentialEpoch
        let restore = Task { await model.restore() }
        for _ in 0..<500 {
            if await transport.healthCalls == 1 { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(model.busy && !model.canRestore)
        restore.cancel()
        await transport.finishHealth(); await restore.value
        #expect(!model.busy && !model.signedIn && model.canRestore)
        #expect(model.discovery.credentialEpoch == epoch)
        await model.restore()
        #expect(await transport.healthCalls == 2)
        #expect(!model.busy && model.canRestore)
    }

    @Test func busyWritePreventsSignOutFromTakingItsCleanupOwnership() async throws {
        let transport = FailedCredentialTransitionTransport()
        let model = model(transport)
        model.replaceCredential("ses_scratch_old"); model.signedIn = true; model.connection = .live
        defer { model.signedIn = false; model.replaceCredential("") }
        let epoch = model.discovery.credentialEpoch
        let write = Task { await model.transition(task(), action: "complete") }
        try await waitForRead(transport)
        #expect(model.busy)
        await model.signOut()
        #expect(model.busy && model.discovery.credentialEpoch == epoch)
        #expect(await transport.signOutCalls == 0)
        await transport.finish(); await write.value
        #expect(!model.busy)
    }
}
