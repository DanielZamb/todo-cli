import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
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
