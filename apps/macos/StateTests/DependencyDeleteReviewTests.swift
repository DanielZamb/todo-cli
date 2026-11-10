import AppKit
import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import SwiftUI
import Testing
import TodoAPI
import Vision
@testable import TodoState

private actor ReviewDeleteTransport: ClientTransport {
    struct Fact: Codable, Sendable {
        let requestVersion: String?
        let requestFingerprint: String?
        let dryRun: String?
        let status: Int
        let code: String?
        let exitCode: Int?
        let exitMeaning: String?
        let body: String
    }
    private let live = URLSessionTransport()
    private(set) var facts: [Fact] = []
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        guard operationID == "tasks.delete", let responseBody else { return (response, responseBody) }
        let data = try await Data(collecting: responseBody, upTo: 65_536)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let query = URLComponents(string: "http://localhost" + (request.path ?? ""))?.queryItems ?? []
        facts.append(.init(requestVersion: query.first { $0.name == "from_version" }?.value,
            requestFingerprint: query.first { $0.name == "dependency_fingerprint" }?.value,
            dryRun: query.first { $0.name == "dry_run" }?.value, status: response.status.code,
            code: json?["code"] as? String ?? json?["_tag"] as? String,
            exitCode: json?["exit_code"] as? Int, exitMeaning: json?["exit_meaning"] as? String,
            body: String(decoding: data, as: UTF8.self)))
        return (response, HTTPBody(data))
    }
}

@MainActor struct DependencyDeleteReviewTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func liveChangedReviewsKeepTheActualFingerprintOrVersionRefusalPair() async throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        let transport = ReviewDeleteTransport()
        let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-delete-review"), clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) })
        model.replaceCredential(session.credential); model.signedIn = true; model.connection = .live
        defer { model.signedIn = false; model.connect() }
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent()
        var receipts: [[String: Any]] = []
        func create(_ title: String) async throws -> TaskSnapshot {
            try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: title))).ok.body.json)
        }
        func show(_ id: String) async throws -> TaskSnapshot {
            try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: id)).ok.body.json)
        }
        let first = try await create("Review blocker A")
        let second = try await create("Review blocker B")
        for scenario in ["changed-empty", "changed-set", "unchanged-version"] {
            let root = try await create("Delete review " + scenario)
            if scenario != "unchanged-version" {
                _ = try await api.tasks_period_depend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: first.id, from_version: 1))).ok.body.json
            }
            let start = await transport.facts.count
            await model.openDependencyDelete(try await show(root.id))
            let fingerprint = try #require(model.dependencies.deletion?.fingerprint)
            if scenario == "changed-set" {
                _ = try await api.tasks_period_depend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: second.id, from_version: 2))).ok.body.json
                _ = try await api.tasks_period_undepend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: first.id, from_version: 3))).ok.body.json
            } else if scenario == "changed-empty" {
                _ = try await api.tasks_period_undepend(path: .init(profile: "work", task: root.id), body: .json(.init(blocker_id: first.id, from_version: 2))).ok.body.json
            } else {
                let body = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: Data(#"{"from_version":1,"changes":{"title":"Fresh Version, same Dependencies"}}"#.utf8))
                _ = try await api.tasks_period_edit(path: .init(profile: "work", task: root.id), body: .json(body)).ok.body.json
            }
            await model.confirmDependencyDelete()
            let facts = Array(await transport.facts.dropFirst(start))
            try #require(facts.count == 3)
            let refusal = facts[1]
            let expectedExit = scenario == "unchanged-version" ? 4 : 2
            let expectedMeaning = scenario == "unchanged-version" ? "Conflict" : "validation or usage"
            #expect(refusal.exitCode == expectedExit)
            #expect(refusal.exitMeaning == expectedMeaning)
            if scenario == "unchanged-version" {
                #expect(refusal.status == 409)
                #expect(refusal.code == "Conflict")
            } else {
                #expect(refusal.status == 422)
                #expect(refusal.code == "has_dependencies")
            }
            let accepted = scenario == "changed-set" ? 4 : scenario == "changed-empty" ? 3 : 2
            let deletion = try #require(model.dependencies.deletion)
            #expect(deletion.changed)
            #expect(deletion.failure == nil)
            #expect(deletion.acceptedFromVersion == accepted)
            #expect(deletion.task.row_version == accepted)
            #expect(deletion.edges.count == (scenario == "changed-set" ? 1 : 0))
            #expect((deletion.fingerprint == fingerprint) == (scenario == "unchanged-version"))
            #expect(try await show(root.id).deleted_at == nil)
            let actualPair = "error \(try #require(refusal.exitCode)) - \(try #require(refusal.exitMeaning))"
            var captures: [[String: String]] = []
            for compact in [true, false] {
                for dark in [false, true] {
                    let visible = try renderedText(model, directory: directory, scenario: scenario, compact: compact, dark: dark)
                    #expect(visible.contains(actualPair))
                    #expect(visible.lowercased().contains("confirm again"))
                    #expect(!visible.lowercased().contains("reload"))
                    captures.append(["layout": compact ? "compact" : "full", "appearance": dark ? "dark" : "light", "visible_text": visible])
                }
            }
            receipts.append(["scenario": scenario, "actual_exit_code": refusal.exitCode as Any? ?? NSNull(), "actual_exit_meaning": refusal.exitMeaning as Any? ?? NSNull(), "captures": captures, "accepted_from_version": accepted, "fingerprint_changed": deletion.fingerprint != fingerprint, "requests": try JSONSerialization.jsonObject(with: JSONEncoder().encode(facts))])
            try JSONSerialization.data(withJSONObject: receipts, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("dependency-delete-refusal-review.json"))
            await model.confirmDependencyDelete()
            #expect(model.dependencies.deletion == nil)
            let after = Array(await transport.facts.dropFirst(start))
            #expect(after.count == 4)
            #expect(after.last?.status == 200)
        }
    }
    private func renderedText(_ model: TodoModel, directory: URL, scenario: String, compact: Bool, dark: Bool) throws -> String {
        let width: CGFloat = compact ? 393 : 560
        let height: CGFloat = compact ? 426 : 600
        let appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        let previous = NSApplication.shared.appearance
        NSApplication.shared.appearance = appearance
        defer { NSApplication.shared.appearance = previous }
        let view = DependencyDeleteView(model: model, compact: compact).frame(width: width, height: height).background(.background).environment(\.colorScheme, dark ? .dark : .light)
        let host = NSHostingView(rootView: view)
        let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.appearance = appearance; window.contentView = host
        defer { window.contentView = nil; window.close() }
        host.frame = .init(x: 0, y: 0, width: width, height: height)
        host.layoutSubtreeIfNeeded()
        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        let png = try #require(bitmap.representation(using: .png, properties: [:]))
        try png.write(to: directory.appendingPathComponent("delete-review-\(scenario)-\(compact ? "compact" : "full")-\(dark ? "dark" : "light").png"))
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["en-US"]
        try VNImageRequestHandler(data: png, options: [:]).perform([request])
        #expect(!window.isVisible)
        return (request.results ?? []).sorted { $0.boundingBox.maxY > $1.boundingBox.maxY }.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
    }
}
