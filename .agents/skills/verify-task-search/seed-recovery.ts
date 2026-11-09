import { Effect, Schema } from "effect";
import {
  ActorId,
  ProfileId,
  Project,
  Tag,
  Task,
} from "../../../packages/domain/src/index.ts";
import { openStore } from "../../../packages/domain/src/store/store.ts";
const path = process.env.TODO_DB ?? "";
if (!path.includes("todo-s01-verify-"))
  throw new Error("Expected explicit scratch database");
const profile = Schema.decodeUnknownSync(ProfileId)(process.argv[2]);
const padded = process.argv[3] === "padded";
const time = "2026-11-09T12:00:00Z";
await Effect.runPromise(
  Effect.gen(function* () {
    const store = yield* openStore({ path });
    try {
      const projects = yield* store.projects();
      const tags = yield* store.tags();
      const rows = [];
      for (const [index, projectName, tagName] of padded
        ? ([[0, null, " keep "]] as const)
        : ([
            [0, "Small", "keep"],
            [1, "Other", "KEEP"],
          ] as const)) {
        const project =
          projectName === null
            ? null
            : (projects.find(
                (value) =>
                  value.profile_id === profile && value.name === projectName,
              ) ??
              Schema.decodeUnknownSync(Project)({
                id: crypto.randomUUID(),
                profile_id: profile,
                name: projectName,
                created_at: time,
                updated_at: time,
              }));
        const tag =
          tags.find(
            (value) => value.profile_id === profile && value.name === tagName,
          ) ??
          Schema.decodeUnknownSync(Tag)({
            id: crypto.randomUUID(),
            profile_id: profile,
            name: tagName,
          });
        const task = Schema.decodeUnknownSync(Task)({
          id: crypto.randomUUID(),
          profile_id: profile,
          title: padded ? "Padded marker" : `Collision probe ${index}`,
          description: "ordinary",
          entity_version: 1,
          row_version: 1,
          status: "open",
          project_id: project?.id ?? null,
          tags: [tag.id],
          priority: "P2",
          scheduled_at: null,
          due_at: null,
          energy: null,
          estimate_min: null,
          source: "agent",
          occurrence: null,
          created_at: time,
          updated_at: time,
          completed_at: null,
          deleted_at: null,
        });
        const entry = yield* store.append({
          actor: Schema.decodeUnknownSync(ActorId)(
            padded
              ? "raw-append-padded-tag-fixture"
              : "raw-append-case-fold-tag-fixture",
          ),
          profile,
          event: {
            kind: "TaskCreated",
            entity_version: 1,
            occurred_at: time,
            task,
            series: null,
            project,
            tags: [tag],
          },
        });
        if (entry.outcome !== "committed")
          throw new Error(entry.reason ?? "Fixture rejected");
        rows.push({ task, project, tag });
      }
      process.stdout.write(`${JSON.stringify(rows)}\n`);
    } finally {
      yield* store.close();
    }
  }),
);
