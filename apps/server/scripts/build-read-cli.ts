import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const [variant, output] = process.argv.slice(2);
assert.ok((variant === "before" || variant === "after") && output);
const root = resolve(import.meta.dirname, "../../..");
const result = await Bun.build({
  entrypoints: [resolve(import.meta.dirname, "read-control-cli.ts")],
  target: "bun",
  compile: { outfile: resolve(output) },
  define: { TODO_BUILD_ID: '"e69230f9"' },
  plugins: [
    {
      name: "immutable-read-cli-control",
      setup(build) {
        build.onLoad(
          { filter: /(?:packages\/domain\/src|apps\/cli\/src)\/.*\.ts$/ },
          (args) => ({
            loader: "ts",
            contents:
              variant === "before"
                ? execFileSync(
                    "git",
                    [
                      "show",
                      `e69230f93ce0ea29e955c34c4610122c6f47cb5c:${relative(root, args.path)}`,
                    ],
                    { cwd: root, encoding: "utf8" },
                  )
                : readFileSync(args.path, "utf8"),
          }),
        );
      },
    },
  ],
});
assert.ok(result.success, result.logs.map(String).join("\n"));
