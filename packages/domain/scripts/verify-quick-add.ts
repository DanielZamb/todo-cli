import { deepStrictEqual } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { Effect, Schema } from "effect";
import { parseQuickAdd, QuickAddInput } from "../src/index.ts";

const evidence = process.argv[2];
if (!evidence || !isAbsolute(evidence))
  throw new Error("Expected absolute evidence directory");
mkdirSync(evidence, { recursive: true });
const actions: unknown[] = [];
await Effect.runPromise(
  Effect.gen(function* () {
    const input = Schema.decodeUnknownSync(QuickAddInput)({
      text: "Ship tomorrow scheduled:fri 10am p1 #Launch #launch @Client",
      now: "2026-10-27T02:00:00Z",
      time_zone: "America/Bogota",
    });
    const expected = {
      title: "Ship",
      due_at: { kind: "date", date: "2026-10-27" },
      scheduled_at: {
        kind: "instant",
        utc: "2026-10-30T15:00:00Z",
        time_zone: "America/Bogota",
      },
      priority: "P1",
      tags: ["launch"],
      project: "Client",
    };
    for (let run = 0; run < 2; run++) {
      const draft = yield* parseQuickAdd(input);
      actions.push({ input, draft });
      deepStrictEqual(draft, expected);
    }
    const quoted = { ...input, text: 'Say "tomorrow" "#literal"' };
    const draft = yield* parseQuickAdd(quoted);
    actions.push({ input: quoted, draft });
    deepStrictEqual(draft, {
      title: "Say tomorrow #literal",
      due_at: null,
      scheduled_at: null,
      priority: "P3",
      tags: [],
      project: null,
    });
    const named = {
      ...input,
      text: `Prepare #"Deep Focus" @'Client Project' "#literal" p1`,
    };
    const namedDraft = yield* parseQuickAdd(named);
    deepStrictEqual(namedDraft, {
      title: "Prepare #literal",
      due_at: null,
      scheduled_at: null,
      priority: "P1",
      tags: ["deep focus"],
      project: "Client Project",
    });
    actions.push({ input: named, draft: namedDraft });
    for (const text of [
      "tomorrow p1",
      "Ship tomorrow fri",
      "Meet tomorrow 10:60am",
      "Meet 2026-03-08 2:30am",
      "Meet 2026-11-01 1:30am",
    ]) {
      const request = {
        ...input,
        text,
        time_zone: Schema.decodeUnknownSync(QuickAddInput.fields.time_zone)(
          "America/New_York",
        ),
      };
      const error = yield* parseQuickAdd(request).pipe(Effect.flip);
      deepStrictEqual(error._tag, "QuickAddError");
      if (text === "Meet tomorrow 10:60am")
        deepStrictEqual(error.message, "Minute must be between 0 and 59");
      actions.push({
        input: request,
        error: error._tag,
        message: error.message,
      });
    }
  }),
);
writeFileSync(
  join(evidence, "actions.json"),
  `${JSON.stringify(actions, null, 2)}\n`,
);
writeFileSync(
  join(evidence, "result.json"),
  `${JSON.stringify({ result: "PASS", actions: actions.length })}\n`,
);
