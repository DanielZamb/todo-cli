// Which History a request committed. The three places that insert a committed
// op_log row note its seq and event text here; a request that wants to report
// it (an HTTP write reply, a CLI command's JSON) runs inside collectCommitted
// and gets the highest seq it committed and can still confirm. The cell lives
// in the fiber's context, so two requests interleaving between transactions
// never see each other's notes.
import { Context, Effect, Fiber, Schema } from "effect";

export const OperationSeq = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
).annotate({
  description:
    "Present: everything this request committed to History is at or below this seq, in the generation that was current from the request's first commit until its reply (a restore in between leaves the field out). A Catalog whose position has that generation and a seq at least this value reflects all of it. No write reply names the generation (there is no generation header; only a Snapshot restore's report carries one, the new generation): a client holds it from its last Catalog position or stream, and a restore reaches the stream as reload. Absent: read to find out. Absence never means nothing changed; a dry run, a refusal, a concurrent Purge or restore, and History written outside the request (such as a sign-in) all leave it out.",
});
export const operationSeqField = {
  operation_seq: Schema.optionalKey(OperationSeq),
};

/**
 * A committed op_log row as inserted: its seq, its exact event text, and the
 * columns Purge never rewrites (actor, profile, versions; occurred_at lives in
 * the event and is kept by a redaction too).
 */
export type NotedOperation = {
  readonly seq: number;
  readonly event: string;
  readonly actor: string;
  readonly profile: string | null;
  readonly from_version: number | null;
  readonly to_version: number | null;
  readonly occurred_at: string;
};
type Reader = {
  readonly query: (sql: string) => {
    readonly get: (...values: (string | number)[]) => unknown;
  };
};
type Cell = {
  noted: { readonly db: Reader; readonly row: NotedOperation }[];
  /** Each database's generation at the request's first note there; null if unreadable. */
  generations: Map<Reader, string | null>;
};
/** The request's cell. Exported for tests that need a failing collector. */
export const CommittedOperationsCell = Context.Reference<Cell | undefined>(
  "todo/CommittedOperations",
  { defaultValue: () => undefined },
);
const currentCell = () => {
  const fiber = Fiber.getCurrent();
  return fiber
    ? Context.get(fiber.context, CommittedOperationsCell)
    : undefined;
};

// A dry run appends to an in-memory fork of the store: never History.
const previews = new WeakSet<object>();
export const markPreviewConnection = (db: object) => {
  previews.add(db);
};

/**
 * Called right after a committed op_log row is inserted, inside its
 * transaction. Total: bookkeeping never costs a commit, so anything that goes
 * wrong here only loses the note (the field is then absent: read to find out).
 * Outside a running fiber (a promise callback, a timer) Fiber.getCurrent() is
 * undefined, so such a note is dropped, never given to another request.
 */
export const noteCommitted = (db: Reader, row: NotedOperation) => {
  try {
    if (previews.has(db)) return;
    const cell = currentCell();
    if (!cell) return;
    cell.noted.push({ db, row });
    if (!cell.generations.has(db)) cell.generations.set(db, generationOf(db));
  } catch {}
};

// The generation a seq belongs to: the newest committed DatabaseRestored's, or
// "initial". The same rule as the Profile classification (auth.ts) and
// snapshots.generationSync. null when it cannot be read.
const generationOf = (db: Reader): string | null => {
  try {
    const row = db
      .query(
        "SELECT json_extract(event,'$.generation') AS generation FROM op_log WHERE profile IS NULL AND actor='snapshot-restore' AND outcome='committed' AND json_extract(event,'$.kind')='DatabaseRestored' ORDER BY seq DESC LIMIT 1",
      )
      .get() as { generation: string | null } | null;
    return row?.generation ?? "initial";
  } catch {
    return null;
  }
};

// How a noted row stands when the request ends:
// - "committed": a committed row at that seq with byte-identical event text;
// - "rolled-back": no row at that seq, or a row whose kept columns differ, so
//   the seq was taken by another operation after this insert rolled back;
// - "unaccounted": a committed row with the same kept columns but other event
//   bytes. Purge redacts that way (it rewrites event and entity_version only),
//   and a same-shaped reuse would look the same, so it cannot be told apart.
// A failed lookup is unaccounted too.
type Standing = "committed" | "rolled-back" | "unaccounted";
const standing = (db: Reader, row: NotedOperation): Standing => {
  try {
    const stored = db
      .query(
        "SELECT actor,profile,from_version,to_version,outcome,event,json_extract(event,'$.occurred_at') AS occurred_at FROM op_log WHERE seq=?",
      )
      .get(row.seq) as {
      actor: string;
      profile: string | null;
      from_version: number | null;
      to_version: number | null;
      outcome: string;
      event: string;
      occurred_at: string | null;
    } | null;
    if (!stored) return "rolled-back";
    const kept =
      stored.outcome === "committed" &&
      stored.actor === row.actor &&
      stored.profile === row.profile &&
      stored.from_version === row.from_version &&
      stored.to_version === row.to_version &&
      stored.occurred_at === row.occurred_at;
    if (!kept) return "rolled-back";
    return stored.event === row.event ? "committed" : "unaccounted";
  } catch {
    return "unaccounted";
  }
};
// A seq is reported only when every note is accounted for: the highest
// committed one, ignoring rolled-back inserts. One unaccounted note (a
// redacted row, a failed lookup) means nothing is reported, never a lower seq.
// A seq means something only inside one generation: when a restore moved the
// generation after the request's first note, nothing is reported (a restore
// reuses seqs, so a note would otherwise read as rolled back).
const settled = (cell: Cell) => {
  for (const [db, generation] of cell.generations)
    if (generation === null || generationOf(db) !== generation) return null;
  let seq: number | null = null;
  for (const { db, row } of cell.noted) {
    const state = standing(db, row);
    if (state === "unaccounted") return null;
    if (state === "committed" && (seq === null || row.seq > seq)) seq = row.seq;
  }
  return seq;
};

/** The highest seq confirmed so far for the request running on this fiber. */
export const committedSoFar = () => {
  const cell = currentCell();
  return cell ? settled(cell) : null;
};

/** Runs an effect and returns what it produced with the highest seq it committed. */
export const collectCommitted = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.suspend(() => {
    const cell: Cell = { noted: [], generations: new Map() };
    return effect.pipe(
      Effect.provideService(CommittedOperationsCell, cell),
      Effect.map((value) => ({ value, seq: settled(cell) })),
    );
  });

/** The value with operation_seq set when the request committed History. */
export const withOperationSeq = <A extends object, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.map(collectCommitted(effect), ({ value, seq }) =>
    seq === null ? value : ({ ...value, operation_seq: seq } as A),
  );
