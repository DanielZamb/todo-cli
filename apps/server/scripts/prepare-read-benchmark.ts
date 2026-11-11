import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const source = resolve(process.argv[2] ?? "");
const target = resolve(".scratch/server-reads/harness");
const fixtures = resolve(".scratch/server-reads/checkpoints");
mkdirSync(target, { recursive: true });
mkdirSync(fixtures, { recursive: true });
const scripts = join(source, ".agents/skills/verify-diagnostics/scripts");
for (const name of ["cold-path-fixture.ts", "cold-path-host.ts"]) {
  const text = readFileSync(join(scripts, name), "utf8").replaceAll(
    "../../../../packages/",
    "../../../packages/",
  );
  writeFileSync(join(target, name), text);
}
let driver = readFileSync(join(scripts, "cold-path.ts"), "utf8").replaceAll(
  "../../../../packages/",
  "../../../packages/",
);
const replace = (from: string, to: string) => {
  assert.equal(driver.split(from).length, 2, from);
  driver = driver.replace(from, to);
};
replace(
  "const mode = process.argv[2];",
  'const mode = process.argv[2]; assert.ok(mode === "ambient" || mode === "pilot");',
);
replace(
  'resolve(".scratch/bin/todo-server")',
  'resolve(".scratch/bin/read-timing-" + process.env.READ_CONTROL_VARIANT)',
);
const detailStart = driver.indexOf("    const detail = await fetch(");
const detailEnd = driver.indexOf("    let parallel:", detailStart);
assert.ok(detailStart > 0 && detailEnd > detailStart);
driver =
  driver.slice(0, detailStart) +
  "    const recorded = []; const snapshot = {};\n" +
  driver.slice(detailEnd);
replace(
  "    const result = {\n      fixture:",
  "    const result = {\n      variant: process.env.READ_CONTROL_VARIANT,\n      fixture:",
);
replace(
  "      successful++;",
  `      const history_decodes = Number(response.headers.get("x-control-history-decodes"));
      assert.ok(Number.isInteger(history_decodes));
      if (process.env.READ_CONTROL_VARIANT === "after") assert.equal(history_decodes, 0);
      else assert.ok(history_decodes >= f.ops);
      successful++;`,
);
replace(
  "        client_ms,\n        ...stages,",
  "        client_ms,\n        history_decodes,\n        ...stages,",
);
const loopStart = driver.indexOf(
  '        for (const pressure of mode === "pressure"',
);
const loopEnd = driver.indexOf(
  "          const result = await sample(",
  loopStart,
);
assert.ok(loopStart > 0 && loopEnd > loopStart);
driver =
  driver.slice(0, loopStart) +
  `        for (const variant of pair % 2 ? ["after", "before"] : ["before", "after"]) {
          const pressure = false;
          process.env.READ_CONTROL_VARIANT = variant;
` +
  driver.slice(loopEnd);
writeFileSync(join(target, "cold-path.ts"), driver);
const manifests = [];
for (const name of ["pilot", "empty", "rich-final"]) {
  const entries: { id: string; path: string }[] = JSON.parse(
    readFileSync(
      join(source, ".scratch/cold-path", name, "fixtures.json"),
      "utf8",
    ),
  );
  for (const entry of entries) {
    const path = join(fixtures, `${entry.id}.db`);
    copyFileSync(entry.path, path);
    manifests.push({ ...entry, path });
  }
}
writeFileSync(join(fixtures, "fixtures.json"), JSON.stringify(manifests));
process.stdout.write(
  `Prepared ${manifests.length} scratch checkpoints and the paired ambient adapter\n`,
);
