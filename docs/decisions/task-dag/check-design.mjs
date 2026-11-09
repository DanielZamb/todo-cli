import { Database } from "bun:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const evidence = resolve(process.argv[2] ?? "docs/evidence/task-dag/phase-0");
mkdirSync(evidence, { recursive: true });
const expect = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
};
const schemas = JSON.parse(readFileSync(new URL("contract.schema.json", import.meta.url))).$defs;
expect(schemas.ListExtension.properties.ready, {const: true}, "Ready filter is true-only");
expect(schemas.ListExtension.properties.blocked, {const: true}, "Blocked filter is true-only");
const shapes = schemas.GraphReport.oneOf;
expect(shapes.map(s=>s.properties.shape.const), ["tree","single","chain","dag"], "graph shape variants");
expect(shapes[0].properties.orientation.enum, ["converging","diverging","mixed"], "tree orientations");
expect(shapes[0].required.includes("orientation"), true, "tree orientation required");
expect(shapes.slice(1).every(s=>!("orientation" in s.properties)), true, "only trees have orientation");
for(const n of [9,14]) expect(new RegExp(schemas.DependencyAdvice.pattern).test(`This Task depends on ${n} Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.`), true, "counted advice");
const scene = JSON.parse(readFileSync(new URL("../../diagrams/todo.excalidraw", import.meta.url)));
const all = new Map(scene.elements.map((e) => [e.id, e]));
expect(all.size, scene.elements.length, "unique element ids");
const frames = scene.elements.filter((e) => e.type === "frame" && e.id.startsWith("dag-"));
expect(frames.length, 11, "DAG frame count");
let arrows = 0;
for (const frame of frames) {
  if (frame.id.endsWith("-graph")) {
    const labels = scene.elements.filter(e => e.frameId === frame.id && e.type === "text" && e.id.includes("-transition-"));
    const boxes = scene.elements.filter(e => e.frameId === frame.id && e.type === "rectangle");
    const intersects = (a,b) => a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height;
    for (let i=0; i<labels.length; i++) {
      expect(labels.slice(i+1).filter(b=>intersects(labels[i],b)).map(b=>b.id), [], "graph transition labels do not overlap");
      expect(boxes.filter(b=>intersects(labels[i],b)).map(b=>b.id), [], "graph transition labels avoid state cards");
    }
    for (const prefix of ["SSE ready [reconnected]", "Retry [connected]", "read or render [failed]"]) {
      const label = labels.find(l=>l.text.startsWith(prefix));
      if(!label) throw new Error("Missing graph recovery label " + prefix);
      const a=all.get(label.id.slice(0,-6));
      const cx=label.x+label.width/2, cy=label.y+label.height/2;
      const points=a.points.map(([px,py])=>[a.x+px,a.y+py]);
      expect(points.some((p,i)=>i>0 && p[1]===points[i-1][1] && Math.abs(cy-p[1])<1 && cx>=Math.min(p[0],points[i-1][0]) && cx<=Math.max(p[0],points[i-1][0])), true, "recovery label sits on its horizontal transition");
    }
  }
  for (const e of scene.elements.filter((e) => e.frameId === frame.id)) {
    const xs = e.points ? e.points.map(p=>e.x+p[0]) : [e.x,e.x+e.width];
    const ys = e.points ? e.points.map(p=>e.y+p[1]) : [e.y,e.y+e.height];
    if (Math.min(...xs) < frame.x || Math.min(...ys) < frame.y || Math.max(...xs) > frame.x + frame.width || Math.max(...ys) > frame.y + frame.height) throw new Error(`Element outside frame: ${e.id}`);
    if (e.type !== "arrow") continue;
    arrows++;
    for (const binding of [e.startBinding, e.endBinding]) if (all.get(binding?.elementId)?.frameId !== frame.id) throw new Error(`Unbound arrow ${e.id}`);
    const label = all.get(`${e.id}-label`);
    if (!label || (label.containerId !== null && label.containerId !== e.id) || !label.text.includes("[") || !label.text.includes("/")) throw new Error(`Missing transition syntax ${e.id}`);
  }
}
const db = new Database(":memory:");
let allowed = 1;
db.function("domain_write_allowed", () => allowed);
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE tasks (id TEXT PRIMARY KEY, payload TEXT NOT NULL,
profile_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.profile_id')) STORED);
INSERT INTO tasks VALUES ('A','{"profile_id":"work"}'),('B','{"profile_id":"work"}'),('C','{"profile_id":"own-work"}');`);
const sql = readFileSync(new URL("migration-0007.sql", import.meta.url), "utf8");
db.exec(sql);
db.exec(sql);
expect(db.query("PRAGMA user_version").get(), { user_version: 7 }, "migration idempotence");
db.query("INSERT INTO task_dependencies VALUES (?,?,?)").run("work", "B", "A");
expect(db.query("SELECT * FROM task_dependencies").all(), [{ profile_id: "work", dependent_id: "B", blocker_id: "A" }], "literal stored edge");
const fails = (query, pattern) => { let message = ""; try { db.exec(query); } catch (e) { message = String(e); } if (!pattern.test(message)) throw new Error(`Expected refusal ${pattern}: ${message}`); };
fails("INSERT INTO task_dependencies VALUES ('work','B','C')", /FOREIGN KEY/);
fails("INSERT INTO task_dependencies VALUES ('work','A','A')", /CHECK/);
fails("DELETE FROM tasks WHERE id='A'", /FOREIGN KEY/);
allowed = 0;
fails("INSERT INTO task_dependencies VALUES ('work','A','B')", /domain writes only/);
fails("UPDATE task_dependencies SET blocker_id='B'", /domain writes only/);
fails("DELETE FROM task_dependencies", /domain writes only/);
expect(db.query("PRAGMA foreign_key_check").all(), [], "foreign key integrity");
expect(db.query("PRAGMA integrity_check").get(), { integrity_check: "ok" }, "SQLite integrity");
const master = db.query("SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'task_dependencies%' OR name='tasks_profile_id_id' ORDER BY name").all();
writeFileSync(`${evidence}/migration-schema.json`, `${JSON.stringify(master, null, 2)}\n`);
db.close();
const result = { status: "PASS", scope: "Phase 0 draft checks only, not production behavior", frames: frames.map((f) => f.id), arrows, sql: ["idempotent", "same-Profile FKs", "self-check", "no cascade", "three domain guards", "integrity"] };
writeFileSync(`${evidence}/design-check.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
