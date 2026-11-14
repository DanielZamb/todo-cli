// Which History a request committed. The three places that insert a committed
// op_log row note its seq here; a request that wants to report it (an HTTP
// write reply, a CLI command's JSON) runs inside collectCommitted and gets the
// highest seq it committed. The cell lives in the fiber's context, so two
// requests interleaving between transactions never see each other's seqs.
import { Context, Effect, Fiber, Schema } from "effect";

export const OperationSeq = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
).annotate({
  description:
    "Present when the request committed History: the highest seq it committed, so every operation it committed is at or below this seq. A Catalog whose position.seq is at least this value (same generation) reflects all of them. Absent when nothing was committed (a dry run, a refusal, a no-op).",
});
export const operationSeqField = {
  operation_seq: Schema.optionalKey(OperationSeq),
};

/** A committed op_log row as inserted: enough to recognise it again later. */
export type NotedOperation = {
  readonly seq: number;
  readonly actor: string;
  readonly occurred_at: string;
};
type Reader = {
  readonly query: (sql: string) => {
    readonly get: (...values: (string | number)[]) => unknown;
  };
};
type Cell = { noted: { readonly db: Reader; readonly row: NotedOperation }[] };
const CurrentCommits = Context.Reference<Cell | undefined>(
  "todo/CommittedOperations",
  { defaultValue: () => undefined },
);
const currentCell = () => {
  const fiber = Fiber.getCurrent();
  return fiber ? Context.get(fiber.context, CurrentCommits) : undefined;
};

// A dry run appends to an in-memory fork of the store: never History.
const previews = new WeakSet<object>();
export const markPreviewConnection = (db: object) => {
  previews.add(db);
};

/** Called right after a committed op_log row is inserted, inside its transaction. */
export const noteCommitted = (db: Reader, row: NotedOperation) => {
  if (!previews.has(db)) currentCell()?.noted.push({ db, row });
};

// A row noted inside a transaction that rolled back (a dry run, a failure) is
// gone, or its seq was taken by another operation: only rows still present
// with the same actor and time count. Purge keeps both.
const settled = (cell: Cell) => {
  let seq: number | null = null;
  for (const { db, row } of cell.noted)
    if (
      (seq === null || row.seq > seq) &&
      db
        .query(
          "SELECT 1 AS found FROM op_log WHERE seq=? AND outcome='committed' AND actor=? AND json_extract(event,'$.occurred_at')=?",
        )
        .get(row.seq, row.actor, row.occurred_at) !== null
    )
      seq = row.seq;
  return seq;
};

/** The highest seq committed so far by the request running on this fiber. */
export const committedSoFar = () => {
  const cell = currentCell();
  return cell ? settled(cell) : null;
};

/** Runs an effect and returns what it produced with the highest seq it committed. */
export const collectCommitted = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.suspend(() => {
    const cell: Cell = { noted: [] };
    return effect.pipe(
      Effect.provideService(CurrentCommits, cell),
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
