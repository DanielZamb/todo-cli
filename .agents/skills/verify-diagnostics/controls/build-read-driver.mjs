import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
const [variant, output] = process.argv.slice(2);
assert.ok((variant === "before" || variant === "after") && output);
const root = process.cwd(), result = await Bun.build({ entrypoints: [resolve(".agents/skills/verify-diagnostics/controls/read-driver.mjs")], target: "bun", compile: { outfile: resolve(output) }, plugins: [{ name: "paired-diagnostics", setup(build) {
  build.onLoad({ filter: /packages\/domain\/src\/.*\.ts$/ }, (args) => {
    const path = relative(root, args.path);
    let contents = variant === "before" ? execFileSync("git", ["show", "70b60e221f3b59fa5fb0a7aa8813b5dd624a64ae:" + path], { encoding: "utf8" }) : readFileSync(args.path, "utf8");
    if (path === "packages/domain/src/store/store.ts") {
      const marker = `  private transaction<A>(run: () => A): A {
    const result = this.db`;
      assert.ok(contents.includes(marker));
      contents = contents.replace(marker, `  private transaction<A>(run: () => A): A {
    const outer = this.db.inTransaction; let started = 0;
    const result = this.db`);
      const begin = "        const writing = this.writing;";
      assert.ok(contents.includes(begin));
      contents = contents.replace(begin, `        if (!outer) started = performance.now();
` + begin);
      const end = `      .immediate();
    if (!this.writing`;
      assert.ok(contents.includes(end));
      contents = contents.replace(end, `      .immediate();
    if (started) globalThis[Symbol.for("todo.diag-hold")]?.holds.push(performance.now() - started);
    if (!this.writing`);
    }
    return { contents, loader: "ts" };
  });
} }] });
assert.ok(result.success, result.logs.map(String).join(`
`));
