# Terminal and desktop monitoring

## Sub-features

Snapshot JSON, NDJSON follow, live terminal panes, Electron and SwiftUI windows.

## How to get to it (user POV)

Use todo diagnostics for a snapshot, --format json for one object, and --follow
for one object per line. Use todo top in a TTY. Desktop Window menus open Diagnostics.

## Driving it with the compiled clients

Use a scratch Session and explicit scratch server URL. Capture the terminal
in a PTY, exercise Tab and p, resize and q, and assert terminal restoration.
Open Diagnostics through each desktop menu and shortcut. Capture both themes.
Use Live to pause or resume, or Command-Shift-L. Manual refresh appears only
while paused. Electron inherits the main window's appearance. At 393×426,
require four whole section summaries, 32px Electron targets and 28pt SwiftUI
targets. Only Errors starts expanded when populated. Tables show five whole
rows and Show all rather than clipping a sixth row. Human labels use Profile
names; JSON keeps ids. Sign-out clears metadata, including delayed replies.
SwiftUI runs headlessly with offscreen NSHostingView. Never launch Todo.app,
hosted XCTest, signed Electron, a Keychain flow, or an installer.

## Gotchas

The non-TTY top command falls back to diagnostics. Follow must emit only NDJSON.
Visual evidence and keyboard interaction need their own proof alongside HTTP.
Coordinator approval is required for visual L1.
