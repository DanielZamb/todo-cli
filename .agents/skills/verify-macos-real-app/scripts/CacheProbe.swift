import Darwin
import Foundation

@main struct CacheProbe {
    static func main() throws {
        let files = try ScratchFiles(CommandLine.arguments[1])
        let mode = CommandLine.arguments[2]
        let directory = files.root.path + "/home"
        let path = files.root.path + "/cache-data"
        if mode == "type" {
            _ = try files.open(directory, directory: true)
            do { _ = try files.open(directory); exit(1) } catch { print("cached directory refused as a regular file"); return }
        }
        FileManager.default.createFile(atPath: path, contents: Data("scratch".utf8), attributes: [.posixPermissions: 0o600])
        if mode == "private" { _ = chmod(path, 0o644) }
        let object = try files.open(path, privateMode: mode == "changed-private")
        do {
            if mode == "immutable" { _ = try files.open(path, immutable: true) }
            else if mode == "private" { _ = try files.open(path, privateMode: true) }
            else if mode == "changed-private" { _ = fchmod(object.fd, 0o644); try files.verify() }
            else { exit(2) }
            exit(1)
        } catch { print("cached descriptor refused the invalid " + mode + " request") }
    }
}
