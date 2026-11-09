import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
const skill = import.meta.dirname;
const root = resolve(skill, "../../../..");
mkdirSync(join(root, "docs/evidence/perf-cache"), { recursive: true });
const evidence = mkdtempSync(join(root, "docs/evidence/perf-cache/admission-"));
const pin = JSON.parse(readFileSync(join(skill, "tool.json"), "utf8"));
const jar = join(
  root,
  "docs/evidence/task-search-formal/tool-cache/tla2tools.jar",
);
assert.ok(
  existsSync(jar),
  "Run the existing pinned Task search formal helper to provision tla2tools",
);
const sha = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
assert.equal(sha(jar), pin.sha256);
const model = join(skill, "TaskSearchCacheAdmission.tla");
const mutants = [
  {
    name: "without-admission",
    flag: "BrokenAdmission",
    property: "NoInsertAfterEvict",
  },
  {
    name: "pending-after-eviction",
    flag: "BrokenEviction",
    property: "NoPendingLeak",
  },
  {
    name: "interrupt-leak",
    flag: "BrokenInterrupt",
    property: "NoPendingLeak",
  },
  {
    name: "insert-incomplete",
    flag: "BrokenIncomplete",
    property: "HitIsComplete",
  },
  {
    name: "without-generation",
    flag: "BrokenGeneration",
    property: "NoStaleReadRetention",
  },
  {
    name: "unconditional-cleanup",
    flag: "BrokenOwnCleanup",
    property: "OwnSlotCleanup",
  },
];
const flags = mutants.map((x) => x.flag);
const invariants = [
  "NoInsertAfterEvict",
  "NoStaleReadRetention",
  "NoPendingLeak",
  "CacheBound",
  "HitIsComplete",
  "OwnSlotCleanup",
];
const receipts = [];
const check = (name, oneProfile, mutant) => {
  const directory = join(evidence, name);
  mkdirSync(directory);
  copyFileSync(model, join(directory, "TaskSearchCacheAdmission.tla"));
  const config =
    [
      "SPECIFICATION Spec",
      "CHECK_DEADLOCK FALSE",
      "CONSTANTS",
      "Capacity = 2",
      `OneProfile = ${oneProfile ? "TRUE" : "FALSE"}`,
      ...flags.map((f) => `${f} = ${mutant?.flag === f ? "TRUE" : "FALSE"}`),
      "INVARIANTS",
      ...(mutant ? [mutant.property] : invariants),
    ].join("\n") + "\n";
  writeFileSync(join(directory, "model.cfg"), config);
  const args = [
    "-Xmx2g",
    "-XX:+UseSerialGC",
    "-Dtlc2.tool.fp.FPSet.impl=tlc2.tool.fp.MemFPSet1",
    "-cp",
    jar,
    "tlc2.TLC",
    "-workers",
    "1",
    "-fp",
    "17",
    "-seed",
    "1",
    "-config",
    "model.cfg",
    "TaskSearchCacheAdmission.tla",
  ];
  const result = spawnSync("java", args, {
    cwd: directory,
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(join(directory, "stdout"), result.stdout ?? "");
  writeFileSync(join(directory, "stderr"), result.stderr ?? "");
  const receipt = {
    name,
    oneProfile,
    mutant: mutant ?? null,
    args,
    exit: result.status,
    signal: result.signal,
  };
  receipts.push(receipt);
  writeFileSync(
    join(evidence, "commands.json"),
    JSON.stringify(receipts, null, 2),
  );
  assert.equal(result.status, mutant ? 12 : 0, `${name}: ${directory}`);
  if (mutant)
    assert.match(
      result.stdout,
      new RegExp(`Invariant ${mutant.property} is violated`),
    );
  else {
    assert.match(
      result.stdout,
      /Model checking completed\. No error has been found/,
    );
    assert.match(result.stdout, /0 states left on queue/);
  }
};
check("one-profile", true);
check("two-profiles", false);
for (const mutant of mutants) check(mutant.name, true, mutant);
check("restored", true);
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify(
    {
      status: "PASS",
      modelHash: sha(model),
      tool: pin,
      receipts,
      bounds: {
        keys: 2,
        preparations: 2,
        reads: 2,
        capacity: 2,
        generationColors: 4,
      },
      scope:
        "finite safety model, not source refinement; generation colors are never reused while referenced by an active read; no unbounded/RSS/liveness theorem",
    },
    null,
    2,
  ),
);
console.log(evidence);
