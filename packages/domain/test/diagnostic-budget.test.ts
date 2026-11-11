import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  DiagnosticCategory,
  DiagnosticStage,
} from "../src/client-diagnostics.ts";
import {
  diagnosticEncodedBytes,
  diagnosticsBudgetBytes,
  diagnosticsDetailBudgetBytes,
} from "../src/diagnostics.ts";
import { Profile } from "../src/entities.ts";
import { ProfileId } from "../src/ids.ts";
import { interactionCategories } from "../src/interaction-categories.ts";
import { openStore } from "../src/store/store.ts";

it.live(
  "bounds the complete encoded poll and opt-in detail after 10000 requests and high-cardinality metadata",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = mkdtempSync(
          join(tmpdir(), "todo-diagnostic-budget-"),
        );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() =>
            rmSync(directory, { recursive: true, force: true }),
          ),
        );
        const store = yield* Effect.acquireRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (store) => Effect.orDie(store.close()),
        );
        yield* store.auth.setupOwner("diagnostic budget fixture");
        const session = yield* store.auth.signIn("diagnostic budget fixture");
        for (let i = 0; i < 40; i++)
          yield* store.putProfile(
            Schema.decodeUnknownSync(Profile)({
              id: `${i}${"界".repeat(200)}`,
              name: "界".repeat(200),
              created_at: "2026-11-11T00:00:00Z",
              updated_at: "2026-11-11T00:00:00Z",
            }),
          );
        const profiler = store.diagnostics.profiler;
        const profile = Schema.decodeUnknownSync(ProfileId)("界".repeat(200));
        for (let i = 0; i < 10000; i++) {
          store.diagnostics.request(
            `GET /distinct/${i}/${"界".repeat(200)}`,
            i % 1000,
            i % 3 ? 200 : 500,
          );
          store.diagnostics.connect(profile, "unknown", String(i));
          const root = profiler.root({});
          const category =
            interactionCategories[i % interactionCategories.length];
          if (!category) throw new Error("Missing registered category");
          const envelope = {
            ...root,
            category: Schema.decodeUnknownSync(DiagnosticCategory)({
              inventory_id: category.id,
              subtype: category.subtypes[0],
            }),
          };
          const span = profiler.start(
            envelope,
            DiagnosticStage.literals[i % DiagnosticStage.literals.length] ??
              "handler",
          );
          profiler.end(span, i % 3 ? "completed" : "failed");
        }
        for (const detail of [false, true]) {
          const snapshot = yield* store.diagnostics.read({
            credential: session.credential,
            detail,
          });
          expect(diagnosticEncodedBytes(snapshot)).toBeLessThanOrEqual(
            detail ? diagnosticsDetailBudgetBytes : diagnosticsBudgetBytes,
          );
          expect(snapshot.profiler?.finished).toBe(10000);
          expect(
            snapshot.profiler?.histogram.counts.reduce((a, b) => a + b, 0),
          ).toBe(10000);
          expect(snapshot.profiler?.detail !== undefined).toBe(detail);
          const sample = snapshot.profiler?.detail;
          if (sample) {
            expect(sample.deliveries.length).toBeLessThanOrEqual(16);
            expect(sample.total_recent).toBe(2048);
            for (const row of [
              ...sample.active,
              ...sample.recent,
              ...sample.deliveries,
            ]) {
              expect("run_id" in row).toBe(false);
              expect("build_id" in row).toBe(false);
              expect("contract_id" in row).toBe(false);
            }
          }
          expect(snapshot.profiler?.omitted.clients).toBeGreaterThan(0);
          expect(snapshot.profiler?.omitted.routes).toBeGreaterThan(0);
          expect(
            snapshot.profiler?.stages.reduce(
              (total, row) => total + row.started,
              0,
            ),
          ).toBe(10000);
          expect(
            snapshot.profiler?.categories.reduce(
              (total, row) => total + row.started,
              0,
            ),
          ).toBe(10000);
        }
      }),
    ),
);
