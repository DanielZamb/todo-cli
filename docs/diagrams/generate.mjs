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
    const mid = o.labelAt ?? (
      n % 2 === 1
        ? abs[(n - 1) / 2]
        : [
            (abs[n / 2 - 1][0] + abs[n / 2][0]) / 2,
            (abs[n / 2 - 1][1] + abs[n / 2][1]) / 2,
          ]);
    const size = o.labelSize ?? 14;
    const font = o.labelFont ?? MONO;
    const m = measure(o.label, size, font);
    const t = text(`${id}-label`, mid[0] - m.width / 2, mid[1] - m.height / 2, o.label, {
      size,
      font,
      color: o.labelColor ?? color,
      containerId: o.labelAt && !o.bindLabel ? null : id,
    });
    t.textAlign = "center";
    t.verticalAlign = "middle";
    if (!o.labelAt || o.bindLabel) bind(el, { type: "text", id: t.id });
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
  arrow("sc-b", "sc-decode", "sc-invalid", { from: "right", to: "left", color: c.warning, label: "invalid --text/--prefix / exit 2", labelSize: 12, labelAt: [X + 1205, Y + 115] });
  arrow("sc-c", "sc-decode", "sc-read");
  arrow("sc-d", "sc-read", "sc-filter");
  arrow("sc-e", "sc-filter", "sc-render", { label: "matches or [] / exit 0", labelSize: 12 });
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
  arrow("sh-c", "sh-list", "sh-reply", { label: "matches or [] / HTTP 200", labelSize: 12 });
  card("sh-invalid", X + 40, Y + 420, 760, { title: "HttpApi validation error", body: "invalid TaskFilters query / HTTP 400", fill: c.warningFill });
  arrow("sh-invalid-a", "sh-boundary", "sh-invalid", { label: "invalid query / HTTP 400", labelSize: 12, from: "bottom", to: "right", via: [[X + 1370, Y + 360], [X + 900, Y + 360], [X + 900, Y + 460]], labelAt: [X + 1110, Y + 350], color: c.warning });
  marker("sh-step1", X + 20, Y + 130, 1);
  marker("sh-step2", X + 970, Y + 400, 2);
  marker("sh-step3", X + 970, Y + 670, 3);
  notes("sh-notes", X + 40, Y + 960, 1720, "Numbered workflow notes", [
    "The dotted tasks_period_list operation is the generated-client name for the same URL, not a new endpoint.",
    "search_matches contains title/description and start/end offsets in the original UTF-16 string. It is never persisted.",
    "Regenerate OpenAPI and the Swift contract. Do not hand-edit generated Swift or copy matching logic into either client.",
  ]);
});

