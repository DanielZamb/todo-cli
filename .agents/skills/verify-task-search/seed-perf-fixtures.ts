import { readFileSync } from "node:fs";
import { Effect, Schema } from "effect";
import { ActorId, Profile, Task } from "../../../packages/domain/src/index.ts";
import { openStore } from "../../../packages/domain/src/store/store.ts";
const fixture = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8"));
await Effect.runPromise(
  Effect.gen(function* () {
    const store = yield* openStore({ path: process.env.TODO_DB ?? "" });
    try {
      for (const scenario of fixture.scenarios) {
        const time = "2026-11-09T12:00:00Z";
        yield* store.putProfile(
          Schema.decodeUnknownSync(Profile)({
            id: scenario.name,
            name: scenario.name,
            created_at: time,
            updated_at: time,
          }),
        );
        for (let i = 0; i < scenario.tasks; i++) {
          const task = Schema.decodeUnknownSync(Task)({
            id: `${scenario.name}-${i}`,
            profile_id: scenario.name,
            title: `Rent café ${i}`,
            description:
              scenario.description.repeat(scenario.repeat) + ` marker${i}`,
            entity_version: 1,
            row_version: 1,
            status: "open",
            project_id: null,
            priority: "P2",
            scheduled_at: null,
            due_at: null,
            energy: null,
            estimate_min: null,
            source: "agent",
            tags: [],
            occurrence: null,
            created_at: time,
            updated_at: time,
            completed_at: null,
            deleted_at: null,
          });
          const entry = yield* store.append({
            actor: Schema.decodeUnknownSync(ActorId)("cache-fixture"),
            profile: task.profile_id,
            event: {
              kind: "TaskCreated",
              entity_version: 1,
              occurred_at: time,
              task,
              series: null,
              project: null,
              tags: [],
            },
          });
          if (entry.outcome !== "committed")
            throw new Error(entry.reason ?? "Fixture rejected");
        }
      }
    } finally {
      yield* store.close();
    }
  }),
);
