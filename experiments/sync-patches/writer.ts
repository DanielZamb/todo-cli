import { Effect, Schema } from "effect";
import {
  openStore,
  TaskCommands,
} from "../../packages/domain/src/store/store.ts";
import { Task, ProfileId } from "../../packages/domain/src/index.ts";
import { database } from "./baseline.ts";
import { createInterface } from "node:readline";
const path = process.argv[2];
if (!path) throw Error("scratch database required");
const store = await Effect.runPromise(openStore({ path }));
const credential = process.argv[3] ?? "",
  commands = new TaskCommands(store);
console.log(JSON.stringify({ ready: true }));
for await (const line of createInterface({ input: process.stdin })) {
  const count = Number(line),
    commits = [];
  for (let i = 0; i < count; i++) {
    const row = database(store)
      .query<{ payload: string }, []>(
        "SELECT payload FROM tasks WHERE id='p0-t040'",
      )
      .get();
    if (!row) throw Error("fixture task");
    const task = Schema.decodeUnknownSync(Task)(JSON.parse(row.payload));
    const result = await Effect.runPromise(
      commands.edit(
        {
          credential,
          profile: Schema.decodeUnknownSync(ProfileId)("p0"),
          task_id: task.id,
        },
        {
          from_version: task.row_version,
          changes: { title: "CLI process edit " + task.row_version },
        },
      ),
    );
    if (result.outcome !== "committed") throw Error(JSON.stringify(result));
    commits.push(performance.timeOrigin + performance.now());
  }
  console.log(JSON.stringify({ commits }));
}
await Effect.runPromise(store.close());
