import { chmod, lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import { RecordingRun, recordingLimits } from "../diagnostic-recordings.ts";
import {
  admissionIncomplete,
  emptyRecordingAdmission,
  type RecordingAdmission,
  recordingRunDefinition,
} from "../recording-admission.ts";
import { RecordingRefusal } from "../recording-refusal.ts";

const Stored = Schema.Struct({ updated_at: Schema.Number, run: RecordingRun });
type State = {
  updated_at: number;
  run: typeof RecordingRun.Type;
  dirty: boolean;
  durable: RecordingAdmission | undefined;
};
const max = (a: number | null, b: number | null) =>
  a === null || b === null ? null : Math.max(a, b);
const increment = (a: number | null, n: number) =>
  a === null || !Number.isSafeInteger(a + n) ? null : a + n;
export class RecordingAdmissions {
  private readonly states = new Map<string, State>();
  constructor(private readonly block: () => number) {}
  static isFile(name: string) {
    return /^[a-f0-9-]{36}\.admission\.json$/iu.test(name);
  }
  ids() {
    return this.states.keys();
  }
  values() {
    return this.states.values();
  }
  base(id: string) {
    return this.states.get(id)?.run;
  }
  dirty(id?: string) {
    return id
      ? !!this.states.get(id)?.dirty
      : [...this.states.values()].some((state) => state.dirty);
  }
  bytes(app?: string) {
    return (
      [...this.states.values()].filter((state) => !app || state.run.app === app)
        .length * this.block()
    );
  }
  charge(app: string, cap: number) {
    const bytes = this.bytes(app);
    return bytes + Math.min(bytes ? this.block() : 0, Math.max(0, cap - bytes));
  }
  state(id: string) {
    return this.states.get(id)?.run.admission ?? emptyRecordingAdmission();
  }
  durable(id: string) {
    return this.states.get(id)?.durable ?? emptyRecordingAdmission();
  }
  covers(id: string, required: RecordingAdmission) {
    if (!admissionIncomplete(required)) return true;
    const stored = this.durable(id);
    const includes = (actual: number | null, expected: number | null) =>
      actual === null || (expected !== null && actual >= expected);
    return (
      admissionIncomplete(stored) &&
      includes(stored.refused_batches, required.refused_batches) &&
      includes(stored.unadmitted_events, required.unadmitted_events)
    );
  }
  describe(run: typeof RecordingRun.Type) {
    return {
      ...recordingRunDefinition(run),
      admission: this.state(run.run_id),
    };
  }
  merge(run: typeof RecordingRun.Type, now: number) {
    if (!admissionIncomplete(run.admission)) return false;
    const previous = this.states.get(run.run_id),
      old = previous?.run.admission ?? emptyRecordingAdmission(),
      incoming = run.admission;
    if (!incoming) return false;
    const admission: RecordingAdmission = {
      schema_version: 1,
      policy: "whole_batch",
      refused_batches: max(old.refused_batches, incoming.refused_batches),
      unadmitted_events: max(old.unadmitted_events, incoming.unadmitted_events),
      incomplete: true,
    };
    if (previous && JSON.stringify(old) === JSON.stringify(admission))
      return false;
    this.put(previous?.run ?? run, admission, now);
    return true;
  }
  refuse(run: typeof RecordingRun.Type, count: number, now: number) {
    this.merge(run, now);
    const old = this.state(run.run_id);
    this.put(
      this.base(run.run_id) ?? run,
      {
        schema_version: 1,
        policy: "whole_batch",
        refused_batches: increment(old.refused_batches, 1),
        unadmitted_events: increment(old.unadmitted_events, count),
        incomplete: true,
      },
      now,
    );
  }
  private put(
    run: typeof RecordingRun.Type,
    admission: RecordingAdmission,
    now: number,
  ) {
    if (
      !this.states.has(run.run_id) &&
      this.states.size >= recordingLimits.knownRuns
    )
      throw new RecordingRefusal("run_capacity");
    this.states.set(run.run_id, {
      updated_at: now,
      run: { ...recordingRunDefinition(run), admission },
      dirty: true,
      durable: this.states.get(run.run_id)?.durable,
    });
  }
  async load(
    directory: string,
    names: string[],
    read: (name: string) => Promise<string>,
  ) {
    for (const name of names.filter(RecordingAdmissions.isFile)) {
      if (this.states.size >= recordingLimits.knownRuns)
        throw new Error("Admission state limit");
      const info = await lstat(join(directory, name));
      if (!info.isFile() || info.isSymbolicLink() || info.size > 2048)
        throw new Error("Invalid admission state");
      const value = Schema.decodeUnknownSync(Stored, {
        onExcessProperty: "error",
      })(JSON.parse(await read(name)));
      if (
        name !== `${value.run.run_id}.admission.json` ||
        !admissionIncomplete(value.run.admission)
      )
        throw new Error("Invalid admission state");
      this.states.set(value.run.run_id, {
        ...value,
        dirty: false,
        durable: value.run.admission,
      });
      await chmod(join(directory, name), 0o600);
    }
  }
  async persist(
    id: string,
    write: (name: string, text: string) => Promise<void>,
  ) {
    const value = this.states.get(id);
    if (!value?.dirty) return;
    const text = JSON.stringify({
      updated_at: value.updated_at,
      run: value.run,
    });
    if (Buffer.byteLength(text) > 2048)
      throw new Error("Admission state limit");
    await write(`${id}.admission.json`, text);
    const current = this.states.get(id);
    if (current) current.durable = value.run.admission;
    if (this.states.get(id) === value) value.dirty = false;
  }
  oldest(active: ReadonlySet<string>) {
    return Math.min(
      ...[...this.states.values()]
        .filter((state) => !active.has(state.run.run_id))
        .map((state) => state.updated_at),
    );
  }
  async expire(
    directory: string,
    now: number,
    active: () => ReadonlySet<string>,
  ) {
    let retained = active();
    for (const [id, state] of this.states)
      if (
        !retained.has(id) &&
        state.updated_at < now - recordingLimits.retentionMs
      ) {
        try {
          await unlink(join(directory, `${id}.admission.json`));
        } catch (error) {
          if (
            !(
              error instanceof Error &&
              "code" in error &&
              error.code === "ENOENT"
            )
          )
            throw error;
        }
        retained = active();
        const current = this.states.get(id);
        if (current) current.durable = undefined;
        if (this.states.get(id) === state) {
          if (retained.has(id)) state.dirty = true;
          else this.states.delete(id);
        }
      }
  }
}
