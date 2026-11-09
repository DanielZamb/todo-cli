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

frame("perf-tags", "PERF: putTask Tag links", 0, 16000, 2800, (x, y) => {
  heading("pt", x + 50, y + 32, "putTask: unchanged task_tags", "Set comparison inside the existing OperationStore.transaction. Task payload and Version writes remain mandatory.");
  card("pt-begin", x + 50, y + 200, 650, { title: "OperationStore.appendSync", body: "transaction / BEGIN IMMEDIATE\nvalidate; record committed op_log\napplyEvent -> applyChanges -> putTask", h: 150 });
  card("pt-compare", x + 1800, y + 200, 850, { title: "putTask / compare Tag ids", body: "tasks LEFT JOIN task_tags WHERE tasks.id=?\nexisting Task + equal sets + no duplicates\nINSERT / UPDATE tasks payload", h: 150 });
  card("pt-keep", x + 1800, y + 700, 850, { title: "Equal distinct sets / keep task_tags", body: "skip task_tags DELETE and INSERT\npreserve task.tags order in payload", fill: c.accent, h: 130 });
  card("pt-relink", x + 50, y + 700, 850, { title: "Different, duplicate or new / relink", body: "DELETE FROM task_tags WHERE task_id=?\nINSERT each task.tags array value; duplicates fail\nnew/rebuild projections use actual rows", h: 150 });
  card("pt-commit", x + 950, y + 1180, 850, { title: "putTask / task_versions -> COMMIT", body: "upsert row_version; publish History + projection\nSQL error rolls the whole transaction back", h: 140 });
  arrow("pt-enter", "pt-begin", "pt-compare", { label: "validated Event", from: "right", to: "left", labelFont: SANS });
  arrow("pt-equal", "pt-compare", "pt-keep", { label: "equal sets, no duplicates", from: "bottom", to: "top", labelFont: SANS });
  arrow("pt-different", "pt-compare", "pt-relink", { label: "different, duplicate or new", from: "left", to: "top", labelFont: SANS, labelAt: [x + 1200, y + 540] });
  arrow("pt-kept", "pt-keep", "pt-commit", { label: "unchanged links", from: "bottom", to: "right", labelFont: SANS });
  arrow("pt-relinked", "pt-relink", "pt-commit", { label: "replaced links", from: "bottom", to: "left", labelFont: SANS });
  marker("pt-m1", x + 1760, y + 180, 1);
  marker("pt-m2", x + 910, y + 1160, 2);
  notes("pt-notes", x + 50, y + 1450, 2650, "Numbered notes", [
    "Equal distinct Tag sets skip relinking. Duplicate arrays take the original INSERT path and fail. Payload order and domain guards stay unchanged.",
    "Measure WAL frames per real Task edit. verify-op-log compares exact task_tags; verify-occ-atomicity rechecks crash stages.",
  ]);
});

frame("perf-cache", "PERF: folded-word cache", 3000, 16000, 3000, (x, y) => {
  heading("pc", x + 50, y + 32, "TaskSearchCache: PreparedField per Profile + exact text", "The content key preserves output correctness; epoch, ownership tokens and purgeGen fence cache-local retention.\nNo Version key, DB coherence protocol or stored query results.");
  card("pc-read", x + 50, y + 200, 1050, { title: "TaskCommands.list / CLI list: capture read", body: "read = searchWords.read(request.profile)\nbefore auth.read / SQLite Task read\ncarry captured epoch + generation to EVERY lookup\ncurrent Task title + description + profile_id\nblank clauses skip field preparation", bodySize: 16, h: 230 });
  card("pc-lookup", x + 1850, y + 200, 1050, { title: "TaskSearchCache.words(read, text)", body: "key = length-prefixed Profile + exact text\nPreparedField { words, preparedUnits }\nhit: entries.get(key).prepared; no prep yield\nmiss: register(read, key, bytes) -> fresh token\nyield* fieldWords(text) prepares words + offsets\nfailed registration computes without retention", bodySize: 16, h: 240 });
  card("pc-serve", x + 1850, y + 900, 1050, { title: "matchTaskSearchSteps / TaskSearchWork", body: "filterTaskRecordsEffect -> runTaskRecordSteps\nexecution.prepare returns complete PreparedField\ncharge preparedUnits ONCE per field, hit or miss\nsame original strings + ordered UTF-16 spans\nshared search_too_broad; no partial rows", bodySize: 16, fill: c.accent, h: 230 });
  card("pc-purge", x + 50, y + 900, 1050, { title: "TaskPurged / Snapshots.restore / hygiene observer", body: "clearAll(): epoch++; entries.clear(); pending.clear()\nANY Purge / restore fences EVERY old Read\nlocal Profile delete: evictProfile(profile)\nserver: taskSearchCacheHygiene.run, 250 ms polls\nnew committed seq/kind/original_kind only\nclose(): permanent closed fence + clearAll()", bodySize: 16, fill: c.warningFill, h: 230 });
  card("pc-admit", x + 1150, y + 1510, 1750, { title: "TaskSearchCache.prepare / retain / dropPending", body: "pending.get(key) === token && canAdmit(read)\ncanAdmit: !closed && read.epoch == epoch\nAND captured generation == current purgeGen\nretain only completed PreparedField; later token wins\nfinally: dropPending(key, token), OWN current slot only\nretained + pending cocharged <= 16 MiB; LRU reserve()\nentries <= 4096 AND pending <= 4096\nentry > 4 MiB / no slot -> compute without retention\ntransient buffers + purgeGen metadata outside charge", bodySize: 16, h: 270 });
  arrow("pc-start", "pc-read", "pc-lookup", { label: "read + exact current text", from: "right", to: "left", labelFont: SANS });
  arrow("pc-use", "pc-lookup", "pc-serve", { label: "synchronous hit / complete payload", from: "bottom", to: "top", labelFont: SANS });
  arrow("pc-hygiene", "pc-purge", "pc-admit", { label: "clearAll / Profile revocation", from: "bottom", to: "left", labelFont: SANS });
  arrow("pc-bound", "pc-lookup", "pc-admit", { label: "miss / yield* fieldWords(text)", from: "left", fromT: 0.8, to: "top", via: [[x + 1450, y + 392], [x + 1450, y + 1420]], labelFont: SANS });
  arrow("pc-prepared", "pc-admit", "pc-serve", { label: "PreparedField / retained or uncached", from: "top", fromT: 0.78, to: "bottom", toT: 0.7, labelFont: SANS });
  marker("pc-m1", x + 1810, y + 180, 1);
  marker("pc-m2", x + 20, y + 880, 2);
  marker("pc-m3", x + 1110, y + 1490, 3);
  notes("pc-notes", x + 50, y + 1900, 2850, "Numbered notes", [
    "The exact Profile/text key preserves words, original UTF-16 offsets and preparedUnits after edits, Revert, Snapshot restore and rebuild.\nThe matcher charges the same preparation count on both paths. This memo does not mitigate the first fold of expanding text.",
    "ANY Purge or Snapshot restore clears ALL Profiles and fences old reads. Observer: committed redacted TaskPurged / ProfileDeleted, <= 1000 ms; generation change clears then resets max seq.\nOwn writes can clear again harmlessly. One uncached refill after rare owner Purge is deliberate. Local Profile delete can evict its Profile. Memory hygiene is not DB coherence.",
    "TaskSearchCacheAdmission.tla checks ClearAll epoch fencing, admission provenance, pending cleanup, complete hits and bounds at 2 keys / 2 preparations / capacity 2.\nReal-Effect controls and same-source cold/partial/warm/uncached work, full JSON/spans and literal bounds complement the finite model; charged bytes are not RSS.",
  ]);
});

