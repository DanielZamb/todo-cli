import Foundation
import AppKit
import SwiftUI
import Vision
import Testing
import TodoAPI
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
@testable import TodoState

private enum ParityDeleteReply: String, CaseIterable, Sendable {
    case preview, foreignProfile, foreignTask, accepted
}

private actor ParityDeleteTransport: ClientTransport {
    let mode: ParityDeleteReply
    private let live = URLSessionTransport()
    private var preview: Data?
    private(set) var confirmations = 0

    init(_ mode: ParityDeleteReply) { self.mode = mode }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let query = URLComponents(string: "http://localhost" + (request.path ?? ""))?.queryItems ?? []
        let dryRun = query.contains { $0.name == "dry_run" && $0.value == "true" }
        if operationID == "tasks.delete", !dryRun {
            confirmations += 1
            if mode != .accepted {
                let data = try #require(preview)
                if mode == .preview { return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(data)) }
                var object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
                object["dry_run"] = false
                if mode == .foreignProfile { object["profile_id"] = "foreign-profile" }
                else { object["id"] = "00000000-0000-4000-8000-000000000002" }
                return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(try JSONSerialization.data(withJSONObject: object)))
            }
        }
        let (response, responseBody) = try await live.send(request, body: body, baseURL: baseURL, operationID: operationID)
        if operationID == "tasks.delete", dryRun, let responseBody {
            let data = try await Data(collecting: responseBody, upTo: 65_536)
            preview = data
            return (response, HTTPBody(data))
        }
        return (response, responseBody)
    }
}

