import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import {
  proveProjectionTagSets,
  proveTagLinks,
} from "../scripts/tag-link-proof.ts";

it(
  "keeps equal Tag sets without relinking and collapses duplicate ids while preserving payloads",
  proveProjectionTagSets,
);
it.effect(
  "preserves exact Task payloads and Tag links through edits, replay, rollback, Move, Delete and Revert",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-tag-proof-"))),
      (directory) => proveTagLinks(join(directory, "scratch.db")),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);
