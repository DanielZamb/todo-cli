import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { runDagCase } from "../scripts/dag-proof.ts";
import { proveDependencyCommands } from "../scripts/dependency-command-proof.ts";

it.effect(
  "runs authenticated edge, creation, Revert, Delete and batch commands",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-dag-command-test-"))),
      (directory) =>
        runDagCase(join(directory, "scratch.db"), proveDependencyCommands),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);
