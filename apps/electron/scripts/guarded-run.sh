#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
export TODO_DAG_GUARD_ROOT="$root"
export TODO_DAG_REAL_BUN=$(command -v bun)
export TODO_DAG_REAL_PNPM=$(command -v pnpm)
export TODO_DAG_REAL_NODE=$(command -v node)
export TODO_DAG_REAL_XCRUN=$(command -v xcrun)
mkdir -p "$root/.scratch"
guards=$(mktemp -d "$root/.scratch/compiler-guards-XXXXXX")
trap 'rm -rf "$guards"' EXIT HUP INT TERM
for executable in bun pnpm node xcrun; do
  case "$executable" in
    bun) target=TODO_DAG_REAL_BUN;;
    pnpm) target=TODO_DAG_REAL_PNPM;;
    node) target=TODO_DAG_REAL_NODE;;
    xcrun) target=TODO_DAG_REAL_XCRUN;;
  esac
  cat > "$guards/$executable" <<'WRAPPER'
#!/bin/sh
sh "$TODO_DAG_GUARD_ROOT/scripts/disk-guard.sh" || exit $?
WRAPPER
  printf 'exec "$%s" "$@"\n' "$target" >> "$guards/$executable"
  chmod +x "$guards/$executable"
done
export PATH="$guards:$PATH"
sh "$root/scripts/disk-guard.sh"
"$@"
