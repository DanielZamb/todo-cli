import assert from "node:assert/strict";
import { Schema } from "effect";
import { Task } from "./packages/domain/src/entities.ts";
import {
  filterTaskRecords,
  TaskFilters,
} from "./packages/domain/src/task-filters.ts";
import {
  matchTaskSearch,
  normalizeTaskSearch,
  parseTaskSearch,
} from "./packages/domain/src/task-search.ts";

const properties = [
  "normalization",
  "positive-and",
  "phrase-subset",
  "prefix",
  "spans",
] satisfies string[];
const requested = process.argv[2];
assert.ok(
  requested === undefined || properties.includes(requested),
  "Unknown property",
);
const seed = 0x5ea2c001;
let state = seed;
const next = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
};
function pick<T>(values: readonly T[]): T {
  const value = values[next() % values.length];
  assert.ok(value !== undefined, "Empty generated corpus");
  return value;
}
const atoms = [
  "pay",
  "rent",
  "draft",
  "drift",
  "Renovar",
  "pasaporte",
  "Canción",
  "cancion",
  "Straße",
  "ﬃ",
  "İı",
  "ςΣ",
  "𐐀",
  "e\u0301",
  "👩🏽‍💻",
  "follow-up",
  "ＡＢＣ",
  "mañana",
  "日本語",
  "🧑‍🚀",
  "a\u0345",
  "ᾈ",
  "ß",
  "i\u0307",
];
const terms = [
  "pay",
  "rent",
  "draft",
  "drift",
  "reno",
  "pasaprote",
  "cancion",
  "strasse",
  "ffi",
  "𐐨",
  "follow",
  "up",
];
const corpus: { title: string; description: string | null }[] = [
  { title: "e\u0301", description: "𐐀 Straße ﬃ" },
  { title: "👩🏽‍💻 e\u0301 𐐀", description: "Pay rent today" },
  { title: "Rent: pay by Friday", description: null },
  { title: "Rent drift", description: "Canción de cuna" },
  { title: "follow-up", description: "Rent drafts" },
  { title: "ﬃ ﬃ 𐐀𐐀 e\u0301e\u0301", description: "" },
];
for (const a of atoms.slice(0, 8))
  for (const b of atoms.slice(0, 8))
    corpus.push({ title: `${a}: ${b}`, description: `${b} ${a}` });
const generatedText = () =>
  Array.from({ length: 2 + (next() % 4) }, () => pick(atoms)).join(
    pick([" ", ": ", " / ", "\n"]),
  );
for (let i = 0; i < 64; i++)
  corpus.push({
    title: generatedText(),
    description: i % 4 === 0 ? null : generatedText(),
  });
const normalizationRandom = Array.from({ length: 2048 }, () =>
  Array.from({ length: 1 + (next() % 8) }, () => pick(atoms)).join(""),
);
const ids = [
  "6aa2647d-1111-4111-8111-111111111111",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
];
const hex = "0123456789abcdef";
for (let i = 0; i < 62; i++) {
  const digits = Array.from({ length: 32 }, () => hex.charAt(next() % 16)).join(
    "",
  );
  ids.push(
    `${digits.slice(0, 8)}-${digits.slice(8, 12)}-4${digits.slice(13, 16)}-8${digits.slice(17, 20)}-${digits.slice(20)}`,
  );
}
const tasks = ids.map((id) =>
  Schema.decodeUnknownSync(Task)({
    id,
    profile_id: "formal",
    entity_version: 1,
    row_version: 1,
    title: "Task",
    description: null,
    status: "open",
    project_id: null,
    priority: "P2",
    scheduled_at: null,
    due_at: null,
    energy: null,
    estimate_min: null,
    source: "agent",
    tags: [],
    occurrence: null,
    created_at: "2026-11-09T00:00:00Z",
    updated_at: "2026-11-09T00:00:00Z",
    completed_at: null,
    deleted_at: null,
  }),
);
const prefixes = new Set([
  "-",
  "6AA2",
  "ffffffff",
  "a".repeat(36),
  "-a-a",
  "0",
]);
for (const id of ids)
  for (let n = 1; n <= 36; n++) {
    prefixes.add(id.slice(0, n));
    prefixes.add(id.slice(0, n).toUpperCase());
  }