frame("perf-refresh", "PERF: minimal client refresh", 6400, 16000, 3000, (x, y) => {
  heading("pr", x + 50, y + 32, "TodoModel.refresh / renderer refresh: request scope", "Full/query split. Existing requestedIdentity, appliedSearchSnapshot, appliedSearch and canPublishSearch remain authoritative.");
  card("pr-input", x + 50, y + 220, 900, { title: "setSearchText / changeSearch / filter Apply", body: "invalidate refreshGeneration immediately\ncapture full requestedIdentity after debounce\nretain rows + highlights while Requesting", h: 150 });
  card("pr-query", x + 1950, y + 220, 900, { title: "Query-only refresh / search IPC", body: "taskRequest search / readSearchRows\ntasks.list with current text and filters\nreads.view only for current planning view\nasync let / Effect.all: await both", h: 150 });
  card("pr-full", x + 50, y + 850, 1000, { title: "Full refresh / catalog still owed", body: "catalogStale / catalogOwedRef set before reads\ntasks, matching_tasks, discovery, four views\ninput, failed or obsolete full keeps obligation\nonly guarded full publication clears it", h: 175 });
  card("pr-guard", x + 1950, y + 850, 900, { title: "canPublishSearch / activeQuery guards", body: "latest request + generation + full identity\naccept all awaited reads or guarded Error\nobsolete success/error changes no visible state", h: 150 });
  card("pr-publish", x + 800, y + 1450, 1400, { title: "appliedSearchSnapshot / appliedSearch", body: "publish response strings + spans + planning membership together\nquery-only keeps catalog; full publishes owed names and counts\nError retains rows; Retry or current-Profile SSE recovers", fill: c.accent, h: 150 });
  arrow("pr-request", "pr-input", "pr-query", { label: "catalog ready; no full owed", from: "right", to: "left", labelFont: SANS });
  arrow("pr-queryready", "pr-query", "pr-guard", { label: "1 request for All tasks; 2 for planning", from: "bottom", to: "top", labelFont: SANS });
  arrow("pr-fullready", "pr-full", "pr-guard", { label: "all full-refresh reads settle", from: "right", to: "left", labelFont: SANS });
  arrow("pr-fallback", "pr-input", "pr-full", { label: "catalog absent or still owed", from: "bottom", to: "top", labelFont: SANS });
  arrow("pr-current", "pr-guard", "pr-publish", { label: "current response only", from: "bottom", to: "right", labelFont: SANS });
  marker("pr-m1", x + 1910, y + 200, 1);
  marker("pr-m2", x + 1910, y + 830, 2);
  marker("pr-m3", x + 760, y + 1430, 3);
  notes("pr-notes", x + 50, y + 1780, 2850, "Numbered notes", [
    "Electron already runs nine reads concurrently. Swift uses async let for full and query reads. Count real HTTP calls through both clients.",
    "TaskSearch.tla guards full/query races and catalogOwed. A query superseding SSE or a write must still publish the owed full catalog.",
    "Keep offline unfiltered cache, drafts and dialog rollback. Compact-first headless drives and offscreen captures respect native HOLD.",
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
