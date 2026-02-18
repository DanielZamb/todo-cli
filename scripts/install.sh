#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-zambamon/todo-cli}"
VERSION="${VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="${BINARY_NAME:-todo}"
FROM_LOCAL=""

usage() {
  cat <<USAGE
Usage: install.sh [options]

Options:
  --from-local <path>   Install from a local built binary (no network)
  --install-dir <dir>   Installation directory (default: \$HOME/.local/bin)
  --binary-name <name>  Installed binary name (default: todo)
  --repo <owner/repo>   GitHub repo for release downloads (default: $REPO)
  --version <tag>       Release tag (default: latest)
  -h, --help            Show this help

Examples:
  ./scripts/install.sh --from-local ./bin/todo
  VERSION=v0.1.0 ./scripts/install.sh --repo zambamon/todo-cli
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-local)
      FROM_LOCAL="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --binary-name)
      BINARY_NAME="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

mkdir -p "$INSTALL_DIR"
TARGET="$INSTALL_DIR/$BINARY_NAME"

if [[ -n "$FROM_LOCAL" ]]; then
  if [[ ! -f "$FROM_LOCAL" ]]; then
    echo "Local binary not found: $FROM_LOCAL" >&2
    exit 1
  fi
  cp "$FROM_LOCAL" "$TARGET"
else
  OS="$(uname | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)
      echo "Unsupported architecture: $ARCH" >&2
      exit 1
      ;;
  esac

  if [[ "$VERSION" == "latest" ]]; then
    URL="https://github.com/$REPO/releases/latest/download/todo-$OS-$ARCH"
  else
    URL="https://github.com/$REPO/releases/download/$VERSION/todo-$OS-$ARCH"
  fi

  echo "Downloading $URL"
  curl -fsSL "$URL" -o "$TARGET"
fi

chmod +x "$TARGET"

echo "Installed: $TARGET"
if command -v "$BINARY_NAME" >/dev/null 2>&1; then
  echo "'${BINARY_NAME}' is available in PATH."
else
  cat <<PATHMSG
\nAdd this to your shell config (~/.zshrc or ~/.bashrc):
  export PATH="$INSTALL_DIR:\$PATH"
Then open a new shell.
PATHMSG
fi

cat <<NEXT

Human onboarding:
  $TARGET --help-human-flag

Suggested first setup:
  $TARGET config set db.path "$HOME/.todo-cli/todo.db"
  $TARGET init --username <name> --password <password>
  $TARGET login --username <name>
NEXT
