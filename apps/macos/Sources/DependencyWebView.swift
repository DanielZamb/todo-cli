import AppKit
import SwiftUI
import WebKit

struct DependencyWebView: NSViewRepresentable {
    let model: TodoModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reducedMotion
    var resourceURL: URL? = TodoColors.bundle.url(forResource: "index", withExtension: "html", subdirectory: "graph-browser")
    var onReply: ((DependencyGraphReply) -> Void)? = nil

    func makeCoordinator() -> Coordinator { Coordinator(model: model, onReply: onReply) }
    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.userContentController.add(context.coordinator, name: "todoGraph")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        context.coordinator.web = web
        if let resourceURL {
            context.coordinator.directory = resourceURL.deletingLastPathComponent().resolvingSymlinksInPath()
            web.loadFileURL(resourceURL, allowingReadAccessTo: resourceURL.deletingLastPathComponent())
        } else {
            Task { @MainActor in model.dependencies.graph?.renderError = "The local diagram resources are unavailable. Use the Task list or Retry." }
        }
        return web
    }
    func updateNSView(_ web: WKWebView, context: Context) {
        context.coordinator.onReply = onReply
        guard let graph = model.dependencies.graph, let report = graph.report else { return }
        let appearance = NSAppearance(named: colorScheme == .dark ? .darkAqua : .aqua)
        web.appearance = appearance
        let render = DependencyGraphRender(
            identity: .init(profile: graph.profile, root: graph.root, credentialEpoch: model.discovery.credentialEpoch, request: graph.request),
            root_id: graph.root,
            nodes: report.nodes.map { .init(mermaid_id: $0.mermaid_id, task_id: $0.task.id, title: $0.task.title, state: $0.displayState) },
            mermaid: report.mermaid, visible_ids: report.topological_order.filter(graph.visibleIDs.contains), viewport: graph.viewport,
            selected_id: graph.selected, focused_id: graph.focused,
            theme: .init(mode: colorScheme == .dark ? "dark" : "light", tokens: Self.themeTokens(appearance: appearance)), reduced_motion: reducedMotion)
        context.coordinator.render = render
        context.coordinator.sendRender()
    }
    static func dismantleNSView(_ web: WKWebView, coordinator: Coordinator) {
        web.stopLoading()
        web.configuration.userContentController.removeScriptMessageHandler(forName: "todoGraph")
        web.navigationDelegate = nil
        coordinator.web = nil
        coordinator.loaded = false
    }
    static func themeTokens(appearance: NSAppearance?) -> [String: String] {
        let roles = ["ink": "foreground", "paper": "background", "card": "card", "border": "border", "muted-text": "muted-foreground", "primary": "primary", "on-primary": "primary-foreground", "accent": "secondary", "warning": "warning", "danger": "destructive"]
        var result: [String: String] = [:]
        appearance?.performAsCurrentDrawingAppearance {
            for (key, name) in roles {
                if let color = NSColor(named: name, bundle: TodoColors.bundle)?.usingColorSpace(.sRGB) {
                    result[key] = String(format: "#%02x%02x%02x", Int((color.redComponent * 255).rounded()), Int((color.greenComponent * 255).rounded()), Int((color.blueComponent * 255).rounded()))
                }
            }
        }
        return result
    }
    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let model: TodoModel
        var onReply: ((DependencyGraphReply) -> Void)?
        weak var web: WKWebView?
        var directory: URL?
        var loaded = false
        var render: DependencyGraphRender?
        private var lastSent: Data?
        init(model: TodoModel, onReply: ((DependencyGraphReply) -> Void)?) { self.model = model; self.onReply = onReply }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true; lastSent = nil; sendRender() }
        func sendRender() {
            guard loaded, let web, let render, let data = Self.encoded(render), data != lastSent,
                  let message = try? JSONSerialization.jsonObject(with: data) else { return }
            lastSent = data
            Task { @MainActor [weak self] in
                do {
                    _ = try await web.callAsyncJavaScript("window.todoGraph.receive(message)", arguments: ["message": message], in: nil, contentWorld: .page)
                } catch {
                    guard let self, self.isCurrent(render.identity) else { return }
                    self.model.dependencies.graph?.renderError = "The diagram could not be read. Use the Task list or Retry."
                }
            }
        }
        private static func encoded(_ render: DependencyGraphRender) -> Data? {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            return try? encoder.encode(render)
        }
        func isCurrent(_ identity: DependencyGraphIdentity) -> Bool {
            guard let graph = model.dependencies.graph else { return false }
            return model.signedIn && model.profile == identity.profile && model.discovery.credentialEpoch == identity.credentialEpoch && graph.root == identity.root && graph.request == identity.request
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "todoGraph", message.frameInfo.isMainFrame else { return }
            do {
                let data = try JSONSerialization.data(withJSONObject: message.body)
                struct Header: Decodable { let identity: DependencyGraphIdentity }
                guard let header = try? JSONDecoder().decode(Header.self, from: data), isCurrent(header.identity) else { return }
                let reply = try JSONDecoder().decode(DependencyGraphReply.self, from: data)
                guard let render, isCurrent(render.identity), reply.isCurrent(render.identity, knownIDs: model.dependencies.graph?.knownIDs ?? []) else { return }
                switch reply.event {
                case .ready: break
                case .rendered(let count): model.dependencies.graph?.renderedNodeCount = count; model.dependencies.graph?.renderError = nil
                case .renderError(let error): model.dependencies.graph?.renderError = error
                case .focus(let id): model.dependencies.graph?.focused = id
                case .viewport(let viewport): model.dependencies.graph?.viewport = viewport
                case .expand(let id): model.dependencies.graph?.expanded.insert(id)
                case .activate(let id):
                    guard let task = model.dependencies.graph?.report?.nodes.first(where: { $0.task.id == id })?.task else { return }
                    model.dependencies.graph?.selected = id
                    Task { if await model.navigate(.edit(task)) { model.closeDependencyGraph() } }
                case .context(let id):
                    guard let task = model.dependencies.graph?.report?.nodes.first(where: { $0.task.id == id })?.task else { return }
                    Task { await model.openDependencyPicker(task) }
                }
                onReply?(reply)
            } catch {
                guard let render, isCurrent(render.identity) else { return }
                model.dependencies.graph?.renderError = "The diagram response is incompatible. Use the Task list or Retry."
            }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url, let directory, url.isFileURL else { decisionHandler(.cancel); return }
            let file = url.resolvingSymlinksInPath().standardizedFileURL.path
            decisionHandler(file.hasPrefix(directory.path + "/") ? .allow : .cancel)
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            guard let render, isCurrent(render.identity) else { return }
            model.dependencies.graph?.renderError = "The local diagram could not load. Use the Task list or Retry."
        }
    }
}
