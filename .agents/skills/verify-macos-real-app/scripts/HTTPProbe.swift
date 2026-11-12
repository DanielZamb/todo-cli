import Foundation

@main struct HTTPProbe {
    @MainActor static func main() {
        do {
            try VerificationProbeScope.install(serverURL: CommandLine.arguments[1])
            try VerificationDefaults.install()
            let data = try VerificationHTTP.get(URL(string: CommandLine.arguments[1])!)
            print(String(decoding: data, as: UTF8.self))
        } catch { FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8)); exit(78) }
    }
}
