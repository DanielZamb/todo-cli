import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  DiagnosticCategory,
  DiagnosticFrameId,
  DiagnosticStage,
  DiagnosticStreamId,
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
  "keeps the newest slow failed observation instead of the oldest fast samples",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = mkdtempSync(
          join(tmpdir(), "todo-diagnostic-admission-"),
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
        yield* store.auth.setupOwner("admission fixture");
        const session = yield* store.auth.signIn("admission fixture");
        for (let i = 0; i < 59; i++)
          store.diagnostics.request(
            "GET /health",
            1.12345678901234 + i / 100,
            200,
          );
        store.diagnostics.request("GET /health", 10000.123456789011, 500);
        for (const detail of [false, true]) {
          const snapshot = yield* store.diagnostics.read({
            credential: session.credential,
            detail,
          });
          expect(snapshot.latency.samples[0]).toBe(10000.123456789011);
          expect(snapshot.latency.samples).not.toContain(1.12345678901234);
          expect(snapshot.latency.samples.slice(1)).toEqual(
            [...snapshot.latency.samples.slice(1)].sort((a, b) => b - a),
          );
          expect(snapshot.profiler?.omitted.latency).toBe(
            60 - snapshot.latency.samples.length,
          );
          expect(snapshot.profiler?.omitted["latency.important"]).toBe(0);
          expect(diagnosticEncodedBytes(snapshot)).toBeLessThanOrEqual(
            detail ? 65536 : 49152,
          );
        }
        store.diagnostics.request("GET /health", 19, 500);
        store.diagnostics.request("GET /health", 17, 403);
        for (let i = 0; i < 58; i++)
          store.diagnostics.request(
            "GET /health",
            2.12345678901234 + i / 100,
            200,
          );
        for (const detail of [false, true]) {
          const snapshot = yield* store.diagnostics.read({
            credential: session.credential,
            detail,
          });
          expect(snapshot.latency.samples.slice(-2)).toEqual([17, 19]);
          expect(snapshot.latency.samples).not.toContain(2.12345678901234);
          expect(snapshot.profiler?.omitted["latency.important"]).toBe(0);
          expect(diagnosticEncodedBytes(snapshot)).toBeLessThanOrEqual(
            detail ? 65536 : 49152,
          );
        }
        for (let i = 0; i < 60; i++)
          store.diagnostics.request("GET /health", 1000000000000000 + i, 200);
        for (const detail of [false, true]) {
          const snapshot = yield* store.diagnostics.read({
            credential: session.credential,
            detail,
          });
          expect(snapshot.latency.samples).toEqual(
            Array.from({ length: 41 }, (_, i) => 1000000000000059 - i),
          );
          expect(snapshot.latency.samples).not.toContain(1000000000000018);
          expect(snapshot.profiler?.omitted.latency).toBe(19);
          expect(snapshot.profiler?.omitted["latency.important"]).toBe(19);
          expect(diagnosticEncodedBytes(snapshot)).toBeLessThanOrEqual(
            detail ? 65536 : 49152,
          );
        }
      }),
    ),
);

it.live(
  "prioritizes failed and refused spans before trimming, and keeps newest active spans, labels and deliveries",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = mkdtempSync(
          join(tmpdir(), "todo-diagnostic-detail-admission-"),
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
        yield* store.auth.setupOwner("detail admission fixture");
        const session = yield* store.auth.signIn("detail admission fixture");
        const recorder = store.diagnostics.profiler;
        for (const outcome of ["failed", "refused"] as const) {
          const start = recorder.start(recorder.root({}), "handler");
          if (!start) throw new Error("Expected admitted start");
          recorder.end(start, outcome, start.monotonic_ms + 1);
        }
        for (let i = 0; i < 64; i++) {
          const start = recorder.start(recorder.root({}), "handler");
          if (!start) throw new Error("Expected admitted start");
          recorder.end(start, "completed", start.monotonic_ms);
        }
        const mixed = yield* store.diagnostics.read({
          credential: session.credential,
          detail: true,
        });
        expect(
          mixed.profiler?.detail?.recent.slice(-2).map((row) => row.outcome),
        ).toEqual(["refused", "failed"]);
        expect(mixed.profiler?.omitted["detail.recent.important"]).toBe(0);
        expect(mixed.profiler?.omitted["detail.recent"]).toBe(34);
        expect(diagnosticEncodedBytes(mixed)).toBeLessThanOrEqual(65536);
        for (let i = 0; i < 60; i++) {
          const start = recorder.start(
            { ...recorder.root({}), monotonic_ms: 0 },
            "entry",
          );
          if (!start) throw new Error("Expected admitted start");
          recorder.end(start, "completed", 1000 + i);
        }
        const active = Array.from({ length: 8 }, () =>
          recorder.start(recorder.root({}), "handler"),
        );
        const stream = Schema.decodeUnknownSync(DiagnosticStreamId)(
          "11111111-1111-4111-8111-111111111111",
        );
        const frame = Schema.decodeUnknownSync(DiagnosticFrameId)(
          "22222222-2222-4222-8222-222222222222",
        );
        for (let i = 0; i < 20; i++)
          recorder.delivery(
            recorder.root({}),
            stream,
            frame,
            recorder.commitReceipt(i, "admission"),
            "transport_handoff",
            i,
          );
        for (const detail of [false, true]) {
          const snapshot = yield* store.diagnostics.read({
            credential: session.credential,
            detail,
          });
          expect(snapshot.profiler?.slow.map((row) => row.duration_ms)).toEqual(
            [1059, 1058, 1057, 1056, 1055, 1054, 1053, 1052],
          );
          expect(snapshot.profiler?.omitted.slow).toBe(54);
          expect(snapshot.profiler?.omitted["slow.important"]).toBe(54);
          expect(diagnosticEncodedBytes(snapshot)).toBeLessThanOrEqual(
            detail ? 65536 : 49152,
          );
          if (detail) {
            const sample = snapshot.profiler?.detail;
            expect(sample?.recent.map((row) => row.duration_ms)).toEqual(
              Array.from({ length: 32 }, (_, i) => 1059 - i),
            );
            expect(snapshot.profiler?.omitted["detail.recent"]).toBe(94);
            expect(snapshot.profiler?.omitted["detail.recent.important"]).toBe(
              30,
            );
            expect(sample?.active.map((row) => row.span_id)).toEqual(
              active
                .slice(-4)
                .reverse()
                .map((row) => row?.span_id),
            );
            expect(snapshot.profiler?.omitted["detail.active"]).toBe(4);
            expect(snapshot.profiler?.omitted["detail.active.important"]).toBe(
              4,
            );
            expect(sample?.deliveries.map((row) => row.bytes)).toEqual([
              19, 18, 17, 16, 15, 14, 13, 12,
            ]);
            expect(snapshot.profiler?.omitted["detail.deliveries"]).toBe(12);
            expect(
              snapshot.profiler?.omitted["detail.deliveries.important"],
            ).toBe(0);
          }
        }
      }),
    ),
);

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