const searchClientFrame = (id, name, X, swift) => frame(id, name, X, 9600, 3000, (x, y) => {
  const p = id;
  const node = (key, dx, dy, title, body, fill) => card(`${p}-${key}`, x + dx, y + dy, 620, { title, body, fill, h: 145 });
  const transition = (key, from, to, label, o = {}) => arrow(`${p}-${key}`, `${p}-${from}`, `${p}-${to}`, { label, labelSize: 15, labelFont: SANS, bindLabel: true, ...o });
  heading(p, x + 50, y + 32, `${name}: search state machine`, "Approved C1/C5. Stale rows stay visible; generation guards publish one response snapshot. Compact first.");
  card(`${p}-variables`, x + 50, y + 115, 2670, { title: "State variables and code mapping", body: [
    { t: "requestedIdentity = { Profile, view, dialog filters, typed text }; appliedSnapshot = { appliedIdentity, rows, search_matches }" },
    { t: "issuedGeneration; appliedGeneration; stale = requestedIdentity != appliedIdentity; phase = Idle | Showing | Debouncing | Requesting | Error" },
    { t: swift ? "TodoModel: generation, refreshGeneration, requestedTaskFilters, taskFilters; TaskListView: .searchable / compact-search" : "renderer.tsx: refreshGeneration, activeQuery, advancedFiltersRef, appliedFiltersRef; TaskFilterDialog; shadcn Input" },
  ], h: 150 });
  node("idle", 50, 350, "Idle", "Profile/view reset clears old selection\nkeep toolbar text; snapshot absent");
  node("showing", 50, 780, "Showing / empty", "rows + spans = appliedSnapshot\nsearch empty: Clear search is primary\ndescription excerpt: one centered line");
  node("debounce", 1080, 780, "Debouncing", "250 ms timer; generation invalidated now\nretain applied rows + highlights\nfield progress / stale emphasis");
  node("request", 2100, 780, "Requesting", "refresh() / refresh(generation:)\ncapture identity + new issuedGeneration\nretain appliedSnapshot");
  node("error", 2100, 1450, "Error", "keep typed text + appliedSnapshot\nCouldn't search. Showing results for\n\"<applied text>\". / Retry", c.warningFill);
  transition("initial", "idle", "request", "refresh [selection ready] / issue current request", { from: "right", to: "top", via: [[x + 2380, y + 420]], labelAt: [x + 1580, y + 390] });
  transition("input", "showing", "debounce", "input change or Esc [enabled]\n/ update requestedIdentity; invalidate; schedule", { from: "right", to: "left", labelAt: [x + 875, y + 810] });
  transition("fired", "debounce", "request", "debounce fired [current timer]\n/ refresh; issue latest identity", { from: "right", to: "left", labelAt: [x + 1900, y + 810] });
  transition("success", "request", "showing", "response(generation) ok [latest + identity current]\n/ atomically publish rows, spans, appliedIdentity", { from: "bottom", to: "bottom", via: [[x + 2410, y + 1120], [x + 360, y + 1120]], labelAt: [x + 1350, y + 1090] });
  transition("newinput", "request", "debounce", "input change or Esc [enabled] / invalidate; debounce", { from: "top", to: "top", via: [[x + 2420, y + 640], [x + 1390, y + 640]], labelAt: [x + 1900, y + 610] });
  transition("failed", "request", "error", "response(generation) error [latest]\n/ keep text; retain snapshot; report", { fromT: 0.95, toT: 0.95, labelAt: [x + 2550, y + 1260], color: c.warning });
  transition("retry", "error", "request", "Retry or SSE reconnect or SSE op\n[Error + current Profile] / issue requestedIdentity", { from: "left", to: "left", via: [[x + 1840, y + 1520], [x + 1840, y + 850]], labelAt: [x + 1840, y + 1370] });
  transition("errorinput", "error", "debounce", "input change or Esc [enabled]\n/ keep snapshot; invalidate; debounce", { from: "bottom", to: "left", toT: 0.8, via: [[x + 2400, y + 1650], [x + 2400, y + 1740], [x + 1000, y + 1740], [x + 1000, y + 896]], labelAt: [x + 1570, y + 1710] });
  transition("repeatinput", "debounce", "debounce", "input change [enabled] / replace timer", { from: "bottom", to: "bottom", fromT: 0.15, toT: 0.85, via: [[x + 1173, y + 1030], [x + 1607, y + 1030]], labelAt: [x + 1390, y + 470] });
  transition("obsolete", "request", "request", "response(generation) ok/error\n[obsolete] / discard", { from: "bottom", to: "bottom", fromT: 0.15, toT: 0.75, via: [[x + 2193, y + 1030], [x + 2565, y + 1030]], labelAt: [x + 2520, y + 1020] });
  transition("sse", "showing", "request", "SSE op [current Profile] / refresh latest requestedIdentity", { from: "top", to: "top", via: [[x + 360, y + 590], [x + 2400, y + 590]], labelAt: [x + 820, y + 560] });
  transition("focus", "showing", "showing", "Cmd+F [search visible] / focus field", { from: "top", to: "top", fromT: 0.15, toT: 0.85, via: [[x + 143, y + 690], [x + 577, y + 690]], labelAt: [x + 350, y + 990] });
  transition("reset", "error", "idle", "Profile switch or view switch [changed]\n/ keep text; clear selection; invalidate", { from: "top", to: "left", via: [[x + 2220, y + 1400], [x + 2220, y + 1350], [x + 20, y + 1350], [x + 20, y + 420]], labelAt: [x + 1060, y + 1320] });
  zone(`${p}-freshness`, x + 50, y + 1930, 2670, 400, "Orthogonal freshness state / retained rows stay visible");
  node("current", 180, 2040, "Current", "requestedIdentity == appliedIdentity\nnormal rows and their matching highlights", c.accent);
  node("stale", 1910, 2040, "Stale", "requestedIdentity != appliedIdentity\nreduced emphasis; field progress if pending\nerror keeps typed text and Retry", c.secondary);
  transition("staleon", "current", "stale", "input or dialog Apply [identity differs]\n/ stale := true; retain snapshot", { from: "right", to: "left", labelAt: [x + 1340, y + 2040] });
  transition("staleoff", "stale", "current", "response ok [latest + requested identity] or input [equals applied]\n/ stale := false; publish snapshot only on response", { from: "bottom", to: "bottom", via: [[x + 2220, y + 2290], [x + 490, y + 2290]], labelAt: [x + 1350, y + 2270] });
  marker(`${p}-step1`, x + 1060, y + 760, 1);
  marker(`${p}-step2`, x + 2080, y + 1430, 2);
  marker(`${p}-step3`, x + 1890, y + 2020, 3);
  notes(`${p}-notes`, x + 50, y + 2390, 2670, "Numbered state-machine notes", [
    "Input, Esc and dialog Apply invalidate immediately. Profile/view switch from every phase uses Idle reset. Cmd+F focuses in every phase.",
    "Error -> Requesting on Retry or current-Profile SSE reconnect/op. Error -> Debouncing on input. Obsolete replies discard in every phase.",
    "Freshness is orthogonal to request phase: stale iff identities differ. Rows and spans share appliedIdentity. SSE refresh can run while Current.",
    "Recovery hooks: Electron connection(connected) / changed; Swift followChanges ready / operation. Filters are drawn in their separate frame.",
    "Weak-fair debounce, successful replies and recovery from Error imply convergence after input stops. Recovery is Retry or SSE reconnect/op; no retry timer.",
  ]);
});
searchClientFrame("search-electron", "Electron search", 0, false);
searchClientFrame("search-swift", "SwiftUI search", 3200, true);

