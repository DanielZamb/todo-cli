import Foundation
import UniformTypeIdentifiers

struct AttachmentSnapshot: Codable, Identifiable, Equatable, Sendable {
  enum Location: Equatable, Sendable {
    case file(String)
    case image(String)
    case link(URL)
  }
  let id: String
  let location: Location
  let name: String?
  let byte_size: Int?
  let label: String?
  let added_at: String
  var path: String? {
    switch location {
    case .file(let path), .image(let path): path
    case .link: nil
    }
  }
  var url: URL {
    switch location {
    case .file(let path), .image(let path): URL(fileURLWithPath: path)
    case .link(let url): url
    }
  }
  var isImage: Bool {
    if case .image = location { return true }
    return false
  }
  var exists: Bool? { path.map { FileManager.default.fileExists(atPath: $0) } }
  var title: String { name ?? (path == nil ? url.host() : url.lastPathComponent) ?? "Attachment" }
  var displayPath: String { path ?? url.absoluteString }
  var secondaryText: String { isImage && byte_size != nil ? "Copied image · \(ByteCountFormatter.string(fromByteCount: Int64(byte_size ?? 0), countStyle: .file))" : displayPath }
  private enum CodingKeys: String, CodingKey { case id, kind, path, url, name, byte_size, label, added_at }
  init(id: String, location: Location, name: String? = nil, byte_size: Int? = nil, label: String? = nil, added_at: String) {
    self.id = id
    self.location = location
    self.name = name
    self.byte_size = byte_size
    self.label = label
    self.added_at = added_at
  }
  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(String.self, forKey: .id)
    name = try values.decodeIfPresent(String.self, forKey: .name)
    byte_size = try values.decodeIfPresent(Int.self, forKey: .byte_size)
    label = try values.decodeIfPresent(String.self, forKey: .label)
    added_at = try values.decode(String.self, forKey: .added_at)
    switch try values.decode(String.self, forKey: .kind) {
    case "file": location = .file(try values.decode(String.self, forKey: .path))
    case "image": location = .image(try values.decode(String.self, forKey: .path))
    case "link":
      let url = try values.decode(URL.self, forKey: .url)
      guard ["https", "http"].contains(url.scheme?.lowercased() ?? "") else {
        throw DecodingError.dataCorruptedError(
          forKey: .url, in: values, debugDescription: "Expected HTTP or HTTPS")
      }
      location = .link(url)
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .kind, in: values, debugDescription: "Unknown Attachment kind")
    }
  }
  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode(id, forKey: .id)
    try values.encodeIfPresent(name, forKey: .name)
    try values.encodeIfPresent(byte_size, forKey: .byte_size)
    try values.encodeIfPresent(label, forKey: .label)
    try values.encode(added_at, forKey: .added_at)
    switch location {
    case .file(let path):
      try values.encode("file", forKey: .kind)
      try values.encode(path, forKey: .path)
    case .image(let path):
      try values.encode("image", forKey: .kind)
      try values.encode(path, forKey: .path)
    case .link(let url):
      try values.encode("link", forKey: .kind)
      try values.encode(url, forKey: .url)
    }
  }
}

enum AttachmentOpening {
  static func allowedURL(_ attachment: AttachmentSnapshot) -> URL? {
    let url = attachment.url
    if attachment.path == nil {
      return ["http", "https"].contains(url.scheme?.lowercased() ?? "") && url.user == nil
        && url.password == nil ? url : nil
    }
    let resolved = url.resolvingSymlinksInPath()
    let blocked = Set([
      "app", "bundle", "exe", "com", "bat", "cmd", "sh", "bash", "zsh", "command", "py", "rb", "pl",
      "js", "mjs", "cjs", "jar", "pkg", "dmg", "scpt", "workflow",
    ])
    for candidate in [url, resolved] {
      if candidate.pathComponents.contains(where: {
        ["app", "bundle"].contains(URL(fileURLWithPath: $0).pathExtension.lowercased())
      }) || blocked.contains(candidate.pathExtension.lowercased()) {
        return nil
      }
    }
    guard
      let values = try? resolved.resourceValues(forKeys: [
        .isRegularFileKey, .isExecutableKey, .contentTypeKey,
      ]), values.isRegularFile == true,
      values.isExecutable != true, values.contentType?.conforms(to: .executable) != true
    else { return nil }
    return resolved
  }
}
