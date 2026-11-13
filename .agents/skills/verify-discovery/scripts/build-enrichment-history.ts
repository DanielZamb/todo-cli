import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const [output, product] = process.argv.slice(2);
assert.ok(output);
if (product) assert.match(product, /^[0-9a-f]{40}$/);
const root = resolve(import.meta.dirname, "../../../..");
const patches: Array<{ path: string; before: string; after: string }> = [];
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
mkdirSync(dirname(resolve(output)), { recursive: true });
const hook = (name: string) =>
  `Reflect.get(globalThis, Symbol.for("todo.verify-discovery.enrichment-moment"))?.("${name}");`;
const result = await Bun.build({
  entrypoints: [resolve(import.meta.dirname, "enrichment-history.ts")],
  compile: { outfile: resolve(output) },
  plugins: [{
    name: "named-enrichment-expiry-moments",
    setup(build) {
      build.onLoad({ filter: /(?:packages\/domain\/src|apps\/server\/src)\/.*\.ts$/ }, (args) => {
        const path = relative(root, args.path);
        let contents = product
          ? execFileSync("git", ["show", `${product}:${path}`], { cwd: root, encoding: "utf8" })
          : readFileSync(args.path, "utf8");
        const before = digest(contents);
        if (path === "packages/domain/src/task-lookup-error.ts") {
          const marker = "  return authorizedTaskLookupError(";
          assert.equal(contents.split(marker).length, 2);
          contents = contents.replace(marker, `  ${hook("after-enrichment")}\n${marker}`);
        }
        if (path === "packages/domain/src/auth/auth.ts") {
          const start = contents.indexOf("  readonly mutate = <A>(");
          const marker = "        const result = Effect.runSyncExitWith(context)(";
          const point = contents.indexOf(marker, start);
          assert.ok(start > 0 && point > start);
          contents = contents.slice(0, point) + `        ${hook("during-write")}\n` + contents.slice(point);
          if (process.env.DISCOVERY_ENRICHMENT_MUTANT === "attribution") {
            const action = /action,(\s+time,\s+actor: error.actor)/g;
            assert.equal([...contents.matchAll(action)].length, 1);
            contents = contents.replace(action, 'action: action === "authenticate" ? "mutate" : action,$1');
          }
        }
        if (before !== digest(contents)) patches.push({ path, before, after: digest(contents) });
        return { loader: "ts", contents };
      });
    },
  }],
});
assert.ok(result.success, result.logs.map(String).join("\n"));
assert.equal(patches.length, 2);
writeFileSync(resolve(output) + ".source.json", JSON.stringify({ product: product ?? "worktree", mutant: process.env.DISCOVERY_ENRICHMENT_MUTANT ?? null, patches }, null, 2));