const searchFilterFrame = (id, name, X, swift) => frame(id, name, X, 12600, 2600, (x, y) => {
  const node = (key, dx, dy, title, body, fill) => card(`${id}-${key}`, x + dx, y + dy, 620, { title, body, fill, h: 145 });
  const transition = (key, from, to, label, o = {}) => arrow(`${id}-${key}`, `${id}-${from}`, `${id}-${to}`, { label, labelFont: SANS, labelSize: 16, ...o });
  heading(id, x + 50, y + 32, `${name}: Filters state machine`, "Entry and exit connect to the client's search phase. Toolbar text survives dialog editing and filter rollback.");
  node("parent", 50, 270, "Parent search phase", swift ? "TaskListView / showingTaskFilters\nreturn to retained appliedSnapshot\nrequested text stays typed" : "renderer.tsx / filtersOpen\nreturn to retained appliedSnapshot\nrequested text stays typed");
  node("draft", 1550, 270, swift ? "TaskFilterView / editing draft" : "TaskFilterDialog / editing draft", "Id starts with / filter-prefix\ndraft fields separate from applied filters\nCancel discards draft");
  node("request", 1550, 870, "Requesting / parent search phase", "compose dialog fields + current text\nnew generation; retain applied snapshot\nrequest state's freshness guard applies");
  node("rollback", 50, 870, "Filter application failed", "filterApplyError / restore dialog fields\nkeep typed search text\nretain applied snapshot", c.warningFill);
  transition("entry", "parent", "draft", "Filters [enabled] / snapshot dialog fields", { from: "right", to: "left" });
  transition("cancel", "draft", "parent", "dialog Cancel [open] / close; retain applied values", { from: "top", to: "top", via: [[x + 1860, y + 170], [x + 360, y + 170]] });
  transition("invalid", "draft", "draft", "dialog Apply [invalid prefix]\n/ show inline validation; retain draft", { from: "right", to: "right", fromT: 0.2, toT: 0.8, via: [[x + 2390, y + 299], [x + 2390, y + 386]] });
  transition("apply", "draft", "request", "dialog Apply [valid]\n/ close; request latest identity", { from: "bottom", to: "top" });
  transition("error", "request", "rollback", "response(generation) error [latest filter apply]\n/ restore dialog filters; keep text", { from: "left", to: "right", color: c.warning });
  transition("return", "rollback", "parent", "rollback [complete] / show filterApplyError", { from: "top", to: "bottom" });
  transition("success", "request", "parent", "response(generation) ok [latest + identity current]\n/ publish snapshot; return to Showing or empty", { from: "right", to: "left", fromT: 0.3, toT: 0.3, via: [[x + 2420, y + 914], [x + 2420, y + 1270], [x + 20, y + 1270], [x + 20, y + 314]] });
  marker(`${id}-step1`, x + 1530, y + 250, 1);
  marker(`${id}-step2`, x + 30, y + 850, 2);
  notes(`${id}-notes`, x + 50, y + 1360, 2480, "Numbered sub-machine notes", [
    "Entry copies dialog fields. Clear all changes dialog draft fields only. Apply composes the toolbar's current text; Cancel leaves applied fields alone.",
    "The parent search phase owns stale, Retry/SSE recovery, Profile/view resets and obsolete-response discard. Filter failure preserves today's dialog rollback behavior.",
  ]);
});
searchFilterFrame("search-electron-filters", "Electron", 0, false);
searchFilterFrame("search-swift-filters", "SwiftUI", 3000, true);

