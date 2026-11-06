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
  var title: String { name ?? (path == nil ? (url.host() ?? url.absoluteString) : url.lastPathComponent) ?? "Attachment" }
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
      guard url.scheme != nil else {
        throw DecodingError.dataCorruptedError(
          forKey: .url, in: values, debugDescription: "Expected absolute URI")
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
  // Types that run code, install software or settings, or open another location.
  static let blockedTypes: [UTType] =
    [.executable, .script, .shellScript, .application, .applicationBundle, .bundle, .package]
    + [
      "com.apple.installer-package-archive", "com.apple.installer-meta-package",
      "com.apple.terminal.settings", "com.apple.terminal.shell-script", "com.apple.mobileconfig",
      "com.apple.web-internet-location", "com.apple.internet-location", "com.apple.applescript.script",
      "com.apple.applescript.script-bundle", "com.apple.automator-action",
      "com.apple.automator-workflow", "com.apple.shortcut", "com.apple.alias-file",
    ].compactMap { UTType($0) }

  static func allowedURL(_ attachment: AttachmentSnapshot) -> URL? {
    let url = attachment.url
    if attachment.path == nil {
      return ["http", "https"].contains(url.scheme?.lowercased() ?? "") && url.user == nil
        && url.password == nil ? url : nil
    }
    let resolved = url.resolvingSymlinksInPath()
    // Keep this list identical to executableExtensions in the Electron client.
    let blocked = Set([
      "app", "bundle", "exe", "com", "bat", "cmd", "ps1", "vbs", "msi", "sh", "bash", "zsh", "csh",
      "tcsh", "ksh", "fish", "command", "tool", "terminal", "py", "rb", "pl", "php", "lua", "tcl",
      "js", "mjs", "cjs", "jar", "jnlp", "pkg", "mpkg", "dmg", "xip", "scpt", "scptd",
      "applescript", "osascript", "workflow", "action", "caction", "shortcut", "mobileconfig",
      "configprofile", "provisionprofile", "webloc", "inetloc", "fileloc", "afploc", "ftploc",
      "smbloc", "url", "prefpane", "plugin", "kext", "appex", "framework", "osax", "qlgenerator",
      "saver", "wdgt", "mdimporter", "service", "xpc", "systemextension", "dext", "component",
      "definition", "inputplugin"
    ])
    for candidate in [url, resolved] {
      if candidate.pathComponents.contains(where: {
        ["app", "bundle"].contains(URL(fileURLWithPath: $0).pathExtension.lowercased())
      }) || blocked.contains(candidate.pathExtension.lowercased()) {
        return nil
      }
    }
    // A Finder alias opens its original, which symlink resolution never sees.
    for candidate in [url, resolved] {
      if (try? candidate.resourceValues(forKeys: [.isAliasFileKey]))?.isAliasFile != false {
        return nil
      }
    }
    guard
      let values = try? resolved.resourceValues(forKeys: [
        .isRegularFileKey, .isExecutableKey, .contentTypeKey,
      ]), values.isRegularFile == true,
      values.isExecutable != true,
      let contentType = values.contentType,
      !blockedTypes.contains(where: { contentType.conforms(to: $0) })
    else { return nil }
    return resolved
  }
}
