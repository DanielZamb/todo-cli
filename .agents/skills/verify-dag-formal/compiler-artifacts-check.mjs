import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { guardedCompiler } from "./compile-artifacts.mjs";
import { digest } from "./candidate-inputs.mjs";
const evidence = process.argv[2];
assert.ok(evidence);
const directory = join(evidence, "compiler-artifact-fixture");
mkdirSync(directory);
const output = join(directory, "driver"),
  source = join(directory, "driver.ts");
const preexisting = join(directory, ".preexisting.bun-build"),
  retired = join(directory, ".synthetic-owned.bun-build");
const foreign = join(directory, ".synthetic-ambiguous.bun-build"),
  linked = join(directory, ".synthetic-link.bun-build");
writeFileSync(source, 'console.log("compiler cleanup fixture");\n');
writeFileSync(preexisting, "preserved prior fixture");
const before = digest(readFileSync(preexisting));
const result = await guardedCompiler(
  async (options) => {
    const built = await Bun.build(options);
    assert.equal(built.success, true);
    copyFileSync(output, retired);
    writeFileSync(foreign, "ambiguous bytes retained");
    symlinkSync(output, linked);
    return built;
  },
  { evidence, label: "compiler-artifact-self-check" },
)({ entrypoints: [source], target: "bun", compile: { outfile: output } });
assert.equal(result.success, true);
assert.equal(existsSync(retired), false);
assert.equal(digest(readFileSync(preexisting)), before);
assert.equal(readFileSync(foreign, "utf8"), "ambiguous bytes retained");
assert.equal(existsSync(linked), true);
const runtime = join(
  dirname(fileURLToPath(import.meta.url)),
  "guarded-runtime.mjs",
);
for (const compile of [true, false]) {
  const cliOutput = join(directory, compile ? "cli-driver" : "bundle.js");
  const cli = spawnSync(
    process.execPath,
    [
      runtime,
      "build",
      ...(compile ? ["--compile"] : []),
      source,
      "--outfile",
      cliOutput,
    ],
    {
      env: {
        ...process.env,
        DAG_F_REAL_BUN: process.execPath,
        DAG_F_GUARD_EVIDENCE: evidence,
        DAG_F_WRAP_BUILDS: "1",
      },
      encoding: "utf8",
    },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(existsSync(cliOutput));
}
for (const receipt of readdirSync(evidence).filter((name) =>
  name.startsWith("compile-temporaries-nested-cli-compiler"),
)) {
  const record = JSON.parse(readFileSync(join(evidence, receipt), "utf8"));
  assert.ok(
    record.artifacts.every(
      (item) => item.action === "unlinked-own-new-compiler-temporary",
    ),
  );
}
writeFileSync(
  join(evidence, "compiler-artifacts-check.json"),
  JSON.stringify(
    {
      status: "pass",
      actualCompiler: true,
      retiredOwnNewCopy: true,
      priorUntouched: true,
      ambiguousUntouched: true,
      symlinkUntouched: true,
      outputSha256: digest(readFileSync(output)),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "PASS new compiler temporary retirement and protected prior/ambiguous/symlink fixtures",
);
