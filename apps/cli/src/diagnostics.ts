import { DiagnosticsSnapshot } from "@todo/domain";
import { CommandError } from "@todo/domain/commands";
import { encodeResponse } from "@todo/domain/presentation";
import { Effect, Schema } from "effect";

export const diagnosticsRead = (server: string, credential: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      let url: URL;
      try {
        url = new URL(server);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error();
      } catch {
        throw new CommandError(
          2,
          "invalid_args",
          "--server must be an HTTP or HTTPS URL without credentials, query or fragment",
        );
      }
      let response: Response;
      try {
        response = await fetch(new URL("/diagnostics", url), {
          signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
          headers: {
            Authorization: `Bearer ${credential}`,
            "X-Todo-Client": "cli",
          },
          cache: "no-store",
        });
      } catch {
        throw new CommandError(
          1,
          "server_unavailable",
          "Cannot read diagnostics; check --server and ensure todo-server is running",
        );
      }
      if (response.status === 401 || response.status === 403)
        throw new CommandError(
          3,
          "auth_required",
          "Diagnostics requires an active owner Session; run todo login --password-stdin for this server's database",
        );
      if (!response.ok)
        throw new CommandError(
          1,
          "server_error",
          "Diagnostics request failed; check the server and retry",
        );
      try {
        return Schema.decodeUnknownSync(DiagnosticsSnapshot)(
          await response.json(),
        );
      } catch {
        throw new CommandError(
          1,
          "invalid_response",
          "Server diagnostics did not match the published schema; use matching CLI and server versions",
        );
      }
    },
    catch: (error) =>
      error instanceof CommandError
        ? error
        : new CommandError(
            1,
            "runtime_error",
            "Diagnostics failed; check the server and retry",
          ),
  });

export const diagnosticsOutput = (
  snapshot: DiagnosticsSnapshot,
  format: "json" | "md" | "table",
  follow = false,
) => {
  const encoded = encodeResponse(DiagnosticsSnapshot, snapshot);
  if (follow) return `${JSON.stringify(JSON.parse(encoded))}\n`;
  if (format === "json") return encoded;
  return `# Diagnostics\n\nGenerated ${snapshot.generated_at}\n\nServer ${snapshot.runtime.version} · up ${Math.floor(snapshot.runtime.uptime_seconds)}s\nDatabase ${snapshot.storage.database_bytes} B · WAL ${snapshot.storage.wal_bytes} B · Snapshots ${snapshot.storage.snapshot_bytes} B\nOperations ${snapshot.operations.total} · accepted ${snapshot.operations.committed} · rejected ${snapshot.operations.rejected} · ${snapshot.operations.per_second.toFixed(2)}/s\nClients ${snapshot.clients.length} · Sessions ${snapshot.credentials.filter((credential) => credential.kind === "session").length} · Access Tokens ${snapshot.credentials.filter((credential) => credential.kind === "token").length}\nPending reminders ${snapshot.scheduler.pending_reminders} · next wake ${snapshot.scheduler.next_wake_at ?? "none"}\n\n${snapshot.storage.tables.map((table) => `- ${table.name}: ${table.count}`).join("\n")}\n\n${snapshot.latency.routes.map((route) => `- ${route.route}: ${route.count} requests · p50 ${route.p50_ms.toFixed(2)}ms · p95 ${route.p95_ms.toFixed(2)}ms · p99 ${route.p99_ms.toFixed(2)}ms`).join("\n")}\n\nUse --format json for all sections or todo top for live monitoring.\n`;
};
