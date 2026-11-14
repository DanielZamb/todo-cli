import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeCompile, DiskStop } from "./compile-safety.mjs";

const skill = dirname(fileURLToPath(import.meta.url));
const root = resolve(skill, "../../..");
const evidence = mkdtempSync(join(process.argv[2], "nested-guard-"));
const realBun = realpathSync(process.execPath);
const json = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const fakeDirectory = join(evidence, "fake-bin");
mkdirSync(fakeDirectory);
writeFileSync(
  join(fakeDirectory, "bun"),
  '#!/bin/sh\nprintf "%s\\n" "$@" > "$DAG_F_PROBE_MARKER"\nprintf "FAKE_COMPILER_ENTERED\\n"\nexit 0\n',
  { mode: 0o700 },
);
const probe = join(evidence, "parent.mjs");
writeFileSync(
  probe,
  `import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
if(process.env.PROBE_STOP === "1") writeFileSync(process.env.DAG_F_DISK_STOP_FILE, JSON.stringify({stdout:"synthetic stop after preload initialization",exitCode:3}));
const args = JSON.parse(process.env.PROBE_ARGS);
const child=spawnSync("bun",args,{encoding:"utf8",env:process.env});
writeFileSync(process.env.PROBE_CHILD_RECEIPT,JSON.stringify({command:"bun",args,exit:child.status,stdout:child.stdout,stderr:child.stderr}));
if(process.env.PROBE_ASSERT === "1") assert.equal(child.status,0,"unchanged AtomicCAS-style parent expects child0");
process.exitCode=child.status??1;
`,
);
const results = [];
function run(
  label,
  {
    stopped = true,
    asserting = false,
    wrapped = true,
    direct = false,
    real = false,
  } = {},
) {
  const directory = join(evidence, label);
  mkdirSync(directory);
  const marker = join(directory, "entered.txt");
  const stop = join(directory, "stop.json");
  if (direct) json(stop, { stdout: "synthetic direct stop", exitCode: 3 });
  const compilerArgs = real
    ? [
        "--bun",
        join(root, "node_modules/typescript/bin/tsc"),
        "-p",
        join(evidence, "tsconfig.json"),
      ]
    : ["--bun", "node_modules/typescript/bin/tsc", "-p", "fake.json"];
  const args = direct
    ? compilerArgs
    : ["--preload", join(skill, "compile-preload.mjs"), probe];
  const env = {
    ...process.env,
    DAG_F_REAL_BUN: realBun,
    DAG_F_GUARD_EVIDENCE: directory,
    DAG_F_DISK_STOP_FILE: stop,
    DAG_F_PROBE_MARKER: marker,
    PROBE_CHILD_RECEIPT: join(directory, "child.json"),
    PROBE_STOP: stopped ? "1" : "0",
    PROBE_ASSERT: asserting ? "1" : "0",
    PROBE_ARGS: JSON.stringify(compilerArgs),
    PATH: real ? process.env.PATH : fakeDirectory + ":" + process.env.PATH,
  };
  beforeCompile({ evidence, label: label + "-launch" });
  const result = spawnSync(
    realBun,
    wrapped ? [join(skill, "guarded-runtime.mjs"), ...args] : args,
    { cwd: root, env, encoding: "utf8" },
  );
  const receipt = {
    label,
    command: realBun,
    args: wrapped ? [join(skill, "guarded-runtime.mjs"), ...args] : args,
    exit: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    entered: existsSync(marker),
    child: existsSync(join(directory, "child.json"))
      ? JSON.parse(readFileSync(join(directory, "child.json"), "utf8"))
      : null,
    runtime: readdirSync(directory)
      .filter((name) => name.startsWith("runtime-command-"))
      .map((name) => ({
        path: join(directory, name),
        ...JSON.parse(readFileSync(join(directory, name), "utf8")),
      })),
  };
  json(join(directory, "result.json"), receipt);
  results.push(receipt);
  return receipt;
}
try {
  for (const label of ["nested-forward", "nested-asserting", "direct-stop"]) {
    const result = run(label, {
      asserting: label === "nested-asserting",
      direct: label === "direct-stop",
    });
    assert.equal(result.exit, 3, label);
    assert.equal(result.entered, false, label);
    if (label !== "direct-stop") assert.equal(result.child.exit, 3);
    if (label === "nested-asserting")
      assert.ok(
        result.runtime.some(
          (row) => row.parentExit === 1 && row.effectiveExit === 3,
        ),
        "parent assertion1 must propagate outer3",
      );
  }
  const raw = run("raw-asserting-parent", { asserting: true, wrapped: false });
  assert.equal(raw.exit, 1);
  assert.equal(raw.child.exit, 3);
  assert.equal(raw.entered, false);
  writeFileSync(
    join(evidence, "valid.ts"),
    "const value: number = 7;\nvoid value;\n",
  );
  json(join(evidence, "tsconfig.json"), {
    compilerOptions: {
      strict: true,
      noEmit: true,
      types: [],
      target: "ES2022",
      skipLibCheck: true,
    },
    files: ["valid.ts"],
  });
  const positive = run("real-nested-tsc", {
    stopped: false,
    asserting: true,
    real: true,
  });
  assert.equal(positive.exit, 0);
  assert.equal(positive.child.exit, 0);
  const compile = positive.runtime.find((row) =>
    row.args.includes(join(root, "node_modules/typescript/bin/tsc")),
  );
  assert.ok(compile, "real nested tsc command must have a guard receipt");
  assert.equal(compile.parentExit, 0);
  assert.equal(compile.effectiveExit, 0);
  assert.equal(compile.guard.exitCode, 0);
  assert.ok(compile.guard.time <= compile.startedAt);
  assert.equal(compile.executable, realBun);
  assert.equal(
    JSON.parse(readFileSync(compile.guard.receiptPath, "utf8")).exitCode,
    0,
  );
  json(join(evidence, "summary.json"), {
    scope:
      "synthetic stop after preload; fake compiler only on refusals; separate real nested TypeScript positive",
    results,
    exit: 0,
  });
  console.log(
    JSON.stringify({ evidence, exit: 0, fakeStopCases: 4, realNestedTsc: 1 }),
  );
} catch (error) {
  json(join(evidence, "failure.json"), {
    message: String(error),
    stack: error.stack,
    results,
  });
  if (error instanceof DiskStop) {
    console.error(error.message);
    process.exit(3);
  }
  throw error;
}
