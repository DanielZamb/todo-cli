import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

it.effect(
  "builds browser Task and auth imports from the shared package root",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-c02-browser-"))),
      (directory) =>
        Effect.sync(() => {
          const output = join(directory, "task.js");
          const result = spawnSync(
            "bun",
            [
              "build",
              "--target=browser",
              "test/fixtures/browser-task.ts",
              "--outfile",
              output,
            ],
            { cwd: new URL("../", import.meta.url), encoding: "utf8" },
          );
          expect({ status: result.status, error: result.stderr }).toEqual({
            status: 0,
            error: "",
          });
          expect(readFileSync(output, "utf8")).not.toContain("bun:sqlite");
        }),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);
