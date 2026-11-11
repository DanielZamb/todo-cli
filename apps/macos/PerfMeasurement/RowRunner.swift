import AppKit
import Darwin
import Foundation
import TodoAPI
@testable import TodoState

@main @MainActor struct RowProbeRunner {
    static func main() {
        let application = NSApplication.shared
        application.setActivationPolicy(.regular)
        application.finishLaunching()
        Task { @MainActor in
            var exitCode: Int32 = 0
            do {
                let env = ProcessInfo.processInfo.environment
                let address = env["MAC_PERF_SERVER"]!
                let credential = env["MAC_PERF_CREDENTIAL"]!
                let trace = PerfConnectionTrace.shared
                trace.configure("fresh")
                defer { trace.cleanup() }
                let model = TodoModel(configuration: .init(server: URL(string: address)!, initialProfile: "work", vaultService: "unused-mac-row-probe"), clientFactory: { url, _ in todoClient(server: url, credential: credential) })
                model.signedIn = true
                model.selectedView = "all"
                trace.beginRefresh(1)
                await model.refreshAfterWrite("Scratch row probe")
                guard model.tasks.count == 178 && model.projects.count == 6 && model.tags.count == 39 else { throw NSError(domain: "MacRowProbe", code: 2) }
                let selection = try await measureRowSelection(model)
                let requests = trace.snapshot()
                let result: [String: Any] = ["runner": "AppKit main loop", "variant": env["MAC_PERF_VARIANT"] ?? "production", "rowSelection": selection, "requests": requests, "checkpoints": [], "refreshes": [], "errors": requests.filter { $0["status"] as? Int != 200 }.count]
                let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
                try data.write(to: URL(fileURLWithPath: env["MAC_PERF_OUTPUT"]!))
            } catch {
                print("Row probe failed: \(error)")
                exitCode = 1
            }
            application.stop(nil)
            let event = NSEvent.otherEvent(with: .applicationDefined, location: .zero, modifierFlags: [], timestamp: 0, windowNumber: 0, context: nil, subtype: 0, data1: 0, data2: 0)!
            application.postEvent(event, atStart: true)
            if exitCode != 0 { Darwin.exit(exitCode) }
        }
        application.run()
    }
}
