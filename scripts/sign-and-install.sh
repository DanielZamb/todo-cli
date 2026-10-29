#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if pgrep -f "/Applications/Todo.app/Contents/MacOS/Todo" >/dev/null ||
  pgrep -f "/Applications/Todo Electron.app/Contents/MacOS" >/dev/null; then
  echo "Quit Todo and Todo Electron first (⌘Q), then run this again." >&2
  exit 1
fi

make sign-desktop

for app in dist/signed.noindex/macos/Todo.app dist/signed.noindex/electron/Todo.app; do
  codesign --verify --deep --strict "$app"
done

rm -rf /Applications/Todo.app "/Applications/Todo Electron.app"
cp -R dist/signed.noindex/macos/Todo.app /Applications/
cp -R dist/signed.noindex/electron/Todo.app "/Applications/Todo Electron.app"

lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$lsregister" -f /Applications/Todo.app "/Applications/Todo Electron.app"

echo "Installed /Applications/Todo.app and /Applications/Todo Electron.app from $(git rev-parse --short HEAD)."
