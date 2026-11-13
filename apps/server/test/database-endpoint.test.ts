import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
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
    Effect.gen(function* () {
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
