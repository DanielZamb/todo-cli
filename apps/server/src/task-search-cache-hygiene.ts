import { Effect, Schedule } from "effect";
import type { CacheHygieneReads } from "./raw-store-reads.ts";

export const taskSearchCacheHygiene = (store: CacheHygieneReads) =>
  Effect.gen(function* () {
    let cursor = yield* store.searchCacheEvents();
    const poll = Effect.gen(function* () {
      const current = yield* store.searchCacheEvents(cursor);
      if (
        current.generation !== cursor.generation ||
        current.events.some(
          (event) =>
            event.kind === "TaskPurged" ||
            event.kind === "ProfileDeleted" ||
            (event.kind === "TaskHistoryRedacted" &&
              event.original_kind === "TaskPurged"),
        )
      )
        store.searchWords.clearAll();
      cursor = current;
    });
    return {
      poll,
      run: poll.pipe(
        Effect.catch((error) =>
          Effect.logError("Search cache hygiene failed", error),
        ),
        Effect.repeat(Schedule.spaced("250 millis")),
      ),
    };
  });
