import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "../.."),
  hook = resolve(import.meta.dirname, "observer.ts"),
  out = resolve(".scratch/sync-patches/bin");
mkdirSync(out, { recursive: true });
const plugin = {
  name: "experiment-only-transaction-hooks",
  setup(
    build: Parameters<
      NonNullable<Parameters<typeof Bun.build>[0]["plugins"]>[number]["setup"]
    >[0],
  ) {
    build.onLoad(
      { filter: /packages\/domain\/src\/store\/store\.ts$/ },
      (args) => {
        let s = readFileSync(args.path, "utf8");
        const a = "  private transaction<A>(run: () => A): A {",
          b = "            return run();",
          c = "    return result;\n  }\n\n  readonly close",
          d = "    } catch (error) {\n      this.db.close();";
        for (const t of [a, b, c, d]) assert.equal(s.split(t).length, 2, t);
        s = s
          .replace(
            a,
            a +
              "\n    let experimentFrame: ReturnType<typeof beginTransaction>;",
          )
          .replace(
            "          const writing = this.writing;",
            "          const writing = this.writing;\n          experimentFrame = writing ? undefined : beginTransaction(this);",
          )
          .replace(
            b,
            "            const experimentResult = run(); insideCommit(this, experimentFrame); return experimentResult;",
          )
          .replace(
            c,
            "    afterCommit(this, experimentFrame); return result;\n  }\n\n  readonly close",
          )
          .replace(d, "      maybeAttach(this);\n" + d);
        return {
          loader: "ts",
          contents:
            "import {beginTransaction,insideCommit,afterCommit,maybeAttach} from " +
            JSON.stringify(hook) +
            ";\n" +
            s,
        };
      },
    );
  },
};
const sources = spawnSync(
  "git",
  [
    "ls-files",
    "-co",
    "--exclude-standard",
    "packages/domain/src",
    "packages/api/src",
    "apps/cli/src",
    "experiments/sync-patches",
    "pnpm-lock.yaml",
  ],
  { encoding: "utf8" },
)
  .stdout.trim()
  .split("\n")
  .sort();
const hash = createHash("sha256");
for (const path of [...new Set(sources)])
  hash.update(path).update(readFileSync(resolve(root, path)));
const sourceHash = hash.digest("hex"),
  receiptPath = resolve(out, "build.json");
try {
  const previous = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (previous.sourceHash === sourceHash) {
    console.log("reusing", sourceHash);
    process.exit(0);
  }
} catch {}
const receipts = [];
for (const [name, entry, instrument] of [
  ["driver", "experiments/sync-patches/driver.ts", true],
  ["cli", "apps/cli/src/main.ts", true],
  ["writer", "experiments/sync-patches/writer.ts", true],
  ["wake", "experiments/sync-patches/wake.ts", false],
  ["transport", "experiments/sync-patches/transport.ts", true],
  ["codec", "experiments/sync-patches/codec.ts", false],
] as const) {
  const result = await Bun.build({
    entrypoints: [resolve(root, entry)],
    target: "bun",
    compile: { outfile: resolve(out, name) },
    define: { TODO_BUILD_ID: '"91855b8b"' },
    plugins: instrument ? [plugin] : [],
  });
  assert.ok(result.success, result.logs.map(String).join("\n"));
  receipts.push({
    name,
    sha256: createHash("sha256")
      .update(readFileSync(resolve(out, name)))
      .digest("hex"),
  });
}
writeFileSync(
  resolve(out, "build.json"),
  JSON.stringify({ sourceHash, receipts }, null, 2),
);
