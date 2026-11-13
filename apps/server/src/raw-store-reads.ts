import type { OperationStore } from "@todo/domain/store";

// The two readers that hold the undecorated store see only these members, so
// neither can build TaskCommands or reach a writer on it. Commits must go
// through the decorated store, which wakes streams at the outermost exit.
export type StreamReads = Pick<
  OperationStore,
  "changesRead" | "terminalChangesRead"
> & {
  readonly auth: Pick<
    OperationStore["auth"],
    "withRead" | "checkRead" | "authenticate" | "withStreamRead"
  >;
  readonly snapshots: Pick<OperationStore["snapshots"], "generation">;
  readonly diagnostics: Pick<
    OperationStore["diagnostics"],
    "connect" | "disconnect" | "delivered"
  >;
};

export type CacheHygieneReads = Pick<OperationStore, "searchCacheEvents"> & {
  readonly searchWords: Pick<OperationStore["searchWords"], "clearAll">;
};