frame("search-copy", "Task search: copy full id", 4000, 8000, 1840, (X, Y) => {
  heading("si", X + 40, Y + 32, "Copy full Task id: state machine", "Electron reuses attachment-native.ts clipboard IPC. SwiftUI uses NSPasteboard.general. No Task mutation.");
  card("si-idle", X + 630, Y + 170, 550, { title: "Idle", body: "full task.id / small selectable monospace\nCopy task id enabled", h: 120 });
  card("si-copied", X + 40, Y + 650, 550, { title: "Copied", body: "success feedback / start feedback timer\nexact full id written to clipboard", fill: c.accent, h: 120 });
  card("si-failed", X + 1240, Y + 650, 550, { title: "Failed", body: "accessible copy error / allow retry\nno false success feedback", fill: c.warningFill, h: 120 });
  arrow("si-copyok", "si-idle", "si-copied", { label: "Copy [clipboard write succeeds]\n/ announce Copied; start timer", labelFont: SANS, labelAt: [X + 390, Y + 430] });
  arrow("si-copyfail", "si-idle", "si-failed", { label: "Copy [clipboard write fails]\n/ announce failure", labelFont: SANS, labelAt: [X + 1450, Y + 430] });
  arrow("si-timeout", "si-copied", "si-idle", { from: "left", to: "left", via: [[X + 20, Y + 710], [X + 20, Y + 230]], label: "feedback timeout [Copied]\n/ clear feedback", labelFont: SANS, labelAt: [X + 240, Y + 270] });
  arrow("si-retry", "si-failed", "si-idle", { from: "right", to: "right", via: [[X + 1810, Y + 710], [X + 1810, Y + 230]], label: "Retry or dismiss [Failed]\n/ clear feedback", labelFont: SANS, labelAt: [X + 1570, Y + 270] });
  marker("si-step1", X + 610, Y + 150, 1);
  marker("si-step2", X + 20, Y + 630, 2);
  notes("si-notes", X + 40, Y + 900, 1720, "Numbered state-machine notes", [
    "Copy reads the complete id of the shown Task, including while search is stale. A new Task detail resets feedback to Idle.",
    "Copied returns to Idle on timeout; Failed returns on Retry or dismiss. Headless tests prove the copied value; offscreen renders prove feedback.",
  ]);
});

let dagFrameY = 11000;
const dagMachine = (id, title, _plannedY, states, transitions, details) => frame(id, title, 0, dagFrameY += 5000, 3000, (x, top) => {
  heading(id, x + 60, top + 28, title, "Phase 0 proposal. Existing entry points and proposed Dependency symbols are named explicitly.");
  const positions = new Map();
  const laneCounts = new Map();
  const pitch = states.length > 6 ? 1250 : 950;
  for (const [key, column, row, name, body, warning] of states) {
    const px = x + 90 + column * 1030;
    const py = top + 250 + row * pitch;
    positions.set(key, { px, py, column, row });
    card(`${id}-${key}`, px, py, 680, { title: name, body, h: 165, fill: warning ? c.warningFill : c.card, bodySize: 15 });
  }
  for (let i = 0; i < transitions.length; i++) {
    const [from, to, label, route = {}] = transitions[i];
    const a = positions.get(from);
    const b = positions.get(to);
    const gap = Math.min(a.row, b.row);
    const laneIndex = laneCounts.get(gap) ?? 0;
    if (a.row !== b.row || (from !== to && (Math.abs(a.column - b.column) > 1 || a.column > b.column))) laneCounts.set(gap, laneIndex + 1);
    let geometry;
    if (from === to) {
      geometry = { from: "top", to: "top", fromT: 0.2, toT: 0.8, via: [[a.px + 136, a.py - 95], [a.px + 544, a.py - 95]], labelAt: [a.px + 340, a.py - 130] };
    } else if (a.row === b.row && b.column - a.column === 1) {
      geometry = { from: "right", to: "left", labelAt: [a.px + 850, a.py + 82] };
    } else if (a.row === b.row) {
      const lane = a.py + 270 + laneIndex * 88;
      geometry = { from: "bottom", to: "bottom", via: [[a.px + 340, lane], [b.px + 340, lane]], labelAt: [(a.px + b.px) / 2 + 340, lane + 30] };
    } else {
      const lane = top + 250 + gap * pitch + 285 + laneIndex * 88;
      geometry = { from: a.row < b.row ? "bottom" : "top", to: a.row < b.row ? "top" : "bottom", via: [[a.px + 340, lane], [b.px + 340, lane]], labelAt: [(a.px + b.px) / 2 + 340, lane - 24] };
    }
    arrow(`${id}-transition-${i}`, `${id}-${from}`, `${id}-${to}`, { ...geometry, label, labelFont: SANS, labelSize: 17, bindLabel: !route.labelAt, ...route, ...(route.via ? {via: route.via.map(([px, py]) => [x + px, top + py])} : {}), ...(route.labelAt ? {labelAt: [x + route.labelAt[0], top + route.labelAt[1]]} : {}) });
  }
  const rows = Math.max(...states.map((s) => s[2])) + 1;
  marker(`${id}-entry-marker`, x + 55, top + 232, 1);
  notes(`${id}-notes`, x + 60, top + 320 + rows * pitch, 2860, "Numbered workflow notes", details);
});

