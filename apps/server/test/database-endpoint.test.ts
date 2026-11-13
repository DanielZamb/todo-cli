import {
  closeSync,
  existsSync,
  linkSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { endpointPath } from "@todo/domain/database-route";
import { openStore } from "@todo/domain/store";
import { Effect } from "effect";
import { databaseEndpoint } from "../src/database-endpoint.ts";

it.live(
  "unavailable descriptor evidence disables publication, proof and authorization",
  () =>
    Effect.sync(() => {
      const directory = mkdtempSync(
        join(tmpdir(), "todo-endpoint-unavailable-"),
      );
      const path = join(directory, "scratch.db");
      const endpoint = databaseEndpoint(path);
      if (!endpoint) throw new Error("Missing endpoint");
      try {
        endpoint.verifyStore(undefined);
        endpoint.publish(12345);
        expect(endpoint.proof("a".repeat(64))).toBeUndefined();
        expect(endpoint.authorize(undefined, undefined, "nudge")).toBe(false);
      } finally {
        endpoint.close();
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);
it.live(
  "the guard outlives store close and symlinked directories share it",
  () =>
    Effect.gen(function* () {
      const directory = mkdtempSync(join(tmpdir(), "todo-endpoint-lifetime-"));
      const path = join(directory, "scratch.db");
      const endpoint = databaseEndpoint(path);
      if (!endpoint) throw new Error("Missing endpoint");
      const before = endpoint.beforeStore();
      const store = yield* openStore({ path });
      try {
        endpoint.verifyStore(before);
        endpoint.publish(12345);
        const record = readFileSync(endpointPath(path), "utf8");
        yield* store.close();
        symlinkSync(directory, directory + "-alias");
        expect(() =>
          databaseEndpoint(join(directory + "-alias", "scratch.db")),
        ).toThrow();
        expect(readFileSync(endpointPath(path), "utf8")).toBe(record);
      } finally {
        endpoint.close();
        rmSync(directory + "-alias", { force: true });
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);
it.live("swap-back fails store verification against the kept descriptor", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "todo-endpoint-swap-"));
    const path = join(directory, "a.db"),
      other = join(directory, "b.db");
    const seed = yield* openStore({ path });
    yield* seed.close();
    const seedB = yield* openStore({ path: other });
    yield* seedB.close();
    const endpoint = databaseEndpoint(path);
    if (!endpoint) throw new Error("Missing endpoint");
    const before = endpoint.beforeStore();
    renameSync(path, path + ".original");
    symlinkSync(other, path);
    const store = yield* openStore({ path });
    unlinkSync(path);
    renameSync(path + ".original", path);
    try {
      expect(() => endpoint.verifyStore(before)).toThrow(
        "SQLite store file differs from the kept database descriptor",
      );
    } finally {
      yield* store.close();
      endpoint.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }),
);
it.live(
  "a multiply linked database serves without a guard and never routes",
  () =>
    Effect.gen(function* () {
      const directory = mkdtempSync(join(tmpdir(), "todo-endpoint-linked-"));
      const path = join(directory, "scratch.db");
      const seed = yield* openStore({ path });
      yield* seed.close();
      linkSync(path, join(directory, "backup-link.db"));
      const first = databaseEndpoint(path);
      const second = databaseEndpoint(path);
      if (!first || !second) throw new Error("Missing endpoint");
      try {
        const before = first.beforeStore();
        const store = yield* openStore({ path });
        first.verifyStore(before);
        yield* store.close();
        first.publish(12345);
        second.publish(12346);
        expect(existsSync(endpointPath(path))).toBe(false);
        expect(first.proof("a".repeat(64))).toBeUndefined();
        expect(second.proof("a".repeat(64))).toBeUndefined();
        expect(first.authorize(undefined, undefined, "nudge")).toBe(false);
        expect(existsSync(join(directory, ".todo-routing"))).toBe(false);
      } finally {
        first.close();
        second.close();
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);
// R1: verifyStore's evidence is a new descriptor on the kept file that appears
// while the store opens. It holds only while nothing else in the server process
// opens the database path in that window. These tests fail if serverLayer puts
// anything else in the window, or if the store acquisition itself leaves an
// extra descriptor on the database file.
it("serverLayer keeps the start-up evidence window to the store acquisition alone", () => {
  const source = readFileSync(
    new URL("../src/server.ts", import.meta.url),
    "utf8",
  );
  const start = "const beforeStore = endpoint?.beforeStore();";
  const end = "yield* Effect.sync(() => endpoint?.verifyStore(beforeStore));";
  expect(source.split(start)).toHaveLength(2);
  expect(source.split(end)).toHaveLength(2);
  const window = source
    .slice(source.indexOf(start) + start.length, source.indexOf(end))
    .replace(/\s+/g, " ")
    .trim();
  expect(window).toBe(
    "const store = yield* Effect.acquireRelease( openStore({ path: options.path }), (store) => Effect.orDie(store.close()), );",
  );
});
it.live(
  "store acquisition leaves exactly one new descriptor on the kept database file",
  () =>
    Effect.gen(function* () {
      const directory = mkdtempSync(join(tmpdir(), "todo-endpoint-window-"));
      const path = join(directory, "scratch.db");
      const endpoint = databaseEndpoint(path);
      if (!endpoint) throw new Error("Missing endpoint");
      const kept = statSync(path, { bigint: true });
      const onKeptFile = (map: ReturnType<typeof endpoint.beforeStore>) =>
        [...(map ?? new Map())]
          .filter(
            ([, id]) =>
              id.device === String(kept.dev) && id.inode === String(kept.ino),
          )
          .map(([fd]) => fd);
      const before = endpoint.beforeStore();
      if (!before) throw new Error("Descriptor evidence unavailable");
      const store = yield* openStore({ path });
      let extra: number | undefined;
      try {
        const opened = onKeptFile(endpoint.beforeStore()).filter(
          (fd) => !before.has(fd),
        );
        expect(opened).toHaveLength(1);
        endpoint.verifyStore(before);
        // Sensitivity: the witness from the seat's R1, one extra open of the
        // path in the window, is visible to this count.
        extra = openSync(path, "r");
        expect(
          onKeptFile(endpoint.beforeStore()).filter((fd) => !before.has(fd)),
        ).toHaveLength(2);
      } finally {
        if (extra !== undefined) closeSync(extra);
        yield* store.close();
        endpoint.close();
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);
