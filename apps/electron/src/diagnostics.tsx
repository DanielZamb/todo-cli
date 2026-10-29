import type { DiagnosticsSnapshot } from "@todo/domain";
import { diagnosticProfileName } from "@todo/domain/presentation";
import { Activity, Database, RefreshCw } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription } from "./components/ui/alert.tsx";
import { Button } from "./components/ui/button.tsx";
import { NativeSelect } from "./components/ui/native-select.tsx";
import "./diagnostics.css";

const Compact = createContext(false);
const bytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KiB`
      : `${(n / 1048576).toFixed(1)} MiB`;
const time = (s: string | null) =>
  s ? new Date(s).toLocaleTimeString() : "None";
const date = (s: string | null) =>
  s
    ? new Date(s).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "None";
function Sparkline({
  values,
  label,
}: {
  values: readonly number[];
  label: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <svg
      className="diagnostics-sparkline"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <path d="M0 28H100" className="spark-baseline" />
      <polyline
        points={
          values
            .map(
              (n, i) =>
                `${(i * 100) / Math.max(1, values.length - 1)},${28 - (n / max) * 24}`,
            )
            .join(" ") || "0,28 100,28"
        }
      />
    </svg>
  );
}
function Panel({
  title,
  summary,
  subtitle,
  children,
  className = "",
  initiallyOpen = false,
}: {
  title: string;
  summary: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  initiallyOpen?: boolean;
}) {
  const compact = useContext(Compact);
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <section className={`diagnostics-panel ${className}`} aria-label={title}>
      {compact ? (
        <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary data-section-summary>
            <strong>{title}</strong>
            <span>{summary}</span>
          </summary>
          <div className="diagnostics-section-content">{children}</div>
        </details>
      ) : (
        <>
          <header>
            <h2>{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </header>
          {children}
        </>
      )}
    </section>
  );
}
function WholeItems({
  items,
  limit = 5,
}: {
  items: ReactNode[];
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  return (
    <>
      <div className="diagnostics-list">
        {items.slice(0, all ? undefined : limit)}
      </div>
      {items.length > limit && (
        <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all (${items.length})`}
        </Button>
      )}
    </>
  );
}
function DiagnosticTable({
  headers,
  rows,
  numeric,
}: {
  headers: string[];
  rows: Array<readonly [string | number, ...ReactNode[]]>;
  numeric: number[];
}) {
  const [all, setAll] = useState(false);
  return (
    <>
      <div className="diagnostics-table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={numeric.includes(i) ? "numeric" : ""}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, all ? undefined : 5).map((row) => (
              <tr key={row[0]} data-diagnostic-row>
                {row.map((cell, i) => (
                  <td
                    key={headers[i]}
                    className={numeric.includes(i) ? "numeric" : ""}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 5 && (
        <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all (${rows.length})`}
        </Button>
      )}
    </>
  );
}
function Pair({ name, value }: { name: string; value: ReactNode }) {
  return (
    <div>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}
export function Diagnostics() {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState("");
  const [live, setLive] = useState(true);
  const liveRef = useRef(live);
  liveRef.current = live;
  const refresh = useRef(() => {});
  const [compact, setCompact] = useState(
    window.matchMedia("(max-width: 699px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 699px)");
    const resize = () => setCompact(media.matches);
    media.addEventListener("change", resize);
    const appearance = () =>
      document.documentElement.classList.toggle(
        "dark",
        localStorage.getItem("theme") === "dark",
      );
    appearance();
    window.addEventListener("storage", appearance);
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "l"
      ) {
        event.preventDefault();
        setLive((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      media.removeEventListener("change", resize);
      window.removeEventListener("storage", appearance);
      window.removeEventListener("keydown", shortcut);
    };
  }, []);
  useEffect(() => {
    let cancelled = false,
      epoch = 0,
      busy = false,
      signedOut = false,
      delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearAuthentication = () => {
      epoch++;
      signedOut = true;
      clearTimeout(timer);
      setSnapshot(null);
      setProfile("");
      setError("Sign in to Todo with an owner Session.");
    };
    const unsubscribe = window.desktop.subscribe((notice) => {
      if (notice._tag === "signedOut") clearAuthentication();
      if (notice._tag === "signedIn") {
        epoch++;
        signedOut = false;
        setError("");
        if (liveRef.current) void poll();
      }
    });
    const poll = async () => {
      if (busy || cancelled || signedOut) return;
      busy = true;
      clearTimeout(timer);
      const requestEpoch = epoch;
      try {
        const reply = await window.desktop.request({ _tag: "diagnostics" });
        if (cancelled || requestEpoch !== epoch) return;
        if (reply._tag === "signedOut") {
          clearAuthentication();
          return;
        }
        if (reply._tag !== "diagnostics")
          throw new Error(
            "Cannot read diagnostics; checking the server and owner Session.",
          );
        setSnapshot(reply.snapshot);
        setProfile((current) =>
          reply.snapshot.profiles.some((p) => p.id === current) ? current : "",
        );
        setError("");
        delay = 1000;
      } catch {
        if (!cancelled && requestEpoch === epoch) {
          setError("Server unavailable; retrying when live.");
          delay = Math.min(30000, delay * 2);
        }
      } finally {
        busy = false;
        if (!cancelled && !signedOut && liveRef.current)
          timer = setTimeout(() => void poll(), delay);
      }
    };
    refresh.current = () => {
      delay = 1000;
      void poll();
    };
    if (live) void poll();
    return () => {
      cancelled = true;
      epoch++;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [live]);
  const name = (id: string | null, fallback = "Owner") =>
    snapshot ? diagnosticProfileName(snapshot, id, fallback) : fallback;
  const operations =
    snapshot?.operations.recent.filter(
      (x) => !profile || x.profile === profile,
    ) ?? [];
  const clients =
    snapshot?.clients.filter((x) => !profile || x.profile === profile) ?? [];
  const entities =
    snapshot?.storage.entities.filter(
      (x) => !profile || x.profile === profile,
    ) ?? [];
  const credentials =
    snapshot?.credentials.filter(
      (x) => !profile || x.profile === null || x.profile === profile,
    ) ?? [];
  const p95 = Math.max(
    0,
    ...(snapshot?.latency.routes.map((r) => r.p95_ms) ?? []),
  );
  return (
    <Compact.Provider value={compact}>
      <main
        className={`diagnostics-page ${compact ? "diagnostics-compact" : ""}`}
      >
        <header className="diagnostics-heading">
          <div>
            <h1>
              <Activity size={23} />
              Diagnostics
            </h1>
            {!compact && (
              <p>
                {snapshot
                  ? `Todo ${snapshot.runtime.version} · uptime ${Math.floor(snapshot.runtime.uptime_seconds / 60)}m · ${bytes(snapshot.runtime.memory_bytes)} memory`
                  : "Server, database and connected clients"}
              </p>
            )}
          </div>
          <div className="diagnostics-controls">
            <NativeSelect
              aria-label="Diagnostics Profile"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
            >
              <option value="">All Profiles</option>
              {snapshot?.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="default"
              size="sm"
              aria-label="Live updates"
              aria-pressed={live}
              title="Pause or resume · Command-Shift-L"
              onClick={() => setLive(!live)}
            >
              {live ? "● Live" : "Paused"}
            </Button>
            {!live && (
              <Button
                variant="outline"
                size="icon"
                aria-label="Refresh diagnostics"
                onClick={() => refresh.current()}
              >
                <RefreshCw size={14} />
              </Button>
            )}
          </div>
        </header>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!snapshot && !error && <p role="status">Reading diagnostics…</p>}
        {snapshot && (
          <>
            <div className="diagnostics-metrics">
              <div>
                <span>Operations / second</span>
                <strong>{snapshot.operations.per_second.toFixed(2)}</strong>
                {!compact && (
                  <Sparkline
                    values={snapshot.operations.samples}
                    label="Operation throughput"
                  />
                )}
              </div>
              <div>
                <span>Database + WAL</span>
                <strong>
                  {bytes(
                    snapshot.storage.database_bytes +
                      snapshot.storage.wal_bytes,
                  )}
                </strong>
                {!compact && (
                  <small>{snapshot.storage.tables.length} tables</small>
                )}
              </div>
              <div>
                <span>SSE subscribers</span>
                <strong>{clients.length}</strong>
                {!compact && (
                  <small>{profile ? "Selected Profile" : "All Profiles"}</small>
                )}
              </div>
              <div>
                <span>Rejected attempts</span>
                <strong>{snapshot.operations.rejected}</strong>
                {!compact && (
                  <small>{snapshot.operations.total} operations total</small>
                )}
              </div>
            </div>
            <div className="diagnostics-grid">
              <Panel
                title="Latency"
                summary={`p95 ${p95.toFixed(1)} ms · ${snapshot.latency.routes.length} routes`}
                subtitle="Last 5 minutes · milliseconds"
                className="diagnostics-wide"
              >
                <Sparkline
                  values={snapshot.latency.samples}
                  label="Request latency"
                />
                <DiagnosticTable
                  headers={["Route", "Count", "p50", "p95", "p99"]}
                  numeric={[1, 2, 3, 4]}
                  rows={snapshot.latency.routes.map((r) => [
                    r.route,
                    r.count,
                    r.p50_ms.toFixed(2),
                    r.p95_ms.toFixed(2),
                    r.p99_ms.toFixed(2),
                  ])}
                />
              </Panel>
              <Panel
                title="Operations"
                summary={`${operations.length} recent · ${snapshot.operations.rejected} rejected`}
                subtitle="Latest 100 · metadata only"
                className="diagnostics-wide"
              >
                <DiagnosticTable
                  headers={["Seq", "Operation", "Profile", "Outcome", "Time"]}
                  numeric={[0, 4]}
                  rows={operations.map((o) => [
                    o.seq,
                    o.type,
                    name(o.profile),
                    <span
                      key={o.seq}
                      className={
                        o.outcome === "rejected"
                          ? "diagnostics-rejected"
                          : "diagnostics-accepted"
                      }
                    >
                      {o.outcome === "rejected" ? "Rejected" : "Accepted"}
                    </span>,
                    time(o.time),
                  ])}
                />
                {!operations.length && (
                  <p className="diagnostics-empty">
                    No operations in this Profile.
                  </p>
                )}
              </Panel>
              <Panel
                title="Errors"
                summary={`${snapshot.errors.length} recent`}
                initiallyOpen={snapshot.errors.length > 0}
                className="diagnostics-full"
              >
                <WholeItems
                  limit={compact ? 1 : 5}
                  items={snapshot.errors.map((e) => (
                    <div
                      key={e.id}
                      data-diagnostic-row
                      className="diagnostics-error-row"
                    >
                      <strong className="diagnostics-rejected">{e.code}</strong>
                      <code>{e.route}</code>
                      <small>{time(e.time)}</small>
                    </div>
                  ))}
                />
                {!snapshot.errors.length && (
                  <p className="diagnostics-empty">No recent errors.</p>
                )}
              </Panel>
              <Panel
                title="Storage"
                summary={`${bytes(snapshot.storage.database_bytes + snapshot.storage.wal_bytes)} · ${snapshot.storage.tables.length} tables`}
                subtitle="Records per table"
              >
                <dl className="diagnostics-pairs">
                  <Pair
                    name="Database"
                    value={bytes(snapshot.storage.database_bytes)}
                  />
                  <Pair name="WAL" value={bytes(snapshot.storage.wal_bytes)} />
                  <Pair
                    name="Attachments"
                    value={String(snapshot.storage.attachments)}
                  />
                  <Pair
                    name="Attachment store"
                    value={bytes(snapshot.storage.attachment_store_bytes)}
                  />
                  <Pair
                    name="Tasks with external ID"
                    value={String(snapshot.storage.external_id_tasks)}
                  />
                  <Pair
                    name="Snapshots"
                    value={bytes(snapshot.storage.snapshot_bytes)}
                  />
                  <Pair
                    name="Last Snapshot"
                    value={time(
                      snapshot.storage.last_snapshot?.created_at ?? null,
                    )}
                  />
                  <Pair
                    name="Restore generation"
                    value={snapshot.storage.restore_generation.slice(0, 8)}
                  />
                </dl>
                <details>
                  <summary>
                    <Database size={13} />
                    {snapshot.storage.tables.length} tables
                  </summary>
                  <dl className="diagnostics-pairs">
                    {snapshot.storage.tables.map((t) => (
                      <Pair key={t.name} name={t.name} value={t.count} />
                    ))}
                  </dl>
                </details>
              </Panel>
              <Panel
                title="Scheduler"
                summary={`${snapshot.scheduler.pending_reminders} pending reminders`}
              >
                <dl className="diagnostics-pairs">
                  <Pair
                    name="Pending reminders"
                    value={snapshot.scheduler.pending_reminders}
                  />
                  <Pair
                    name="Next wake"
                    value={date(snapshot.scheduler.next_wake_at)}
                  />
                  <Pair
                    name="Last ReminderFired"
                    value={time(
                      snapshot.scheduler.last_reminder_fired?.time ?? null,
                    )}
                  />
                </dl>
              </Panel>
              <Panel
                title="Clients"
                summary={`${clients.length} connected`}
                subtitle="Live SSE subscribers"
              >
                <WholeItems
                  items={clients.map((c) => (
                    <div key={c.id} data-diagnostic-row>
                      <strong>
                        {c.kind} · {name(c.profile)}
                      </strong>
                      <small>
                        Since {time(c.connected_since)} · event{" "}
                        {c.last_event_id ?? "none"}
                      </small>
                    </div>
                  ))}
                />
                {!clients.length && (
                  <p className="diagnostics-empty">No connected clients.</p>
                )}
              </Panel>
              <Panel
                title="Sessions"
                summary={`${credentials.length} active credentials`}
                subtitle="Sessions & Access Tokens"
              >
                <WholeItems
                  items={credentials.map((c) => (
                    <div key={c.id} data-diagnostic-row>
                      <strong>
                        {c.kind === "session" ? "Owner Session" : c.name} ·{" "}
                        {c.scope}
                      </strong>
                      <small>
                        {name(c.profile, "All Profiles")} · expires{" "}
                        {new Date(c.expires_at).toLocaleDateString()}
                      </small>
                      <small>
                        {c.last_used_at
                          ? `Last used ${time(c.last_used_at)}`
                          : "Never used"}
                      </small>
                    </div>
                  ))}
                />
              </Panel>
              <Panel
                title="Profiles"
                summary={`${entities.length} Profiles`}
                subtitle="Tasks, Projects, Tags, Series and Occurrences"
              >
                <WholeItems
                  items={entities.map((e) => (
                    <div key={e.profile} data-diagnostic-row>
                      <strong>{name(e.profile)}</strong>
                      <small>
                        {e.tasks} Tasks · {e.projects} Projects · {e.tags} Tags
                      </small>
                      <small>
                        {e.series} Series · {e.occurrences} Occurrences
                      </small>
                    </div>
                  ))}
                />
              </Panel>
            </div>
            <footer className="diagnostics-footer">
              <span>
                {error
                  ? "Disconnected"
                  : live
                    ? "Live · refreshes every second"
                    : "Paused"}{" "}
                · {time(snapshot.generated_at)}
              </span>
              {!compact && (
                <span>
                  Read only · latency and totals cover all Profiles · last use
                  covers this server process
                </span>
              )}
            </footer>
          </>
        )}
      </main>
    </Compact.Provider>
  );
}
