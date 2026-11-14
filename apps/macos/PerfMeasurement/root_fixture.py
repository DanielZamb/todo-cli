def decorate(source, root_window, climb=False):
    def replace_once(old, new):
        nonlocal source
        assert source.count(old) == 1, old
        source = source.replace(old, new, 1)

    replace_once('        var model: TodoModel!', '''        var model: TodoModel!
        let personalTaskCount = Int(env["MAC_PERF_PERSONAL_TASKS"] ?? "180")!
        let workTaskCount = Int(env["MAC_PERF_WORK_TASKS"] ?? "180")!
        let workTagCount = Int(env["MAC_PERF_WORK_TAGS"] ?? "70")!
        let workProjectCount = Int(env["MAC_PERF_WORK_PROJECTS"] ?? "12")!
        let completionTitle = (env["MAC_PERF_COMPLETE_TITLE"]?.isEmpty == false ? env["MAC_PERF_COMPLETE_TITLE"] : nil) ?? String(format: "Measurement Task %03d", personalTaskCount > 100 ? 100 : 72)
        let activeCompact = env["MAC_PERF_ACTIVE_LAYOUT"] == "compact"
        var diagnosticsWindow: NSWindow?
        defer {
            diagnosticsWindow?.contentViewController = nil
            diagnosticsWindow?.close()
        }
''')
    if not climb: replace_once('model.tasks.count == 180 } }', 'model.tasks.count == personalTaskCount } }')
    replace_once('model.tasks.count == 180 && model.tags.count == 70 && model.projects.count == 12', 'model.tasks.count == workTaskCount && model.tags.count == workTagCount && model.projects.count == workProjectCount')
    replace_once('$0.title == "Measurement Task 100"', '$0.title == completionTitle')
    replace_once('            let full = layout(false)', '''            let full = layout(false)
            let inactiveWindow = activeCompact ? windows.removeLast() : windows.removeFirst()
            inactiveWindow.contentViewController = nil
            inactiveWindow.contentView = nil
            inactiveWindow.close()''')
    replace_once('        try await step("stream-ready")', '''        if env["MAC_PERF_DIAGNOSTICS"] == "1" {
            try await step("open-diagnostics") {
                let controller = NSHostingController(rootView: DiagnosticsView(model: model, live: true))
                let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 900, height: 720), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
                window.isReleasedWhenClosed = false
                window.contentViewController = controller
                controller.view.frame = NSRect(x: 0, y: 0, width: 900, height: 720)
                controller.view.layoutSubtreeIfNeeded()
                diagnosticsWindow = window
                try await wait(seconds: 10) { model.diagnostics != nil || model.diagnosticsError != nil }
                try #require(model.diagnostics != nil, "Diagnostics failed: \\(String(describing: model.diagnosticsError))")
                try #require(!window.isVisible)
            }
        }
        try await step("stream-ready")''')
    replace_once('            for window in windows { window.contentView?.layoutSubtreeIfNeeded() }', '''            for window in windows { window.contentView?.layoutSubtreeIfNeeded() }
            diagnosticsWindow?.contentView?.layoutSubtreeIfNeeded()
            try #require(!NSApplication.shared.windows.contains { $0.isVisible }, "Headless windows must remain unordered")
            try #require(!NSApplication.shared.windows.contains { $0.attachedSheet != nil }, "Headless root must not present a sheet")''')
    if root_window:
        replace_once('            let busy = meter.finish()', '''            let busy = meter.finish()
            let toolbarItems = windows.map { $0.toolbar?.items.count ?? 0 }''')
        replace_once('"reconnects": (model?.reconnectCount ?? 0) - priorReconnects,', '"nativeToolbarItems": toolbarItems, "reconnects": (model?.reconnectCount ?? 0) - priorReconnects,')
        replace_once('''            let view = compact
                ? AnyView(TaskListView(model: model, compactMode: true).taskContent)
                : AnyView(HStack(spacing: 0) { TaskListView(model: model).sidebar.frame(width: 220); TaskListView(model: model).taskContent })
            let host = NSHostingView(rootView: view.frame(width: compact ? 393 : 1280, height: compact ? 426 : 820))''', '''            let controller = NSHostingController(rootView: RootView(model: model, compactMode: .constant(compact)).frame(width: compact ? 393 : 1280, height: compact ? 426 : 820))
            let host = controller.view''')
        replace_once('            window.contentView = host', '            window.contentViewController = controller')
        source = source.replace('for window in windows { window.close() }', 'for window in windows { window.contentViewController = nil; window.close() }')
        if not climb:
            begin = source.index('        try await step("open-task")')
            end = source.index('        model.editor = nil', begin)
            source = source[:begin] + '''        try await step("open-task") {
            model.beginEditing(model.tasks[0])
            try #require(model.editor != nil)
        }
        try await step("dependency-picker-unavailable") {}
        try await step("dependencies-view-unavailable") {}
''' + source[end:]
            replace_once('        model.editor = nil', '        try await step("close-task") { model.editor = nil }')
    return source
