import Foundation

@main struct GuardProbe {
    static func main() {
        do {
            try LaunchGuard.check()
            print("manifest accepted")
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(78)
        }
    }
}
