#!/usr/bin/env bun
// Writes docs/diagrams/todo.excalidraw: one editable scene with one frame per
// diagram. render.sh exports each frame to a PNG with `excalidraw render
// --frame-id`. Labels name real tables, columns, routes and pragmas. When the
// code changes, change the label here, not only in the PNG.
//
// Colors follow design/electron/TOKENS.md light roles. Sans text is Liberation
// Sans (fontFamily 9). Identifiers use Cascadia (fontFamily 3).

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const c = {
  ink: "#161D19",
  paper: "#F7F8F5",
  primary: "#285D46",
  onPrimary: "#FFFFFF",
  accent: "#E0EDE3",
  onAccent: "#244E37",
  secondary: "#E8EDE7",
  muted: "#EDF0EB",
  mutedFg: "#546359",
  card: "#FFFFFF",
  border: "#AEB8AE",
  warning: "#76550B",
  warningFill: "#F6E7C1",
  danger: "#8C2F24",
};

const SANS = 9;
const MONO = 3;
const LINE = 1.25;
const charWidth = (font) => (font === MONO ? 0.6 : 0.53);
const measure = (text, size, font) => {
  const lines = text.split("\n");
  return {
    width: Math.ceil(
      Math.max(...lines.map((l) => l.length)) * size * charWidth(font),
    ),
    height: Math.ceil(lines.length * size * LINE),
  };
};

let seed = 1;
const elements = [];
const byId = new Map();
let currentFrame = null;

const push = (element) => {
  elements.push(element);
  byId.set(element.id, element);
  return element;
};

const base = (id, type, extra) => ({
  id,
  type,
  angle: 0,
  strokeColor: c.ink,
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 1.5,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  groupIds: [],
  frameId: currentFrame,
  roundness: null,
  seed: seed++,
  version: 1,
  versionNonce: seed * 7919,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
  ...extra,
});

const bind = (target, ref) => {
  target.boundElements = [...(target.boundElements ?? []), ref];
};

// Free text. x,y is the top-left corner unless align is "center".
const text = (id, x, y, value, o = {}) => {
  const size = o.size ?? 16;
  const font = o.font ?? SANS;
  const m = measure(value, size, font);
  const left = o.align === "center" ? x - m.width / 2 : x;
  return push(
    base(id, "text", {
      x: left,
      y,
      width: m.width,
      height: m.height,
      strokeColor: o.color ?? c.ink,
      text: value,
      originalText: value,
      fontSize: size,
      fontFamily: font,
      textAlign: o.align ?? "left",
      verticalAlign: "top",
      containerId: o.containerId ?? null,
      autoResize: true,
      lineHeight: LINE,
      groupIds: o.groupIds ?? [],
    }),
  );
};

const rect = (id, x, y, w, h, o = {}) =>
  push(
    base(id, "rectangle", {
      x,
      y,
      width: w,
      height: h,
      backgroundColor: o.fill ?? "transparent",
      strokeColor: o.stroke ?? c.ink,
      strokeStyle: o.dashed ? "dashed" : "solid",
      strokeWidth: o.strokeWidth ?? 1.5,
      roundness: o.round === false ? null : { type: 3 },
      groupIds: o.groupIds ?? [],
    }),
  );

// A card: title in sans, body lines in mono, height from content.
// body is a string with \n, or an array of { t, font, color } blocks.
const PAD = 14;
const card = (id, x, y, w, o) => {
  const group = `${id}-group`;
  const titleSize = o.titleSize ?? 19;
  const bodySize = o.bodySize ?? 14;
  const blocks = (
    typeof o.body === "string" ? [{ t: o.body }] : (o.body ?? [])
  ).map((b) => ({ font: MONO, color: o.bodyColor ?? c.ink, ...b }));
  const titleH = Math.ceil(titleSize * LINE);
  const bodyH = blocks.reduce(
    (sum, b) => sum + measure(b.t, bodySize, b.font).height + 4,
    0,
  );
  const h = o.h ?? PAD + titleH + (blocks.length ? 8 + bodyH : 0) + PAD - 4;
  const box = rect(id, x, y, w, h, {
    fill: o.fill ?? c.card,
    stroke: o.stroke,
    dashed: o.dashed,
    strokeWidth: o.strokeWidth,
    groupIds: [group],
  });
  text(`${id}-title`, x + PAD, y + PAD, o.title, {
    size: titleSize,
    font: o.titleFont ?? SANS,
    color: o.titleColor ?? c.ink,
    groupIds: [group],
  });
  let cursor = y + PAD + titleH + 8;
  blocks.forEach((b, i) => {
    const el = text(`${id}-body${i}`, x + PAD, cursor, b.t, {
      size: bodySize,
      font: b.font,
      color: b.color,
      groupIds: [group],
    });
    if (el.width > w - PAD * 2)
      console.warn(`overflow: ${id} block ${i} ${el.width}px > ${w - PAD * 2}px`);
    cursor += el.height + 4;
  });
  return box;
};

// A labelled region, such as an OS process or a transaction.
const zone = (id, x, y, w, h, label, o = {}) => {
  const box = rect(id, x, y, w, h, {
    fill: o.fill ?? "transparent",
    stroke: o.stroke ?? c.mutedFg,
    dashed: o.dashed ?? true,
    strokeWidth: 1.5,
  });
  text(`${id}-label`, x + 14, y + 10, label, {
    size: o.size ?? 15,
    font: o.font ?? MONO,
    color: o.color ?? c.mutedFg,
  });
  return box;
};

