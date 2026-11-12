import {
  type DiagnosticCandidate,
  importantDiagnosticDuration,
  rankDiagnosticItems,
} from "./diagnostic-admission.ts";
import type { DiagnosticsSnapshot } from "./diagnostics.ts";

export const diagnosticsBudgetBytes = 49152;
export const diagnosticsDetailBudgetBytes = 65536;
const encoder = new TextEncoder();
export const diagnosticEncodedBytes = (value: unknown) =>
  encoder.encode(JSON.stringify(value, null, 2)).length + 1;

export function boundDiagnostics(
  snapshot: DiagnosticsSnapshot,
  observations?: {
    readonly latency: readonly {
      readonly duration: number;
      readonly status: number;
    }[];
    readonly routes: ReadonlyMap<
      string,
      { readonly important: boolean; readonly order: number }
    >;
  },
): DiagnosticsSnapshot {
  const omitted: Record<string, number> = { ...snapshot.profiler?.omitted };
  let remaining = diagnosticsBudgetBytes - 8192;
  const select = <A>(
    key: string,
    items: readonly DiagnosticCandidate<A>[],
    quota: number,
    indent: number,
    limit = 64,
  ): A[] => {
    const accepted: DiagnosticCandidate<A>[] = [];
    let used = 32;
    for (const item of items) {
      if (accepted.length === limit) break;
      const text = JSON.stringify(item.value, null, 2);
      const cost =
        encoder.encode(text).length + indent * text.split("\n").length + 2;
      if (used + cost > quota || cost > remaining) break;
      used += cost;
      remaining -= cost;
      accepted.push(item);
    }
    omitted[key] = (omitted[key] ?? 0) + items.length - accepted.length;
    omitted[`${key}.important`] =
      (omitted[`${key}.important`] ?? 0) +
      items.filter((item) => item.important).length -
      accepted.filter((item) => item.important).length;
    return accepted.sort((a, b) => b.order - a.order).map((item) => item.value);
  };
  const inventory = <A>(items: readonly A[]) =>
    rankDiagnosticItems(
      items,
      () => false,
      (_, index) => -index,
    );
  const newest = <A>(items: readonly A[]) =>
    rankDiagnosticItems(
      items,
      () => false,
      (_, index) => index,
    );
  const spanSummary = (
    items: NonNullable<DiagnosticsSnapshot["profiler"]>["stages"],
  ) =>
    rankDiagnosticItems(
      items,
      (row) =>
        row.unfinished > 0 ||
        row.outcomes.slice(1).some((count) => count > 0) ||
        (row.p99_ms === null && row.finished > 0) ||
        (row.p99_ms ?? 0) >= 20,
      (_, index) => -index,
    );
  const profiler = snapshot.profiler;
  const summary = profiler ? { ...profiler } : undefined;
  if (summary) delete summary.detail;
  const projected = summary
    ? {
        ...summary,
        stages: select("stages", spanSummary(summary.stages), 8192, 6),
        categories: select(
          "categories",
          spanSummary(summary.categories),
          14336,
          6,
        ),
        slow: select(
          "slow",
          rankDiagnosticItems(
            summary.slow,
            () => true,
            (_, index) => index,
          ),
          2048,
          6,
          8,
        ),
        omitted,
      }
    : undefined;
  const result = {
    ...snapshot,
    profiles: select("profiles", inventory(snapshot.profiles), 1024, 4),
    deleted_profiles: select(
      "deleted_profiles",
      inventory(snapshot.deleted_profiles),
      1024,
      4,
    ),
    storage: {
      ...snapshot.storage,
      tables: select("tables", inventory(snapshot.storage.tables), 2048, 6),
      entities: select(
        "entities",
        inventory(snapshot.storage.entities),
        2048,
        6,
      ),
      last_snapshot:
        diagnosticEncodedBytes(snapshot.storage.last_snapshot) <= 512
          ? snapshot.storage.last_snapshot
          : null,
    },
    credentials: select(
      "credentials",
      rankDiagnosticItems(
        snapshot.credentials,
        () => false,
        (value) => Date.parse(value.last_used_at ?? value.created_at),
      ),
      2048,
      4,
    ),
    clients: select(
      "clients",
      rankDiagnosticItems(
        snapshot.clients,
        () => true,
        (value) => value.id,
      ),
      2048,
      4,
    ),
    operations: {
      ...snapshot.operations,
      recent: select(
        "operations",
        rankDiagnosticItems(
          snapshot.operations.recent,
          (value) => value.outcome === "rejected",
          (value) => value.seq,
        ),
        2048,
        6,
        12,
      ),
      samples: select(
        "throughput",
        newest(snapshot.operations.samples),
        1024,
        6,
        60,
      ),
    },
    errors: select(
      "errors",
      rankDiagnosticItems(
        snapshot.errors,
        () => true,
        (value) => value.id,
      ),
      2048,
      4,
      12,
    ),
    latency: {
      ...snapshot.latency,
      routes: select(
        "routes",
        rankDiagnosticItems(
          snapshot.latency.routes,
          (value) =>
            observations?.routes.get(value.route)?.important ??
            value.p99_ms >= 20,
          (value, index) =>
            observations?.routes.get(value.route)?.order ?? -index,
        ),
        4096,
        6,
        64,
      ),
      samples: select(
        "latency",
        rankDiagnosticItems(
          observations?.latency ??
            snapshot.latency.samples.map((duration) => ({
              duration,
              status: 200,
            })),
          (value) =>
            importantDiagnosticDuration(value.duration, value.status >= 400),
          (_, index) => index,
        ).map((item) => ({ ...item, value: item.value.duration })),
        1024,
        6,
        60,
      ),
    },
    scheduler: {
      ...snapshot.scheduler,
      last_reminder_fired:
        diagnosticEncodedBytes(snapshot.scheduler.last_reminder_fired) <= 512
          ? snapshot.scheduler.last_reminder_fired
          : null,
    },
    ...(projected
      ? {
          profiler: projected,
        }
      : {}),
  };
  if (profiler?.detail && result.profiler) {
    const available = Math.max(
      0,
      diagnosticsDetailBudgetBytes - diagnosticEncodedBytes(result) - 2048,
    );
    remaining = available;
    const detail = {
      ...profiler.detail,
      active: select(
        "detail.active",
        rankDiagnosticItems(
          profiler.detail.active,
          () => true,
          (value) => value.sequence,
        ),
        Math.min(4096, available / 8),
        8,
        4,
      ),
      recent: select(
        "detail.recent",
        rankDiagnosticItems(
          profiler.detail.recent,
          (value) =>
            importantDiagnosticDuration(
              value.duration_ms,
              value.outcome !== "completed",
            ),
          (value) => value.sequence,
        ),
        Math.min(32768, available * 0.625),
        8,
        32,
      ),
      deliveries: select(
        "detail.deliveries",
        rankDiagnosticItems(
          profiler.detail.deliveries,
          () => false,
          (value) => value.sequence,
        ),
        Math.min(8192, available / 4),
        8,
        16,
      ),
    };
    omitted["detail.recent"] =
      profiler.detail.total_recent - detail.recent.length;
    omitted["detail.deliveries"] =
      profiler.detail.total_deliveries - detail.deliveries.length;
    omitted["detail.active"] =
      profiler.detail.total_active - detail.active.length;
    return { ...result, profiler: { ...result.profiler, detail } };
  }
  return result;
}
