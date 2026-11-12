import AppKit

@main struct LocalInputProbe {
    @MainActor static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let request = URL(fileURLWithPath: CommandLine.arguments[1])
        let timer = OwnerIdle.monitor(interruptionRequest: request)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            try! Data().write(to: request)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { exit(1) }
        withExtendedLifetime(timer) { app.run() }
        exit(1)
    }
}