dagMachine("dag-cli-edges", "CLI depend and undepend outcomes", 16000, [
  ["input", 0, 0, "depend / undepend", "main.ts command boundary\n--expected-version / full Task ids\nTaskCommands + proposed dependency-commands.ts"],
  ["lock", 1, 0, "OperationStore.transaction", "BEGIN IMMEDIATE before graph reads\nread endpoints and edge existence\nactive Profile + visible endpoints"],
  ["noop", 2, 0, "EdgeReport / unchanged", "existing add or absent remove\ncurrent Version returned / exit 0\nno op_log row; no Version comparison"],
  ["guard", 1, 1, "addDependency / removeDependency", "real change: compare dependent Version\nBFS all statuses; in-degree <= 13\ndone Task only gets resolved blockers"],
  ["reject", 0, 1, "recordRejection after rollback", "dependency_cycle / blocked / too_many_dependencies\nConflict exit 4 / other rule refusal exit 2\ncapture witness while locked", true],
  ["commit", 2, 1, "appendSync / applyEvent / commit", "DependencyAdded or DependencyRemoved\ndependent Version advances once\nEdgeReport / exit 0; additive warnings"],
], [
  ["input", "lock", "command [valid]\n/ authenticate; acquire writer lock"],
  ["lock", "noop", "existence [no-op]\n/ return current Versions"],
  ["lock", "guard", "existence [real change]\n/ compare current Version"],
  ["guard", "reject", "validation [refused]\n/ rollback; retain evidence"],
  ["guard", "commit", "validation [accepted]\n/ record and apply together"],
  ["reject", "input", "retry [recovered]\n/ issue fresh intent and Version", { from: "left", to: "left", via: [[35, 852], [35, 332]], labelAt: [280, 615] }],
], [
  "The entry names depend/undepend and Dependency helpers are proposed. OperationStore.transaction, appendSync and applyEvent already exist.",
  "No-op beats a stale valid Version, after authorization and endpoint checks. Real changes validate under the lock. Rejected evidence survives rollback.",
  "Only the dependent advances. The ninth add warns, the fourteenth refuses. A redundant edge is stored and returns its implying path.",
]);

dagMachine("dag-cli-delete", "CLI rm with Dependencies", 19000, [
  ["input", 0, 0, "mutateTask / rm", "--force still means Purge\n--with-dependencies authorizes edge removal\n--dry-run writes nothing"],
  ["preview", 1, 0, "locked Delete preview", "read both incident edge directions\nexpected Version + affected Versions\nreturn exact removed_dependencies"],
  ["dry", 2, 0, "DeleteReport / dry_run", "same report; projected Versions\nno Snapshot; no op_log; exit 0"],
  ["prompt", 0, 1, "[y/N] on stdin + stdout TTY", "md mode only / default No\nlist Depends on and Blocks\nNo or EOF cancels / exit 0"],
  ["refuse", 1, 1, "has_dependencies / exit 2", "JSON or other nonprompt mode\nname --with-dependencies\nno projection writes", true],
  ["apply", 2, 1, "TaskCommands.delete / recheck", "reacquire BEGIN IMMEDIATE\nverify current Version + preview edge set\none TaskDeleted v2 removes every edge"],
], [
  ["input", "preview", "rm [authorized]\n/ read a consistent preview"],
  ["preview", "dry", "--dry-run [true]\n/ report; exit 0"],
  ["preview", "prompt", "edges [TTY + md, no flag]\n/ release lock; ask"],
  ["preview", "refuse", "edges [agent + no flag]\n/ explain recovery"],
  ["preview", "apply", "rm [no dry-run + flag or no edges]\n/ validate and commit"],
  ["prompt", "apply", "Yes [same preview]\n/ revalidate; commit"],
  ["prompt", "input", "No or EOF [default]\n/ cancel without writes", { from: "left", to: "left", via: [[35, 852], [35, 332]], labelAt: [230, 615] }],
  ["apply", "refuse", "recheck [edge set changed]\n/ require renewed confirmation"],
], [
  "Dry-run terminates without a write. Apply starts only when dry-run is false and edges were authorized, or there are no edges.",
  "No lock is held during a human prompt. The final transaction rejects a changed confirmed edge set. A stale Task Version remains Conflict exit 4.",
  "TaskDeleted contains every edge and surviving dependent Version. A Task without Dependencies deletes as today. Purge later only redacts History.",
]);