const counts: Record<string, number> = {};
let property = "setup";
let witness: unknown;
function test(input: unknown, condition: boolean) {
  witness = input;
  counts[property] = (counts[property] ?? 0) + 1;
  assert.equal(condition, true, property);
}
const matches = (task: (typeof corpus)[number], query: string) =>
  matchTaskSearch(task, parseTaskSearch(query));

try {
  for (property of properties.filter(
    (name) => requested === undefined || requested === name,
  )) {
    switch (property) {
      case "normalization": {
        const check = (input: string) => {
          const once = normalizeTaskSearch(input);
          const twice = normalizeTaskSearch(once);
          test({ input, once, twice }, once === twice);
        };
        for (let point = 0; point <= 0x10ffff; point++)
          if (point < 0xd800 || point > 0xdfff)
            check(String.fromCodePoint(point));
        for (const a of atoms)
          for (const b of atoms) for (const c of atoms) check(a + b + c);
        for (const input of normalizationRandom) check(input);
        break;
      }
      case "positive-and":
        for (const task of corpus)
          for (const base of terms) {
            const before = matches(task, base).accepted;
            for (const added of terms) {
              const after = matches(task, `${base} ${added}`).accepted;
              test({ task, base, added, before, after }, !after || before);
            }
          }
        break;
      case "phrase-subset":
        for (const task of corpus)
          for (const first of terms)
            for (const second of terms) {
              const phrase = `${first} ${second}`;
              const quoted = matches(task, `"${phrase}"`).accepted;
              const unquoted = matches(task, phrase).accepted;
              test({ task, phrase, quoted, unquoted }, !quoted || unquoted);
            }
        break;
      case "prefix":
        for (const prefix of prefixes) {
          const filters = Schema.decodeUnknownSync(TaskFilters)({ prefix });
          const actual = filterTaskRecords(tasks, filters, {
            projects: [],
            tags: [],
          }).map((task) => task.id);
          const expected = tasks
            .filter((task) =>
              task.id.toLowerCase().startsWith(prefix.toLowerCase()),
            )
            .map((task) => task.id);
          witness = { prefix, actual, expected };
          counts[property] = (counts[property] ?? 0) + 1;
          assert.deepEqual(actual, expected, property);
        }
        break;
      case "spans": {
        const graphemes = new Intl.Segmenter("und", {
          granularity: "grapheme",
        });
        let positiveSpans = 0;
        let descriptionSpans = 0;
        for (const task of corpus)
          for (const query of [
            "e",
            ...terms,
            ...atoms,
            '"pay rent"',
            '"pay re',
            "rent -draft",
            "-draft",
            " ",
            "pay pay",
            "𐐨",
          ]) {
            const result = matches(task, query);
            test(
              { task, query, result },
              result.accepted || result.matches.length === 0,
            );
            let previous: (typeof result.matches)[number] | undefined;
            for (const span of result.matches) {
              const value = task[span.field] ?? "";
              const boundaries = new Set([0, value.length]);
              for (const part of graphemes.segment(value)) {
                boundaries.add(part.index);
                boundaries.add(part.index + part.segment.length);
              }
              test(
                { task, query, span, previous },
                Number.isInteger(span.start) &&
                  Number.isInteger(span.end) &&
                  span.start >= 0 &&
                  span.end > span.start &&
                  span.end <= value.length &&
                  boundaries.has(span.start) &&
                  boundaries.has(span.end) &&
                  (previous === undefined ||
                    (previous.field === span.field
                      ? previous.end <= span.start
                      : previous.field === "title" &&
                        span.field === "description")),
              );
              positiveSpans++;
              if (span.field === "description") descriptionSpans++;
              previous = span;
            }
          }
        test(
          { positiveSpans, descriptionSpans },
          positiveSpans > 100 && descriptionSpans > 100,
        );
        break;
      }
      default:
        throw new Error(`Unknown property ${property}`);
    }
  }
  console.log(
    JSON.stringify({
      passed: true,
      seed,
      atoms,
      terms,
      taskCorpus: corpus.length,
      normalizationRandom: normalizationRandom.length,
      prefixTasks: tasks.length,
      prefixQueries: prefixes.size,
      counts,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      passed: false,
      kind:
        error instanceof Error && error.name === "AssertionError"
          ? "behavior-assertion"
          : "execution-error",
      property,
      witness,
      counts,
      error: String(error),
    }),
  );
  process.exitCode = 1;
}
