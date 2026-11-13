import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "@effect/vitest";
import {
  proveRawHistory,
  rawHistoryScopes,
} from "../scripts/snapshot-raw-history-proof.ts";

for (const scope of rawHistoryScopes)
  for (const metadataOnly of [false, true]) {
    it(`repairs actual stored History and checkpoint bytes through ${scope}, metadata only ${metadataOnly}`, async () => {
      const directory = mkdtempSync(join(tmpdir(), "todo-raw-history-"));
      try {
        await proveRawHistory(directory, scope, metadataOnly);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