dagMachine("dag-lifecycle", "Completion, reopen and Create follow-up", 22000, [
  ["input", 0, 0, "transition / edit / revert", "TaskCommands.transition + finishTaskSync\nOperationStore.revert + validate\nall status writes share dependency-rules.ts"],
  ["guard", 1, 0, "BEGIN IMMEDIATE / status guards", "done requires resolved direct blockers\nreopen checks direct done dependents\ngrouped Revert validates final graph"],
  ["commit", 2, 0, "appendSync / accepted", "TaskCompleted / TaskReopened / TaskReverted\nrecurring successor inherits no edges\nno descendant weight writes"],
  ["blocked", 0, 1, "blocked / exit 2, HTTP 422", "unresolved direct blockers listed\nFinish or cancel Dependencies first\nno force completion", true],
  ["reopen", 1, 1, "blocks_done_task / exit 2, HTTP 422", "done dependents listed\ntodo add <title> --depends-on <done-id>\nCLI recovery hint + both-client action", true],
  ["follow", 2, 1, "Create follow-up / Quick add", "prefill depends_on = chosen done dependent\nsource Task remains unchanged\nconfirm create through tasks.create"],
], [
  ["input", "guard", "intent [authorized]\n/ acquire lock; validate Version"],
  ["guard", "commit", "status guards [pass]\n/ commit resolved event"],
  ["guard", "blocked", "complete [unresolved blockers]\n/ rollback; record refusal"],
  ["guard", "reopen", "reopen or Revert [done dependent]\n/ rollback; record refusal"],
  ["reopen", "follow", "Create follow-up [connected]\n/ open prefilled draft"],
  ["follow", "commit", "Add [valid draft]\n/ create Task and initial edge"],
  ["blocked", "input", "retry [blockers resolved]\n/ reload current Version", { from: "left", to: "left", via: [[35, 852], [35, 332]], labelAt: [260, 615] }],
], [
  "Cancelled blockers resolve completion too. Reopening either a done or a cancelled blocker is refused beneath a done dependent.",
  "Create follow-up is explicit new work. It never reopens the source or removes its edges. Offline state disables writes and retains the draft.",
  "Adding an unresolved blocker to a done Task uses the same blocked refusal. Replaying committed events applies facts without running these guards again.",
]);

