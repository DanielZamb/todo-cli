import { type LookupMatch, LookupQuery } from "@todo/domain";
import { Schema } from "effect";
import type { Reply, Request } from "./protocol.ts";

export type DiscoveryKind = "directory" | "lookup";
type Identity = {
  readonly credentialGeneration: number;
  readonly dialogGeneration: number;
  readonly generation: number;
  readonly kind: DiscoveryKind;
  readonly prefix: string;
};
type AppliedSnapshot = {
  readonly requestedIdentity: Identity;
  readonly result: Extract<Reply, { _tag: "directory" | "lookup" }>;
};
export type DiscoveryState =
  | { kind: "Closed" }
  | { kind: "Invalid"; dialog: DiscoveryKind; prefix: string }
  | {
      kind: "Editing";
      dialog: DiscoveryKind;
      prefix: string;
    }
  | {
      kind: "Requesting";
      requestedIdentity: Identity;
    }
  | { kind: "Showing"; appliedSnapshot: AppliedSnapshot }
  | {
      kind: "ResponseError";
      requestedIdentity: Identity;
      message: string;
    };
export class DiscoveryStateController {
  private credentialGeneration = 0;
  private dialogGeneration = 0;
  private generation = 0;
  private state: DiscoveryState = { kind: "Closed" };
  private listeners = new Set<() => void>();
  readonly snapshot = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DiscoveryState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  readonly close = () => {
    this.dialogGeneration++;
    this.generation++;
    this.publish({ kind: "Closed" });
  };
  readonly credentialChanged = () => {
    this.credentialGeneration++;
    this.close();
  };
  open(dialog: DiscoveryKind) {
    this.close();
    this.publish({ kind: "Editing", dialog, prefix: "" });
  }
  editPrefix(prefix: string) {
    if (this.state.kind === "Closed") return;
    this.generation++;
    this.publish({ kind: "Editing", dialog: "lookup", prefix });
  }
  private current(identity: Identity) {
    return (
      this.state.kind !== "Closed" &&
      identity.credentialGeneration === this.credentialGeneration &&
      identity.dialogGeneration === this.dialogGeneration &&
      identity.generation === this.generation
    );
  }
  async submit(
    request: (request: Request) => Promise<Reply>,
    prefix: string,
    kind: DiscoveryKind,
  ) {
    if (this.state.kind === "Closed" || this.state.kind === "Requesting")
      return;
    if (kind === "lookup" && !Schema.is(LookupQuery.fields.prefix)(prefix)) {
      this.generation++;
      this.publish({ kind: "Invalid", dialog: kind, prefix });
      return;
    }
    const requestedIdentity: Identity = {
      credentialGeneration: this.credentialGeneration,
      dialogGeneration: this.dialogGeneration,
      generation: ++this.generation,
      kind,
      prefix,
    };
    this.publish({ kind: "Requesting", requestedIdentity });
    let result: Reply;
    try {
      result = await request(
        kind === "directory"
          ? { _tag: "directory" }
          : {
              _tag: "lookup",
              prefix: Schema.decodeUnknownSync(LookupQuery.fields.prefix)(
                prefix,
              ),
            },
      );
    } catch {
      result = {
        _tag: "error",
        message: "Could not contact Todo. Retry when connected.",
      };
    }
    if (!this.current(requestedIdentity)) return;
    if (
      (kind === "directory" && result._tag === "directory") ||
      (kind === "lookup" && result._tag === "lookup")
    ) {
      this.publish({
        kind: "Showing",
        appliedSnapshot: { requestedIdentity, result },
      });
    } else {
      this.publish({
        kind: "ResponseError",
        requestedIdentity,
        message:
          result._tag === "error"
            ? result.message
            : "Discovery is unavailable. Sign in and retry.",
      });
    }
  }
  retry(request: (request: Request) => Promise<Reply>) {
    if (this.state.kind !== "ResponseError") return;
    const { prefix, kind } = this.state.requestedIdentity;
    return this.submit(request, prefix, kind);
  }
  offline() {
    const state = this.state;
    if (
      state.kind === "Closed" ||
      state.kind === "Editing" ||
      state.kind === "Invalid"
    )
      return;
    const identity =
      state.kind === "Showing"
        ? state.appliedSnapshot.requestedIdentity
        : state.requestedIdentity;
    this.generation++;
    this.publish({
      kind: "ResponseError",
      requestedIdentity: { ...identity, generation: this.generation },
      message: "Todo is offline. Retry when connected.",
    });
  }
  async show(
    appliedSnapshot: AppliedSnapshot,
    match: typeof LookupMatch.Type,
    actions: {
      prepare: () => boolean | Promise<boolean>;
      request: (request: Request) => Promise<Reply>;
      open: (task: Extract<Reply, { _tag: "task" }>["task"]) => void;
      error: (message: string) => void;
    },
  ) {
    const authorized = () =>
      this.state.kind === "Showing" &&
      this.state.appliedSnapshot === appliedSnapshot &&
      this.current(appliedSnapshot.requestedIdentity);
    if (
      !authorized() ||
      appliedSnapshot.result._tag !== "lookup" ||
      !appliedSnapshot.result.matches.includes(match)
    )
      return;
    const source = { profile: match.profile.id, task: match.task_id };
    if (!(await actions.prepare()) || !authorized()) return;
    const credentialGeneration = this.credentialGeneration;
    this.close();
    const showGeneration = this.generation;
    const current = () =>
      credentialGeneration === this.credentialGeneration &&
      showGeneration === this.generation;
    let result: Reply;
    try {
      result = await actions.request({ _tag: "showTask", ...source });
    } catch {
      result = {
        _tag: "error",
        message: "Could not contact Todo. Retry when connected.",
      };
    }
    if (!current()) return;
    if (
      result._tag === "task" &&
      result.task.id === source.task &&
      result.task.profile_id === source.profile
    )
      actions.open(result.task);
    else
      actions.error(
        result._tag === "error"
          ? result.message
          : "Task is unavailable. Find it again.",
      );
  }
}
