import Foundation

@main struct PreflightProbe {
    @MainActor static func main() {
        do {
            if CommandLine.arguments.count == 2, CommandLine.arguments[1] == "--input-policy" {
                guard !OwnerIdle.sessionInputArrived(elapsed: 10, idleSeconds: [120, 125]),
                      OwnerIdle.sessionInputArrived(elapsed: 10, idleSeconds: [120, 0]) else { exit(1) }
            } else if CommandLine.arguments.count == 3 {
                let state = OwnerPreflight(frontmostBundleID: CommandLine.arguments[1] == "unknown" ? "unknown" : "synthetic", frontmostName: "synthetic", frontmostBundleName: CommandLine.arguments[1], idleSeconds: Double(CommandLine.arguments[2])!, hidIdleSeconds: 120)
                try OwnerIdle.validate(state)
            } else { try OwnerIdle.requireIdle() }
            print("preflight accepted")
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(78)
        }
    }
}