// A numbered marker that the notes block explains.
const marker = (id, x, y, n) => {
  const group = `${id}-group`;
  push(
    base(id, "ellipse", {
      x,
      y,
      width: 30,
      height: 30,
      backgroundColor: c.primary,
      strokeColor: c.primary,
      groupIds: [group],
    }),
  );
  text(`${id}-n`, x + 15, y + 5, String(n), {
    size: 16,
    align: "center",
    color: c.onPrimary,
    groupIds: [group],
  });
};

const edge = (el, side, t = 0.5) => {
  const { x, y, width: w, height: h } = el;
  if (side === "top") return [x + w * t, y];
  if (side === "bottom") return [x + w * t, y + h];
  if (side === "left") return [x, y + h * t];
  return [x + w, y + h * t];
};

// Arrow bound to elements on both ends. via adds absolute bend points.
// label is bound to the arrow and placed where Excalidraw places it.
const arrow = (id, from, to, o = {}) => {
  const a = byId.get(from);
  const b = byId.get(to);
  const start = edge(a, o.from ?? "bottom", o.fromT);
  const end = edge(b, o.to ?? "top", o.toT);
  const abs = [start, ...(o.via ?? []), end];
  const points = abs.map(([px, py]) => [px - start[0], py - start[1]]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const color = o.color ?? c.ink;
  const el = push(
    base(id, "arrow", {
      x: start[0],
      y: start[1],
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      strokeColor: color,
      strokeStyle: o.dashed ? "dashed" : "solid",
      strokeWidth: o.strokeWidth ?? 1.5,
      points,
      lastCommittedPoint: null,
      startBinding: { elementId: from, focus: 0, gap: 4 },
      endBinding: { elementId: to, focus: 0, gap: 4 },
      startArrowhead: o.both ? "triangle" : null,
      endArrowhead: "triangle",
      elbowed: false,
    }),
  );
  bind(a, { type: "arrow", id });
  bind(b, { type: "arrow", id });
  if (o.label) {
    const n = abs.length;
    const mid =
      n % 2 === 1
        ? abs[(n - 1) / 2]
        : [
            (abs[n / 2 - 1][0] + abs[n / 2][0]) / 2,
            (abs[n / 2 - 1][1] + abs[n / 2][1]) / 2,
          ];
    const size = o.labelSize ?? 14;
    const font = o.labelFont ?? MONO;
    const m = measure(o.label, size, font);
    const t = text(`${id}-label`, mid[0] - m.width / 2, mid[1] - m.height / 2, o.label, {
      size,
      font,
      color: o.labelColor ?? color,
      containerId: id,
    });
    t.textAlign = "center";
    t.verticalAlign = "middle";
    bind(el, { type: "text", id: t.id });
  }
  return el;
};

// Plain line or arrow from absolute points, not bound. Used for sequence
// diagrams, where lifelines are not shapes.
const line = (id, pts, o = {}) => {
  const [x0, y0] = pts[0];
  const points = pts.map(([px, py]) => [px - x0, py - y0]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return push(
    base(id, o.arrow ? "arrow" : "line", {
      x: x0,
      y: y0,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      strokeColor: o.color ?? c.ink,
      strokeStyle: o.dashed ? "dashed" : "solid",
      strokeWidth: o.strokeWidth ?? 1.5,
      points,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: o.arrow ? "triangle" : null,
      elbowed: false,
      groupIds: o.groupIds ?? [],
    }),
  );
};

const notes = (id, x, y, w, title, items) => {
  text(`${id}-title`, x, y, title, { size: 18, color: c.ink });
  let cursor = y + 34;
  items.forEach((item, i) => {
    marker(`${id}-m${i}`, x, cursor - 4, i + 1);
    const t = text(`${id}-t${i}`, x + 44, cursor, item, { size: 16 });
    if (t.width > w - 44)
      console.warn(`overflow: ${id} note ${i + 1} ${t.width}px > ${w - 44}px`);
    cursor += t.height + 14;
  });
  return cursor;
};

// Frame height follows the content, so there is no empty band at the bottom.
const frame = (id, name, x, y, w, draw) => {
  currentFrame = id;
  draw(x, y);
  currentFrame = null;
  const h =
    Math.max(
      ...elements
        .filter((e) => e.frameId === id)
        .map((e) => e.y + e.height),
    ) -
    y +
    48;
  push(
    base(id, "frame", {
      x,
      y,
      width: w,
      height: h,
      name,
      strokeColor: "#bbb",
      backgroundColor: "transparent",
      roundness: null,
    }),
  );
};

const heading = (id, x, y, title, subtitle) => {
  text(`${id}-h`, x, y, title, { size: 28 });
  text(`${id}-s`, x, y + 42, subtitle, { size: 17, color: c.mutedFg });
};

// 1. Runtime ---------------------------------------------------------------

frame("runtime", "Runtime", 0, 0, 1900, (X, Y) => {
  heading(
    "rt",
    X + 40,
    Y + 32,
    "Runtime: which process opens todo.db",
    "Two OS processes can write the same SQLite file. Desktop apps reach it only through todo-server.",
  );

  card("rt-term", X + 40, Y + 140, 580, {
    title: "Terminal: the owner or an agent",
    body: "todo add 'Pay rent' --due 2026-11-01\ntodo --format json list --project 'Client Launch'\nprintf '%s\\n' \"$pass\" | todo init --password-stdin",
  });
  card("rt-electron", X + 700, Y + 140, 520, {
    title: "Electron",
    body: "renderer (React) ⇄ main over preload IPC\nmain holds the Session: userData/session.enc,\n  encrypted with safeStorage\nclient: @todo/api, the TypeScript HttpApi\nTODO_SERVER_URL, must be loopback",
  });
  card("rt-macos", X + 1280, Y + 140, 520, {
    title: "macOS 26, SwiftUI",
    body: "client: TodoAPI, generated from /openapi.json\nSession in Keychain\nSettings runs todo-server install, status\n  and uninstall for the bundled server",
  });

  zone("rt-pcli", X + 40, Y + 400, 580, 450, "process: todo  (one per command, exits)");
  card("rt-cli", X + 70, Y + 450, 520, {
    title: "todo  (apps/cli)",
    body: "Bun binary, @effect/cli\nSession: ~/.todo-cli/session_<profile>.json\ntodo top, todo diagnostics: HTTP to the server\n--format json: one object on stdout\nexit 0 ok · 1 runtime · 2 usage/validation\n     3 not found/auth · 4 Conflict",
  });
  card("rt-dom1", X + 70, Y + 710, 520, {
    title: "@todo/domain",
    titleColor: c.onPrimary,
    fill: c.primary,
    stroke: c.primary,
    bodyColor: c.onPrimary,
    body: "OperationStore, linked into the binary\nauthenticate → validate → op_log → projection",
  });

  zone(
    "rt-psrv",
    X + 700,
    Y + 400,
    1100,
    450,
    "process: todo-server  (long-lived, binds 127.0.0.1)",
  );
  card("rt-http", X + 730, Y + 450, 340, {
    title: "HttpApi",
    body: "127.0.0.1:${TODO_PORT:-4310}\nAuthorization: Bearer\n  ses_… or tok_…\n401 invalid · 403 scope\nspec: GET /openapi.json",
  });
  card("rt-sse", X + 1090, Y + 450, 340, {
    title: "SSE",
    body: "GET /profiles/:p/events\npolls op_log every 250 ms\nid: <seq>, resume with\n  Last-Event-ID",
  });
  card("rt-sched", X + 1450, Y + 450, 320, {
    title: "Scheduler loop",
    body: "sleeps until next due,\n  at most 1 s\nreminders, snooze wake-ups\nexpired credentials\ndaily Snapshot + prune",
  });
  card("rt-dom2", X + 730, Y + 710, 1040, {
    title: "@todo/domain",
    titleColor: c.onPrimary,
    fill: c.primary,
    stroke: c.primary,
    bodyColor: c.onPrimary,
    body: "the same OperationStore as the CLI: one copy of the rules\nauthenticate → validate → op_log → projection",
  });

  card("rt-db", X + 40, Y + 960, 760, {
    title: "~/.todo-cli/todo.db   (SQLite, or --db / TODO_DB)",
    fill: c.accent,
    body: "journal_mode=WAL · synchronous=FULL · foreign_keys=ON\nbusy_timeout=5000 ms · mode 0600 on db, -wal, -shm\nop_log: source of truth · projection: rebuildable",
  });
  card("rt-snap", X + 830, Y + 960, 300, {
    title: "snapshots/",
    fill: c.secondary,
    body: "owner Snapshots\nwhole-db copies, 0700",
  });
  card("rt-att", X + 1150, Y + 960, 260, {
    title: "attachments/",
    fill: c.secondary,
    body: "copied images\n0700 dirs, 0600 files",
  });
  card("rt-launchd", X + 1440, Y + 960, 360, {
    title: "launchd",
    fill: c.secondary,
    body: "~/Library/LaunchAgents/\n  com.todo-cli.server.plist\nRunAtLoad · KeepAlive\nenv TODO_DB, TODO_PORT",
  });

  arrow("rt-a1", "rt-term", "rt-cli", { label: "argv, stdin" });
  arrow("rt-a2", "rt-cli", "rt-dom1", { label: "function call" });
  arrow("rt-a3", "rt-electron", "rt-psrv", { toT: 0.236, label: "HTTP + SSE" });
  arrow("rt-a4", "rt-macos", "rt-psrv", { toT: 0.764, label: "HTTP + SSE" });
  arrow("rt-a5", "rt-cli", "rt-http", {
    from: "right",
    to: "left",
    fromT: 0.25,
    toT: 0.15,
    dashed: true,
    label: "todo top",
    labelSize: 13,
  });
  arrow("rt-a7", "rt-http", "rt-dom2", { toT: 0.165 });
  arrow("rt-a8", "rt-sse", "rt-dom2", { toT: 0.51 });
  arrow("rt-a9", "rt-sched", "rt-dom2", { toT: 0.85 });
  arrow("rt-a10", "rt-dom1", "rt-db", { toT: 0.3, label: "BEGIN IMMEDIATE … COMMIT" });
  arrow("rt-a11", "rt-dom2", "rt-db", {
    fromT: 0.06,
    toT: 0.85,
    label: "BEGIN IMMEDIATE … COMMIT",
  });
  arrow("rt-a12", "rt-launchd", "rt-psrv", {
    from: "top",
    to: "bottom",
    toT: 0.93,
    label: "starts, restarts",
  });
  arrow("rt-a13", "rt-macos", "rt-launchd", {
    from: "right",
    to: "right",
    fromT: 0.8,
    via: [
      [X + 1860, Y + 140 + 140],
      [X + 1860, Y + 1030],
    ],
    label: "install",
    labelSize: 13,
  });

  marker("rt-m1", X + 645, Y + 750, 1);
  marker("rt-m2", X + 1235, Y + 340, 2);
  marker("rt-m3", X + 560, Y + 870, 3);
  marker("rt-m4", X + 1385, Y + 462, 4);
  marker("rt-m5", X + 762, Y + 968, 5);

  notes("rt-notes", X + 40, Y + 1140, 1760, "How to read it", [
    "Rules exist once, in @todo/domain. Both processes load the same package and check credentials the same way (ADR-0001).",
    "Desktop apps never open SQLite. They hold a Session and call todo-server (ADR-0002, ADR-0003).",
    "The CLI writes with the server stopped. If both processes write at once, SQLite's write lock serializes them, and the waiter retries for up to 5 s.",
    "A CLI write reaches open desktop apps because the SSE route rereads op_log every 250 ms. There is no file watcher and no IPC between processes.",
    "Guard triggers abort any write that does not come from a domain transaction, including a manual sqlite3 session.",
  ]);
});

// 2. Write path --------------------------------------------------------------

frame("write", "Write path", 2000, 0, 1840, (X, Y) => {
  heading(
    "wp",
    X + 40,
    Y + 32,
    "Write path: editing a Task at Version 3",
    "Every write is one SQLite transaction. A rejected attempt is rolled back, then recorded in a second transaction.",
  );

  card("wp-cli", X + 40, Y + 140, 540, {
    title: "CLI",
    body: "todo edit TASK_ID --title 'Pay rent and utilities' \\\n  --expected-version 3\ncredential: ~/.todo-cli/session_work.json",
  });
  card("wp-http", X + 620, Y + 140, 520, {
    title: "HTTP",
    body: "PATCH /profiles/work/tasks/TASK_ID\nAuthorization: Bearer tok_…\n{ \"from_version\": 3, \"title\": \"Pay rent …\" }",
  });
  card("wp-auth", X + 240, Y + 330, 700, {
    title: "Authenticate: auth.authenticate({ access: 'write' })",
    body: "credentials row by secret_hash, not revoked, expires_at in the future\nAccess Token: Profile scope matches, scope 'read-write'\nfails: CLI exit 3 · HTTP 401 Unauthorized or 403 Forbidden",
  });

  zone(
    "wp-tx1",
    X + 40,
    Y + 540,
    1100,
    590,
    "transaction 1 · BEGIN IMMEDIATE · domain_write_allowed() = 1",
    { stroke: c.primary, color: c.primary },
  );
  card("wp-validate", X + 80, Y + 590, 500, {
    title: "1  Validate against the projection",
    body: "read the Task from tasks\nprofile_id equals :profile\nProject and Tags exist in that Profile\nrow_version = 3, the expected Version",
  });
  card("wp-log", X + 80, Y + 810, 500, {
    title: "2  Append to op_log",
    fill: c.primary,
    stroke: c.primary,
    titleColor: c.onPrimary,
    bodyColor: c.onPrimary,
    body: "seq 42 (AUTOINCREMENT)\nevent TaskEdited: resolved before and after\nfrom_version 3 → to_version 4\noutcome 'committed', reason NULL",
  });
  card("wp-apply", X + 620, Y + 810, 490, {
    title: "3  Apply the event to the projection",
    body: "tasks.payload with row_version 4\ntask_tags, task_versions\ncompleting an Occurrence also inserts\n  the next one, in the same event",
  });
  card("wp-commit", X + 620, Y + 1000, 490, {
    title: "COMMIT",
    fill: c.accent,
    body: "the op_log row and the projection change\nbecome visible together, or not at all",
  });

  card("wp-ok", X + 40, Y + 1200, 520, {
    title: "4  Respond",
    body: "CLI: Task JSON, row_version 4, exit 0\nHTTP: 200 with the Task",
  });
  card("wp-sse", X + 600, Y + 1200, 540, {
    title: "5  Stream",
    body: "SSE poll sees seq 42 within 250 ms\nid: 42 · event: operation\nonly on streams for Profile work",
  });

  zone("wp-rej", X + 1200, Y + 540, 600, 610, "rejected attempt", {
    stroke: c.warning,
    color: c.warning,
  });
  card("wp-rollback", X + 1240, Y + 590, 520, {
    title: "ROLLBACK transaction 1",
    fill: c.warningFill,
    stroke: c.warning,
    body: "Rejection('conflict') when row_version ≠ 3\nRejection('validation') for bad input\nnothing from transaction 1 is kept",
  });
  card("wp-reclog", X + 1240, Y + 770, 520, {
    title: "transaction 2 · append to op_log",
    fill: c.warningFill,
    stroke: c.warning,
    body: "event TaskAttemptRejected\n  with the attempted kind and payload\noutcome 'rejected', reason 'conflict'\nto_version NULL · replay skips the row",
  });
  card("wp-recresp", X + 1240, Y + 970, 520, {
    title: "Respond",
    fill: c.warningFill,
    stroke: c.warning,
    body: "conflict: CLI exit 4 · HTTP 409\n  with the latest Task and Version\nvalidation: CLI exit 2 · HTTP 422\nshown in History, never sent over SSE",
  });

  arrow("wp-a1", "wp-cli", "wp-auth", { fromT: 0.5, toT: 0.2 });
  arrow("wp-a2", "wp-http", "wp-auth", { fromT: 0.5, toT: 0.75 });
  arrow("wp-a3", "wp-auth", "wp-validate", { fromT: 0.2, toT: 0.6, label: "authorized" });
  arrow("wp-a4", "wp-validate", "wp-log", { label: "ok" });
  arrow("wp-a5", "wp-log", "wp-apply", { from: "right", to: "left" });
  arrow("wp-a6", "wp-apply", "wp-commit");
  arrow("wp-a7", "wp-commit", "wp-ok", { fromT: 0.1, toT: 0.6 });
  arrow("wp-a8", "wp-commit", "wp-sse", { fromT: 0.5, toT: 0.5 });
  arrow("wp-a9", "wp-validate", "wp-rollback", {
    from: "right",
    to: "left",
    fromT: 0.4,
    toT: 0.4,
    color: c.warning,
    dashed: true,
    label: "throws Rejection",
  });
  arrow("wp-a10", "wp-rollback", "wp-reclog", { color: c.warning });
  arrow("wp-a11", "wp-reclog", "wp-recresp", { color: c.warning });

  notes("wp-notes", X + 40, Y + 1350, 1760, "Why it is shaped this way", [
    "The log row and the projection change share one transaction, so History never disagrees with what clients read (ADR-0007).",
    "Rejected attempts are stored so Conflicts stay visible in History. Replay and SSE ignore them.",
    "Outside a domain transaction, triggers abort writes: 'domain writes only' on projection tables, 'op_log is append-only' on UPDATE or DELETE.",
  ]);
});

// 3. Data model -------------------------------------------------------------

frame("model", "Data model", 3940, 0, 1840, (X, Y) => {
  heading(
    "dm",
    X + 40,
    Y + 32,
    "Data model: tables in todo.db (schema 6)",
    "op_log is the source of truth. Projection tables are derived from it and can be rebuilt by replay.",
  );

  zone("dm-access", X + 40, Y + 130, 520, 1060, "identity and access");
  card("dm-owner", X + 70, Y + 180, 460, {
    title: "owner",
    titleFont: MONO,
    body: "singleton PK, CHECK = 1\npassphrase_hash",
  });
  card("dm-cred", X + 70, Y + 330, 460, {
    title: "credentials",
    titleFont: MONO,
    body: "id PK\nkind 'session' | 'token'\nsecret_hash UNIQUE\nname UNIQUE, tokens only\nprofile FK, NULL = every Profile\nscope 'read-only' | 'read-write'\ncreated_at · expires_at · revoked_at",
  });
  card("dm-prof", X + 70, Y + 690, 460, {
    title: "profiles",
    titleFont: MONO,
    fill: c.accent,
    body: "id PK\nname\ncreated_at · updated_at",
  });
  card("dm-pdel", X + 70, Y + 930, 460, {
    title: "profile_deletions",
    titleFont: MONO,
    body: "profile PK, FK → profiles.id\ndeleted_at\ntriggers: the ID is never reused",
  });

  zone(
    "dm-proj",
    X + 620,
    Y + 130,
    1180,
    740,
    "projection · rebuilt from op_log · writes only inside domain transactions",
    { stroke: c.primary, color: c.primary },
  );
  card("dm-projects", X + 650, Y + 180, 320, {
    title: "projects",
    titleFont: MONO,
    body: "id PK\nprofile_id FK\nname\nUNIQUE(profile_id, name)",
  });
  card("dm-tags", X + 650, Y + 400, 320, {
    title: "tags",
    titleFont: MONO,
    body: "id PK\nprofile_id FK\nname\nUNIQUE(profile_id, name)",
  });
  card("dm-tasktags", X + 650, Y + 620, 320, {
    title: "task_tags",
    titleFont: MONO,
    body: "task_id FK\n  ON DELETE CASCADE\ntag_id FK\nPK(task_id, tag_id)",
  });
  card("dm-tasks", X + 1070, Y + 180, 380, {
    title: "tasks",
    titleFont: MONO,
    fill: c.accent,
    body: "id PK\npayload JSON: the whole Task\ngenerated columns:\n  profile_id, project_id, status,\n  row_version, due_at, …\nexternal_id UNIQUE per profile_id\npayload.attachments[]\npayload.occurrence.series_id",
  });
  card("dm-series", X + 1530, Y + 180, 240, {
    title: "series",
    titleFont: MONO,
    body: "id PK\npayload JSON:\n  profile_id\n  recurrence\n  (RFC 5545)\n  task template",
  });
  card("dm-versions", X + 1070, Y + 700, 700, {
    title: "task_versions · series_versions",
    titleFont: MONO,
    body: "id PK → last accepted version\nkept after Purge, so a Version never goes back",
  });
  text(
    "dm-scope",
    X + 650,
    Y + 830,
    "Every projection table has profile_id → profiles.id, directly or inside payload.",
    { size: 15, color: c.mutedFg },
  );

  zone("dm-truth", X + 620, Y + 960, 1180, 230, "source of truth · append-only", {
    stroke: c.ink,
    color: c.ink,
  });
  card("dm-oplog", X + 650, Y + 1010, 600, {
    title: "op_log",
    titleFont: MONO,
    fill: c.primary,
    stroke: c.primary,
    titleColor: c.onPrimary,
    bodyColor: c.onPrimary,
    body: "seq PK AUTOINCREMENT · actor · profile FK\nevent JSON: resolved facts, no raw command\nfrom_version · to_version\noutcome 'committed' | 'rejected' · reason",
  });
  card("dm-snap", X + 1330, Y + 1010, 440, {
    title: "snapshots",
    titleFont: MONO,
    body: "seq PK, FK → op_log.seq\npayload: projection + versions\ncheckpoint for rebuild()",
  });

  arrow("dm-r1", "dm-cred", "dm-prof", { label: "profile  0..1" });
  arrow("dm-r2", "dm-pdel", "dm-prof", { from: "top", to: "bottom", label: "1 : 0..1" });
  arrow("dm-r3", "dm-tasks", "dm-projects", {
    from: "left",
    to: "right",
    fromT: 0.22,
    toT: 0.5,
    label: "project_id\n0..1",
    labelSize: 13,
  });
  arrow("dm-r4", "dm-tasktags", "dm-tags", { from: "top", to: "bottom", label: "tag_id" });
  arrow("dm-r5", "dm-tasktags", "dm-tasks", {
    from: "right",
    to: "bottom",
    fromT: 0.25,
    toT: 0.2,
    via: [[X + 1146, Y + 620 + 37]],
    label: "task_id",
  });
  arrow("dm-r6", "dm-tasks", "dm-series", {
    from: "right",
    to: "left",
    fromT: 0.85,
    toT: 0.5,
    label: "occurrence",
    labelSize: 12,
  });
  arrow("dm-r7", "dm-snap", "dm-oplog", { from: "left", to: "right", label: "seq" });
  arrow("dm-r8", "dm-oplog", "dm-proj", {
    from: "top",
    to: "bottom",
    fromT: 0.6,
    toT: 0.33,
    dashed: true,
    color: c.primary,
    label: "rebuild(): replay committed rows by seq",
  });

  notes("dm-terms", X + 40, Y + 1240, 1760, "Domain words mapped to storage (see CONTEXT.md)", [
    "Task: a tasks row. Version: tasks.row_version. History: the op_log rows that name the Task.",
    "Conflict: an op_log row with outcome 'rejected' and reason 'conflict'. It is kept and never replayed.",
    "Occurrence: a real Task whose payload.occurrence points at a Series. Attachment: an entry in payload.attachments[], not a table.",
    "Session and Access Token: credentials rows, kind 'session' or 'token'. The ses_ or tok_ prefix shows which on the wire.",
    "Purge rewrites op_log content in place (ADR-0008). It is the only path that edits a logged row.",
  ]);
});

// 4. Live updates -------------------------------------------------------------

frame("live", "Live updates", 5880, 0, 1840, (X, Y) => {
  heading(
    "lv",
    X + 40,
    Y + 32,
    "Live updates: one desktop client following Profile work",
    "SSE ids are op_log seq values. A client stores the last id and sends it back on reconnect.",
  );

  const lanes = [
    ["lv-client", "Electron main or macOS", X + 290],
    ["lv-sse", "todo-server SSE route", X + 760],
    ["lv-db", "op_log, credentials", X + 1240],
    ["lv-cli", "todo CLI", X + 1640],
  ];
  const top = Y + 140;
  const bottom = Y + 1150;
  for (const [id, name, cx] of lanes) {
    card(id, cx - 160, top, 320, { title: name, h: 56, fill: c.accent });
    line(`${id}-life`, [[cx, top + 56], [cx, bottom]], {
      dashed: true,
      color: c.mutedFg,
    });
  }
  const lx = Object.fromEntries(lanes.map(([id, , cx]) => [id, cx]));

  let step = 0;
  const msg = (from, to, y, label, o = {}) => {
    step += 1;
    const x1 = lx[from];
    const x2 = lx[to];
    const dir = Math.sign(x2 - x1);
    const id = `lv-msg${step}`;
    line(id, [[x1 + dir * 4, y], [x2 - dir * 6, y]], {
      arrow: true,
      dashed: o.dashed,
      color: o.color ?? c.ink,
      groupIds: [`${id}-g`],
    });
    const left = Math.min(x1, x2) + 16;
    const t = text(`${id}-t`, left, y - 8 - Math.ceil(14 * LINE) * label.split("\n").length, label, {
      size: 14,
      font: MONO,
      color: o.color ?? c.ink,
      groupIds: [`${id}-g`],
    });
    if (t.width > Math.abs(x2 - x1) - 24)
      console.warn(`overflow: ${id} ${t.width}px > ${Math.abs(x2 - x1) - 24}px`);
  };
  const note = (lane, y, title, body, w) => {
    step += 1;
    card(`lv-note${step}`, lx[lane] + 16, y, w, {
      title,
      titleSize: 15,
      body,
      bodySize: 13,
      stroke: c.border,
    });
  };

  msg("lv-client", "lv-sse", Y + 290,
    "GET /profiles/work/events\nAuthorization: Bearer ses_…\nLast-Event-ID: 41\nX-Todo-Generation: g7");
  msg("lv-sse", "lv-db", Y + 340, "authenticate(read)");
  note("lv-sse", Y + 365, "reset check",
    "Last-Event-ID > max seq, or\ngeneration ≠ current:\nsend event: reload first", 300);
  msg("lv-sse", "lv-client", Y + 500, "event: ready", { dashed: true });

  msg("lv-cli", "lv-db", Y + 640, "todo edit …: seq 42 (work)\nrejected attempt: seq 43\nother Profile: seq 44");

  zone("lv-loop", X + 60, Y + 680, 1440, 400, "loop · every 250 ms", {
    stroke: c.primary,
    color: c.primary,
  });
  msg("lv-sse", "lv-db", Y + 760, "history(after 41)");
  msg("lv-db", "lv-sse", Y + 820, "seq 42, 43, 44", { dashed: true });
  msg("lv-sse", "lv-client", Y + 900, "id: 42\nevent: operation\ndata: OpLogEntry", { dashed: true });
  note("lv-sse", Y + 915, "filtering",
    "43 is rejected, 44 is another Profile:\nboth skipped, cursor moves to 44.\nIds have gaps. That is normal.", 400);
  msg("lv-sse", "lv-db", Y + 1060, "authenticate(read) again");

  msg("lv-sse", "lv-client", Y + 1140,
    "after a Snapshot restore: event: reload\n{ generation, seq: restore_seq }", {
      dashed: true,
      color: c.warning,
    });

  notes("lv-notes", X + 40, Y + 1210, 1760, "Guarantees", [
    "Delivery is ordered by seq and resumable: reconnecting with Last-Event-ID: 42 replays from 43.",
    "Credentials are checked on every poll. A revoked or expired credential ends the stream.",
    "After a Snapshot restore, clients drop their cache, refetch, and resume from restore_seq.",
  ]);
});

frame("search-cli", "Task search: CLI", 0, 8000, 1840, (X, Y) => {
  heading("sc", X + 40, Y + 32, "Task search through todo list", "Phase 0 design. Existing names are literal; task-search.ts and search_matches are proposed additions.");
  card("sc-list", X + 40, Y + 140, 510, { title: "list / Command.make", body: "--text <query> / --prefix <hex>\nexisting list flags stay AND filters" });
  card("sc-decode", X + 650, Y + 140, 510, { title: "Schema.decodeUnknownSync(TaskFilters)", body: "inputLimits.searchText = 200\nprefix: /^[0-9a-f-]{1,36}$/i" });
  card("sc-invalid", X + 1260, Y + 140, 510, { title: "CommandError / exit 2", body: "invalid_args names --text or --prefix\nJSON: generated_at, code, message", fill: c.warningFill });
  card("sc-read", X + 650, Y + 365, 510, { title: "withStore / selectProfile / readTasks", body: "Profile-visible Tasks only\nno database migration or writes" });
  card("sc-filter", X + 650, Y + 570, 510, { title: "filterTaskRecords / task-search.ts", body: "title + description / all query terms\ntext AND prefix AND existing filters\nkeep input order; original UTF-16 spans" });
  card("sc-render", X + 650, Y + 800, 510, { title: "filterTasks / renderTasks / write", body: "today / overdue / inbox still apply\nJSON adds per-Task search_matches\nexit 0 also for tasks: []" });
  arrow("sc-a", "sc-list", "sc-decode", { from: "right", to: "left" });
  arrow("sc-b", "sc-decode", "sc-invalid", { from: "right", to: "left", color: c.warning });
  arrow("sc-c", "sc-decode", "sc-read");
  arrow("sc-d", "sc-read", "sc-filter");
  arrow("sc-e", "sc-filter", "sc-render");
  marker("sc-step1", X + 630, Y + 120, 1);
  marker("sc-step2", X + 630, Y + 550, 2);
  marker("sc-step3", X + 20, Y + 120, 3);
  notes("sc-notes", X + 40, Y + 1040, 1720, "Numbered workflow notes", [
    "Validation happens before opening the store. Whitespace-only text has no predicate; prefix never resolves a mutation id.",
    "One domain matcher returns acceptance and spans. CLI JSON decorates views without changing persisted Task payloads.",
    "show, edit, done, cancel, reopen, rm, history, attach, detach, move and copy still require exact full ids.",
  ]);
});

frame("search-http", "Task search: HTTP", 2000, 8000, 1840, (X, Y) => {
  heading("sh", X + 40, Y + 32, "Task search through HttpApi", "One Task list route and additive response metadata; clients do not implement matching.");
  card("sh-routes", X + 40, Y + 150, 760, { title: "HttpApi tasks.list", body: "GET /profiles/:profile/tasks?text=...&prefix=...\nSwift generated operation: tasks_period_list\nTaskFilters remains the shared query schema" });
  card("sh-boundary", X + 990, Y + 150, 760, { title: "TaskFilters decode / authenticate", body: "invalid text or prefix -> HTTP 400\nexisting credential and Profile checks stay\nunknown query parameters still rejected" });
  card("sh-list", X + 990, Y + 420, 760, { title: "TaskCommands.list / filterTaskRecords", body: "authorized Profile / visible Tasks\ntask-search.ts: one matcher, stable order\nsearch_matches is response-only metadata" });
  card("sh-reply", X + 990, Y + 690, 760, { title: "HttpApi success / HTTP 200", body: "existing array envelope remains unchanged\nper-Task search_matches when text is supplied\n[] for no matches; CLI keeps { tasks: [] }" });
  arrow("sh-a", "sh-routes", "sh-boundary", { from: "right", to: "left" });
  arrow("sh-b", "sh-boundary", "sh-list");
  arrow("sh-c", "sh-list", "sh-reply");
  marker("sh-step1", X + 20, Y + 130, 1);
  marker("sh-step2", X + 970, Y + 400, 2);
  marker("sh-step3", X + 970, Y + 670, 3);
  notes("sh-notes", X + 40, Y + 960, 1720, "Numbered workflow notes", [
    "The dotted tasks_period_list operation is the generated-client name for the same URL, not a new endpoint.",
    "search_matches contains title/description and start/end offsets in the original UTF-16 string. It is never persisted.",
    "Regenerate OpenAPI and the Swift contract. Do not hand-edit generated Swift or copy matching logic into either client.",
  ]);
});

const searchClientFrame = (id, name, X, swift) => frame(id, name, X, 9600, 1840, (x, y) => {
  const p = id;
  heading(p, x + 40, y + 32, `${name}: request states`, "Proposed search transitions extend the existing refresh guard. Compact view is the first proof target.");
  card(`${p}-idle`, x + 40, y + 150, 520, { title: "Idle / showing / empty", body: swift ? "TaskListView / TodoModel\n.searchable / compact-search\nrequestedTaskFilters == taskFilters" : "renderer.tsx / shadcn Input\nadvancedFiltersRef / appliedFiltersRef\nrefreshGeneration / activeQuery" });
  card(`${p}-debounce`, x + 660, y + 150, 520, { title: "Debouncing / 250 ms", body: "edit / Esc clear -> invalidate now\nhide old-query rows, retain applied data\nCmd+F focuses the visible search field" });
  card(`${p}-request`, x + 660, y + 410, 520, { title: swift ? "Requesting / refresh(generation:)" : "Requesting / refresh()", body: "capture Profile + view + filters + text\nnew generation for each request\nSSE refresh uses the latest input" });
  card(`${p}-guard`, x + 660, y + 680, 520, { title: "Response freshness guard", body: swift ? "generation / refreshGeneration\nprofile / selectedView / filters equality\n!Task.isCancelled" : "refreshGeneration.current == captured\nactiveQuery.current == captured\nrequested filters still match input" });
  card(`${p}-discard`, x + 1280, y + 680, 500, { title: "Obsolete response / discard", body: "no rows, errors or filters published\nnewer debounce/request continues", fill: c.secondary });
  card(`${p}-success`, x + 40, y + 950, 520, { title: "Showing matches / empty", body: "publish current rows + search_matches\nkeep view order / display highlights\nzero matches offers Clear search" });
  card(`${p}-error`, x + 660, y + 950, 520, { title: "Error / previous filters active", body: "restore last applied filters + text\nkeep previous data and show error\nno rows falsely attributed to new text", fill: c.warningFill });
  card(`${p}-dialog`, x + 1280, y + 150, 500, { title: swift ? "TaskFilterView / draft" : "TaskFilterDialog / draft", body: "Id starts with / filter-prefix\nCancel -> keep applied values\ninvalid prefix -> inline error\nApply -> compose current search" });
  arrow(`${p}-a`, `${p}-idle`, `${p}-debounce`, { from: "right", to: "left" });
  arrow(`${p}-b`, `${p}-debounce`, `${p}-request`);
  arrow(`${p}-c`, `${p}-request`, `${p}-guard`);
  arrow(`${p}-d`, `${p}-guard`, `${p}-discard`, { from: "right", to: "left" });
  arrow(`${p}-e`, `${p}-guard`, `${p}-success`, { fromT: 0.2, toT: 0.7 });
  arrow(`${p}-f`, `${p}-guard`, `${p}-error`, { color: c.warning });
  arrow(`${p}-g`, `${p}-dialog`, `${p}-request`, { from: "left", to: "right", via: [[x + 1230, y + 330], [x + 1230, y + 475]] });
  marker(`${p}-step1`, x + 640, y + 130, 1);
  marker(`${p}-step2`, x + 640, y + 930, 2);
  marker(`${p}-step3`, x + 20, y + 930, 3);
  notes(`${p}-notes`, x + 40, y + 1220, 1720, "Numbered workflow notes", [
    "Any input change, view switch or Profile switch invalidates in-flight work before the debounce. Search and dialog filters combine.",
    "Pending rows are hidden, not relabeled. On failure the field returns to the applied query before its retained rows reappear.",
    "Client proof includes delayed replies, clear, Cmd+F, Esc, mixed filters, title and description highlights, and light/dark Compact captures.",
  ]);
});
searchClientFrame("search-electron", "Electron search", 0, false);
searchClientFrame("search-swift", "SwiftUI search", 2000, true);

frame("search-copy", "Task search: copy full id", 4000, 8000, 1840, (X, Y) => {
  heading("si", X + 40, Y + 32, "Copy the exact Task id", "Both Task details expose the full id in small monospace. Copy is independent of search matching.");
  card("si-detail", X + 40, Y + 150, 500, { title: "Task detail / full task.id", body: "Electron editor / SwiftUI editor\nread-only, selectable monospace\nCopy task id button" });
  card("si-copy", X + 660, Y + 150, 500, { title: "Copy action", body: "Electron: validated clipboard IPC\nSwiftUI: NSPasteboard.general\nwrite the exact complete UUID" });
  card("si-result", X + 1280, Y + 150, 500, { title: "Copied / copy failed", body: "announce success after write\naccessible error if copy fails\nno Task mutation or Version change" });
  arrow("si-a", "si-detail", "si-copy", { from: "right", to: "left" });
  arrow("si-b", "si-copy", "si-result", { from: "right", to: "left" });
  marker("si-step1", X + 20, Y + 130, 1);
  marker("si-step2", X + 640, Y + 130, 2);
  notes("si-notes", X + 40, Y + 430, 1720, "Numbered workflow notes", [
    "The copied value is the full Task id from the detail being shown, including while search or another filter is active.",
    "Unsigned Electron host verifies the production IPC path. Swift offscreen proof renders the action; headless tests prove the copied value.",
  ]);
});

const scene = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    gridSize: 20,
    viewBackgroundColor: c.paper,
    exportBackground: true,
    exportWithDarkMode: false,
    currentItemFontFamily: SANS,
    currentItemRoughness: 0,
  },
  files: {},
};

writeFileSync(join(dir, "todo.excalidraw"), `${JSON.stringify(scene, null, 2)}\n`);
console.log(`wrote todo.excalidraw with ${elements.length} elements`);
