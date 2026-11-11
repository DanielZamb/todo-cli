import type { DiagnosticsSnapshot } from "./diagnostics.ts";

export const diagnosticsBudgetBytes = 49152;
export const diagnosticsDetailBudgetBytes = 65536;
const encoder = new TextEncoder();
export const diagnosticEncodedBytes = (value: unknown) =>
  encoder.encode(JSON.stringify(value, null, 2)).length + 1;

export function boundDiagnostics(
  snapshot: DiagnosticsSnapshot,
): DiagnosticsSnapshot {
  const omitted: Record<string, number> = { ...snapshot.profiler?.omitted };
  let remaining = diagnosticsBudgetBytes - 8192;
  const select = <A>(
    key: string,
    items: readonly A[],
    quota: number,
    indent: number,
    limit = 64,
  ): A[] => {
    const accepted: A[] = [];
    let used = 32;
    for (const item of items.slice(0, limit)) {
      const text = JSON.stringify(item, null, 2);
      const cost =
        encoder.encode(text).length + indent * text.split("\n").length + 2;
      if (used + cost > quota || cost > remaining) continue;
      used += cost;
      remaining -= cost;
      accepted.push(item);
    }
    omitted[key] = (omitted[key] ?? 0) + items.length - accepted.length;
    return accepted;
  };
  const profiler = snapshot.profiler;
  const summary = profiler ? { ...profiler } : undefined;
  if (summary) delete summary.detail;
  const projected = summary
    ? {
        ...summary,
        stages: select("stages", summary.stages, 6144, 6),
        categories: select("categories", summary.categories, 16384, 6),
        slow: select("slow", summary.slow, 2048, 6, 8),
        omitted,
      }
    : undefined;
  const result = {
    ...snapshot,
    profiles: select("profiles", snapshot.profiles, 1024, 4),
    deleted_profiles: select(
      "deleted_profiles",
      snapshot.deleted_profiles,
      1024,
      4,
    ),
    storage: {
      ...snapshot.storage,
      tables: select("tables", snapshot.storage.tables, 2048, 6),
      entities: select("entities", snapshot.storage.entities, 2048, 6),
      last_snapshot:
        diagnosticEncodedBytes(snapshot.storage.last_snapshot) <= 512
          ? snapshot.storage.last_snapshot
          : null,
    },
    credentials: select("credentials", snapshot.credentials, 2048, 4),
    clients: select("clients", snapshot.clients, 2048, 4),
    operations: {
      ...snapshot.operations,
      recent: select("operations", snapshot.operations.recent, 2048, 6, 12),
      samples: select("throughput", snapshot.operations.samples, 1024, 6, 60),
    },
    errors: select("errors", snapshot.errors, 2048, 4, 12),
    latency: {
      ...snapshot.latency,
      routes: select("routes", snapshot.latency.routes, 4096, 6, 64),
      samples: select("latency", snapshot.latency.samples, 1024, 6, 60),
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
        profiler.detail.active,
        Math.min(4096, available / 8),
        8,
        4,
      ),
      recent: select(
        "detail.recent",
        profiler.detail.recent.slice(-48).reverse(),
        Math.min(32768, available * 0.625),
        8,
        32,
      ),
      deliveries: select(
        "detail.deliveries",
        profiler.detail.deliveries.slice(-32).reverse(),
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
