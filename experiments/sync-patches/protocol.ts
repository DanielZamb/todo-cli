import type { Replica, Patch } from "./model.ts";
import { applyPatch, bytes } from "./patch.ts";
export class Subscription {
  private seen = new Set<string>();
  private lane = Promise.resolve();
  private queuedBytes = 0;
  private epoch = 0;
  replica: Replica;
  readonly pending = new Map<string, string>();
  caughtUp = false;
  reason = "start";
  constructor(
    replica: Replica,
    readonly budget = 1048576,
  ) {
    this.replica = replica;
    this.seen.add(replica.cursor);
  }
  replace(replica: Replica) {
    this.epoch++;
    this.replica = replica;
    this.seen.clear();
    this.seen.add(replica.cursor);
    this.caughtUp = false;
    this.reason = "profile";
    return this.epoch;
  }
  token() {
    return this.epoch;
  }
  markCaughtUp(epoch: number, generation: string, to: string) {
    if (
      epoch === this.epoch &&
      generation === this.replica.generation &&
      to === this.replica.cursor
    )
      this.caughtUp = true;
  }
  enqueue(epoch: number, patch: Patch) {
    const size = bytes(patch);
    if (size + this.queuedBytes > this.budget) {
      this.reason = "overflow";
      this.caughtUp = false;
      return Promise.resolve(false);
    }
    this.queuedBytes += size;
    const work = this.lane
      .then(() => {
        if (epoch !== this.epoch) return false;
        if (this.seen.has(patch.to)) return true;
        if (
          this.replica.cursor !== patch.from ||
          this.replica.generation !== patch.generation
        ) {
          this.reason = "gap";
          this.caughtUp = false;
          return false;
        }
        const next = applyPatch(this.replica, patch);
        this.replica = next;
        this.seen.add(next.cursor);
        if (this.seen.size > 256) {
          const oldest = this.seen.values().next().value;
          if (oldest) this.seen.delete(oldest);
        }
        return true;
      })
      .finally(() => {
        this.queuedBytes -= size;
      });
    this.lane = work.then(() => {});
    return work;
  }
  refuse(id: string) {
    this.pending.delete(id);
  }
}
