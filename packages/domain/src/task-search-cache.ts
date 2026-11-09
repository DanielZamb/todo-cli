import type { ProfileId } from "./ids.ts";
import { fieldWords, type PreparedField } from "./task-search.ts";

type Read = { readonly profile: ProfileId; readonly generation: number };
type Entry = {
  readonly profile: ProfileId;
  readonly prepared: PreparedField;
  readonly bytes: number;
};
type Pending = { readonly read: Read; readonly bytes: number };
const entryLimit = 4096;
const byteLimit = 16 * 1024 * 1024;
const perEntryLimit = 4 * 1024 * 1024;

export class TaskSearchCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Pending>();
  private readonly purgeGen = new Map<ProfileId, number>();
  private retainedBytes = 0;
  private pendingBytes = 0;
  private closed = false;

  read(profile: ProfileId): Read {
    return { profile, generation: this.purgeGen.get(profile) ?? 0 };
  }

  private canAdmit(read: Read) {
    return (
      !this.closed && read.generation === (this.purgeGen.get(read.profile) ?? 0)
    );
  }

  private key(profile: ProfileId, text: string) {
    return `${profile.length}:${profile}${text}`;
  }

  private keyBytes(profile: ProfileId, text: string) {
    return (
      128 +
      2 * (String(profile.length).length + 1 + 2 * profile.length + text.length)
    );
  }

  get usage() {
    return {
      entries: this.entries.size,
      pending: this.pending.size,
      retainedBytes: this.retainedBytes,
      pendingBytes: this.pendingBytes,
      chargedBytes: this.retainedBytes + this.pendingBytes,
      generationProfiles: this.purgeGen.size,
      generationBytes: Array.from(this.purgeGen.keys()).reduce(
        (sum, profile) => sum + 136 + 2 * profile.length,
        0,
      ),
      closed: this.closed,
    };
  }

  readonly words = (read: Read, text: string) => this.prepare(read, text);

  private *prepare(read: Read, text: string): Generator<void, PreparedField> {
    const bytes = this.keyBytes(read.profile, text);
    if (this.closed || bytes > perEntryLimit) return yield* fieldWords(text);
    const key = this.key(read.profile, text);
    const entry = this.entries.get(key);
    if (entry) {
      if (this.canAdmit(read)) {
        this.entries.delete(key);
        this.entries.set(key, entry);
      }
      return entry.prepared;
    }
    const token = this.register(read, key, bytes);
    try {
      const prepared = yield* fieldWords(text);
      if (token && this.pending.get(key) === token && this.canAdmit(read))
        this.retain(key, token, prepared);
      return prepared;
    } finally {
      if (token) this.dropPending(key, token);
    }
  }

  private register(
    read: Read,
    key: string,
    bytes: number,
  ): Pending | undefined {
    if (!this.canAdmit(read)) return undefined;
    const previous = this.pending.get(key);
    if (previous) this.dropPending(key, previous);
    if (this.pending.size >= entryLimit || !this.reserve(bytes, entryLimit))
      return undefined;
    const token = { read, bytes };
    this.pending.set(key, token);
    this.pendingBytes += bytes;
    return token;
  }

  private retain(key: string, token: Pending, prepared: PreparedField) {
    this.dropPending(key, token);
    const bytes =
      token.bytes +
      64 +
      prepared.words.reduce((sum, word) => sum + 96 + 2 * word.text.length, 0);
    if (bytes > perEntryLimit || !this.reserve(bytes, entryLimit - 1)) return;
    this.entries.set(key, { profile: token.read.profile, prepared, bytes });
    this.retainedBytes += bytes;
  }

  private reserve(bytes: number, retainedLimit: number) {
    for (const key of this.entries.keys()) {
      if (
        this.retainedBytes + this.pendingBytes + bytes <= byteLimit &&
        this.entries.size <= retainedLimit
      )
        break;
      this.dropEntry(key);
    }
    return this.retainedBytes + this.pendingBytes + bytes <= byteLimit;
  }

  private dropEntry(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      this.retainedBytes -= entry.bytes;
      this.entries.delete(key);
    }
  }

  private dropPending(key: string, token: Pending) {
    if (this.pending.get(key) === token) {
      this.pendingBytes -= token.bytes;
      this.pending.delete(key);
    }
  }

  revoke(profile: ProfileId) {
    if (!this.closed)
      this.purgeGen.set(profile, (this.purgeGen.get(profile) ?? 0) + 1);
  }

  evict(profile: ProfileId, text: string) {
    const key = this.key(profile, text);
    this.dropEntry(key);
    const token = this.pending.get(key);
    if (token) this.dropPending(key, token);
  }

  evictProfile(profile: ProfileId) {
    this.revoke(profile);
    for (const [key, entry] of this.entries)
      if (entry.profile === profile) this.dropEntry(key);
    for (const [key, token] of this.pending)
      if (token.read.profile === profile) this.dropPending(key, token);
  }

  close() {
    this.closed = true;
    this.entries.clear();
    this.pending.clear();
    this.purgeGen.clear();
    this.retainedBytes = 0;
    this.pendingBytes = 0;
  }
}
