#!/bin/sh
set -eu

usage() {
  printf '%s\n' 'Usage: install.sh [--install-dir <directory>]' \
    'Build and install todo and todo-server from this checkout.' \
    'Default directory: $HOME/.local/bin' \
    'Requires Bun, pnpm, and dependencies installed with pnpm install --frozen-lockfile.'
}

install_dir="$HOME/.local/bin"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --install-dir)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        echo '--install-dir requires a directory' >&2
        exit 2
      fi
      install_dir=$2
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$install_dir" in
  /*) ;;
  -*) echo 'Installation directory must not start with a dash' >&2; exit 2 ;;
  *) install_dir="$PWD/$install_dir" ;;
esac
for tool in pnpm bun; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Required command missing: $tool" >&2; exit 1; }
done

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
pnpm --filter @todo/cli --filter @todo/server build
mkdir -p "$install_dir"
install -m 755 apps/cli/dist/todo "$install_dir/todo"
install -m 755 apps/server/dist/todo-server "$install_dir/todo-server"
printf 'Installed: %s/todo\nInstalled: %s/todo-server\n' "$install_dir" "$install_dir"
