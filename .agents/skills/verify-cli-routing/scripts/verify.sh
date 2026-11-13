#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a new evidence directory' >&2; exit 2; }
mkdir -p "$evidence"
cd "$root"
{
  sh scripts/disk-guard.sh
  bun -e 'const s=require("node:fs").statfsSync("."); const gib=s.bavail*s.bsize/2**30; console.log(JSON.stringify({free_gib:gib,soft_floor_gib:30})); if(gib<30)process.exit(3)'
  bun .agents/skills/verify-cli/scripts/cache-binaries.ts
  cli=$(bun -e 'process.stdout.write(require("./.scratch/bin/build.json").cli)')
  server=$(bun -e 'process.stdout.write(require("./.scratch/bin/build.json").server)')
  cache=$(dirname "$cli")
  bun scripts/compile.ts apps/cli/scripts/routing-companion.ts "$cache/routing-companion"
  bun scripts/compile.ts apps/cli/scripts/verify-routing.ts "$cache/verify-routing"
  bun apps/cli/scripts/build-routing-guard.ts "$cache/guarded-todo"
  TODO_ROUTING_CACHE="$cache" bun -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const {spawnSync} = require("node:child_process");
    let count = 0;
    for (const name of fs.readdirSync(process.env.TODO_ROUTING_CACHE)) {
      if (!name.startsWith(".") || !name.endsWith(".bun-build")) continue;
      const file = path.join(process.env.TODO_ROUTING_CACHE, name);
      if (spawnSync("lsof", ["-t", "--", file]).stdout.length) continue;
      fs.unlinkSync(file); count++;
    }
    console.log(JSON.stringify({closed_compiler_temporaries_removed:count}));
  '
  "$cache/verify-routing" "$evidence" "$cli" "$server" "$cache/routing-companion" "$cache/guarded-todo"
} > "$evidence/commands.log" 2>&1
test -s "$evidence/result.json"
printf 'PASS; evidence survived cleanup: %s\n' "$evidence"
