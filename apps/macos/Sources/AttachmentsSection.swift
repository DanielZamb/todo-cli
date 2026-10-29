import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct AttachmentLayoutKey: PreferenceKey {
  static let defaultValue: [String: CGRect] = [:]
  static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, new in new }) }
}
private extension View {
  func attachmentBounds(_ id: String) -> some View { background(GeometryReader { geometry in Color.clear.preference(key: AttachmentLayoutKey.self, value: [id: geometry.frame(in: .global)]) }) }
}
struct AttachmentLabelBadge: View {
  let label: String
  var body: some View {
    Text(label.lowercased() == "jira" ? "Jira" : label).font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
      .lineLimit(1).padding(.horizontal, 4).padding(.vertical, 1)
      .overlay(RoundedRectangle(cornerRadius: 3).stroke(.quaternary)).help(label)
  }
}
struct JiraAttachmentMarker: View {
  let task: TaskSnapshot
  var body: some View {
    if task.jiraAttachment != nil { AttachmentLabelBadge(label: "jira").fixedSize().layoutPriority(1).accessibilityLabel("Jira draft attached").attachmentBounds("jira-row-marker") }
  }
}
struct AttachmentsSection: View {
  @Bindable var model: TodoModel
  @State private var link = ""
  @State private var label = ""
  @State private var editing: AttachmentSnapshot?
  @State private var labelTask: String?
  @State private var labelProfile = ""
  @State private var addingLink = false
  @State private var hasImage = false
  @State private var dropTarget = false
  @State private var error: String?
  init(model: TodoModel, showsLinkForm: Bool = false) {
    self.model = model
    _addingLink = State(initialValue: showsLinkForm)
  }
  private var disabled: Bool { !model.canWrite || model.conflict != nil }
  private let imageTypes: [UTType] = [.png, .jpeg, .gif, .webP]
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Label("Attachments", systemImage: "paperclip").font(.subheadline.weight(.semibold))
        Spacer()
        Menu {
          Button("Add File…") { chooseFile() }
          Button("Add Link…") { addingLink = true }
          if hasImage { Button("Paste Image") { pasteImage() } }
        } label: { Label("Add", systemImage: "plus").frame(minWidth: 44, minHeight: 28) }
        .menuStyle(.button).controlSize(.large).frame(minWidth: 44, minHeight: 28).contentShape(Rectangle()).disabled(disabled).accessibilityLabel("Add attachment").accessibilityIdentifier("attachment-add").attachmentBounds("add")
      }.accessibilityIdentifier("attachments-heading").attachmentBounds("heading")
      if let attachments = model.attachmentTask?.attachments, !attachments.isEmpty {
        VStack(spacing: 16) { ForEach(attachments) { attachment in attachmentRow(attachment) } }
      } else {
        Text("Drop files or paste an image here.").font(.caption).foregroundStyle(.secondary)
      }
      if addingLink {
        VStack(alignment: .leading, spacing: 8) {
          TextField("https://", text: $link).textFieldStyle(.roundedBorder).accessibilityLabel("Attachment URL")
          HStack {
            Button("Attach link") { Task { await model.attachLink(link); if model.editorError == nil { addingLink = false; link = "" } } }.disabled(disabled || link.isEmpty)
            Button("Cancel") { addingLink = false }
          }.controlSize(.regular)
        }
      }
      if let error { Text(error).font(.caption).foregroundStyle(TodoColors.color("destructive")).accessibilityIdentifier("attachment-error") }
    }
    .padding(.top, 16).overlay(alignment: .top) { Divider() }
    .background(dropTarget ? Color.accentColor.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 8))
    .accessibilityElement(children: .contain).accessibilityLabel("Attachments").accessibilityIdentifier("attachments-section")
    .onAppear { refreshClipboard() }
    .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in refreshClipboard() }
    .onDrop(of: [.fileURL, .png, .jpeg, .gif, .webP], isTargeted: $dropTarget, perform: receive)
    .onPasteCommand(of: [.png, .jpeg, .gif, .webP]) { providers in _ = receive(providers) }
    .sheet(item: $editing) { attachment in
      AttachmentLabelEditor(attachment: attachment, label: $label, disabled: disabled, cancel: { editing = nil }, save: { Task {
          guard model.editor?.id == labelTask, model.profile == labelProfile else { editing = nil; return }
          await model.labelAttachment(attachment, label: label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : label.trimmingCharacters(in: .whitespacesAndNewlines))
          if model.editorError == nil { editing = nil } } })
    }
  }
  private func refreshClipboard() { hasImage = NSPasteboard.general.canReadObject(forClasses: [NSImage.self], options: nil) }
  @ViewBuilder private func labelActions(_ attachment: AttachmentSnapshot) -> some View {
    if attachment.label?.lowercased() != "jira" { Button("Mark as Jira draft") { Task { await model.labelAttachment(attachment, label: "jira") } } }
    Button("Edit label…") { label = attachment.label ?? ""; labelTask = model.editor?.id; labelProfile = model.profile; editing = attachment }
    if attachment.label != nil { Button("Clear label") { Task { await model.labelAttachment(attachment, label: nil) } } }
  }
  private func attachmentRow(_ attachment: AttachmentSnapshot) -> some View {
    HStack(spacing: 8) {
      Group {
        if attachment.isImage, let path = attachment.path, attachment.exists == true,
          let size = try? URL(fileURLWithPath: path).resourceValues(forKeys: [.fileSizeKey]).fileSize,
          size <= 20 * 1024 * 1024, let image = NSImage(contentsOfFile: path) { Image(nsImage: image).resizable().scaledToFill() }
        else { Image(systemName: attachment.path == nil ? "link" : attachment.isImage ? "photo" : "doc").foregroundStyle(.secondary) }
      }.frame(width: 32, height: 32).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 5)).clipShape(RoundedRectangle(cornerRadius: 5))
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 4) {
          Button(attachment.title) { open(attachment, reveal: false) }.buttonStyle(.plain).font(.caption.weight(.medium)).lineLimit(1).frame(minHeight: 28).disabled(attachment.exists == false).help(attachment.displayPath).attachmentBounds("open-\(attachment.id)")
          if let label = attachment.label { AttachmentLabelBadge(label: label) }
        }
        Text(attachment.secondaryText).font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle).textSelection(.enabled).help(attachment.displayPath).accessibilityValue(attachment.displayPath)
        if attachment.exists == false { Text("Missing file").font(.caption2).foregroundStyle(TodoColors.color("destructive")) }
      }.frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: 0) {
        if attachment.path != nil && attachment.exists == true {
          Button { open(attachment, reveal: true) } label: { Image(systemName: "folder").frame(width: 28, height: 28) }
          .buttonStyle(.borderless).help("Reveal in Finder").accessibilityLabel("Reveal \(attachment.title) in Finder").disabled(attachment.exists != true).attachmentBounds("reveal-\(attachment.id)")
        }
        Menu { labelActions(attachment) } label: { Image(systemName: "ellipsis").frame(width: 28, height: 28) }
          .menuStyle(.borderlessButton).menuIndicator(.hidden).controlSize(.large).frame(width: 28, height: 28).contentShape(Rectangle()).attachmentBounds("actions-\(attachment.id)").accessibilityLabel("Attachment actions for \(attachment.title)").disabled(disabled)
        Button { Task { await model.detachAttachment(attachment) } } label: { Image(systemName: "xmark").frame(width: 28, height: 28) }
          .buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel("Remove attachment \(attachment.title)").disabled(disabled).attachmentBounds("remove-\(attachment.id)")
      }
    }.contextMenu { labelActions(attachment) }.accessibilityIdentifier("attachment-row-\(attachment.id)").attachmentBounds("row-\(attachment.id)")
  }
  private func open(_ attachment: AttachmentSnapshot, reveal: Bool) {
    guard let url = AttachmentOpening.allowedURL(attachment) else {
      error = "Todo cannot open executables, app bundles or missing files."
      return
    }
    error = nil
    if reveal, url.isFileURL {
      NSWorkspace.shared.activateFileViewerSelecting([url])
    } else if !NSWorkspace.shared.open(url) {
      error = "Could not open the Attachment."
    }
  }
  private func chooseFile() {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = false
    panel.allowsMultipleSelection = true
    let expectedTask = model.editor?.id
    let expectedProfile = model.profile
    panel.begin { response in
      guard response == .OK else { return }
      let paths = panel.urls.map(\.path)
      Task { @MainActor in
        for path in paths {
          guard model.editor?.id == expectedTask, model.profile == expectedProfile else { return }
          await model.attachPath(path, label: nil)
        }
      }
    }
  }
  private func pasteImage() {
    guard let image = NSImage(pasteboard: .general), let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let data = bitmap.representation(using: .png, properties: [:])
    else {
      error = "Copy an image, then choose Paste image."
      return
    }
    let expectedTask = model.editor?.id
    let expectedProfile = model.profile
    Task {
      guard model.editor?.id == expectedTask, model.profile == expectedProfile else { return }
      await model.uploadImage(data, mimeType: "image/png", label: nil)
    }
  }
  private func receive(_ providers: [NSItemProvider]) -> Bool {
    guard !disabled else { return false }
    let expectedTask = model.editor?.id
    let expectedProfile = model.profile
    Task { @MainActor in
      for provider in providers {
        do {
          guard model.editor?.id == expectedTask, model.profile == expectedProfile else { return }
          if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            let data = try await providerData(provider, type: UTType.fileURL.identifier)
            guard model.editor?.id == expectedTask, model.profile == expectedProfile,
              let url = URL(dataRepresentation: data, relativeTo: nil)
            else { return }
            await receiveFile(url)
          } else if let type = imageTypes.first(where: {
            provider.hasItemConformingToTypeIdentifier($0.identifier)
          }), let mime = type.preferredMIMEType {
            let data = try await providerData(provider, type: type.identifier)
            guard model.editor?.id == expectedTask, model.profile == expectedProfile else { return }
            await model.uploadImage(data, mimeType: mime, label: nil)
          }
        } catch { self.error = "Could not read the dropped file. Try Add file." }
      }
    }
    return true
  }
  private func providerData(_ provider: NSItemProvider, type: String) async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadDataRepresentation(forTypeIdentifier: type) { data, error in
        if let data {
          continuation.resume(returning: data)
        } else {
          continuation.resume(throwing: error ?? CocoaError(.fileReadUnknown))
        }
      }
    }
  }
  private func receiveFile(_ url: URL) async {
    if let type = UTType(filenameExtension: url.pathExtension), imageTypes.contains(type),
      let mime = type.preferredMIMEType
    {
      guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
        size <= 20 * 1024 * 1024,
        let data = try? Data(contentsOf: url)
      else {
        error = "Images must be 20 MiB or smaller."
        return
      }
      await model.uploadImage(
        data, mimeType: mime, name: url.lastPathComponent)
    } else {
      await model.attachPath(url.path, label: nil)
    }
  }
}

struct AttachmentLabelEditor: View {
  let attachment: AttachmentSnapshot
  @Binding var label: String
  let disabled: Bool
  let cancel: () -> Void
  let save: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Edit label").font(.headline)
      Text(attachment.title).font(.caption).foregroundStyle(.secondary)
      TextField("Label", text: $label).textFieldStyle(.roundedBorder).accessibilityLabel("Attachment label")
      HStack { Spacer(); Button("Cancel", action: cancel); Button("Save label", action: save).keyboardShortcut(.defaultAction).disabled(disabled) }.controlSize(.regular)
    }.padding(20).frame(width: 320)
  }
}
