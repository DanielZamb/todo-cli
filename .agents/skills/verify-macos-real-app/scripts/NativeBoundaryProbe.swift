import AppKit
import Foundation

@_silgen_name("verification_security_service_denied_name")
private func serviceDenied(_ name: UnsafePointer<CChar>) -> Int32
@_silgen_name("verification_true_execution")
private func trueExecution(_ directory: UnsafePointer<CChar>) -> Int32

@main struct NativeBoundaryProbe {
    @MainActor static func main() {
        do {
            let mode = CommandLine.arguments[1]
            if ["defaults", "input-mask", "busy-main", "config"].contains(mode) { try VerificationProbeScope.install() }
            if mode == "defaults" {
                UserDefaults.standard.setVolatileDomain(["sentinel": "ambient"], forName: UserDefaults.globalDomain)
                try VerificationDefaults.install(); try VerificationDefaults.install()
                try verificationRequire(UserDefaults.standard.object(forKey: "sentinel") == nil, "Ambient defaults escaped the memory boundary.")
                UserDefaults.standard.set("scratch", forKey: "sentinel")
                try verificationRequire(UserDefaults.standard.string(forKey: "sentinel") == "scratch", "Memory defaults did not preserve their own value.")
                print("memory defaults accepted"); return
            }
            if mode == "input-mask" {
                let expected: [UInt] = [1,2,3,4,5,6,7,8,9,10,11,12,14,17,18,19,20,22,23,24,25,26,27,29,30,31,32,33,34,37,38,40]
                for raw in expected { try verificationRequire(OwnerIdle.inputMask.rawValue & (1 << raw) != 0, "Owner input type \(raw) is missing.") }
                print("all keyboard, pointer, gesture and tablet masks accepted"); return
            }
            if mode == "busy-main" {
                let watch = OwnerInputWatch(started: ProcessInfo.processInfo.systemUptime, combined: { 120 }, hid: { 0 })
                withExtendedLifetime(watch) { Thread.sleep(forTimeInterval: 2) }
                exit(1)
            }
            if mode == "config" {
                let config = VerificationHTTP.configuration()
                try verificationRequire(config.urlCredentialStorage == nil && config.httpCookieStorage == nil && config.urlCache == nil && !config.httpShouldSetCookies, "A persistent HTTP store is enabled.")
                try verificationRequire((config.connectionProxyDictionary?["HTTPEnable"] as? Int) == 0 && (config.connectionProxyDictionary?["ProxyAutoConfigEnable"] as? Int) == 0, "A proxy is enabled.")
                print("isolated HTTP configuration accepted"); return
            }
            if mode == "machine-lock" {
                let claim = try VerificationClaim.machine()
                print("machine lock accepted"); fflush(stdout)
                withExtendedLifetime(claim) {
                    for _ in 0..<6000 where !FileManager.default.fileExists(atPath: CommandLine.arguments[2] + "/continue-instance-test") { Thread.sleep(forTimeInterval: 0.01) }
                }; return
            }
            defer { LaunchGuard.stop() }
            let metadataOnly = ["owned-metadata", "stale-metadata"].contains(mode)
            var validator: (@MainActor (Data) throws -> Void)?
            if metadataOnly {
                validator = { (data: Data) in
                    if mode == "stale-metadata" { Thread.sleep(forTimeInterval: 3) }
                    let state = try JSONDecoder().decode(OwnerPreflight.self, from: data)
                    try OwnerIdle.validateFresh(state, now: ProcessInfo.processInfo.systemUptime, maximumAge: 2)
                    try verificationRequire(state.frontmostBundleID != "unknown" && state.frontmostBundleName != "unknown", "The owned metadata snapshot has no frontmost identity.")
                    print("owned metadata read headlessly; no window or owner-idle authority")
                }
            }
            try LaunchGuard.check(expectedContract: VerificationBuild.contract, visible: metadataOnly || mode == "missing-metadata-validator", expectedServerSHA256: VerificationBuild.serverSHA256, expectedCLISHA256: VerificationBuild.cliSHA256, expectedBoundarySHA256: VerificationBuild.boundarySHA256, expectedPreflightSHA256: VerificationBuild.preflightSHA256, beforeSandbox: validator)
            let manifest = LaunchGuard.accepted!
            if mode == "sandbox" {
                let outside = CommandLine.arguments[2]
                try verificationRequire((try? Data(contentsOf: URL(fileURLWithPath: outside))) == nil, "An outside scratch sentinel was readable.")
                try verificationRequire((try? Data("must remain untouched".utf8).write(to: URL(fileURLWithPath: outside))) == nil, "An outside scratch sentinel was writable.")
                let own = URL(fileURLWithPath: manifest.home + "/allowed-sentinel")
                try Data("scratch".utf8).write(to: own)
                try verificationRequire(try String(contentsOf: own, encoding: .utf8) == "scratch", "The scratch file allowance is missing.")
                let execution = manifest.root.withCString { trueExecution($0) }
                try verificationRequire(execution == 1, "The exec control returned \(execution) instead of the sandbox denial.")
                let fd = socket(AF_INET, SOCK_STREAM, 0); defer { close(fd) }
                var address = sockaddr_in(); address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size); address.sin_family = sa_family_t(AF_INET); address.sin_addr.s_addr = inet_addr("127.0.0.1"); address.sin_port = UInt16(CommandLine.arguments[3])!.bigEndian
                let connected = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
                try verificationRequire(connected == -1 && errno == EPERM, "An unrelated loopback listener was reachable.")
                print("scratch file access accepted; outside file, network and execution denied")
            }
            if mode == "hold" {
                print("manifest accepted"); fflush(stdout)
                for _ in 0..<6000 where !FileManager.default.fileExists(atPath: manifest.root + "/continue-instance-test") { Thread.sleep(forTimeInterval: 0.01) }
            }
            if mode == "policy" {
                try ScratchSandbox.install(manifest)
                let names = ["com.apple.securityd", "com.apple.securityd.xpc", "com.apple.secd", "com.apple.akd", "com.apple.ctkd", "com.apple.accountsd", "com.apple.AuthenticationServicesCore.AuthenticationServicesAgent", "com.apple.AuthenticationServices.CredentialProvider", "com.apple.LocalAuthentication.RemoteService", "com.apple.CoreAuthentication.daemon", "com.apple.cloudd", "com.apple.CloudKit", "com.apple.bird", "com.apple.kvs", "com.apple.ubiquity", "com.apple.cfprefsd.agent", "com.apple.lsd.open", "com.apple.lsd.mapdb", "local.todo.unlisted-credential-service"]
                for name in names { try verificationRequire(name.withCString { serviceDenied($0) } == 1, "A credential or settings broker remains reachable: \(name)") }
                try verificationRequire(verificationHIDIdleSeconds() >= 0, "The HID signal is unavailable inside the sandbox.")
                try VerificationDirectories.install()
                try VerificationDefaults.install()
                _ = try VerificationHTTP.health(URL(string: manifest.serverURL + "/health")!)
                print("credential brokers denied; memory defaults, HID and ephemeral HTTP accepted")
            }
            if mode == "read-tasks" {
                try LaunchGuard.verifyOwnedChild()
                let data = try VerificationHTTP.get(URL(string: manifest.serverURL + "/profiles/verify/tasks")!, headers: ["Authorization": "Bearer " + manifest.session])
                let text = String(decoding: data, as: UTF8.self)
                try verificationRequire(text.contains("V01 seeded Task alpha") && text.contains("V01 seeded Task beta"), "The owned scratch database does not contain the seeded Tasks.")
                print("both seeded Tasks accepted through public HTTP")
            }
            if mode == "replaced-server" {
                LaunchGuard.child!.terminate(); LaunchGuard.child!.waitUntilExit()
                print("owned server stopped"); fflush(stdout)
                for _ in 0..<6000 where !FileManager.default.fileExists(atPath: manifest.root + "/continue-test") { Thread.sleep(forTimeInterval: 0.01) }
                try LaunchGuard.verifyOwnedChild()
                _ = try VerificationHTTP.health(URL(string: manifest.serverURL + "/health")!)
                print("replacement accepted")
            }
            print("manifest accepted")
        } catch { FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8)); exit(78) }
    }
}
