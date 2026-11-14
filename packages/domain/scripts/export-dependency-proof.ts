import assert from "node:assert/strict";
import { Schema } from "effect";
import {
  obsidianProjection,
  projectionDependencies,
  renderExport,
  taskView,
} from "../src/presentation.ts";
import { at, task } from "./dag-proof.ts";

export function proveExportDependencies() {
  const a = task("A", { title: "Source | [quote] & <tag>" });
  const b = task("B");
  const c = task("C");
  const views = [
    taskView(
      {
        ...a,
        depends_on: [],
        blocks: [b.id, c.id],
        ready: true,
        blocked: false,
        remaining_energy: { energy: 0, unweighted: 1 },
        search_matches: [{ field: "title", start: 0, end: 6 }],
      },
      [],
      [],
    ),
    taskView(
      {
        ...b,
        depends_on: [a.id],
        blocks: [c.id],
        ready: false,
        blocked: true,
        remaining_energy: { energy: 0, unweighted: 2 },
      },
      [],
      [],
    ),
    taskView(
      {
        ...c,
        depends_on: [a.id, b.id],
        blocks: [],
        ready: false,
        blocked: true,
        remaining_energy: { energy: 0, unweighted: 3 },
      },
      [],
      [],
    ),
  ];
  const json = Schema.decodeUnknownSync(
    Schema.Record(Schema.String, Schema.Json),
  )(JSON.parse(renderExport(views, "json", at, "all", "default")));
  const rows = Schema.decodeUnknownSync(
    Schema.Array(Schema.Record(Schema.String, Schema.Json)),
  )(json.tasks);
  assert.equal(rows.length, 3);
  assert.equal(Object.hasOwn(rows[0] ?? {}, "depends_on"), false);
  assert.deepEqual(rows[1]?.depends_on, ["A"]);
  assert.deepEqual(rows[2]?.depends_on, ["A", "B"]);
  for (const row of rows)
    for (const field of [
      "blocks",
      "ready",
      "blocked",
      "remaining_energy",
      "search_matches",
    ])
      assert.equal(Object.hasOwn(row, field), false);
  const plain = taskView(task("A"), [], []);
  const before =
    "Before\n<!-- todo-cli:begin -->\nold\n<!-- todo-cli:end -->\nAfter\n";
  assert.equal(
    obsidianProjection(before, [plain], at),
    "Before\n<!-- todo-cli:begin -->\n# CLI Tasks\n\nLast synced: 2026-11-09T06:00:00Z\n\n# Tasks\n\n- [ ] [P2] Task A (id: A, v:1)\n<!-- todo-cli:end -->\nAfter\n",
  );
  assert.equal(
    renderExport([plain], "md", at, "all", "default"),
    "# Tasks\n\n- [ ] [P2] Task A (id: A, v:1)\n",
  );
  const note = obsidianProjection(before, views, at);
  assert.ok(note.startsWith("Before\n<!-- todo-cli:begin -->\n"));
  assert.ok(note.endsWith("<!-- todo-cli:end -->\nAfter\n"));
  assert.ok(
    note.includes(
      "[[#^task-A|Source &#124; &#91;quote&#93; &#38; &#60;tag&#62;]]",
    ),
  );
  for (const id of ["A", "B", "C"])
    assert.match(note, new RegExp(`\\^task-${id}$`, "m"));
  assert.equal(note.split("```mermaid").length, 2);
  assert.equal(note.match(/ --> /gu)?.length, 3);
  assert.ok(note.includes("  n0 --> n1\n"));
  assert.ok(note.includes("  n0 --> n2\n"));
  assert.ok(note.includes("  n1 --> n2\n"));
  assert.equal(obsidianProjection(note, views, at), note);
  const selected = views.filter((view) => view.id === "C");
  const outside = projectionDependencies(selected);
  assert.deepEqual(outside.outside, ["A", "B"]);
  const selectedNote = obsidianProjection(before, selected, at);
  assert.ok(
    selectedNote.includes("Depends on: [[#^task-A|A]], [[#^task-B|B]]"),
  );
  assert.ok(
    selectedNote.includes(
      "Dependencies outside this projection:\n- A ^task-A\n- B ^task-B\n",
    ),
  );
}
