import AppKit
import SwiftUI
import Foundation
import Testing
import TodoAPI
@testable import TodoState

@Suite(.serialized) @MainActor
struct DiagnosticsStateTests {
@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_DIAGNOSTICS_SERVER"] != nil)) @MainActor
func diagnosticsReadsRealTrafficAndSurvivesReload() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used"), clientFactory: { _, _ in client })
    model.signedIn = true
    await model.loadDiagnostics()
    let before = try #require(model.diagnostics)
    let task = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "F12 Swift diagnostics Task", external_id: "private-c11-swift-id"))).ok.body.json
    _ = try await client.tasks_period_edit(path: .init(profile: "work", task: task.id), body: .json(.init(from_version: 1, changes: .init(title: "F12 Swift edited")))).ok
    let conflict = try await client.tasks_period_edit(path: .init(profile: "work", task: task.id), body: .json(.init(from_version: 1, changes: .init(title: "F12 Swift rejected"))))
    guard case .conflict = conflict else { Issue.record("Expected a real Conflict"); return }
    await model.loadDiagnostics()
    let value = try #require(model.diagnostics)
    #expect(model.diagnosticsError == nil)
    #expect(model.diagnosticsLoading == false)
    #expect(value.storage.entities.first { $0.profile == "work" }?.tasks == (before.storage.entities.first { $0.profile == "work" }?.tasks ?? 0) + 1)
    #expect(value.storage.external_id_tasks == before.storage.external_id_tasks + 1)
    #expect(value.operations.total == before.operations.total + 3)
    #expect(value.operations.committed == before.operations.committed + 2)
    #expect(value.operations.rejected == before.operations.rejected + 1)
    #expect(value.errors.contains { $0.code == "conflict" && $0.route == "PATCH /profiles/{profile}/tasks/{task}" })
    #expect(value.latency.routes.contains { $0.route == "PATCH /profiles/{profile}/tasks/{task}" && $0.count >= 2 })
    let latest = Array(value.operations.recent.prefix(3))
    #expect(latest.map { $0.outcome.rawValue } == ["rejected", "committed", "committed"])
    let reloaded = TodoModel(configuration: model.configuration, clientFactory: { _, _ in client })
    reloaded.signedIn = true
    await reloaded.loadDiagnostics()
    #expect(reloaded.diagnostics?.operations.total == value.operations.total)
    #expect(reloaded.diagnostics?.storage.entities == value.storage.entities)
    _ = try await client.tasks_period_uploadAttachment(path: .init(profile: "work", task: task.id), body: .json(.init(from_version: 2, mime_type: .image_sol_png, data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg==", label: "private-f11-swift-image"))).ok
    await model.loadDiagnostics()
    let attached = try #require(model.diagnostics)
    #expect(attached.storage.attachments == value.storage.attachments + 1)
    #expect(attached.storage.attachment_store_bytes == value.storage.attachment_store_bytes + 67)
    #expect(attached.operations.recent.first?._type.rawValue == "AttachmentAdded")
    await reloaded.loadDiagnostics()
    #expect(reloaded.diagnostics?.storage.attachments == attached.storage.attachments)
    let data = try JSONEncoder().encode(attached)
    let text = String(decoding: data, as: UTF8.self)
    #expect(!text.contains("F12 Swift"))
    #expect(!text.contains("private-f11-swift-image"))
    #expect(!text.contains("private-c11-swift-id"))
    #expect(!text.contains(session.credential))
    #expect(!text.contains("secret_hash"))
    #expect(!text.contains("passphrase_hash"))
    if let receipt = ProcessInfo.processInfo.environment["TODO_DIAGNOSTICS_SNAPSHOT"] { try data.write(to: URL(fileURLWithPath: receipt)) }
    let invalid = TodoModel(configuration: model.configuration, clientFactory: { _, _ in todoClient(server: server, credential: "ses_invalid") })
    invalid.signedIn = true
    await invalid.loadDiagnostics()
    #expect(invalid.diagnostics == nil)
    #expect(invalid.diagnosticsError == "Server unavailable; retrying when live.")
    #expect(invalid.diagnosticsRetrySeconds == 2)
    for _ in 0..<5 { await invalid.loadDiagnostics() }
    #expect(invalid.diagnosticsRetrySeconds == 30)
    invalid.signedIn = false
    await invalid.loadDiagnostics()
    #expect(invalid.diagnosticsError == "Sign in to Todo with an owner Session.")
}

@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_DIAGNOSTICS_SERVER"] != nil))
func diagnosticsLivePauseAndManualRefreshUseRealHTTP() async throws {
    NSApplication.shared.setActivationPolicy(.prohibited)
    let server = try #require(ProcessInfo.processInfo.environment["TODO_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used"), clientFactory: { _, _ in client })
    model.signedIn = true
    let host = NSHostingView(rootView: DiagnosticsView(model: model).frame(width: 393, height: 426))
    let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: 393, height: 426), styleMask: [.titled], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    window.contentView = host
    host.layoutSubtreeIfNeeded()
    defer { window.contentView = nil; window.close() }
    for _ in 0..<600 where model.diagnostics == nil { try await Task.sleep(for: .milliseconds(100)) }
    #expect(window.isVisible == false)
    _ = try #require(model.diagnostics)
    model.diagnosticsLive = false
    try await Task.sleep(for: .milliseconds(200))
    let before = try await client.diagnostics_period_snapshot().ok.body.json
    try await Task.sleep(for: .milliseconds(1300))
    let after = try await client.diagnostics_period_snapshot().ok.body.json
    let count = { (s: DiagnosticsSnapshot) in s.latency.routes.first { $0.route == "GET /diagnostics" }?.count ?? 0 }
    #expect(count(after) == count(before) + 1)
    await model.loadDiagnostics()
    let refreshed = try await client.diagnostics_period_snapshot().ok.body.json
    #expect(count(refreshed) == count(after) + 2)
    let old = try #require(model.diagnostics).operations.total
    _ = try await client.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "Paused then resumed Swift diagnostics"))).ok
    model.diagnosticsLive = true
    for _ in 0..<600 where model.diagnostics?.operations.total != old + 1 { try await Task.sleep(for: .milliseconds(100)) }
    #expect(model.diagnostics?.operations.total == old + 1)
    model.diagnosticsLive = false
}
@Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_DIAGNOSTICS_SERVER"] != nil && ProcessInfo.processInfo.environment["TODO_F10_CLI"] != nil))
func diagnosticsKeepsDeletedProfileNamesButHidesThemFromDiscovery() async throws {
    let server = try #require(ProcessInfo.processInfo.environment["TODO_DIAGNOSTICS_SERVER"].flatMap(URL.init(string:)))
    let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
    let client = todoClient(server: server, credential: session.credential)
    let process = Process()
    process.executableURL = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_F10_CLI"]))
    process.arguments = ["--profile", "Archived Swift", "init", "--format", "json"]
    process.standardOutput = Pipe(); process.standardError = Pipe()
    try process.run(); process.waitUntilExit()
    #expect(process.terminationStatus == 0)
    let profile = try #require(try await client.reads_period_profiles().ok.body.json.first { $0.name == "Archived Swift" })
    let before = try await client.diagnostics_period_snapshot().ok.body.json
    _ = try await client.reads_period_deleteProfile(path: .init(profile: profile.id), body: .json(.init(with_tasks: false, dry_run: false))).ok
    let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "never-used"), clientFactory: { _, _ in client })
    model.signedIn = true
    await model.loadDiagnostics()
    let value = try #require(model.diagnostics)
    #expect(!value.profiles.contains { $0.id == profile.id })
    #expect(!value.storage.entities.contains { $0.profile == profile.id })
    #expect(value.deleted_profiles.first { $0.id == profile.id }?.name == "Archived Swift")
    #expect(value.storage.tables.first { $0.name == "profile_deletions" }?.count == (before.storage.tables.first { $0.name == "profile_deletions" }?.count ?? 0) + 1)
    #expect(value.operations.recent.first?._type.rawValue == "ProfileDeleted")
    let reloaded = TodoModel(configuration: model.configuration, clientFactory: { _, _ in client })
    reloaded.signedIn = true
    await reloaded.loadDiagnostics()
    #expect(reloaded.diagnostics?.deleted_profiles == value.deleted_profiles)
    if let path = ProcessInfo.processInfo.environment["TODO_DIAGNOSTICS_SNAPSHOT"] { try JSONEncoder().encode(value).write(to: URL(fileURLWithPath: path)) }
}

}
