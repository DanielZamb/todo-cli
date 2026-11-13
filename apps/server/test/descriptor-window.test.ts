import {
  closeSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { openStore } from "@todo/domain/store";
import { Effect } from "effect";
import { vi } from "vitest";

// Integration of recordings with CLI routing (INTEG-CONTRACT): the recordings
// worker opens and closes its own files on another thread. When it closes a
// descriptor that was open before an evidence window and the window's open
// takes that number, the number is not new, yet it names a file opened inside
// the window. A descriptor's identity is fixed for the life of its open, so a
// number whose identity changed was opened in the window. These tests reuse a
// number deterministically, without threads: occupy the lowest free number with
// another file, take the before list, close it, and let the window's open take
// it. The negative controls must still refuse.

// The guard window sits inside databaseEndpoint. The hook closes the occupier
// immediately before the guard's connection opens, which is where a worker's
// close would land.
const hook = vi.hoisted((): { beforeGuardOpen: (() => void) | undefined } => ({
  beforeGuardOpen: undefined,
}));
vi.mock("bun:sqlite", async (importOriginal) => {
  const real = await importOriginal<typeof import("bun:sqlite")>();
  class Database extends real.Database {
    constructor(...args: ConstructorParameters<typeof real.Database>) {
      const [path] = args;
      if (
        typeof path === "string" &&
        path.includes(".todo-routing") &&
        hook.beforeGuardOpen
      ) {
        const run = hook.beforeGuardOpen;
        hook.beforeGuardOpen = undefined;
        run();
      }
      super(...args);
    }
  }
  return { ...real, Database };
});
const { databaseEndpoint } = await import("../src/database-endpoint.ts");

// Compare an open number with a path without opening the path: an extra open
// of the kept file inside the window would itself be evidence.
const names = (fd: number, path: string) => {
  const a = fstatSync(fd, { bigint: true });
  const b = statSync(path, { bigint: true });
  return a.dev === b.dev && a.ino === b.ino;
};
// Point the guard path at a different, private, empty file: the guard's
// connection then opens a file other than the kept lock descriptor's.
const replaceGuard = (directory: string) => {
  const registry = join(directory, ".todo-routing");
  const [guard] = readdirSync(registry).filter((name) =>
    name.endsWith(".sqlite"),
  );
  if (!guard) throw new Error("Missing guard file");
  renameSync(join(registry, guard), join(registry, `${guard}.moved`));
  writeFileSync(join(registry, guard), "", { mode: 0o600 });
};
const scratch = (name: string) => mkdtempSync(join(tmpdir(), `todo-${name}-`));
const seed = (path: string) =>
  Effect.gen(function* () {
    const store = yield* openStore({ path });
    yield* store.close();
  });

it.live(
  "store window: a reused number that now names the kept file is accepted",
  () =>
    Effect.gen(function* () {
      const directory = scratch("window-reuse");
      const path = join(directory, "scratch.db");
      yield* seed(path);
      const endpoint = databaseEndpoint(path);
      if (!endpoint) throw new Error("Missing endpoint");
      const occupier = openSync(join(directory, "occupier.bin"), "w");
      const before = endpoint.beforeStore();
      if (!before) throw new Error("Descriptor evidence unavailable");
      closeSync(occupier);
      const store = yield* openStore({ path });
      try {
        // Precondition: the store's main file took the occupier's number.
        expect(before.has(occupier)).toBe(true);
        expect(names(occupier, path)).toBe(true);
        expect(() => endpoint.verifyStore(before)).not.toThrow();
      } finally {
        yield* store.close();
        endpoint.close();
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);

it.live(
  "store window: a store on another file is refused, even on a reused number beside an unrelated new descriptor",
  () =>
    Effect.gen(function* () {
      const directory = scratch("window-other");
      const path = join(directory, "scratch.db");
      const other = join(directory, "other.db");
      yield* seed(path);
      yield* seed(other);
      const endpoint = databaseEndpoint(path);
      if (!endpoint) throw new Error("Missing endpoint");
      const occupier = openSync(join(directory, "occupier.bin"), "w");
      const before = endpoint.beforeStore();
      if (!before) throw new Error("Descriptor evidence unavailable");
      closeSync(occupier);
      const store = yield* openStore({ path: other });
      const unrelated = openSync(join(directory, "unrelated.bin"), "w");
      try {
        expect(names(occupier, other)).toBe(true);
        expect(() => endpoint.verifyStore(before)).toThrow(
          "SQLite store file differs from the kept database descriptor",
        );
      } finally {
        closeSync(unrelated);
        yield* store.close();
        endpoint.close();
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);

it.live(
  "store window: a number that named the database before the window and still does is not counted (swap-back)",
  () =>
    Effect.gen(function* () {
      const directory = scratch("window-held");
      const path = join(directory, "scratch.db");
      const other = join(directory, "other.db");
      yield* seed(path);
      yield* seed(other);
      const endpoint = databaseEndpoint(path);
      if (!endpoint) throw new Error("Missing endpoint");
      const held = openSync(path, "r");
      const before = endpoint.beforeStore();
      if (!before) throw new Error("Descriptor evidence unavailable");
      const store = yield* openStore({ path: other });
      try {
        expect(before.has(held)).toBe(true);
        expect(() => endpoint.verifyStore(before)).toThrow(
          "SQLite store file differs from the kept database descriptor",
        );
      } finally {
        closeSync(held);
        yield* store.close();
        endpoint.close();
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);

it.live(
  "guard window: a reused number that now names the guard file is accepted",
  () =>
    Effect.sync(() => {
      const directory = scratch("guard-reuse");
      const path = join(directory, "scratch.db");
      const occupier = openSync(join(directory, "occupier.bin"), "w");
      hook.beforeGuardOpen = () => closeSync(occupier);
      let endpoint: ReturnType<typeof databaseEndpoint>;
      try {
        endpoint = databaseEndpoint(path);
        expect(hook.beforeGuardOpen).toBeUndefined();
        expect(endpoint).toBeDefined();
      } finally {
        hook.beforeGuardOpen = undefined;
        endpoint?.close();
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);

it.live(
  "guard window: a guard connection on another file is refused, even on a reused number",
  () =>
    Effect.sync(() => {
      const directory = scratch("guard-other");
      const path = join(directory, "scratch.db");
      const occupier = openSync(join(directory, "occupier.bin"), "w");
      // The guard path is replaced by another file between the kept lock
      // descriptor and the guard's connection; the connection takes the
      // occupier's number but names a different file.
      hook.beforeGuardOpen = () => {
        closeSync(occupier);
        replaceGuard(directory);
      };
      try {
        expect(() => databaseEndpoint(path)).toThrow(
          "Server database binding or singleton guard unavailable",
        );
        expect(hook.beforeGuardOpen).toBeUndefined();
      } finally {
        hook.beforeGuardOpen = undefined;
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);

it.live(
  "guard window: a number that named the guard before the window and still does is not counted",
  () =>
    Effect.sync(() => {
      const directory = scratch("guard-held");
      const path = join(directory, "scratch.db");
      // The kept lock descriptor names the guard before the window and still
      // does; the guard's connection is pointed at another file, so only that
      // held number names the locked file after the window.
      hook.beforeGuardOpen = () => replaceGuard(directory);
      try {
        expect(() => databaseEndpoint(path)).toThrow(
          "Server database binding or singleton guard unavailable",
        );
      } finally {
        hook.beforeGuardOpen = undefined;
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);
