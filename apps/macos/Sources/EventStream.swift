import Foundation

struct ServerEvent: Equatable {
    var id: String?
    var name: String
    var data: String
}

struct EventStreamDecoder {
    private var buffer = Data()
    private var name = "message"
    private var id: String?
    private var data: [String] = []
    private var firstLine = true
    private var afterCR = false

    mutating func append(_ bytes: ArraySlice<UInt8>) throws -> [ServerEvent] {
        var events: [ServerEvent] = []
        for byte in bytes {
            if byte == 10 && afterCR { afterCR = false; continue }
            afterCR = byte == 13
            if byte == 10 || byte == 13 {
                guard var line = String(data: buffer, encoding: .utf8) else { throw StreamError.invalidUTF8 }
                buffer.removeAll(keepingCapacity: true)
                if firstLine { line = line.replacingOccurrences(of: "\u{feff}", with: ""); firstLine = false }
                if line.isEmpty {
                    if !data.isEmpty { events.append(ServerEvent(id: id, name: name, data: data.joined(separator: "\n"))) }
                    name = "message"
                    id = nil
                    data = []
                } else if !line.hasPrefix(":") {
                    let parts = line.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
                    let value = parts.count == 2 ? String(parts[1].hasPrefix(" ") ? parts[1].dropFirst() : parts[1][...]) : ""
                    switch parts[0] {
                    case "event": name = value
                    case "data": data.append(value)
                    case "id": if !value.contains("\0") { id = value }
                    default: break
                    }
                }
            } else {
                buffer.append(byte)
                if buffer.count > 4_194_304 { throw StreamError.frameTooLarge }
            }
        }
        return events
    }
}

enum StreamError: LocalizedError {
    case invalidUTF8, frameTooLarge, closed
    var errorDescription: String? { "The live connection ended. Reconnecting…" }
}
