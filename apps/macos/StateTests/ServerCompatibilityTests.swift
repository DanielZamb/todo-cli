import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
import TodoAPI
@testable import TodoState

private actor StaleHealth: ClientTransport {
    let json: String
    var paths: [String] = []
    init(_ json: String) { self.json = json }
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        paths.append(request.path ?? "")
        return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(json))
    }
}

@MainActor struct ServerCompatibilityTests {
    @Test func staleHealthBlocksConnectSignInReadsAndWrites() async throws {
        for (json, expectedBuild) in [
            (#"{"service":"todo-server"}"#, "unknown"),
            (#"{"service":"todo-server","build":"verify-old","contract":"fake-contract"}"#, "verify-old")
        ] {
            let transport = StaleHealth(json)
            let model = TodoModel(configuration: .init(server: URL(string: "http://127.0.0.1:1")!, initialProfile: "work", vaultService: "unused-stale-health"), clientFactory: { url, credential in
                Client(serverURL: url, transport: transport, middlewares: [BearerMiddleware(credential: credential)])
            })
            // The stale check happens before SessionVault is accessed.
            #expect(await model.signIn("scratch verification passphrase") == false)
            #expect(model.outdatedServerBuild == expectedBuild)
            #expect(await transport.paths == ["/health"])
            model.signedIn = true
            model.connection = .live
            #expect(model.canWrite == false)
            model.newTitle = "Must never be written"
            #expect(await model.create(openEditor: false) == false)
            model.applyTaskFilters(.init(status: "closed"))
            await model.loadHistory()
            await model.openSeries()
            model.connect()
            for _ in 0..<100 {
                if await transport.paths.count == 2 { break }
                try await Task.sleep(for: .milliseconds(10))
            }
            #expect(await transport.paths == ["/health", "/health"])
            #expect(model.tasks.isEmpty)
            #expect(model.outdatedServerBuild == expectedBuild)
            #expect(model.connection == .offline)
        }
    }
}

import AppKit
import SwiftUI

@Test @MainActor func planningStatusIsDisabledInTheRenderedForm() async throws {
    NSApplication.shared.setActivationPolicy(.prohibited)
    for compact in [true, false] {
        for planning in [true, false] {
            let view = NSHostingView(rootView: TaskFilterView(draft: .init(), compact: compact, planning: planning, apply: { _ in }, close: {}))
            let size = NSSize(width: compact ? 393 : 600, height: compact ? 426 : 640)
            let window = NSWindow(contentRect: NSRect(origin: NSPoint(x: -10000, y: -10000), size: size), styleMask: [.titled], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentView = view
            view.frame = NSRect(origin: .zero, size: size)
            view.layoutSubtreeIfNeeded()
            try await Task.sleep(for: .milliseconds(100))
            func popups(_ view: NSView) -> [NSPopUpButton] {
                (view as? NSPopUpButton).map { [$0] } ?? view.subviews.flatMap(popups)
            }
            let controls = popups(view)
            // Form order is Status, Priority, Due date, Scheduled date, Energy.
            #expect(controls.count == 5)
            #expect(controls.map(\.isEnabled) == (planning ? [false, true, true, true, true] : [true, true, true, true, true]))
            window.close()
        }
    }
}
