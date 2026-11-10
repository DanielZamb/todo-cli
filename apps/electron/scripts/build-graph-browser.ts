import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Schema } from "effect";

const root = resolve(import.meta.dirname, "../../..");
const source = join(root, "apps/electron/graph-browser");
export const graphBrowserOutput = join(
  root,
  "apps/electron/dist/graph-browser",
);
const Lock = Schema.Struct({
  bun: Schema.String,
  pele: Schema.Literal("1.13.0"),
  files: Schema.Record(
    Schema.String,
    Schema.Struct({ sha256: Schema.String, bytes: Schema.Int }),
  ),
});
export async function buildGraphBrowser(updateLock = false) {
  const pele = JSON.parse(
    readFileSync(
      join(root, "apps/electron/node_modules/pele/package.json"),
      "utf8",
    ),
  );
  assert.equal(pele.version, "1.13.0", "Graph browser requires Pele 1.13.0");
  execFileSync("sh", [join(root, "scripts/disk-guard.sh")], {
    stdio: "inherit",
  });
  mkdirSync(graphBrowserOutput, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(source, "host.ts")],
    target: "browser",
    format: "iife",
    minify: true,
    naming: "graph.js",
    outdir: graphBrowserOutput,
  });
  assert.ok(result.success, result.logs.join("\n"));
  for (const name of ["index.html", "graph.css"])
    writeFileSync(
      join(graphBrowserOutput, name),
      readFileSync(join(source, name)),
    );
  writeFileSync(
    join(graphBrowserOutput, "THIRD-PARTY-NOTICES.txt"),
    readFileSync(join(root, "apps/electron/node_modules/pele/LICENSE")),
  );
  checkGraphBrowserOutput(updateLock);
  return graphBrowserOutput;
}

export function checkGraphBrowserOutput(updateLock = false) {
  const command = "bun apps/electron/scripts/build-graph-browser.ts";
  const files = Object.fromEntries(
    ["graph.js", "index.html", "graph.css", "THIRD-PARTY-NOTICES.txt"].map(
      (name) => {
        const bytes = readFileSync(join(graphBrowserOutput, name));
        return [
          name,
          {
            sha256: createHash("sha256").update(bytes).digest("hex"),
            bytes: bytes.length,
          },
        ];
      },
    ),
  );
  const lock = { bun: Bun.version, pele: "1.13.0", files };
  const path = join(source, "graph-browser.lock.json");
  if (updateLock) writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
  assert.ok(
    existsSync(path),
    `Missing graph browser lock. Run ${command} --update-lock after reviewing source.`,
  );
  const expected = Schema.decodeUnknownSync(Lock)(
    JSON.parse(readFileSync(path, "utf8")),
  );
  assert.deepEqual(
    lock,
    expected,
    `Graph browser output mismatch. Build with ${command}. Reviewed source changes require --update-lock.`,
  );
}
if (import.meta.main) {
  if (process.argv.includes("--check-only")) checkGraphBrowserOutput();
  else
    process.stdout.write(
      `${await buildGraphBrowser(process.argv.includes("--update-lock"))}\n`,
    );
}
