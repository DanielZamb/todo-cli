import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { BatchEditRequest, batchEditTasks } from "../src/batch-edit.ts";
import { openStore, TaskCommands } from "../src/store/store.ts";
import { profile, work } from "./store-fixtures.ts";

it.effect(
  "batch edit previews without History or Version writes and applies matching Versions independently",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.now());
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-batch-edit-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const store = yield* Effect.acquireRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (value) => Effect.orDie(value.close()),
        );
        yield* store.putProfile(work);
        yield* store.auth.setupOwner("scratch batch passphrase");
        const session = yield* store.auth.signIn("scratch batch passphrase");
        const request = { credential: session.credential, profile };
        const commands = new TaskCommands(store);
        const a = yield* commands.create(request, { title: "First" });
        const b = yield* commands.create(request, { title: "Second" });
        if (a.outcome !== "committed" || b.outcome !== "committed")
          throw new Error("Fixture creation failed");
        const input = Schema.decodeUnknownSync(BatchEditRequest)({
          items: [
            { task_id: a.task.id, from_version: 1 },
            { task_id: b.task.id, from_version: 1 },
          ],
          changes: { priority: "P1" },
        });
        const before = yield* store.history();
        const preview = yield* batchEditTasks(store, request, {
          ...input,
          dry_run: true,
        });
        expect(preview.totals).toEqual({ updated: 2, rejected: 0 });
        expect(yield* store.history()).toEqual(before);
        expect(
          (yield* commands.list(request)).map((t) => t.row_version),
        ).toEqual([1, 1]);
        yield* commands.edit(
          { ...request, task_id: b.task.id },
          {
            from_version: b.task.row_version,
            changes: { title: "Competing edit" },
          },
        );
        const report = yield* batchEditTasks(store, request, input);
        expect(
          report.items.map((row) => [
            row.outcome,
            row.current_version,
            row.error?.code ?? null,
          ]),
        ).toEqual([
          ["updated", 2, null],
          ["rejected", 2, "occ_conflict"],
        ]);
        expect(
          (yield* commands.list(request))
            .map((t) => [t.title, t.priority, t.row_version])
            .sort(),
        ).toEqual([
          ["Competing edit", "P3", 2],
          ["First", "P1", 2],
        ]);
        const history = yield* store.history();
        const stale = yield* batchEditTasks(store, request, {
          ...input,
          dry_run: true,
        });
        expect(stale.totals).toEqual({ updated: 0, rejected: 2 });
        expect(yield* store.history()).toEqual(history);
        const matrix = yield* commands.create(request, {
          title: "Field matrix",
        });
        if (matrix.outcome !== "committed")
          throw new Error("Fixture creation failed");
        for (const changes of [
          { title: "Shared title" },
          { description: "Shared notes" },
          { priority: "P2" },
          { project_name: "Client Project" },
          { tag_names: ["deep focus", "ready"] },
          { due_at: { kind: "date", date: "2026-11-05" } },
          { scheduled_at: { kind: "date", date: "2026-11-04" } },
          { energy: 4 },
          { estimate_min: 25 },
        ]) {
          const current = yield* commands.get({
            ...request,
            task_id: matrix.task.id,
          });
          if (!current) throw new Error("Fixture Task disappeared");
          const batch = Schema.decodeUnknownSync(BatchEditRequest)({
            items: [{ task_id: current.id, from_version: current.row_version }],
            changes,
          });
          expect((yield* batchEditTasks(store, request, batch)).totals).toEqual(
            { updated: 1, rejected: 0 },
          );
        }
        const saved = yield* commands.get({
          ...request,
          task_id: matrix.task.id,
        });
        expect(
          saved && [
            saved.title,
            saved.description,
            saved.priority,
            saved.due_at,
            saved.scheduled_at,
            saved.energy,
            saved.estimate_min,
            saved.row_version,
          ],
        ).toEqual([
          "Shared title",
          "Shared notes",
          "P2",
          { kind: "date", date: "2026-11-05" },
          { kind: "date", date: "2026-11-04" },
          4,
          25,
          10,
        ]);
        const definitions = yield* store.auth.read(request);
        expect(definitions.projects.map((project) => project.name)).toEqual([
          "Client Project",
        ]);
        expect(definitions.tags.map((tag) => tag.name).sort()).toEqual([
          "deep focus",
          "ready",
        ]);
        const previewHistory = yield* store.history();
        const previewMetadata = Schema.decodeUnknownSync(BatchEditRequest)({
          items: [{ task_id: matrix.task.id, from_version: 10 }],
          changes: { project_name: "Preview only" },
          dry_run: true,
        });
        yield* batchEditTasks(store, request, previewMetadata);
        expect(yield* store.history()).toEqual(previewHistory);
        expect(
          (yield* store.auth.read(request)).projects.map(
            (project) => project.name,
          ),
        ).toEqual(["Client Project"]);
        const reader = yield* store.auth.issueToken({
          credential: session.credential,
          token: { name: "batch reader", profile, scope: "read-only" },
        });
        for (const dry_run of [true, false]) {
          const denial = yield* Effect.result(
            batchEditTasks(
              store,
              { ...request, credential: reader.credential },
              { ...previewMetadata, dry_run },
            ),
          );
          expect(denial._tag).toBe("Failure");
        }
        expect(
          (yield* commands.get({ ...request, task_id: matrix.task.id }))
            ?.row_version,
        ).toBe(10);
      }),
    ),
);

it("batch edit requires one shared field and unique Task ids", () => {
  const task_id = "11111111-1111-4111-8111-111111111111";
  const item = { task_id, from_version: 1 };
  expect(Schema.is(BatchEditRequest)({ items: [item], changes: {} })).toBe(
    false,
  );
  expect(
    Schema.is(BatchEditRequest)({
      items: [item],
      changes: { title: "A", priority: "P1" },
    }),
  ).toBe(false);
  expect(
    Schema.is(BatchEditRequest)({
      items: [item, item],
      changes: { priority: "P1" },
    }),
  ).toBe(false);
});