for (const [suffix, name, entry] of [["electron", "Electron", "renderer.tsx / activeQuery / deleteTask"], ["swift", "SwiftUI", "TodoModel / generation / deleteTask(_:)"]]) {
  const shift = suffix === "electron" ? 0 : 12000;
  dagMachine(`dag-${suffix}-picker`, `${name} Depends on and Blocks picker`, 25000 + shift, [
    ["closed", 0, 0, "Task detail / list menu", `${entry}\nAdd dependency / Depends on / Blocks\nproposed dependency-picker identifier`],
    ["load", 1, 0, "DependencyPicker / loading", "Profile-wide task search, not current view\nretain requested Profile + mode + root id\nexisting links loaded checked"],
    ["ready", 2, 0, "DependencyPicker / ready", "linked rows stay checked under search\nDepends on: root depends on candidate\nBlocks: candidate depends on root"],
    ["error", 0, 1, "Picker error / retained draft", "recovery hint and witness visible\nConflict requires Reload current Versions\nno blind resend", true],
    ["write", 1, 1, "tasks.depend / tasks.undepend", "toggle uses dependent current Version\nserialize per dependent; disable pending row\npreview/apply batch keeps per-item results"],
    ["offline", 2, 1, "Offline / read only", "retain checked state and search text\ndisable all mutation controls\nshow Offline text"],
  ], [
    ["closed", "load", "open [connected]\n/ snapshot identity; request links"],
    ["load", "ready", "response [latest identity]\n/ publish rows and checks"],
    ["ready", "ready", "search [text changed]\n/ debounce with shared search guards"],
    ["ready", "write", "toggle [enabled]\n/ capture dependent Version"],
    ["write", "ready", "response [changed or unchanged]\n/ refresh checks; quiet no-op"],
    ["write", "error", "response [refusal or Conflict]\n/ retain intent; show recovery"],
    ["error", "load", "Retry or Reload [connected]\n/ fetch current graph and Versions"],
    ["ready", "offline", "disconnect [current Profile]\n/ retain snapshot; disable writes"],
    ["offline", "load", "SSE ready [reconnected]\n/ reload current identity"],
    ["load", "closed", "Cancel or Esc [open]\n/ invalidate; restore invoking focus"],
  ], [
    "This is a separate sub-machine, entered from Task detail, graph context menu, list Add dependency or keyboard. Both directions use one component.",
    "Search uses server text and original response spans. Obsolete responses never publish. Current-Profile SSE ops reload graph data and Versions.",
    "Cancel and Profile/root switch apply in every open phase. Close invalidates requests. Already linked and Already removed do not show an error.",
  ]);
  dagMachine(`dag-${suffix}-drag`, `${name} list drag with keyboard alternative`, 28000 + shift, [
    ["idle", 0, 0, "Task list / idle", `${entry}\nAdd dependency menu + keyboard opens picker\nproposed dependency-drop-target identifier`],
    ["drag", 1, 0, "Dragging Task source", "source id / Profile captured\ndrop target will depend on source\nvisible relation text"],
    ["target", 2, 0, "Drop target / allowed", "show target will depend on source\ntarget Version retained\nrefuse self or foreign Profile"],
    ["linked", 0, 1, "Already depends on", "existing edge / quiet state\nrelease without request or Version bump\nkeyboard can open checked picker"],
    ["write", 1, 1, "tasks.depend / pending", "same command as picker\nserver checks current graph under lock\nno optimistic committed edge"],
    ["error", 2, 1, "Drop refused / recover", "loop path, blockers or Conflict\nretain list selection\nReload or choose another target", true],
  ], [
    ["idle", "drag", "drag start [enabled]\n/ capture source"],
    ["drag", "target", "drag over [valid target]\n/ show direction"],
    ["drag", "linked", "drag over [edge exists]\n/ show Already depends on"],
    ["target", "write", "drop [allowed]\n/ send expected target Version"],
    ["write", "idle", "response [accepted or unchanged]\n/ refresh graph; announce quietly"],
    ["write", "error", "response [refused]\n/ display recovery"],
    ["error", "target", "choose target [reloaded]\n/ use current Version"],
    ["linked", "idle", "drop or Esc [already linked]\n/ no write", { from: "left", to: "left", via: [[35, 852], [35, 332]], labelAt: [270, 615] }],
    ["drag", "idle", "Esc or drag end [cancelled]\n/ clear drag state"],
  ], [
    "List drag is v1. Diagram edge dragging is deferred. The Add dependency menu and keyboard action reach the picker without a drag gesture.",
    "Self, foreign Profile, offline and absent targets never submit. Cycle and Version rules remain authoritative in the domain, not drag state.",
    "SSE refresh can invalidate a target. Keep source/target identity stable and recheck on drop. A refused drop never mutates the displayed graph optimistically.",
  ]);
  dagMachine(`dag-${suffix}-delete`, `${name} every-Delete confirmation`, 31000 + shift, [
    ["idle", 0, 0, "Task detail or list / Delete", `${entry}\nevery Delete first opens a dialog\nproposed task-delete-dialog identifier`],
    ["preview", 1, 0, "Delete dialog / loading preview", "tasks.delete dry_run=true\nread Task Version and incident edges\ndefault Cancel; Escape restores focus"],
    ["confirm", 2, 0, "Delete dialog / confirmation", "Depends on and Blocks listed\nDelete Task and remove Dependencies\nempty graph says Delete Task"],
    ["error", 0, 1, "Delete dialog / changed or error", "Conflict or changed preview set\nshow recovery and current edges\nrequire fresh explicit confirmation", true],
    ["write", 1, 1, "tasks.delete / applying", "with_dependencies=true when needed\ncurrent expected Version + confirmed set\ndisable repeated action"],
    ["offline", 2, 1, "Offline / retained dialog", "read only; keep preview visible\nno Delete or Retry while offline\nCancel still works"],
  ], [
    ["idle", "preview", "Delete [dialog closed]\n/ open confirmation"],
    ["preview", "confirm", "response [latest + current root]\n/ show exact edge set"],
    ["confirm", "write", "Confirm [connected]\n/ submit reviewed removal"],
    ["write", "error", "response [Conflict or changed edges]\n/ keep dialog; show recovery"],
    ["error", "preview", "Reload [connected]\n/ fetch current preview"],
    ["write", "idle", "response [committed]\n/ close; reload; announce Delete"],
    ["confirm", "offline", "disconnect [dialog open]\n/ disable destructive action"],
    ["offline", "preview", "SSE ready [connected]\n/ invalidate old confirmation"],
    ["confirm", "preview", "SSE operation [edges may change]\n/ invalidate confirmation; reload"],
    ["preview", "idle", "Cancel or Esc [open]\n/ close; restore invoking focus"],
  ], [
    "Electron gains confirmation for every Delete. SwiftUI retains its existing confirmation and adds graph-specific impact, preview and changed-state recovery.",
    "Cancel/close applies in every phase before commit. A response can publish only for the current Profile, Task and generation. Offline never authorizes a write.",
    "One TaskDeleted event hides the Task and removes both edge directions. Apply rechecks the preview under BEGIN IMMEDIATE before recording anything.",
  ]);
}

