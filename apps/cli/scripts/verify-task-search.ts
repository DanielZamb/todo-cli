import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TaskRead } from "@todo/domain";
import { TaskResponse, TasksResponse } from "@todo/domain/presentation";
import { Schema } from "effect";
import { searchCases } from "../../../packages/domain/test/task-search-cases.ts";

type Cli = (args: string[], input?: string, expected?: number) => unknown;
type Request = (
  path: string,
  method?: string,
  payload?: unknown,
  expected?: number,
) => Promise<unknown>;
export async function verifyTaskSearch(
  cli: Cli,
  request: Request,
  evidence: string,
) {
  const receipts: unknown[] = [];
  for (const entry of searchCases) {
    const created = Schema.decodeUnknownSync(TaskResponse)(
      cli([
        "add",
        entry.title,
        ...("description" in entry ? ["--desc", entry.description] : []),
      ]),
    ).task;
    const filters = { prefix: created.id.toUpperCase(), text: entry.text };
    const local = Schema.decodeUnknownSync(TasksResponse)(
      cli(["list", "--prefix", filters.prefix, "--text", entry.text]),
    );
    const remote = Schema.decodeUnknownSync(Schema.Array(TaskRead))(
      await request(`/profiles/work/tasks?${new URLSearchParams(filters)}`),
    );
    const expected =
      entry.matches === null
        ? []
        : [{ title: entry.title, search_matches: entry.matches }];
    assert.deepEqual(local.filters, filters);
    assert.deepEqual(
      local.tasks?.map(({ title, search_matches }) => ({
        title,
        search_matches,
      })),
      expected,
    );
    assert.deepEqual(
      remote.map(({ title, search_matches }) => ({ title, search_matches })),
      expected,
    );
    const shown = Schema.decodeUnknownSync(TaskResponse)(
      cli(["show", created.id]),
    ).task;
    assert.equal("search_matches" in shown, false);
    const remoteShown = Schema.decodeUnknownSync(TaskRead)(
      await request(`/profiles/work/tasks/${created.id}`),
    );
    assert.equal("search_matches" in remoteShown, false);
    cli(["rm", created.id, "--expected-version", "1"]);
    receipts.push({ ...entry, id: created.id, local, remote });
  }
  for (const [name, value] of [
    ["text", "x".repeat(201)],
    ["text", "😀".repeat(101)],
    ["prefix", "zz"],
    ["prefix", "a".repeat(37)],
    ["prefix", ""],
    ["prefix", " ab"],
  ]) {
    assert.ok(name !== undefined && value !== undefined);
    const failure = Schema.decodeUnknownSync(
      Schema.Struct({ code: Schema.String, message: Schema.String }),
    )(cli(["list", `--${name}=${value}`], undefined, 2));
    assert.equal(failure.code, "invalid_args");
    assert.ok(failure.message.includes(`--${name}`));
    await request(
      `/profiles/work/tasks?${new URLSearchParams({ [name]: value })}`,
      "GET",
      undefined,
      400,
    );
  }
  for (const prefix of ["a".repeat(36), "-"]) {
    const result = Schema.decodeUnknownSync(TasksResponse)(
      cli(["list", "--prefix", prefix]),
    );
    assert.deepEqual(result.tasks, []);
    assert.deepEqual(
      await request(`/profiles/work/tasks?${new URLSearchParams({ prefix })}`),
      [],
    );
  }
  const first = Schema.decodeUnknownSync(TaskResponse)(
    cli(["add", "Stable search first"]),
  ).task;
  const second = Schema.decodeUnknownSync(TaskResponse)(
    cli(["add", "Stable search second"]),
  ).task;
  const unfiltered = Schema.decodeUnknownSync(TasksResponse)(cli(["list"]));
  assert.ok(unfiltered.tasks?.every((task) => !("search_matches" in task)));
  const ordered = Schema.decodeUnknownSync(TasksResponse)(
    cli(["list", "--text", "stable search"]),
  );
  const expectedOrder = (unfiltered.tasks ?? [])
    .filter((task) => task.id === first.id || task.id === second.id)
    .map((task) => task.title);
  assert.deepEqual(
    ordered.tasks?.map((task) => task.title),
    expectedOrder,
  );
  for (const [flag, titles] of [
    ["inbox", expectedOrder],
    ["today", []],
    ["overdue", []],
  ] satisfies [string, string[]][]) {
    const result = Schema.decodeUnknownSync(TasksResponse)(
      cli(["list", "--text", "stable search", `--${flag}`]),
    );
    assert.deepEqual(
      result.tasks?.map((task) => task.title),
      titles,
    );
  }
  const remoteBefore = Schema.decodeUnknownSync(Schema.Array(TaskRead))(
    await request("/profiles/work/tasks"),
  );
  const remoteOrder = Schema.decodeUnknownSync(Schema.Array(TaskRead))(
    await request("/profiles/work/tasks?text=stable+search"),
  );
  assert.deepEqual(
    remoteOrder.map((task) => task.title),
    remoteBefore
      .filter((task) => task.id === first.id || task.id === second.id)
      .map((task) => task.title),
  );
  const short = first.id.slice(0, 8);
  cli(["show", short], undefined, 3);
  const history = Schema.decodeUnknownSync(
    Schema.Struct({ entries: Schema.Array(Schema.Unknown) }),
  )(cli(["history", short]));
  assert.deepEqual(history.entries, []);
  for (const action of ["edit", "done", "cancel", "reopen", "rm"])
    cli([action, short, "--expected-version", "1"], undefined, 3);
  cli(["attach", short, "https://example.test/search"], undefined, 3);
  cli(["detach", short, "missing"], undefined, 3);
  for (const action of ["move", "copy"])
    cli(
      [action, short, "--to", "personal", "--expected-version", "1"],
      undefined,
      3,
    );
  await request(`/profiles/work/tasks/${short}`, "GET", undefined, 404);
  const prefixOnly = Schema.decodeUnknownSync(TasksResponse)(
    cli(["list", "--prefix", first.id.toUpperCase()]),
  );
  assert.deepEqual(
    prefixOnly.tasks?.map((task) => task.title),
    ["Stable search first"],
  );
  assert.ok(prefixOnly.tasks?.every((task) => !("search_matches" in task)));
  const unchanged = Schema.decodeUnknownSync(TaskResponse)(
    cli(["show", first.id]),
  ).task;
  assert.equal(unchanged.row_version, 1);
  for (const created of [first, second])
    cli(["rm", created.id, "--expected-version", "1"]);
  writeFileSync(
    join(evidence, "task-search.json"),
    JSON.stringify(
      {
        status: "PASS",
        cases: receipts,
        order: expectedOrder,
        exactIdCommands: "unchanged",
      },
      null,
      2,
    ),
  );
}
