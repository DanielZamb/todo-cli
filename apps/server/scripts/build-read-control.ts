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
            if (
              variant === "after" &&
              process.env.READ_STREAM_MUTANT === "drop-reload" &&
              path === "apps/server/src/sse.ts"
            ) {
              const marker =
                /events.push\(\{\s+event: "reload",\s+data: \{\s+generation: current.generation,\s+seq: current.restore_seq,\s+\},\s+\}\);/g;
              assert.equal([...contents.matchAll(marker)].length, 1);
              contents = contents.replace(marker, "");
            }
            const wakeWait = "yield* wake.wait(state.wakeVersion);";
            if (
              variant === "after" &&
              path === "apps/server/src/sse.ts" &&
              contents.includes(wakeWait) &&
              process.env.READ_STREAM_WAKE_UNGATED !== "1"
            ) {
              // READ_CONTROL_POLL_GATE holds Clock.sleep, which held every
              // pass of the timer loop. The wake's signal path does not sleep,
              // so hold it at the same point: after the wait, before the pass
              // captures its wake version and takes its lease.
              assert.equal(contents.split(wakeWait).length, 2);
              contents = contents.replace(
                wakeWait,
                `${wakeWait}\n                yield* Effect.sleep("0 millis");`,
              );
            }
            if (
              variant === "after" &&
              process.env.READ_TERMINAL_MUTANT === "session-only" &&
              path === "packages/domain/src/auth/auth.ts"
            ) {
              const marker =
                "            info === undefined ||\n            info.profile !== null";
              assert.equal(contents.split(marker).length, 2);
              contents = contents.replace(
                marker,
                '            info?.kind !== "session"',
              );
            }
            if (
              variant === "after" &&
              process.env.READ_SCOPE_OBSERVER === "1"
            ) {
              if (path === "packages/domain/src/auth/auth.ts") {
                contents = contents.replace(
                  "    this.projection = new ClientProjection(db);",
                  `    const query = db.query.bind(db);
    Object.defineProperty(db, "query", { configurable: true, value: (sql, ...args) => {
      const observer = globalThis[Symbol.for("todo.read-control.scope")];
      if (observer) observer.statements.push(sql);
      return query(sql, ...args);
    }});
    this.projection = new ClientProjection(db);`,
                );
                const begin = "    return transaction(() => {";
                const end =
                  "    });\n  } catch (error) {\n    frame.failed = true;";
                assert.equal(contents.split(begin).length, 2);
                assert.equal(contents.split(end).length, 2);
                contents = contents.replace(
                  begin,
                  `    let start = 0;
    try { return transaction(() => { if (!nested) start = performance.now();`,
                );
                contents = contents.replace(
                  end,
                  `    }); }
    finally { if (start) globalThis[Symbol.for("todo.read-control.scope")]?.holds.push(performance.now() - start); }
  } catch (error) {
    frame.failed = true;`,
                );
              }
              if (path === "apps/server/src/server.ts")
                contents = contents.replace(
                  "const start = performance.now();",
                  `const start = performance.now(); globalThis[Symbol.for("todo.read-control.scope")] = { statements: [], holds: [] };`,
                );
            }
            if (
              variant === "after" &&
              process.env.READ_ABSENT_MUTANT &&
              path === "packages/domain/src/auth/auth.ts"
            ) {
              const marker =
                /if \(!absent\)\s+throw new StoreError\(new Error\("Invalid read authority"\)\);/;
              assert.ok(marker.test(contents));
              contents = contents.replace(
                marker,
                process.env.READ_ABSENT_MUTANT === "404"
                  ? 'throw new AuthError("profile_deleted", credential.id);'
                  : 'return operation(bindRead(this.db, Schema.decodeUnknownSync(ProfileId)("work"), request.credential, parsed, credential, this.presentProfile(Schema.decodeUnknownSync(ProfileId)("work"))));',
              );
            }
            if (
              process.env.READ_CONTROL_DETERMINISTIC_IDS === "1" &&
              path === "packages/domain/src/store/snapshots.ts"
            ) {
              assert.ok(contents.includes("randomUUID()"));
              contents = contents.replaceAll(
                "randomUUID()",
                `(globalThis[Symbol.for("todo.read-control.uuid")] = (globalThis[Symbol.for("todo.read-control.uuid")] ?? 0) + 1, "00000000-0000-4000-8000-" + String(globalThis[Symbol.for("todo.read-control.uuid")]).padStart(12, "0"))`,
              );
            }
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
              ...(${process.env.READ_SCOPE_OBSERVER === "1"} ? {
                "x-control-statements": JSON.stringify(globalThis[Symbol.for("todo.read-control.scope")]?.statements ?? []),
                "x-control-lock-holds": JSON.stringify(globalThis[Symbol.for("todo.read-control.scope")]?.holds ?? []),
              } : {}),
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
