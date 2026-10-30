#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

label=com.todo-cli.server
domain="gui/$(id -u)"
agent="$HOME/Library/LaunchAgents/$label.plist"
server_dir="$HOME/Library/Application Support/Todo/Server"
database="$HOME/.todo-cli/todo.db"

if pgrep -f "/Applications/Todo.app/Contents/MacOS/Todo" >/dev/null ||
  pgrep -f "/Applications/Todo Electron.app/Contents/MacOS" >/dev/null; then
  echo "Quit Todo and Todo Electron first (⌘Q), then run this again." >&2
  exit 1
fi

if [ -f "$database" ]; then
  backups="$HOME/.todo-cli/backups"
  mkdir -p "$backups"
  chmod 700 "$backups"
  backup="$backups/todo-$(date +%Y%m%d-%H%M%S)-pre-upgrade.db"
  sqlite3 "$database" ".backup '$backup'"
  chmod 600 "$backup"
  [ "$(sqlite3 "$backup" 'PRAGMA integrity_check;')" = ok ]
  echo "Backed up $database to $backup."
fi

if launchctl print "$domain/$label" >/dev/null 2>&1; then
  launchctl bootout "$domain/$label"
  echo "Stopped the Todo server."
fi

./scripts/install.sh
./scripts/sign-and-install.sh

if [ -f "$agent" ]; then
  mkdir -p "$server_dir"
  install -m 755 /Applications/Todo.app/Contents/Resources/Server/todo-server "$server_dir/todo-server"
  launchctl bootstrap "$domain" "$agent"
  echo "Restarted the Todo server from $(git rev-parse --short HEAD)."
fi

"$HOME/.local/bin/todo-server" status
"$root/scripts/check-installed.sh" --require cli,server-bin --require-present
