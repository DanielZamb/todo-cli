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
    "Present: everything this request committed to History is at or below this seq, so a Catalog whose position.seq is at least this value (same generation) reflects all of it. Absent: read to find out. Absence never means nothing changed; a dry run, a refusal, and History written outside the request (such as a sign-in) all leave it out.",
});
export const operationSeqField = {
  operation_seq: Schema.optionalKey(OperationSeq),
};

/** A committed op_log row as inserted: its seq and its exact event text. */
export type NotedOperation = {
  readonly seq: number;
  readonly event: string;
};
type Reader = {
  readonly query: (sql: string) => {
    readonly get: (...values: (string | number)[]) => unknown;
  };
};
type Cell = { noted: { readonly db: Reader; readonly row: NotedOperation }[] };
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
    if (!previews.has(db)) currentCell()?.noted.push({ db, row });
  } catch {}
};

// A row noted inside a transaction that rolled back (a dry run, a failure) is
// gone, or its seq was taken by another operation. Only a committed row at
// that seq with the byte-identical event text counts: a false match would be
// the same operation. A failed lookup counts as unconfirmed.
const confirmed = (db: Reader, row: NotedOperation) => {
  try {
    return (
      db
        .query(
          "SELECT 1 AS found FROM op_log WHERE seq=? AND outcome='committed' AND event=?",
        )
        .get(row.seq, row.event) !== null
    );
  } catch {
    return false;
  }
};
const settled = (cell: Cell) => {
  let seq: number | null = null;
  for (const { db, row } of cell.noted)
    if ((seq === null || row.seq > seq) && confirmed(db, row)) seq = row.seq;
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
    const cell: Cell = { noted: [] };
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
