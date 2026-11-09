import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const evidence = mkdtempSync(
  join(root, "docs/evidence/perf-cache/pair-floor-"),
);
const results = [];
for (const mode of ["before-start", "after-pair", "complete"]) {
  const directory = join(evidence, mode);
  const binaries = join(directory, "bin");
  mkdirSync(binaries, { recursive: true });
  writeFileSync(
    join(binaries, "bun"),
    `#!/bin/sh
if [ "$1" = -e ]; then printf '/fixture/oracle'; exit 0; fi
printf '%s\n' "$4" >> "$CACHE_FLOOR_FIXTURE/sides"
mkdir -p "$3"
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(binaries, "df"),
    `#!/bin/sh
count=0
if [ -e "$CACHE_FLOOR_FIXTURE/count" ]; then count=$(cat "$CACHE_FLOOR_FIXTURE/count"); fi
count=$((count + 1))
printf '%s\n' "$count" > "$CACHE_FLOOR_FIXTURE/count"
available=40000000
if [ "$CACHE_FLOOR_MODE" = before-start ] || { [ "$CACHE_FLOOR_MODE" = after-pair ] && [ "$count" -gt 1 ]; }; then available=28000000; fi
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\nfixture 50000000 10000000 %s 20%% /System/Volumes/Data\n' "$available"
`,
    { mode: 0o755 },
  );
  const output = join(directory, "result");
  const result = spawnSync(
    "sh",
    [
      join(import.meta.dirname, "measure-series.sh"),
      "fixture-before",
      "fixture-after",
      output,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: binaries + ":" + process.env.PATH,
        CACHE_FLOOR_FIXTURE: directory,
        CACHE_FLOOR_MODE: mode,
      },
      encoding: "utf8",
    },
  );
  writeFileSync(join(directory, "stdout"), result.stdout ?? "");
  writeFileSync(join(directory, "stderr"), result.stderr ?? "");
  const sides = existsSync(join(directory, "sides"))
    ? readFileSync(join(directory, "sides"), "utf8").trim().split("\n")
    : [];
  const checks = Number(readFileSync(join(directory, "count"), "utf8"));
  assert.equal(result.status, mode === "complete" ? 0 : 75);
  assert.deepEqual(
    sides,
    mode === "before-start"
      ? []
      : mode === "after-pair"
        ? ["before", "after"]
        : [
            "before",
            "after",
            "before",
            "after",
            "before",
            "after",
            "before",
            "after",
            "before",
            "after",
          ],
  );
  assert.equal(
    checks,
    mode === "before-start" ? 1 : mode === "after-pair" ? 2 : 6,
  );
  assert.equal(existsSync(join(output, "before-2.exit")), mode === "complete");
  if (mode !== "before-start")
    assert.equal(
      readFileSync(join(output, "last-complete-pair"), "utf8").trim(),
      mode === "complete" ? "5" : "1",
    );
  results.push({ mode, exit: result.status, sides, diskChecks: checks });
}
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify(
    {
      status: "PASS",
      results,
      scope:
        "Literal ordering proof of real shell series using fake measurement and df commands; no timing or server work",
    },
    null,
    2,
  ),
);
console.log(evidence);
