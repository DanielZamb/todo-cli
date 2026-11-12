import Foundation

@main struct OwnerPolicyProbe {
    @MainActor static func main() {
        do {
            let mode = CommandLine.arguments[1]
            let id = mode == "renamed-mac" ? "local.todo.Todo" : mode == "renamed-electron" ? "dev.todo.electron" : mode == "unknown" ? "unknown" : "synthetic"
            let state = OwnerPreflight(frontmostBundleID: id, frontmostName: "synthetic", frontmostBundleName: "Renamed.app", idleSeconds: mode == "recent" ? 0 : 120, hidIdleSeconds: 120, uptimeSeconds: 100)
            try OwnerIdle.validate(state)
            try OwnerIdle.validateFresh(state, now: mode == "future" ? 99 : mode == "stale" ? 104 : mode == "expired" ? 111 : 101, maximumAge: mode == "expired" ? 10 : 2)
            print("synthetic owner-policy fixture accepted; no window authority")
        } catch {
            FileHandle.standardError.write(Data(((error as? VerificationRefusal)?.errorDescription ?? "Owner-policy fixture failed") .utf8))
            exit(78)
        }
    }
}
