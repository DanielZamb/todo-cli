import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunHttpServer } from "@effect/platform-bun";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import { diagnosticsMiddleware } from "../src/server.ts";

export const verifyHttpFailures = Effect.scoped(
  Effect.gen(function* () {
    const path = yield* Effect.acquireRelease(
      Effect.sync(() =>
        mkdtempSync(join(tmpdir(), "todo-diagnostics-errors-")),
      ),
      (path) =>
        Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    );
    const store = yield* Effect.acquireRelease(
      openStore({
        path: join(path, "scratch.db"),
        attachmentRoot: join(path, "attachments"),
      }),
      (store) => Effect.orDie(store.close()),
    );
    yield* store.auth.setupOwner("diagnostics failure fixture");
    const session = yield* store.auth.signIn("diagnostics failure fixture");
    const layer = HttpRouter.serve(
      HttpRouter.add(
        "GET",
        "/fixture-defect",
        Effect.die(new Error("private fixture defect")),
      ),
      { middleware: diagnosticsMiddleware(store.diagnostics) },
    ).pipe(
      Layer.provideMerge(
        BunHttpServer.layer({ hostname: "127.0.0.1", port: 0 }),
      ),
    );
    const context = yield* Layer.build(layer);
    const base = HttpServer.formatAddress(
      Context.get(context, HttpServer.HttpServer).address,
    );
    for (const [route, status] of [
      ["/unknown-private-path", 404],
      ["/fixture-defect", 500],
    ] satisfies Array<[string, number]>) {
      const response = yield* Effect.promise(() => fetch(base + route));
      assert.equal(response.status, status);
      yield* Effect.promise(() => response.arrayBuffer());
    }
    const snapshot = yield* store.diagnostics.read({
      credential: session.credential,
    });
    assert.deepEqual(
      snapshot.errors.map((e) => [e.code, e.route]),
      [
        ["internal_error", "GET unmatched"],
        ["not_found", "GET unmatched"],
      ],
    );
    assert.equal(snapshot.latency.routes[0]?.count, 2);
    assert.ok(!JSON.stringify(snapshot).includes("private fixture"));
    return {
      result: "PASS",
      statuses: [404, 500],
      errors: snapshot.errors.map((e) => e.code),
      latency_count: snapshot.latency.routes[0]?.count,
    };
  }),
);
if (import.meta.main) {
  const result = await Effect.runPromise(verifyHttpFailures);
  writeFileSync(
    process.argv[2] ?? "/dev/stdout",
    JSON.stringify(result, null, 2),
  );
}
