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

pnpm install --frozen-lockfile

restart_on_failure() {
  status=$?
  if [ "$status" -ne 0 ] && [ -f "$agent" ] &&
    ! launchctl print "$domain/$label" >/dev/null 2>&1; then
    launchctl bootstrap "$domain" "$agent" &&
      echo "Upgrade failed; restarted the previous Todo server." >&2
  fi
  exit "$status"
}

if launchctl print "$domain/$label" >/dev/null 2>&1; then
  trap restart_on_failure EXIT
  launchctl bootout "$domain/$label"
  echo "Stopped the Todo server."
fi

./scripts/install.sh
./scripts/sign-and-install.sh

if [ -f "$agent" ]; then
  mkdir -p "$server_dir"
  install -m 755 /Applications/Todo.app/Contents/Resources/Server/todo-server "$server_dir/todo-server"
  launchctl bootstrap "$domain" "$agent"
  port=$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:TODO_PORT' "$agent" 2>/dev/null || echo 4310)
  for _ in $(seq 1 50); do
    curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1 && break
    sleep 0.2
  done
  echo "Restarted the Todo server from $(git rev-parse --short HEAD)."
fi

"$HOME/.local/bin/todo-server" status
"$root/scripts/check-installed.sh" --require cli,server-bin --require-present
