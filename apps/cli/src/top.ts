import type { DiagnosticsSnapshot } from "@todo/domain";
import { diagnosticProfileName } from "@todo/domain/presentation";
import { Effect } from "effect";

const safe = (value: string) =>
  [...value]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || (code >= 127 && code <= 159) ? " " : character;
    })
    .join("");
const padLine = (text: string, width: number) => {
  const chars = [...safe(text)];
  return (
    chars.length > width
      ? `${chars.slice(0, Math.max(0, width - 1)).join("")}…`
      : chars.join("")
  ).padEnd(width);
};
const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1048576).toFixed(1)} MiB`;
const time = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString() : "none";
const stamp = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "none";
const spark = (values: readonly number[]) => {
  const scale = Math.max(1, ...values);
  return values.length
    ? values
        .map(
          (value) => "▁▂▃▄▅▆▇█"[Math.min(7, Math.floor((value / scale) * 7))],
        )
        .join("")
    : "Collecting samples…";
};
export type TopState = { pane: number; profile: string | null; offset: number };
export function topPanes(
  snapshot: DiagnosticsSnapshot,
  profile: string | null,
) {
  const name = (id: string | null, fallback = "Owner") =>
    diagnosticProfileName(snapshot, id, fallback);
  const operations = snapshot.operations.recent.filter(
    (operation) => profile === null || operation.profile === profile,
  );
  const clients = snapshot.clients.filter(
    (client) => profile === null || client.profile === profile,
  );
  const credentials = snapshot.credentials.filter(
    (credential) =>
      profile === null ||
      credential.profile === null ||
      credential.profile === profile,
  );
  const entities = snapshot.storage.entities.filter(
    (entity) => profile === null || entity.profile === profile,
  );
  return [
    {
      title: "Storage",
      lines: [
        `DB ${size(snapshot.storage.database_bytes)}   WAL ${size(snapshot.storage.wal_bytes)}`,
        `Snapshots ${size(snapshot.storage.snapshot_bytes)}   Last Snapshot: ${time(snapshot.storage.last_snapshot?.created_at ?? null)}`,
        `Attachments ${snapshot.storage.attachments}   Store ${size(snapshot.storage.attachment_store_bytes)}`,
        `Tasks with external ID ${snapshot.storage.external_id_tasks}`,
        ...snapshot.storage.tables.map(
          (table) => `${table.name.padEnd(22)} ${table.count}`,
        ),
      ],
    },
    {
      title: "Operations",
      lines: [
        `${snapshot.operations.per_second.toFixed(2)} ops/s · 60s window · ${snapshot.operations.rejected} rejected total`,
        spark(snapshot.operations.samples),
        ...operations.map(
          (operation) =>
            `${operation.outcome === "rejected" ? "REJECT" : "ACCEPT"} #${operation.seq} ${operation.type} · ${name(operation.profile)} · ${time(operation.time)}`,
        ),
      ],
    },
    {
      title: "Profiles & entities",
      lines: entities.length
        ? entities.flatMap((entity) => [
            name(entity.profile),
            `${entity.tasks} Tasks · ${entity.projects} Projects · ${entity.tags} Tags`,
            `${entity.series} Series · ${entity.occurrences} Occurrences`,
          ])
        : ["No Profiles"],
    },
    {
      title: "Latency",
      lines: [
        "Completed responses · last 5m · max 2048",
        spark(snapshot.latency.samples),
        ...snapshot.latency.routes
          .map((route) => `${route.route}  n=${route.count}`)
          .flatMap((route, index) => [
            route,
            `  p50 ${snapshot.latency.routes[index]?.p50_ms.toFixed(2)}  p95 ${snapshot.latency.routes[index]?.p95_ms.toFixed(2)}  p99 ${snapshot.latency.routes[index]?.p99_ms.toFixed(2)} ms`,
          ]),
      ],
    },
    {
      title: "Connected clients",
      lines: clients.length
        ? clients.flatMap((client) => [
            `${client.kind} · ${name(client.profile)} · #${client.id}`,
            `Since ${time(client.connected_since)} · last event ${client.last_event_id ?? "none"}`,
          ])
        : ["No SSE subscribers"],
    },
    {
      title: "Sessions & Access Tokens",
      lines: credentials.length
        ? credentials.flatMap((credential) => [
            `${credential.kind === "session" ? "Session" : credential.name} · ${credential.scope} · ${name(credential.profile, "All Profiles")}`,
            `Expires ${stamp(credential.expires_at)} · ${credential.last_used_at ? `last used ${time(credential.last_used_at)}` : "never used"}`,
          ])
        : ["No active credentials"],
    },
    {
      title: "Recent errors",
      lines: snapshot.errors.length
        ? snapshot.errors.flatMap((error) => [
            `${time(error.time)} · ${error.code}`,
            error.route,
          ])
        : ["No errors in the last 5 minutes"],
    },
    {
      title: "Scheduler",
      lines: [
        `${snapshot.scheduler.pending_reminders} pending reminders`,
        `Next wake ${stamp(snapshot.scheduler.next_wake_at)}`,
        `Last ReminderFired ${time(snapshot.scheduler.last_reminder_fired?.time ?? null)}`,
        "Read only · refresh every second",
        `Restore generation: ${snapshot.storage.restore_generation}`,
        "Timings and last use: this server process",
      ],
    },
  ];
}
export function renderTop(
  snapshot: DiagnosticsSnapshot | null,
  state: TopState,
  columns: number,
  rows: number,
  error = "",
  color = true,
) {
  const width = Math.max(1, columns);
  const height = Math.max(1, rows);
  if (width < 40 || height < 10)
    return `\x1b[H${padLine("q quit · resize to 40 × 10", width)}\x1b[J`;
  const accent = color ? "\x1b[32m" : "";
  const reset = color ? "\x1b[0m" : "";
  const lines = [
    padLine(
      `TODO / diagnostics    ${snapshot ? `v${snapshot.runtime.version} · up ${Math.floor(snapshot.runtime.uptime_seconds)}s · ${size(snapshot.runtime.memory_bytes)} RSS` : "Connecting…"}`,
      width,
    ),
    padLine(
      `Profile: ${state.profile === null ? "All Profiles" : (snapshot?.profiles.find((profile) => profile.id === state.profile)?.name ?? state.profile)}    ${error || (snapshot ? `Live · ${time(snapshot.generated_at)}` : "")}`,
      width,
    ),
  ];
  if (snapshot) {
    const panes = topPanes(snapshot, state.profile);
    const compact = width < 100 || height < 32;
    const selected = compact
      ? panes.filter((_, index) => index === state.pane)
      : panes;
    const paneWidth = compact ? width : Math.floor((width - 1) / 2);
    const paneHeight = compact ? height - 4 : Math.floor((height - 4) / 4);
    const box = (pane: (typeof panes)[number], focused: boolean) => {
      const heading = ` ${pane.title} `;
      const edge = focused ? "║" : "│";
      const horizontal = focused ? "═" : "─";
      const content = pane.lines.slice(
        focused ? state.offset : 0,
        (focused ? state.offset : 0) + paneHeight - 2,
      );
      return [
        `${focused ? accent : ""}${focused ? "╔" : "┌"}${padLine(heading, paneWidth - 2).replace(/ +$/, (spaces) => horizontal.repeat(spaces.length))}${focused ? "╗" : "┐"}${reset}`,
        ...Array.from(
          { length: paneHeight - 2 },
          (_, index) =>
            `${edge}${padLine(content[index] ?? "", paneWidth - 2)}${edge}`,
        ),
        `${focused ? "╚" : "└"}${horizontal.repeat(paneWidth - 2)}${focused ? "╝" : "┘"}`,
      ];
    };
    for (let index = 0; index < selected.length; index += compact ? 1 : 2) {
      const left = selected[index];
      if (!left) continue;
      const leftLines = box(left, compact || index === state.pane);
      const right = selected[index + 1];
      const rightLines =
        !compact && right ? box(right, index + 1 === state.pane) : [];
      lines.push(
        ...leftLines.map(
          (line, row) =>
            `${line}${rightLines[row] ? ` ${rightLines[row]}` : ""}`,
        ),
      );
    }
  } else lines.push(padLine(error || "Waiting for the server…", width));
  while (lines.length < height - 1) lines.push(" ".repeat(width));
  lines.push(
    padLine(
      "q Quit  ·  Tab Pane  ·  ↑↓ Scroll  ·  p Profile  |  Latency, errors and totals cover all Profiles",
      width,
    ),
  );
  return `\x1b[H${lines.slice(0, height).join("\r\n")}\x1b[J`;
}
export const runTop = <E>(
  read: Effect.Effect<DiagnosticsSnapshot, E>,
  color: boolean,
) =>
  Effect.tryPromise({
    try: (signal) =>
      new Promise<void>((resolve) => {
        const previousRaw = process.stdin.isRaw;
        let state: TopState = { pane: 0, profile: null, offset: 0 };
        let snapshot: DiagnosticsSnapshot | null = null;
        let error = "";
        let closed = false;
        let busy = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let delay = 1000;
        const controller = new AbortController();
        const render = () => {
          if (!closed)
            process.stdout.write(
              renderTop(
                snapshot,
                state,
                process.stdout.columns || 120,
                process.stdout.rows || 40,
                error,
                color,
              ),
            );
        };
        const cleanup = () => {
          if (closed) return;
          closed = true;
          clearTimeout(timer);
          controller.abort();
          process.stdin.off("data", key);
          process.stdout.off("resize", render);
          process.off("SIGINT", cleanup);
          process.off("SIGTERM", cleanup);
          signal.removeEventListener("abort", cleanup);
          process.stdin.setRawMode(previousRaw);
          process.stdin.pause();
          process.stdout.write("\x1b[0m\x1b[?25h\x1b[?1049l");
          resolve();
        };
        const key = (data: Buffer) => {
          const text = data.toString();
          if (text === "q" || text === "\x03" || text === "\x04")
            return cleanup();
          if (text === "\t")
            state = { ...state, pane: (state.pane + 1) % 8, offset: 0 };
          if (text === "\x1b[Z")
            state = { ...state, pane: (state.pane + 7) % 8, offset: 0 };
          if (text === "\x1b[B")
            state = {
              ...state,
              offset: Math.min(
                Math.max(
                  0,
                  (snapshot
                    ? (topPanes(snapshot, state.profile)[state.pane]?.lines
                        .length ?? 0)
                    : 0) - 1,
                ),
                state.offset + 1,
              ),
            };
          if (text === "\x1b[A")
            state = { ...state, offset: Math.max(0, state.offset - 1) };
          if (text === "p" && snapshot) {
            const profiles: Array<string | null> = [
              null,
              ...snapshot.profiles.map((profile) => profile.id),
            ];
            state = {
              ...state,
              profile:
                profiles[
                  (profiles.indexOf(state.profile) + 1) % profiles.length
                ] ?? null,
              offset: 0,
            };
          }
          render();
        };
        const poll = async () => {
          if (closed || busy) return;
          busy = true;
          try {
            snapshot = await Effect.runPromise(read, {
              signal: controller.signal,
            });
            if (
              state.profile &&
              !snapshot.profiles.some((p) => p.id === state.profile)
            )
              state = { ...state, profile: null, offset: 0 };
            error = "";
            delay = 1000;
          } catch {
            error = "Disconnected · check server and owner Session · retrying";
            delay = Math.min(30000, delay * 2);
          } finally {
            busy = false;
            render();
            if (!closed) timer = setTimeout(() => void poll(), delay);
          }
        };
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", key);
        process.stdout.on("resize", render);
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
        signal.addEventListener("abort", cleanup, { once: true });
        process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J");
        render();
        void poll();
      }),
    catch: () => new Error("Terminal monitoring failed"),
  });
