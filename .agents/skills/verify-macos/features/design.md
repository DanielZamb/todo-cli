# Offscreen design proof

Run `./scripts/swift-slot.sh apps/macos/scripts/verify-design.py "$PWD/docs/evidence/w07/round-new"` with a
new evidence directory. This recipe is allowed during native HOLD. It compiles
Swift Testing targets without TodoApp or an app-hosted XCTest, compiles the
existing Color assets without signing, and captures fixture views at 2x in both
appearances. It never launches Todo.app.

The renderer sets the AppKit activation policy to prohibited before constructing
views. Its windows remain unordered. It uses hosting-view `cacheDisplay`, with
no screen capture, activation, Dock icon, menu bar or TCC request. A generated
client with an in-memory transport supplies fixture responses. Settings receives
notification text and managed-server status directly. SessionVault, EventStream,
UNUserNotificationCenter and launchctl never run.

The production NavigationSplitView and the fixture WorkspaceSnapshot both call
`TaskListView.sidebar` and `TaskListView.taskContent`. Those compile-time references
keep one implementation for the sidebar and task content. The fixture adds static
toolbar and tab chrome because unordered windows cannot capture native chrome.
That chrome is fixture-only. Liquid Glass and vibrancy are flat or approximate.
The real glass, keyboard, focus and native chrome checks remain supervised gaps.
The Conflict uses native radioGroup Pickers. Their radio outlines flatten in the
offscreen cache. The supervised checklist must check unselected, selected and
keyboard-operated Conflict choices in both appearances.

Require `result.json`, `manifest.json`, `accessibility.json`, all 278 PNGs and exit 0
in `commands.json`. The identifier check reads the W08 base a19f207 source and
accepts formatter-inserted whitespace around the existing string expressions.
Read the PNGs before claiming visual proof. PresentationTests checks literal row
priorities, all Tag names, dates and conflict picker mapping. The existing scratch
HTTP recipe in writes.md covers Project and Tag creation and recurrence behavior.

The captures include the 18 original screens plus dirty-navigation, Conflict
navigation and deletion-notice variants in light and dark. Another 14 captures
cover Compact mode at 393 × 426, including sign-in, tasks, offline, empty,
quick add, editor and Conflict. Confirmation content
uses the production message and action builders inside fixture-only chrome.

The recipe runs PresentationTests and WindowLayoutTests before rendering.
WindowLayoutTests hosts RootView in an unordered window, toggles its binding,
and checks the literal content size, top-left position and restored frame.
Starting compact and expanding also has an offscreen check. These tests do not
prove the native toolbar button or keyboard shortcut. See [Compact mode](compact.md).

W08 places the inspector outside NavigationSplitView, with its own automatic
toolbar item. The content toolbar keeps Add task. WorkspaceSnapshot draws
separate fixture toolbar sections on either side of the inspector divider.
These images cannot prove native toolbar placement. Inspect it after the user's
next signed build, along with opening, closing and reopening the inspector.

Quick add uses a standard rounded text field. Its native popover or MenuBarExtra
window supplies the glass and the system Reduce Transparency behavior. There is
no second glass effect around the content. The MenuBarExtra scene applies the
shared primary tint and the stored appearance, including its signed-out message.
Offscreen captures cannot prove that scene's native accent or material.

Unsaved navigation uses an alert. Save retains the default Return shortcut,
Discard is destructive, Cancel is cancel, and Conflict omits Save. Titles,
messages and identifiers remain unchanged. The navigation captures share those
production action and message builders, with fixture alert chrome. Native alert
button order, default focus, Return and Escape remain supervised checks.

U01 adds 26 metadata captures to the previous 38. The production Project and Tag
sheet content appears over both window sizes, including empty-name and offline
Add states. It also captures long row metadata and the menu-bar quick-add content.

F10 adds 24 Profile deletion PNGs. Profile deletion empty confirmation, refusal, failed refusal and
second-step views, including the singular Task case, render over full and Compact
content in both appearances.
The five new Profile deletion identifiers supplement the preserved expressions.
Run Swift build, test and verify commands under the shared lock required by the
current run's standing orders.

C10 adds 36 transfer captures. See [Move and copy](transfer.md) for their states.

U01 adds two Compact quick-add flow captures. At 393 pt, five chips occupy at most two rows; the receipt also measures chip and action targets. The full manifest now contains 178 PNGs.

U02 adds 14 Compact captures for the five planning views, error and Settings
entry. The integrated manifest has 220 images. `compact-layout.json` records
production geometry; the state helper retains `u02-formatting-http.json` and
checks the durable Version separately from the images.

Version guardrails add outdated-server and disabled planning Status captures in both layouts and appearances.