for (const [suffix, name, offset] of [["electron", "Electron", 0], ["swift", "SwiftUI", 5000]]) dagMachine(`dag-${suffix}-graph`, `${name} graph loading, navigation and SSE`, 50000 + offset, [
  ["load", 0, 0, "GraphView / loading", "tasks.graph / selected Task id\nlatest Profile + root + request generation\nlocal resources only"],
  ["ready", 1, 0, "GraphView / region ready", "selected + direct blockers + dependents\napp-owned x/y/scale/selection/focus\nclick opens Task; context/key opens picker"],
  ["expand", 2, 0, "GraphView / expanding", "expand one level by click or key\nretain existing viewport and focus\nshow nodes outside region"],
  ["error", 0, 1, "GraphView / error", "retain last good data; Retry if connected\nPele failure shows accessible relation list\nTask list/search remains available", true],
  ["overview", 1, 1, "GraphView / whole-group overview", "explicit toggle; list primary above ~50\nkeep saved region and selected Task\nall stored edges including redundant ones"],
  ["refresh", 2, 1, "GraphView / SSE refresh", "current Profile operations invalidate graph\nretain expanded ids + transform + selection\nlatest response only; never mount.update"],
  ["offline", 0, 2, "GraphView / offline", "retain readable last graph\nall writes disabled; no retry action\nselected Task list still available"],
  ["gone", 1, 2, "Task deleted / selection recovery", "fall back to surviving region root\notherwise show deleted notice + Task list\nnever resurrect vanished Task content"],
], [
  ["load", "ready", "response [latest identity]\n/ render region; bind accessible nodes"],
  ["ready", "expand", "Expand [more neighbors]\n/ extend expanded-id set"],
  ["expand", "ready", "render [success]\n/ preserve transform and selection"],
  ["ready", "overview", "Overview [enabled]\n/ save region; fit group"],
  ["overview", "ready", "Region [enabled]\n/ restore saved region viewport"],
  ["ready", "refresh", "SSE op [current Profile]\n/ fetch same root identity"],
  ["overview", "refresh", "SSE op [current Profile]\n/ preserve overview mode"],
  ["refresh", "ready", "response [latest + region + root survives]\n/ replace data; retain host state"],
  ["refresh", "gone", "response [selected Task gone]\n/ repair selection explicitly"],
  ["refresh", "overview", "response [latest + overview]\n/ preserve overview transform"],
  ["refresh", "refresh", "response [obsolete]\n/ discard without host-state changes"],
  ["refresh", "error", "response [latest + failed]\n/ retain snapshot and host state"],
  ["ready", "offline", "disconnect [current Profile]\n/ retain snapshot; disable writes"],
  ["load", "error", "read or render [failed]\n/ retain data; expose recovery"],
  ["error", "load", "Retry [connected]\n/ issue current identity"],
  ["error", "offline", "disconnect [current Profile]\n/ retain error and snapshot"],
  ["offline", "load", "SSE ready [reconnected]\n/ reload current root", { from: "left", to: "left", via: [[35, 1372], [35, 332]], labelAt: [235, 1110] }],
], [
  "Disconnect from every online state enters Offline. Profile/root switches invalidate requests. Obsolete success/error self-loops discard without changing host state.",
  "Refresh returns to the saved region or overview mode. Expand/overview changes no server data. SSE errors retain viewport, selected id and focused id.",
  "Anchor pointerdown bypasses zoom capture, issue 130. A disappearing Reset/zoom control returns focus to SVG, issue 131. Native relation lists keep every action available.",
  "Pele is pinned 1.13.0. Electron renderer and SwiftUI NSViewRepresentable/WKWebView use the same offline adapter and design tokens. Drag-to-connect is later.",
]);

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
