import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { openStore } from "../../packages/domain/src/store/store.ts";
import {
  Profile,
  Task,
  ActorId,
  ProfileId,
  Tag,
  DependencyCommands,
  TaskId,
} from "../../packages/domain/src/index.ts";
export async function seed(directory: string, large: boolean) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "scratch.db"),
    store = await Effect.runPromise(openStore({ path })),
    run = Effect.runPromise,
    at = new Date().toISOString(),
    day = at.slice(0, 10);
  try {
    await run(store.auth.setupOwner("sync experiment scratch only"));
    const owner = await run(store.auth.signIn("sync experiment scratch only"));
    const actor = Schema.decodeUnknownSync(ActorId)("experiment");
    for (let p = 0; p < 8; p++) {
      const profile = Schema.decodeUnknownSync(ProfileId)("p" + p);
      await run(
        store.putProfile(
          Schema.decodeUnknownSync(Profile)({
            id: profile,
            name: "Synthetic " + p,
            created_at: at,
            updated_at: at,
          }),
        ),
      );
      if (!large && p > 0) continue;
      const tags = Array.from({ length: 39 }, (_, i) =>
        Schema.decodeUnknownSync(Tag)({
          id: `tag-${p}-${i}`,
          profile_id: profile,
          name: "Tag " + i,
        }),
      );
      for (let i = 0; i < 178; i++) {
        const task = Schema.decodeUnknownSync(Task)({
          id: `p${p}-t${String(i).padStart(3, "0")}`,
          profile_id: profile,
          entity_version: 1,
          row_version: 1,
          title: "Synthetic Task " + i,
          description: "x".repeat(i < 88 ? 1100 : i === 177 ? 5244 : 1260),
          status: i < 50 ? "open" : i < 176 ? "done" : "cancelled",
          project_id: null,
          priority: "P" + ((i % 4) + 1),
          scheduled_at:
            i < 50 && i % 9 === 0 ? { kind: "date", date: day } : null,
          due_at: i < 50 && i % 7 === 0 ? { kind: "date", date: day } : null,
          energy: (i % 5) + 1,
          estimate_min: 30,
          source: "agent",
          tags: i === 0 ? tags.map((t) => t.id) : [tags[i % 39]?.id],
          occurrence: null,
          created_at: at,
          updated_at: at,
          completed_at: i >= 50 ? at : null,
          deleted_at: null,
          attachments:
            i < 108
              ? [
                  {
                    id: `link-${p}-${i}`,
                    kind: "link",
                    url: "https://example.invalid/" + i,
                    label: "Reference",
                    added_at: at,
                  },
                ]
              : [],
        });
        const result = await run(
          store.append({
            actor,
            profile,
            event: {
              kind: "TaskCreated",
              entity_version: 1,
              occurred_at: at,
              task,
              project: null,
              tags: tags.filter((t) => task.tags.includes(t.id)),
              series: null,
            },
          }),
        );
        assert.equal(result.outcome, "committed", JSON.stringify(result));
      }
      for (const [dependent, blocker] of [
        ...Array.from({ length: 10 }, (_, i) => [i + 1, i]),
        [12, 11],
        [13, 11],
        [14, 12],
        [14, 13],
        ...Array.from({ length: 20 }, (_, i) => [i + 15, 0]),
      ]) {
        const id = Schema.decodeUnknownSync(TaskId)(
            `p${p}-t${String(dependent).padStart(3, "0")}`,
          ),
          row = (await run(store.tasks())).find((t) => t.id === id);
        assert.ok(row);
        const result = await run(
          new DependencyCommands(store).change(
            { credential: owner.credential, profile, task_id: id },
            {
              blocker_id: Schema.decodeUnknownSync(TaskId)(
                `p${p}-t${String(blocker).padStart(3, "0")}`,
              ),
              from_version: row.row_version,
            },
            "depend",
          ),
        );
        assert.equal(result.outcome, "success", JSON.stringify(result));
      }
    }
    const tasks = await run(store.tasks());
    assert.equal(tasks.length, large ? 1424 : 178);
    const work = tasks.filter((t) => t.profile_id === "p0");
    assert.deepEqual(
      ["open", "done", "cancelled"].map(
        (s) => work.filter((t) => t.status === s).length,
      ),
      [50, 126, 2],
    );
    const config = {
      path,
      credential: owner.credential,
      profile: "p0",
      at: day + "T23:59:30.000Z",
      large,
    };
    writeFileSync(join(directory, "fixture.json"), JSON.stringify(config));
    return config;
  } finally {
    await run(store.close());
  }
}
