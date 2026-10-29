# Todo app icon

`Todo.icon` is the Icon Composer document and the single source for both desktop
apps. Edit it in Icon Composer. Its `Assets/` hold the three SVG layers, each a
1024×1024 transparent canvas: back card, front card and check.

- The macOS app compiles it through Xcode (`ASSETCATALOG_COMPILER_APPICON_NAME = Todo`).
- The Electron build compiles it with `xcrun actool` into `Assets.car` and a
  fallback `Todo.icns` inside the bundle.

Keep the check a filled outline. Icon Composer closes open stroked paths and
draws a glass edge along the closing segment.
