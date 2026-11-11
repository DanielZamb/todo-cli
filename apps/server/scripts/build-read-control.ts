import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const [variant, output] = process.argv.slice(2);
assert.ok((variant === "before" || variant === "after") && output);
const root = resolve(import.meta.dirname, "../../..");
const counter = 'globalThis[Symbol.for("todo.read-control.decodes")]';
const result = await Bun.build({
  entrypoints: [resolve(import.meta.dirname, "read-control-server.ts")],
  target: "bun",
  compile: { outfile: resolve(output) },
  define: { TODO_BUILD_ID: '"e69230f9"' },
  plugins: [
    {
      name: "read-control-observer",
      setup(build) {
        build.onLoad(
          { filter: /(?:packages\/domain\/src|apps\/server\/src)\/.*\.ts$/ },
          (args) => {
            const path = relative(root, args.path);
            let contents =
              variant === "before"
                ? execFileSync(
                    "git",
                    [
                      "show",
                      `e69230f93ce0ea29e955c34c4610122c6f47cb5c:${path}`,
                    ],
                    { cwd: root, encoding: "utf8" },
                  )
                : readFileSync(args.path, "utf8");
            contents = contents.replaceAll(
              "event: JSON.parse(row.event)",
              `event: (${counter} = (${counter} ?? 0) + 1, JSON.parse(row.event))`,
            );
            if (path === "apps/server/src/server.ts") {
              contents = contents.replace(
                "const start = performance.now();",
                `const start = performance.now(); const decodes = ${counter} ?? 0;`,
              );
              const original =
                "diagnostics.request(route, end - start, response.status, end);\n        return Effect.succeed(response);";
              assert.ok(
                contents.includes(original),
                "Timing observer must match the reviewed middleware",
              );
              contents = contents.replace(
                original,
                `diagnostics.request(route, end - start, response.status, end);
            return Effect.succeed(HttpServerResponse.setHeaders(response, {
              "server-timing": "todo-handler;dur=" + (end - start),
              "x-todo-request": request.headers["x-todo-request"] ?? "",
              "x-control-history-decodes": String((${counter} ?? 0) - decodes),
            }));`,
              );
            }
            return { contents, loader: "ts" };
          },
        );
      },
    },
  ],
});
assert.ok(result.success, result.logs.map(String).join("\n"));
