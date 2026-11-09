import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Schema } from "effect";
import {
  discoveryManifest,
  inputDefault,
} from "../.agents/skills/verify-discovery-formal/inputs";
import { repositoryInput, verificationRoot } from "./verification-inputs";

const root = verificationRoot(import.meta.dirname);
const workflow = process.argv[2];
assert.ok(workflow === "discovery" || workflow === "task-search");
const base = join(root, `docs/evidence/${workflow}-formal`);
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "paths-"));
const candidate = process.argv[3];
const args =
  workflow === "discovery"
    ? [
        join(root, ".agents/skills/verify-discovery-formal/check-inputs.ts"),
        ...(candidate ? [candidate] : []),
      ]
    : [
        join(root, ".agents/skills/verify-task-search-formal/check.ts"),
        "--inputs-only",
      ];
const variable =
  workflow === "discovery"
    ? "TODO_DISCOVERY_INPUTS"
    : "TODO_TASK_SEARCH_TOOL_CACHE";
const clean = { ...process.env };
delete clean[variable];
const stages: unknown[] = [];
function run(
  label: string,
  value: string | undefined,
  expected: number,
  witness?: RegExp,
) {
  const result = spawnSync("bun", args, {
    cwd: root,
    env: { ...clean, ...(value === undefined ? {} : { [variable]: value }) },
    encoding: "utf8",
    timeout: 60_000,
  });
  writeFileSync(join(evidence, `${label}.stdout`), result.stdout ?? "");
  writeFileSync(join(evidence, `${label}.stderr`), result.stderr ?? "");
  stages.push({
    label,
    command: "bun",
    args,
    override: value,
    exit: result.status,
    signal: result.signal,
    error: result.error?.message,
  });
  assert.equal(result.status, expected, `${label}: inspect ${evidence}`);
  if (witness) assert.match(result.stderr, witness);
}
try {
  run("baseline", undefined, 0);
  run("absolute", tmpdir(), 1, /repo-relative input path/);
  run(
    "outside",
    "../outside-verification-input",
    1,
    /input must stay inside the repo/,
  );
  const link = join(evidence, "outside-link");
  symlinkSync(tmpdir(), link);
  try {
    run("symlink", relative(root, link), 1, /input symlink escapes the repo/);
  } finally {
    unlinkSync(link);
  }
  if (workflow === "discovery") {
    const manifest = Schema.decodeUnknownSync(discoveryManifest)(
      JSON.parse(
        readFileSync(
          repositoryInput(root, inputDefault, "fresh discovery inputs"),
          "utf8",
        ),
      ),
    );
    const broken = {
      ...manifest,
      receipts: manifest.receipts.map((receipt, index) =>
        index === 0 ? { ...receipt, path: tmpdir() } : receipt,
      ),
    };
    const path = join(evidence, "absolute-receipt.json");
    writeFileSync(path, JSON.stringify(broken));
    run(
      "absolute-required-receipt",
      relative(root, path),
      1,
      /repo-relative input path/,
    );
  }
  run("restored", undefined, 0);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ passed: true, workflow, stages }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, workflow, evidence }));
} catch (error) {
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { passed: false, workflow, stages, error: String(error) },
      null,
      2,
    ),
  );
  console.error(error);
  process.exitCode = 1;
}
