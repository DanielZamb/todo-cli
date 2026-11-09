import type { ProfileId } from "./ids.ts";
import { fieldWords, type Word } from "./task-search.ts";

type Entry = {
  readonly profile: ProfileId;
  readonly words: readonly Word[];
  readonly bytes: number;
};

export class TaskSearchCache {
  private readonly entries = new Map<string, Entry>();
  private chargedBytes = 0;

  private key(profile: ProfileId, text: string) {
    return `${profile.length}:${profile}${text}`;
  }

  get usage() {
    return { entries: this.entries.size, chargedBytes: this.chargedBytes };
  }

  readonly words = (profile: ProfileId, text: string): readonly Word[] => {
    const key = this.key(profile, text);
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.words;
    }
    const prepared = fieldWords(text);
    const bytes =
      128 +
      2 * (key.length + profile.length) +
      prepared.reduce((sum, word) => sum + 96 + 2 * word.text.length, 0);
    if (bytes > 4 * 1024 * 1024) return prepared;
    while (
      this.entries.size >= 4096 ||
      this.chargedBytes + bytes > 16 * 1024 * 1024
    ) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.drop(oldest.value);
    }
    this.entries.set(key, { profile, words: prepared, bytes });
    this.chargedBytes += bytes;
    return prepared;
  };

  private drop(key: string) {
    const entry = this.entries.get(key);
    if (entry) {
      this.chargedBytes -= entry.bytes;
      this.entries.delete(key);
    }
  }

  evict(profile: ProfileId, text: string) {
    this.drop(this.key(profile, text));
  }

  evictProfile(profile: ProfileId) {
    for (const [key, entry] of this.entries)
      if (entry.profile === profile) this.drop(key);
  }

  clear() {
    this.entries.clear();
    this.chargedBytes = 0;
  }
}
