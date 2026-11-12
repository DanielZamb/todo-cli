import Foundation

@main struct FileProbe {
    static func main() {
        do {
            let root = try ScratchFiles(CommandLine.arguments[1])
            defer { root.releaseSeals() }
            let path = CommandLine.arguments[2]
            let object = try root.open(path, directory: CommandLine.arguments.contains("--directory"), immutable: CommandLine.arguments.contains("--immutable"))
            if CommandLine.arguments.contains("--immutable") { try object.seal(); _ = try object.digest() }
            if CommandLine.arguments.contains("--protect") { try root.protectDirectories() }
            print("descriptor opened"); fflush(stdout)
            if CommandLine.arguments.contains("--wait") {
                for _ in 0..<500 where !FileManager.default.fileExists(atPath: root.root.path + "/continue-file-test") { Thread.sleep(forTimeInterval: 0.01) }
            }
            try root.verify()
            print("descriptor accepted")
        } catch { FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8)); exit(78) }
    }
}
