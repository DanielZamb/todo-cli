#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
sh "$root/apps/electron/scripts/guarded-disk.sh"
export TODO_DAG_GUARD_ROOT="$root"
export TODO_DAG_REAL_BUN="${TODO_DAG_REAL_BUN:-$(command -v bun)}"
export TODO_DAG_REAL_PNPM="${TODO_DAG_REAL_PNPM:-$(command -v pnpm)}"
export TODO_DAG_REAL_NODE="${TODO_DAG_REAL_NODE:-$(command -v node)}"
export TODO_DAG_REAL_XCRUN="${TODO_DAG_REAL_XCRUN:-$(command -v xcrun)}"
for delegate in "$TODO_DAG_REAL_BUN" "$TODO_DAG_REAL_PNPM" "$TODO_DAG_REAL_NODE" "$TODO_DAG_REAL_XCRUN"; do
  case "$delegate" in /*) ;; *) echo 'Compiler delegates must be absolute executable paths' >&2; exit 2;; esac
  [ -x "$delegate" ] || exit 2
done
mkdir -p "$root/.scratch"
guards=$(mktemp -d "$root/.scratch/compiler-guards-XXXXXX")
runtime=""
trap 'rm -rf "$guards"; [ -z "$runtime" ] || rm -rf "$runtime"' EXIT HUP INT TERM
if [ "${TODO_DAG_RUNTIME_INSTALLED:-0}" != 1 ]; then
  runtime=$(mktemp -d /tmp/todo-dag-runtime-XXXXXX)
  ln -s "$root/apps/electron/scripts/guarded-runtime.cjs" "$runtime/preload.cjs"
  export BUN_OPTIONS="${BUN_OPTIONS:+$BUN_OPTIONS }--preload=$runtime/preload.cjs"
  export TODO_DAG_RUNTIME_INSTALLED=1
fi
for executable in bun pnpm node xcrun; do
  case "$executable" in
    bun) target=TODO_DAG_REAL_BUN;;
    pnpm) target=TODO_DAG_REAL_PNPM;;
    node) target=TODO_DAG_REAL_NODE;;
    xcrun) target=TODO_DAG_REAL_XCRUN;;
  esac
  cat > "$guards/$executable" <<'WRAPPER'
#!/bin/sh
sh "$TODO_DAG_GUARD_ROOT/apps/electron/scripts/guarded-disk.sh" || exit $?
WRAPPER
  printf 'exec "$%s" "$@"\n' "$target" >> "$guards/$executable"
  chmod +x "$guards/$executable"
done
export PATH="$guards:$PATH"
"$@"
