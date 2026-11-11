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
      Layer.mergeAll(
        HttpRouter.add("GET", "/fixture-never", Effect.never),
        HttpRouter.add(
          "GET",
          "/fixture-defect",
          Effect.die(new Error("private fixture defect")),
        ),
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
    const controller = new AbortController();
    const requestId = "44444444-4444-4444-8444-444444444444";
    const aborted = fetch(base + "/fixture-never", {
      signal: controller.signal,
      headers: { "X-Todo-Request": requestId },
    }).catch(() => null);
    for (
      let attempt = 0;
      attempt < 100 &&
      !store.diagnostics.profiler
        .snapshot()
        .active.some((x) => x.request_id === requestId);
      attempt++
    )
      yield* Effect.sleep("10 millis");
    assert.ok(
      store.diagnostics.profiler
        .snapshot()
        .active.some((x) => x.request_id === requestId),
    );
    controller.abort();
    yield* Effect.promise(() => aborted);
    for (
      let attempt = 0;
      attempt < 100 &&
      !store.diagnostics.profiler
        .snapshot()
        .recent.some((x) => x.request_id === requestId && x.stage === "entry");
      attempt++
    )
      yield* Effect.sleep("10 millis");
    assert.equal(
      store.diagnostics.profiler
        .snapshot()
        .recent.find((x) => x.request_id === requestId && x.stage === "entry")
        ?.outcome,
      "cancelled",
    );
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
