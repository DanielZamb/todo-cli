import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { runDagCase } from "../scripts/dag-proof.ts";
import { proveImportDependencies } from "../scripts/import-dependency-proof.ts";
import { parseImportText } from "../src/import.ts";

it.effect(
  "imports forward external-id Dependencies atomically with original report order",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-dag-import-test-"))),
      (directory) =>
        runDagCase(join(directory, "scratch.db"), (store) =>
          proveImportDependencies(
            store,
            parseImportText(
              readFileSync(
                new URL(
                  "./fixtures/import/dependencies-forward.json",
                  import.meta.url,
                ),
                "utf8",
              ),
            ),
          ),
        ),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);
