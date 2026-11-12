import Foundation

@main struct GuardProbe {
    @MainActor static func main() {
        do {
            defer { LaunchGuard.stop() }
            try LaunchGuard.check(expectedContract: VerificationBuild.contract, expectedServerSHA256: VerificationBuild.serverSHA256, expectedCLISHA256: VerificationBuild.cliSHA256, expectedBoundarySHA256: VerificationBuild.boundarySHA256, expectedPreflightSHA256: VerificationBuild.preflightSHA256)
            print("manifest accepted")
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(78)
        }
    }
}