@MainActor struct DependencyRecoveryParityTests {
    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func directionRoundTripsCannotLeaveAConflictLockedWithoutReload() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        let directory = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["TODO_W06_RECEIPT"])).deletingLastPathComponent()
        var captures: [[String: String]] = []
        for direction in DependencyDirection.allCases {
            for offline in [false, true] {
                let suffix = "\(direction.rawValue) \(offline)"
                let root = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "Parity root \(suffix)"))).ok.body.json)
                let candidate = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "Parity candidate \(suffix)"))).ok.body.json)
                let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-parity-picker"))
                model.replaceCredential(session.credential); model.signedIn = true; model.connection = .live
                defer { model.signedIn = false; model.connect() }
                model.beginEditing(root); model.editor?.title = "Keep the native Conflict draft"
                await model.openDependencyPicker(root, direction: direction)
                let dependent = direction == .dependsOn ? root : candidate
                let blocker = direction == .dependsOn ? candidate : root
                let edit = try JSONDecoder().decode(Operations.tasks_period_edit.Input.Body.jsonPayload.self, from: JSONSerialization.data(withJSONObject: ["from_version": 1, "changes": ["title": "Remote parity change \(suffix)"]]))
                _ = try await api.tasks_period_edit(path: .init(profile: "work", task: dependent.id), body: .json(edit)).ok.body.json
                await model.toggleDependency(candidate)
                #expect(model.dependencies.picker?.requiresReload == true)
                #expect(model.dependencies.picker?.failure?.message == "This Task changed. Reload its Dependencies before trying again.")
                if offline { model.connection = .offline }
                let other: DependencyDirection = direction == .dependsOn ? .blocks : .dependsOn
                for next in [other, direction] {
                    await model.setDependencyDirection(next)
                    #expect(model.dependencies.picker?.direction == next)
                    if offline {
                        #expect(model.dependencies.picker?.requiresReload == true)
                        #expect(model.dependencies.picker?.failure?.message == "This Task changed. Reload its Dependencies before trying again.")
                        #expect(model.dependencies.picker?.failure?.detail == "error 4 - Conflict")
                    } else {
                        #expect(model.dependencies.picker?.requiresReload == false)
                        #expect(model.dependencies.picker?.failure == nil)
                        #expect(model.dependencies.picker?.loading == false)
                    }
                }
                #expect(model.editor?.title == "Keep the native Conflict draft")
                if offline {
                    for compact in [true, false] {
                        for dark in [false, true] {
                            let name = "picker-direction-\(direction == .dependsOn ? "depends-on" : "blocks")-\(compact ? "compact" : "full")-\(dark ? "dark" : "light")"
                            let text = try pickerText(model, directory: directory, name: name, compact: compact, dark: dark)
                            #expect(text.contains("Reload"))
                            captures.append(["direction": direction.rawValue, "layout": compact ? "compact" : "full", "appearance": dark ? "dark" : "light", "png": name + ".png", "visible_text": text])
                        }
                    }
                }
                let unchanged = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: dependent.id)).ok.body.json)
                #expect(unchanged.row_version == 2)
                #expect(unchanged.depends_on?.isEmpty != false)
                model.connection = .live
                await model.reloadDependencyPicker()
                #expect(model.dependencies.picker?.requiresReload == false)
                #expect(model.dependencies.picker?.failure == nil)
                let fresh = try #require(model.dependencies.picker?.rows.first { $0.id == candidate.id })
                await model.toggleDependency(fresh)
                let changed = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: dependent.id)).ok.body.json)
                #expect(changed.row_version == 3)
                #expect(changed.depends_on == [blocker.id])
            }
        }
        try JSONSerialization.data(withJSONObject: captures, options: [.prettyPrinted, .sortedKeys]).write(to: directory.appendingPathComponent("dependency-recovery-parity.json"))
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["TODO_W06_SERVER"] != nil))
    func onlyAValidatedDeleteCanDiscardTheNativeEditorDraft() async throws {
        let server = try #require(ProcessInfo.processInfo.environment["TODO_W06_SERVER"].flatMap(URL.init(string:)))
        let session = try await todoClient(server: server, credential: "").signIn_period_signIn(body: .json(.init(passphrase: "scratch verification passphrase"))).ok.body.json
        let api = todoClient(server: server, credential: session.credential)
        for mode in ParityDeleteReply.allCases {
            let task = try await TaskSnapshot.decode(api.tasks_period_create(path: .init(profile: "work"), body: .json(.init(title: "Native delete parity \(mode.rawValue)"))).ok.body.json)
            let transport = ParityDeleteTransport(mode)
            let model = TodoModel(configuration: .init(server: server, initialProfile: "work", vaultService: "unused-parity-delete"), clientFactory: { url, credential in Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)]) })
            model.replaceCredential(session.credential); model.signedIn = true; model.connection = .live
            defer { model.signedIn = false; model.connect() }
            model.beginEditing(task); model.editor?.title = "Unsaved native review draft"
            await model.openDependencyDelete(task)
            #expect(model.editor?.title == "Unsaved native review draft")
            #expect(model.dependencies.deletion?.acceptedFromVersion == 1)
            await model.confirmDependencyDelete()
            #expect(await transport.confirmations == 1)
            if mode == .accepted {
                #expect(model.editor == nil)
                #expect(model.dependencies.deletion == nil)
                #expect(model.deletionNotice == "Task deleted")
                let rows = try await api.tasks_period_list(path: .init(profile: "work")).ok.body.json.map(TaskSnapshot.decode)
                #expect(!rows.contains { $0.id == task.id })
            } else {
                #expect(model.editor?.title == "Unsaved native review draft")
                #expect(model.hasUnsavedEditor)
                #expect(model.dependencies.deletion?.failure?.message == "The server response could not be read. Reload Dependencies before confirming again.")
                #expect(model.dependencies.deletion?.fingerprint == nil)
                let current = try await TaskSnapshot.decode(api.tasks_period_show(path: .init(profile: "work", task: task.id)).ok.body.json)
                #expect(current.row_version == 1)
                #expect(current.title == task.title)
                #expect(current.deleted_at == nil)
                model.closeDependencyDelete()
                #expect(await model.navigate(.edit(current)))
                #expect(model.editor?.title == "Unsaved native review draft")
                #expect(await model.navigate(.profile("personal")) == false)
                model.cancelNavigation()
                #expect(model.editor?.title == "Unsaved native review draft")
            }
        }
    }

    private func pickerText(_ model: TodoModel, directory: URL, name: String, compact: Bool, dark: Bool) throws -> String {
        let width: CGFloat = compact ? 393 : 560, height: CGFloat = compact ? 426 : 600
        let appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        let previous = NSApplication.shared.appearance
        NSApplication.shared.appearance = appearance
        defer { NSApplication.shared.appearance = previous }
        let view = DependencyPickerView(model: model, compact: compact).frame(width: width, height: height).background(.background).environment(\.colorScheme, dark ? .dark : .light)
        let host = NSHostingView(rootView: view)
        let window = NSWindow(contentRect: .init(x: -10000, y: -10000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.appearance = appearance; window.contentView = host
        defer { window.contentView = nil; window.close() }
        host.frame = .init(x: 0, y: 0, width: width, height: height)
        host.layoutSubtreeIfNeeded()
        let bitmap = try #require(host.bitmapImageRepForCachingDisplay(in: host.bounds))
        host.cacheDisplay(in: host.bounds, to: bitmap)
        let png = try #require(bitmap.representation(using: .png, properties: [:]))
        try png.write(to: directory.appendingPathComponent(name + ".png"))
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["en-US"]
        try VNImageRequestHandler(data: png, options: [:]).perform([request])
        #expect(!window.isVisible)
        return (request.results ?? []).sorted { $0.boundingBox.maxY > $1.boundingBox.maxY }.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
    }
}
