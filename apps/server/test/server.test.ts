import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { BUILD_ID, CONTRACT_ID, Conflict, TodoApi } from "@todo/api";
import {
  ImportReport,
  OccurrenceId,
  OpLogEntry,
  PlanningView,
  Profile,
  ProfileSummary,
  ProjectSummary,
  Series,
  TagSummary,
  Task,
} from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { OpenApi } from "effect/http-api";
import { TestClock } from "effect/testing";
import { serverLayer } from "../src/server.ts";

const fixture = Effect.gen(function* () {
  yield* TestClock.setTime(Date.now());
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-s01-test-"))),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );
  const path = join(directory, "scratch.db");
  const store = yield* Effect.acquireRelease(openStore({ path }), (store) =>
    Effect.orDie(store.close()),
  );
  yield* store.auth.setupOwner("test passphrase");
  for (const id of ["work", "personal"])
    yield* store.putProfile(
      Schema.decodeUnknownSync(Profile)({
        id,
        name: id,
        created_at: "2026-10-27T00:00:00Z",
        updated_at: "2026-10-27T00:00:00Z",
      }),
    );
  const context = yield* Layer.build(serverLayer({ path, port: 0 }));
  const server = Context.get(context, HttpServer.HttpServer);
  const base = HttpServer.formatAddress(server.address);
  const request = (
    method: string,
    path: string,
    body?: unknown,
    credential?: string,
  ) =>
    Effect.tryPromise(async () => {
      const response = await fetch(base + path, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(credential === undefined
            ? {}
            : { Authorization: `Bearer ${credential}` }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      const json: unknown = text ? JSON.parse(text) : null;
      return { status: response.status, body: json };
    });
  const signIn = yield* request("POST", "/auth/sessions", {
    passphrase: "test passphrase",
  });
  expect(signIn.status).toBe(200);
  const credential = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(signIn.body).credential;
  return { store, request, credential, base };
});

const parseTask = Schema.decodeUnknownSync(Task);
const tokenSecret = Schema.decodeUnknownSync(
  Schema.Struct({ credential: Schema.String }),
);

describe("Todo HTTP contract", () => {
  it.effect(
    "imports through the shared contract with no-write previews, idempotency and per-Task Conflicts",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential, store } = yield* fixture;
          const items = [
            {
              external_id: "http:one",
              title: "HTTP import",
              description: "Keep",
              project_name: "Import",
              tag_names: ["proof"],
            },
          ];
          const history = yield* store.history();
          const preview = yield* request(
            "POST",
            "/profiles/work/import",
            { items, dry_run: true },
            credential,
          );
          expect(preview.status).toBe(200);
          expect(
            Schema.decodeUnknownSync(ImportReport)(preview.body).totals,
          ).toEqual({ created: 1, updated: 0, unchanged: 0, rejected: 0 });
          expect(yield* store.tasks()).toEqual([]);
          expect(yield* store.history()).toEqual(history);
          const applied = yield* request(
            "POST",
            "/profiles/work/import",
            { items },
            credential,
          );
          expect(applied.status).toBe(200);
          expect(
            Schema.decodeUnknownSync(ImportReport)(applied.body).totals,
          ).toEqual({ created: 1, updated: 0, unchanged: 0, rejected: 0 });
          expect(
            Schema.decodeUnknownSync(ImportReport)(
              (yield* request(
                "POST",
                "/profiles/work/import",
                { items },
                credential,
              )).body,
            ).totals,
          ).toEqual({ created: 0, updated: 0, unchanged: 1, rejected: 0 });
          const conflict = yield* request(
            "POST",
            "/profiles/work/import",
            {
              items: [
                { external_id: "http:one", title: "Stale", from_version: 2 },
              ],
            },
            credential,
          );
          expect(
            Schema.decodeUnknownSync(ImportReport)(conflict.body).items.map(
              (row) => [
                row.outcome,
                row.error?.code,
                row.error?.details?.current_version,
              ],
            ),
          ).toEqual([["rejected", "occ_conflict", 1]]);
          expect(
            (yield* request(
              "GET",
              "/profiles/personal/tasks",
              undefined,
              credential,
            )).body,
          ).toEqual([]);
          const token = yield* store.auth.issueToken({
            credential,
            token: {
              name: "Import reader",
              profile: Schema.decodeUnknownSync(Profile.fields.id)("work"),
              scope: "read-only",
            },
          });
          expect(
            (yield* request(
              "POST",
              "/profiles/work/import",
              { items, dry_run: true },
              token.credential,
            )).status,
          ).toBe(403);
          expect(
            (yield* request("POST", "/profiles/work/import", { items })).status,
          ).toBe(401);
        }),
      ),
  );

  it.effect(
    "records canonical HTTP payload rejections in authenticated History",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential, store } = yield* fixture;
          for (const [method, path] of [
            ["GET", "/health"],
            ["GET", "/profiles"],
            ["GET", "/profiles/work/tasks"],
            ["POST", "/auth/sessions"],
            ["GET", "/openapi.json"],
          ] as const) {
            const rejected = yield* request(
              method,
              path + "?unknown=closed",
              undefined,
              credential,
            );
            expect(rejected.status).toBe(400);
            expect(rejected.body).toMatchObject({
              code: "invalid_query",
              message: "Unknown query parameter: unknown",
            });
          }
          const created = yield* request(
            "POST",
            "/profiles/work/tasks",
            { title: "Keep title" },
            credential,
          );
          const task = parseTask(created.body);
          for (const input of [
            { title: " " },
            { title: "Task", source: "other" },
          ]) {
            expect(
              (yield* request(
                "POST",
                "/profiles/work/tasks",
                input,
                credential,
              )).status,
            ).toBe(400);
            expect(
              (yield* request(
                "PATCH",
                `/profiles/work/tasks/${task.id}`,
                { from_version: 1, changes: input },
                credential,
              )).status,
            ).toBe(400);
          }
          const invalidEdit = { from_version: 1, changes: { title: " " } };
          expect(
            (yield* request(
              "PATCH",
              `/profiles/work/tasks/${task.id}`,
              invalidEdit,
              "tok_missing",
            )).status,
          ).toBe(401);
          for (const [name, profile, scope] of [
            ["validation-reader", "work", "read-only"],
            ["validation-foreign", "personal", "read-write"],
          ] as const) {
            const token = tokenSecret(
              (yield* request(
                "POST",
                "/auth/tokens",
                { name, profile, scope },
                credential,
              )).body,
            ).credential;
            expect(
              (yield* request(
                "PATCH",
                `/profiles/work/tasks/${task.id}`,
                invalidEdit,
                token,
              )).status,
            ).toBe(403);
          }
          expect(
            (yield* store.history())
              .filter((entry) => entry.event.kind === "TaskAttemptRejected")
              .map((entry) => [
                entry.reason,
                entry.from_version,
                entry.event.kind === "TaskAttemptRejected"
                  ? entry.event.attempted_kind
                  : null,
              ]),
          ).toEqual([
            ["validation", null, "TaskCreated"],
            ["validation", 1, "TaskEdited"],
            ["validation", null, "TaskCreated"],
            ["validation", 1, "TaskEdited"],
          ]);
          expect(
            (yield* store.tasks()).map((task) => [
              task.title,
              task.row_version,
            ]),
          ).toEqual([["Keep title", 1]]);
        }),
      ),
  );
  it.effect(
    "lists, shows, creates, patches, transitions and deletes with Version conflicts and durable History",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential, store, base } = yield* fixture;
          expect(base).toMatch(/^http:\/\/127\.0\.0\.1:/);
          expect(yield* request("GET", "/health")).toEqual({
            status: 200,
            body: {
              service: "todo-server",
              contract: CONTRACT_ID,
              build: BUILD_ID,
            },
          });
          const created = yield* request(
            "POST",
            "/profiles/work/tasks",
            {
              title: "Write the HTTP contract",
              description: "Keep this description",
              priority: "P2",
            },
            credential,
          );
          expect(created.status).toBe(200);
          const task = parseTask(created.body);
          expect([
            task.title,
            task.description,
            task.priority,
            task.source,
            task.status,
            task.row_version,
          ]).toEqual([
            "Write the HTTP contract",
            "Keep this description",
            "P2",
            "manual",
            "open",
            1,
          ]);
          const path = `/profiles/work/tasks/${task.id}`;
          expect(yield* request("GET", path, undefined, credential)).toEqual(
            created,
          );
          expect(
            yield* request(
              "GET",
              "/profiles/work/tasks",
              undefined,
              credential,
            ),
          ).toEqual({ status: 200, body: [task] });
          const edited = yield* request(
            "PATCH",
            path,
            { from_version: 1, changes: { title: "Ship the HTTP contract" } },
            credential,
          );
          expect(edited.status).toBe(200);
          const latest = parseTask(edited.body);
          expect([
            latest.title,
            latest.description,
            latest.row_version,
          ]).toEqual(["Ship the HTTP contract", "Keep this description", 2]);
          const stale = yield* request(
            "PATCH",
            path,
            { from_version: 1, changes: { title: "Stale title" } },
            credential,
          );
          expect(stale).toEqual({
            status: 409,
            body: { _tag: "Conflict", latest },
          });
          for (const [version, action, status] of [
            [2, "complete", "done"],
            [3, "reopen", "open"],
            [4, "cancel", "cancelled"],
          ] as const) {
            const result = yield* request(
              "POST",
              `${path}/transition`,
              { from_version: version, action },
              credential,
            );
            expect(result.status).toBe(200);
            const changed = parseTask(result.body);
            expect([changed.status, changed.row_version]).toEqual([
              status,
              version + 1,
            ]);
          }
          const staleTransition = yield* request(
            "POST",
            `${path}/transition`,
            { from_version: 2, action: "complete" },
            credential,
          );
          expect(staleTransition.status).toBe(409);
          expect(
            Schema.decodeUnknownSync(Conflict)(staleTransition.body).latest
              ?.row_version,
          ).toBe(5);
          expect(
            (yield* request(
              "DELETE",
              `${path}?from_version=4`,
              undefined,
              credential,
            )).status,
          ).toBe(409);
          const deleted = yield* request(
            "DELETE",
            `${path}?from_version=5`,
            undefined,
            credential,
          );
          expect(deleted.status).toBe(200);
          expect(parseTask(deleted.body).row_version).toBe(6);
          expect(parseTask(deleted.body).deleted_at).not.toBeNull();
          expect(yield* request("GET", path, undefined, credential)).toEqual({
            status: 404,
            body: { _tag: "NotFound", message: "Task not found" },
          });
          expect(
            yield* request(
              "GET",
              "/profiles/work/tasks",
              undefined,
              credential,
            ),
          ).toEqual({ status: 200, body: [] });
          const history = yield* store.history();
          expect(
            history
              .filter((entry) => entry.reason === "conflict")
              .map((entry) => entry.from_version),
          ).toEqual([1, 2, 4]);
          expect(
            history
              .filter((entry) => entry.event.kind.startsWith("Task"))
              .map((entry) => [entry.outcome, entry.event.kind, entry.reason]),
          ).toEqual([
            ["committed", "TaskCreated", null],
            ["committed", "TaskEdited", null],
            ["rejected", "TaskAttemptRejected", "conflict"],
            ["committed", "TaskCompleted", null],
            ["committed", "TaskReopened", null],
            ["committed", "TaskCancelled", null],
            ["rejected", "TaskAttemptRejected", "conflict"],
            ["rejected", "TaskAttemptRejected", "conflict"],
            ["committed", "TaskDeleted", null],
          ]);
        }),
      ),
    20000,
  );

  it.effect(
    "enforces Session and scoped Access Token auth on every request",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential, store } = yield* fixture;
          expect((yield* request("GET", "/profiles/work/tasks")).status).toBe(
            401,
          );
          expect(
            (yield* request(
              "GET",
              "/profiles/work/tasks",
              undefined,
              "invalid",
            )).status,
          ).toBe(401);
          expect(
            (yield* request("POST", "/auth/sessions", { passphrase: "wrong" }))
              .status,
          ).toBe(401);
          const reader = tokenSecret(
            (yield* request(
              "POST",
              "/auth/tokens",
              { name: "reader", profile: "work", scope: "read-only" },
              credential,
            )).body,
          ).credential;
          const writer = tokenSecret(
            (yield* request(
              "POST",
              "/auth/tokens",
              { name: "writer", profile: "work", scope: "read-write" },
              credential,
            )).body,
          ).credential;
          expect(reader).toMatch(/^tok_/);
          expect(
            yield* request("GET", "/profiles/work/tasks", undefined, reader),
          ).toEqual({ status: 200, body: [] });
          expect(
            (yield* request(
              "POST",
              "/profiles/work/tasks",
              { title: "Denied" },
              reader,
            )).status,
          ).toBe(403);
          expect(
            (yield* request(
              "GET",
              "/profiles/personal/tasks",
              undefined,
              reader,
            )).status,
          ).toBe(403);
          expect(
            (yield* request(
              "POST",
              "/profiles/personal/tasks",
              { title: "Denied" },
              writer,
            )).status,
          ).toBe(403);
          expect(
            (yield* request("GET", "/auth/tokens", undefined, writer)).status,
          ).toBe(403);
          const created = yield* request(
            "POST",
            "/profiles/work/tasks",
            { title: "Token write" },
            writer,
          );
          expect(created.status).toBe(200);
          const task = parseTask(created.body);
          const path = `/profiles/work/tasks/${task.id}`;
          for (const [method, suffix, body] of [
            [
              "PATCH",
              "",
              { from_version: 1, changes: { title: "Denied edit" } },
            ],
            ["POST", "/transition", { from_version: 1, action: "complete" }],
            ["DELETE", "?from_version=1", undefined],
          ] as const) {
            expect(
              (yield* request(method, path + suffix, body, reader)).status,
            ).toBe(403);
          }
          expect(
            (yield* request(
              "GET",
              `/profiles/personal/tasks/${task.id}`,
              undefined,
              credential,
            )).status,
          ).toBe(404);
          expect(
            (yield* request(
              "PATCH",
              `/profiles/personal/tasks/${task.id}`,
              { from_version: 1, changes: { title: "Foreign edit" } },
              credential,
            )).status,
          ).toBe(404);
          expect(
            (yield* request(
              "DELETE",
              "/auth/tokens/writer",
              undefined,
              credential,
            )).status,
          ).toBe(204);
          expect(
            (yield* request("GET", "/profiles/work/tasks", undefined, writer))
              .status,
          ).toBe(401);
          expect(
            (yield* request("DELETE", "/auth/session", undefined, credential))
              .status,
          ).toBe(204);
          expect(
            (yield* request(
              "GET",
              "/profiles/work/tasks",
              undefined,
              credential,
            )).status,
          ).toBe(401);
          expect(
            (yield* store.tasks()).map((task) => [
              task.title,
              task.row_version,
            ]),
          ).toEqual([["Token write", 1]]);
          expect(
            (yield* store.history()).filter(
              (entry) => entry.event.kind === "AuthAttemptRejected",
            ).length,
          ).toBeGreaterThanOrEqual(10);
        }),
      ),
    20000,
  );

  it.effect(
    "isolates Project and Tag definitions from rejected work History and HTTP responses",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential, store } = yield* fixture;
          const workTask = parseTask(
            (yield* request(
              "POST",
              "/profiles/work/tasks",
              { title: "Keep work unchanged" },
              credential,
            )).body,
          );
          const personal = Schema.decodeUnknownSync(Profile.fields.id)(
            "personal",
          );
          const seeded = yield* store.auth.append({
            credential,
            profile: personal,
            event: {
              kind: "TaskCreated",
              entity_version: 1,
              occurred_at: workTask.created_at,
              task: {
                ...workTask,
                id: "personal-task",
                profile_id: personal,
                title: "Private task",
                project_id: "personal-project",
                tags: ["personal-tag"],
              },
              series: null,
              project: {
                id: "personal-project",
                profile_id: personal,
                name: "Sensitive personal Project",
                created_at: workTask.created_at,
                updated_at: workTask.created_at,
              },
              tags: [
                {
                  id: "personal-tag",
                  profile_id: personal,
                  name: "Sensitive personal Tag",
                },
              ],
            },
          });
          expect(seeded.outcome).toBe("committed");
          const writer = tokenSecret(
            (yield* request(
              "POST",
              "/auth/tokens",
              { name: "work writer", profile: "work", scope: "read-write" },
              credential,
            )).body,
          ).credential;
          const reader = tokenSecret(
            (yield* request(
              "POST",
              "/auth/tokens",
              { name: "work reader", profile: "work", scope: "read-only" },
              credential,
            )).body,
          ).credential;
          const responses = [];
          for (const method of ["POST", "PATCH"]) {
            for (const metadata of [
              { project_id: "missing-project", tags: [] },
              { project_id: "personal-project", tags: [] },
              { project_id: null, tags: ["missing-tag"] },
              { project_id: null, tags: ["personal-tag"] },
              { project_id: "missing-project", tags: ["missing-tag"] },
              { project_id: "personal-project", tags: ["personal-tag"] },
            ]) {
              responses.push(
                yield* request(
                  method,
                  method === "POST"
                    ? "/profiles/work/tasks"
                    : `/profiles/work/tasks/${workTask.id}`,
                  method === "POST"
                    ? { title: "Rejected create", ...metadata }
                    : { from_version: 1, changes: metadata },
                  writer,
                ),
              );
            }
          }
          const view = yield* store.auth.read({
            credential: reader,
            profile: workTask.profile_id,
          });
          const rejections = view.history.filter(
            (entry) => entry.event.kind === "TaskAttemptRejected",
          );
          expect(rejections).toHaveLength(12);
          for (const entry of rejections) {
            expect(entry.reason).toBe("validation");
            if (entry.event.kind === "TaskAttemptRejected") {
              expect(entry.event.violations).toEqual([
                {
                  field: "event",
                  code: "validation",
                  received: expect.objectContaining(
                    entry.event.attempted_kind === "TaskCreated"
                      ? { project: null, tags: [] }
                      : {
                          project_before: null,
                          project_after: null,
                          tags_before: [],
                          tags_after: [],
                        },
                  ),
                },
              ]);
            }
          }
          expect(JSON.stringify(view)).not.toContain(
            "Sensitive personal Project",
          );
          expect(JSON.stringify(view)).not.toContain("Sensitive personal Tag");
          for (const response of responses)
            expect(response).toEqual({
              status: 422,
              body: { _tag: "InvalidTask", message: "validation" },
            });
          expect(
            yield* request("GET", "/profiles/work/tasks", undefined, reader),
          ).toEqual({ status: 200, body: [workTask] });
          const httpHistory = yield* request(
            "GET",
            `/profiles/work/tasks/${workTask.id}/history`,
            undefined,
            reader,
          );
          expect(httpHistory.status).toBe(200);
          const entries = Schema.decodeUnknownSync(Schema.Array(OpLogEntry))(
            httpHistory.body,
          );
          expect(
            entries.map((entry) => [
              entry.outcome,
              entry.event.kind,
              entry.reason,
            ]),
          ).toEqual([
            ["committed", "TaskCreated", null],
            ...Array.from({ length: 6 }, () => [
              "rejected",
              "TaskAttemptRejected",
              "validation",
            ]),
          ]);
          const rejectedDefinitions = entries.flatMap((entry) =>
            entry.event.kind === "TaskAttemptRejected"
              ? entry.event.violations.map((violation) =>
                  Schema.decodeUnknownSync(
                    Schema.Struct({
                      project_before: Schema.Null,
                      project_after: Schema.Null,
                      tags_before: Schema.Array(Schema.Never),
                      tags_after: Schema.Array(Schema.Never),
                    }),
                  )(violation.received),
                )
              : [],
          );
          expect(rejectedDefinitions).toEqual(
            Array.from({ length: 6 }, () => ({
              project_before: null,
              project_after: null,
              tags_before: [],
              tags_after: [],
            })),
          );
          expect(JSON.stringify(httpHistory.body)).not.toContain(
            "Sensitive personal Project",
          );
          expect(JSON.stringify(httpHistory.body)).not.toContain(
            "Sensitive personal Tag",
          );
          expect(
            yield* request(
              "GET",
              `/profiles/personal/tasks/${workTask.id}/history`,
              undefined,
              credential,
            ),
          ).toEqual({ status: 200, body: [] });
          expect(
            (yield* request(
              "GET",
              `/profiles/personal/tasks/personal-task/history`,
              undefined,
              reader,
            )).status,
          ).toBe(403);
          const personalView = yield* store.auth.read({
            credential,
            profile: personal,
          });
          expect(
            personalView.tasks.map((task) => [
              task.id,
              task.title,
              task.row_version,
              task.project_id,
              task.tags,
            ]),
          ).toEqual([
            [
              "personal-task",
              "Private task",
              1,
              "personal-project",
              ["personal-tag"],
            ],
          ]);
          expect(
            personalView.projects.map((project) => [project.id, project.name]),
          ).toEqual([["personal-project", "Sensitive personal Project"]]);
          expect(personalView.tags.map((tag) => [tag.id, tag.name])).toEqual([
            ["personal-tag", "Sensitive personal Tag"],
          ]);
        }),
      ),
    20000,
  );

  it.effect(
    "rejects malformed requests and preserves the task after domain validation failures",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential, store } = yield* fixture;
          for (const payload of [
            { title: "" },
            { title: "Invalid", priority: "P5" },
            { title: "Invalid", energy: 6 },
          ])
            expect(
              (yield* request(
                "POST",
                "/profiles/work/tasks",
                payload,
                credential,
              )).status,
            ).toBe(400);
          expect(
            (yield* request(
              "POST",
              "/profiles/work/tasks",
              { title: "Missing Project", project_id: "missing" },
              credential,
            )).status,
          ).toBe(422);
          const task = parseTask(
            (yield* request(
              "POST",
              "/profiles/work/tasks",
              { title: "Keep me" },
              credential,
            )).body,
          );
          const definitions = {
            project: {
              id: "project-1",
              profile_id: "work",
              name: "HTTP",
              created_at: task.created_at,
              updated_at: task.updated_at,
            },
            tags: [{ id: "tag-1", profile_id: "work", name: "proof" }],
          };
          yield* store.auth.append({
            credential,
            profile: task.profile_id,
            event: {
              kind: "TaskCreated",
              entity_version: 1,
              occurred_at: task.created_at,
              task: {
                ...task,
                id: "metadata-seed",
                project_id: "project-1",
                tags: ["tag-1"],
              },
              series: null,
              ...definitions,
            },
          });
          const grouped = yield* request(
            "POST",
            "/profiles/work/tasks",
            {
              title: "With metadata",
              project_id: "project-1",
              tags: ["tag-1"],
            },
            credential,
          );
          expect(grouped.status).toBe(200);
          const groupedTask = parseTask(grouped.body);
          expect([groupedTask.project_id, groupedTask.tags]).toEqual([
            "project-1",
            ["tag-1"],
          ]);
          const metadataEdit = yield* request(
            "PATCH",
            `/profiles/work/tasks/${groupedTask.id}`,
            { from_version: 1, changes: { title: "Keep metadata" } },
            credential,
          );
          expect(metadataEdit.status).toBe(200);
          expect([
            parseTask(metadataEdit.body).title,
            parseTask(metadataEdit.body).project_id,
            parseTask(metadataEdit.body).tags,
          ]).toEqual(["Keep metadata", "project-1", ["tag-1"]]);
          const detached = yield* request(
            "PATCH",
            `/profiles/work/tasks/${groupedTask.id}`,
            { from_version: 2, changes: { project_id: null, tags: [] } },
            credential,
          );
          expect(detached.status).toBe(200);
          expect([
            parseTask(detached.body).project_id,
            parseTask(detached.body).tags,
          ]).toEqual([null, []]);
          expect(
            (yield* request(
              "POST",
              "/profiles/personal/tasks",
              {
                title: "Foreign metadata",
                project_id: "project-1",
                tags: ["tag-1"],
              },
              credential,
            )).status,
          ).toBe(422);
          const path = `/profiles/work/tasks/${task.id}`;
          expect(
            (yield* request(
              "PATCH",
              path,
              { changes: { title: "No Version" } },
              credential,
            )).status,
          ).toBe(400);
          expect(
            (yield* request("DELETE", path, undefined, credential)).status,
          ).toBe(400);
          expect(
            (yield* request(
              "POST",
              `${path}/transition`,
              { from_version: 1, action: "reopen" },
              credential,
            )).status,
          ).toBe(422);
          expect(
            (yield* request(
              "PATCH",
              path,
              { from_version: 1, changes: { tags: ["missing"] } },
              credential,
            )).status,
          ).toBe(422);
          expect(yield* request("GET", path, undefined, credential)).toEqual({
            status: 200,
            body: task,
          });
        }),
      ),
    20000,
  );

  it.effect(
    "completes an Occurrence through the domain and emits the shared OpenAPI contract",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential, store } = yield* fixture;
          const series = Schema.decodeUnknownSync(Series)({
            id: "daily",
            profile_id: "work",
            entity_version: 1,
            row_version: 1,
            recurrence: {
              dtstart: { kind: "date", date: "2026-10-27" },
              rrule: "FREQ=DAILY;COUNT=2",
              exdate: [],
            },
            task: {
              title: "Daily review",
              description: null,
              project_id: null,
              priority: "P3",
              scheduled_at: null,
              due_at: null,
              energy: null,
              estimate_min: null,
              source: "manual",
              tags: [],
            },
            created_at: "2026-10-27T00:00:00Z",
            updated_at: "2026-10-27T00:00:00Z",
            deleted_at: null,
          });
          yield* store.auth.startSeries({
            credential,
            profile: series.profile_id,
            series,
            task_id: Schema.decodeUnknownSync(Task.fields.id)("first"),
            occurrence_id:
              Schema.decodeUnknownSync(OccurrenceId)("occurrence-first"),
          });
          const result = yield* request(
            "POST",
            "/profiles/work/tasks/first/transition",
            { from_version: 1, action: "complete" },
            credential,
          );
          expect(result.status).toBe(200);
          expect(
            (yield* store.tasks())
              .sort((a, b) =>
                String(a.occurrence?.date).localeCompare(
                  String(b.occurrence?.date),
                ),
              )
              .map((task) => [task.title, task.status, task.occurrence?.date]),
          ).toEqual([
            ["Daily review", "done", "2026-10-27"],
            ["Daily review", "open", "2026-10-28"],
          ]);
          const contract = yield* request("GET", "/openapi.json");
          expect(contract.status).toBe(200);
          expect(contract.body).toEqual(OpenApi.fromApi(TodoApi));
          const emitted: unknown = yield* Effect.tryPromise(() =>
            Bun.file(
              new URL("../../../packages/api/openapi.json", import.meta.url),
            ).json(),
          );
          expect(emitted).toEqual(contract.body);
        }),
      ),
    20000,
  );
  it.effect(
    "reads Profile counts, scoped metadata, and open planning views over HTTP",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential, store } = yield* fixture;
          const first = parseTask(
            (yield* request(
              "POST",
              "/profiles/work/tasks",
              { title: "Inbox without Project" },
              credential,
            )).body,
          );
          const project = {
            id: "work-project",
            profile_id: "work",
            name: "Work Project",
            created_at: first.created_at,
            updated_at: first.created_at,
          };
          const tag = { id: "work-tag", profile_id: "work", name: "work-tag" };
          const cases = [
            {
              id: "inbox-project",
              title: "Inbox with Project",
              project_id: "work-project",
              tags: ["work-tag"],
            },
            {
              id: "due",
              title: "Due today",
              due_at: { kind: "date", date: "2026-10-27" },
            },
            {
              id: "scheduled",
              title: "Scheduled today",
              scheduled_at: {
                kind: "instant",
                utc: "2026-10-27T23:00:00Z",
                time_zone: "America/Bogota",
              },
              project_id: "work-project",
              tags: ["work-tag"],
            },
            {
              id: "overdue",
              title: "Overdue",
              due_at: { kind: "date", date: "2026-10-26" },
              scheduled_at: { kind: "date", date: "2026-10-28" },
            },
            {
              id: "future",
              title: "Future scheduled",
              scheduled_at: { kind: "date", date: "2026-10-28" },
              project_id: "work-project",
            },
            {
              id: "done",
              title: "Done",
              status: "done",
              project_id: "work-project",
              tags: ["work-tag"],
            },
            {
              id: "cancelled",
              title: "Cancelled",
              status: "cancelled",
              due_at: { kind: "date", date: "2026-10-26" },
            },
            {
              id: "snoozed",
              title: "Snoozed",
              status: "snoozed",
              scheduled_at: { kind: "date", date: "2026-10-27" },
            },
            {
              id: "deleted",
              title: "Deleted",
              deleted_at: first.created_at,
              project_id: "work-project",
              tags: ["work-tag"],
            },
          ];
          for (const value of cases) {
            const task = parseTask({ ...first, ...value });
            expect(
              (yield* store.auth.append({
                credential,
                profile: first.profile_id,
                event: {
                  kind: "TaskCreated",
                  entity_version: 1,
                  occurred_at: first.created_at,
                  task,
                  series: null,
                  project: task.project_id ? project : null,
                  tags: task.tags.length ? [tag] : [],
                },
              })).outcome,
            ).toBe("committed");
          }
          const personal = Schema.decodeUnknownSync(Profile.fields.id)(
            "personal",
          );
          expect(
            (yield* store.auth.append({
              credential,
              profile: personal,
              event: {
                kind: "TaskCreated",
                entity_version: 1,
                occurred_at: first.created_at,
                task: {
                  ...first,
                  id: "private",
                  title: "Private",
                  profile_id: personal,
                },
                series: null,
                project: null,
                tags: [],
              },
            })).outcome,
          ).toBe("committed");
          const reader = tokenSecret(
            (yield* request(
              "POST",
              "/auth/tokens",
              { name: "read counts", profile: "work", scope: "read-only" },
              credential,
            )).body,
          ).credential;
          const summaries = Schema.decodeUnknownSync(
            Schema.Array(ProfileSummary),
          )((yield* request("GET", "/profiles", undefined, reader)).body);
          expect(
            summaries.map((p) => [
              p.id,
              p.name,
              p.open_task_count,
              p.inbox_task_count,
            ]),
          ).toEqual([["work", "work", 6, 2]]);
          const all = Schema.decodeUnknownSync(Schema.Array(ProfileSummary))(
            (yield* request("GET", "/profiles", undefined, credential)).body,
          );
          expect(
            all.map((p) => [p.id, p.open_task_count, p.inbox_task_count]),
          ).toEqual([
            ["personal", 1, 1],
            ["work", 6, 2],
          ]);
          const projects = Schema.decodeUnknownSync(
            Schema.Array(ProjectSummary),
          )(
            (yield* request(
              "GET",
              "/profiles/work/projects",
              undefined,
              reader,
            )).body,
          );
          expect(
            projects.map((p) => [p.id, p.name, p.open_task_count]),
          ).toEqual([["work-project", "Work Project", 3]]);
          const tags = Schema.decodeUnknownSync(Schema.Array(TagSummary))(
            (yield* request("GET", "/profiles/work/tags", undefined, reader))
              .body,
          );
          expect(tags.map((t) => [t.id, t.name, t.open_task_count])).toEqual([
            ["work-tag", "work-tag", 2],
          ]);
          const expected = {
            today: [
              ["Overdue", ["Overdue"]],
              ["Due today", ["Due today"]],
              ["Scheduled today", ["Scheduled today"]],
            ],
            overdue: [["Overdue", ["Overdue"]]],
            scheduled: [
              ["Scheduled", ["Future scheduled", "Overdue", "Scheduled today"]],
            ],
            inbox: [["Inbox", ["Inbox with Project", "Inbox without Project"]]],
          };
          for (const name of [
            "today",
            "overdue",
            "scheduled",
            "inbox",
          ] as const) {
            const response = yield* request(
              "GET",
              `/profiles/work/views/${name}?now=2026-10-27T14:00:00Z`,
              undefined,
              reader,
            );
            expect(response.status).toBe(200);
            const view = Schema.decodeUnknownSync(PlanningView)(response.body);
            expect([view.name, view.now]).toEqual([
              name,
              "2026-10-27T14:00:00Z",
            ]);
            expect(
              view.groups.map((g) => [
                g.name,
                g.tasks.map((t) => t.title).sort(),
              ]),
            ).toEqual(expected[name]);
          }
          for (const route of [
            "/profiles",
            "/profiles/work/projects",
            "/profiles/work/tags",
            "/profiles/work/views/today",
            `/profiles/work/tasks/${first.id}/history`,
          ]) {
            expect((yield* request("GET", route)).status).toBe(401);
            expect(
              (yield* request("GET", route, undefined, "invalid")).status,
            ).toBe(401);
          }
          for (const suffix of [
            "projects",
            "tags",
            "views/today",
            "tasks/private/history",
          ])
            expect(
              (yield* request(
                "GET",
                `/profiles/personal/${suffix}`,
                undefined,
                reader,
              )).status,
            ).toBe(403);
          expect(
            (yield* request(
              "GET",
              "/profiles/work/views/today?now=invalid",
              undefined,
              reader,
            )).status,
          ).toBe(400);
          const unscoped = tokenSecret(
            (yield* request(
              "POST",
              "/auth/tokens",
              { name: "all profiles", profile: null, scope: "read-only" },
              credential,
            )).body,
          ).credential;
          expect(
            Schema.decodeUnknownSync(Schema.Array(ProfileSummary))(
              (yield* request("GET", "/profiles", undefined, unscoped)).body,
            ).map((p) => p.id),
          ).toEqual(["personal", "work"]);
          yield* request(
            "DELETE",
            "/auth/tokens/read%20counts",
            undefined,
            credential,
          );
          expect(
            (yield* request("GET", "/profiles", undefined, reader)).status,
          ).toBe(401);
        }),
      ),
    20000,
  );

  it.effect(
    "parses reproducible quick-add drafts through authenticated read-only HTTP",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential } = yield* fixture;
          const reader = tokenSecret(
            (yield* request(
              "POST",
              "/auth/tokens",
              { name: "parse", profile: "work", scope: "read-only" },
              credential,
            )).body,
          ).credential;
          const input = {
            text: "Ship tomorrow scheduled:fri 10am p1 #Launch #launch @Client",
            now: "2026-10-27T02:00:00Z",
            time_zone: "America/Bogota",
          };
          const expected = {
            status: 200,
            body: {
              title: "Ship",
              due_at: { kind: "date", date: "2026-10-27" },
              scheduled_at: {
                kind: "instant",
                utc: "2026-10-30T15:00:00Z",
                time_zone: "America/Bogota",
              },
              priority: "P1",
              tags: ["launch"],
              project: "Client",
            },
          };
          expect(
            yield* request(
              "POST",
              "/profiles/work/quick-add/parse",
              input,
              reader,
            ),
          ).toEqual(expected);
          expect(
            yield* request(
              "POST",
              "/profiles/work/quick-add/parse",
              input,
              reader,
            ),
          ).toEqual(expected);
          expect(
            (yield* request(
              "POST",
              "/profiles/personal/quick-add/parse",
              input,
              reader,
            )).status,
          ).toBe(403);
          expect(
            (yield* request("POST", "/profiles/work/quick-add/parse", input))
              .status,
          ).toBe(401);
          expect(
            (yield* request(
              "POST",
              "/profiles/work/quick-add/parse",
              { ...input, time_zone: "invalid" },
              reader,
            )).status,
          ).toBe(400);
          expect(
            (yield* request(
              "POST",
              "/profiles/work/quick-add/parse",
              { ...input, text: "tomorrow p1" },
              reader,
            )).status,
          ).toBe(422);
          expect(
            yield* request(
              "POST",
              "/profiles/work/quick-add/parse",
              { ...input, text: "Meet tomorrow 10:60am" },
              reader,
            ),
          ).toEqual({
            status: 422,
            body: {
              _tag: "InvalidTask",
              message: "Minute must be between 0 and 59",
            },
          });
          expect(
            (yield* request(
              "POST",
              "/profiles/work/quick-add/parse",
              { text: "No explicit clock" },
              reader,
            )).status,
          ).toBe(400);
          expect(
            yield* request("GET", "/profiles/work/tasks", undefined, reader),
          ).toEqual({ status: 200, body: [] });
        }),
      ),
    20000,
  );
  it.effect(
    "retains redacted Profile-scoped Task History after Purge",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { request, credential, store } = yield* fixture;
          const task = parseTask(
            (yield* request(
              "POST",
              "/profiles/work/tasks",
              { title: "Retain History after Purge" },
              credential,
            )).body,
          );
          const path = `/profiles/work/tasks/${task.id}`;
          const deleted = yield* request(
            "DELETE",
            `${path}?from_version=1`,
            undefined,
            credential,
          );
          expect(deleted.status).toBe(200);
          expect(
            (yield* store.auth.append({
              credential,
              profile: task.profile_id,
              event: {
                kind: "TaskPurged",
                entity_version: 1,
                occurred_at: task.created_at,
                task_id: task.id,
                before: parseTask(deleted.body),
              },
            })).outcome,
          ).toBe("committed");
          expect((yield* store.tasks()).map((task) => task.title)).toEqual([]);
          expect(
            (yield* request("GET", path, undefined, credential)).status,
          ).toBe(404);
          const response = yield* request(
            "GET",
            `${path}/history`,
            undefined,
            credential,
          );
          expect(response.status).toBe(200);
          const history = Schema.decodeUnknownSync(Schema.Array(OpLogEntry))(
            response.body,
          );
          expect(
            history.map((entry) => [
              entry.event.kind === "TaskHistoryRedacted"
                ? entry.event.original_kind
                : entry.event.kind,
              entry.outcome,
              entry.reason,
              entry.from_version,
              entry.to_version,
            ]),
          ).toEqual([
            ["TaskCreated", "committed", null, null, 1],
            ["TaskDeleted", "committed", null, 1, 2],
            ["TaskPurged", "committed", null, 2, null],
          ]);
          expect(
            history.every(
              (entry) => entry.event.kind === "TaskHistoryRedacted",
            ),
          ).toBe(true);
          expect(JSON.stringify(response.body)).not.toContain(
            "Retain History after Purge",
          );
          expect(
            yield* request(
              "POST",
              `${path}/revert`,
              { from_version: 2, seq: history[0]?.seq },
              credential,
            ),
          ).toEqual({
            status: 422,
            body: { _tag: "InvalidTask", message: "task_purged" },
          });
          expect(
            yield* request(
              "GET",
              `/profiles/personal/tasks/${task.id}/history`,
              undefined,
              credential,
            ),
          ).toEqual({ status: 200, body: [] });
        }),
      ),
    20000,
  );
});

it.effect(
  "resolves names on task and Series writes, discovers definitions and rejects foreign ids",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { request, credential } = yield* fixture;
        const send = (method: string, path: string, body?: unknown) =>
          request(method, path, body, credential);
        const created = yield* send("POST", "/profiles/work/tasks", {
          title: "Client metadata",
          project_name: "Launch",
          tag_names: ["FOCUS", " focus ", "Ready"],
        });
        expect(created.status).toBe(200);
        const first = parseTask(created.body);
        const projects = yield* send("GET", "/profiles/work/projects");
        const projectValues = Schema.decodeUnknownSync(
          Schema.Array(ProjectSummary),
        )(projects.body);
        expect(projectValues.map(({ name }) => name)).toEqual(["Launch"]);
        const tags = Schema.decodeUnknownSync(Schema.Array(TagSummary))(
          (yield* send("GET", "/profiles/work/tags")).body,
        );
        expect(tags.map(({ name }) => name).sort()).toEqual(["focus", "ready"]);
        const other = parseTask(
          (yield* send("POST", "/profiles/work/tasks", { title: "Other" }))
            .body,
        );
        const reused = yield* send(
          "PATCH",
          `/profiles/work/tasks/${other.id}`,
          {
            from_version: 1,
            changes: { project_name: "Launch", tag_names: ["ready", "FOCUS"] },
          },
        );
        expect(reused.status).toBe(200);
        expect(parseTask(reused.body).project_id).toBe(first.project_id);
        expect([...parseTask(reused.body).tags].sort()).toEqual(
          [...first.tags].sort(),
        );
        const recurrence = {
          dtstart: { kind: "date", date: "2026-10-28" },
          rrule: "FREQ=DAILY",
          exdate: [],
        };
        const series = yield* send("POST", "/profiles/work/series", {
          task: {
            title: "Series names",
            project_name: "Series Project",
            tag_names: ["SERIES"],
          },
          recurrence,
        });
        expect(series.status).toBe(200);
        const occurrence = parseTask(series.body);
        const edited = yield* send(
          "PATCH",
          `/profiles/work/tasks/${occurrence.id}/series`,
          {
            from_version: 1,
            changes: {
              project_name: "Launch",
              tags: [tags[0]?.id],
              tag_names: ["READY"],
            },
            recurrence,
          },
        );
        expect(edited.status).toBe(200);
        expect(parseTask(edited.body).project_id).toBe(first.project_id);
        for (const fields of [
          { project_id: first.project_id },
          { tags: first.tags },
          { project_id: first.project_id, project_name: "Foreign" },
          { tags: first.tags, tag_names: ["Foreign"] },
        ]) {
          expect(
            (yield* send("POST", "/profiles/personal/tasks", {
              title: "Foreign",
              ...fields,
            })).status,
          ).toBe(422);
        }
        expect(
          (yield* send("GET", "/profiles/personal/projects")).body,
        ).toEqual([]);
        expect((yield* send("GET", "/profiles/personal/tags")).body).toEqual(
          [],
        );
        const legacy = yield* send("POST", "/profiles/work/tasks", {
          title: "Legacy ids",
          project_id: first.project_id,
          tags: first.tags,
        });
        expect(legacy.status).toBe(200);
        expect(parseTask(legacy.body).project_id).toBe(first.project_id);
        expect(parseTask(legacy.body).tags).toEqual(first.tags);
        const clear = yield* send("PATCH", `/profiles/work/tasks/${other.id}`, {
          from_version: 2,
          changes: { project_name: "", tag_names: [] },
        });
        expect(clear.status).toBe(200);
        expect(parseTask(clear.body).project_id).toBe(null);
        expect(parseTask(clear.body).tags).toEqual([]);
      }),
    ),
);

it.effect(
  "Attachment HTTP uploads validate bytes and refuse arbitrary image reads",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { request, credential, store } = yield* fixture;
        const created = yield* request(
          "POST",
          "/profiles/work/tasks",
          { title: "HTTP attachments" },
          credential,
        );
        const task = parseTask(created.body);
        const path = `/profiles/work/tasks/${task.id}/attachments`;
        const attached = yield* request(
          "POST",
          path,
          {
            from_version: 1,
            location: { kind: "file", path: "/tmp/jira-draft.md" },
            label: "jira",
          },
          credential,
        );
        expect(attached.status).toBe(200);
        expect(parseTask(attached.body).attachments?.[0]).toMatchObject({
          kind: "file",
          path: "/tmp/jira-draft.md",
          label: "jira",
        });
        const stale = yield* request(
          "POST",
          path,
          {
            from_version: 1,
            location: { kind: "link", url: "https://example.com/issue/42" },
          },
          credential,
        );
        expect(stale.status).toBe(409);
        const invalid = yield* request(
          "POST",
          `${path}/upload`,
          { from_version: 2, mime_type: "image/png", data: "bm90IGFuIGltYWdl" },
          credential,
        );
        expect(invalid.status).toBe(422);
        expect(
          (yield* request(
            "POST",
            path,
            { from_version: 2, location: { kind: "file", path: "../outside" } },
            credential,
          )).status,
        ).toBe(400);
        const imageReference = yield* request(
          "POST",
          path,
          { from_version: 2, location: { kind: "image", path: "/etc/passwd" } },
          credential,
        );
        const referenced = parseTask(imageReference.body).attachments?.[1];
        if (!referenced) throw new Error("Missing image reference");
        expect(
          (yield* request(
            "GET",
            `${path}/${referenced.id}/image`,
            undefined,
            credential,
          )).status,
        ).toBe(404);
        expect(
          (yield* request("GET", `${path}/${referenced.id}/image`)).status,
        ).toBe(401);
        expect(
          (yield* store.history())
            .filter(
              (entry) =>
                entry.outcome === "rejected" &&
                entry.event.kind === "TaskAttemptRejected",
            )
            .map((entry) => entry.reason),
        ).toEqual(["conflict", "validation", "validation"]);
      }),
    ),
);

it.effect(
  "C10 HTTP copy preserves completed Tasks and move resolves target metadata",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { request, credential, store } = yield* fixture;
        const send = (method: string, path: string, body?: unknown) =>
          request(method, path, body, credential);
        const source = parseTask(
          (yield* send("POST", "/profiles/work/tasks", {
            title: "Transfer HTTP",
            project_name: "ARG",
            tag_names: ["focus"],
          })).body,
        );
        const other = parseTask(
          (yield* send("POST", "/profiles/work/tasks", {
            title: "Untouched HTTP",
          })).body,
        );
        const done = parseTask(
          (yield* send("POST", `/profiles/work/tasks/${source.id}/transition`, {
            from_version: 1,
            action: "complete",
          })).body,
        );
        const copied = yield* send(
          "POST",
          `/profiles/work/tasks/${source.id}/copy`,
          { from_version: 2, destination_profile: "personal" },
        );
        expect(copied.status).toBe(200);
        const target = parseTask(copied.body);
        expect([
          target.title,
          target.status,
          target.created_at,
          target.completed_at,
          target.row_version,
          target.occurrence,
        ]).toEqual([
          "Transfer HTTP",
          "done",
          source.created_at,
          done.completed_at,
          1,
          null,
        ]);
        expect(target.id).not.toBe(source.id);
        expect(
          (yield* send("POST", `/profiles/work/tasks/${source.id}/copy`, {
            from_version: 1,
            destination_profile: "personal",
          })).status,
        ).toBe(409);
        const moved = yield* send(
          "POST",
          `/profiles/work/tasks/${source.id}/move`,
          { from_version: 2, destination_profile: "personal" },
        );
        expect(moved.status).toBe(200);
        expect([
          parseTask(moved.body).project_id,
          parseTask(moved.body).tags,
        ]).toEqual([target.project_id, target.tags]);
        expect(
          (yield* store.tasks()).filter((t) => t.profile_id === "work"),
        ).toEqual([other]);
        expect(
          parseTask(
            (yield* send("GET", `/profiles/work/tasks/${other.id}`)).body,
          ),
        ).toEqual(other);
      }),
    ),
);

it.effect(
  "C10 rejected malformed and missing-destination Copy attempts enter source History",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { request, credential, store } = yield* fixture;
        const source = parseTask(
          (yield* request(
            "POST",
            "/profiles/work/tasks",
            { title: "Rejected Copy" },
            credential,
          )).body,
        );
        const target = `/profiles/work/tasks/${source.id}`;
        expect(
          (yield* request(
            "POST",
            target + "/copy",
            { from_version: 0, destination_profile: "personal" },
            credential,
          )).status,
        ).toBe(400);
        expect(
          (yield* request(
            "POST",
            target + "/copy",
            { from_version: 1, destination_profile: "missing-profile" },
            credential,
          )).status,
        ).toBe(422);
        expect(
          (yield* store.history())
            .filter((e) => e.outcome === "rejected")
            .map((e) => [
              e.reason,
              e.event.kind === "TaskAttemptRejected"
                ? e.event.attempted_kind
                : null,
            ]),
        ).toEqual([
          ["validation", "TaskCreated"],
          ["validation", "TaskCreated"],
        ]);
        expect(yield* store.tasks()).toEqual([source]);
      }),
    ),
);

it.effect(
  "Profile deletion hides every scoped route, reports counts and preserves owner Sessions",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { request, credential } = yield* fixture;
        const task = parseTask(
          (yield* request(
            "POST",
            "/profiles/work/tasks",
            { title: "Delete with History" },
            credential,
          )).body,
        );
        const scoped = tokenSecret(
          (yield* request(
            "POST",
            "/auth/tokens",
            { name: "work-only", profile: "work", scope: "read-write" },
            credential,
          )).body,
        ).credential;
        expect(
          (yield* request(
            "DELETE",
            "/profiles/work",
            { with_tasks: true, dry_run: false },
            scoped,
          )).status,
        ).toBe(403);
        const refused = yield* request(
          "DELETE",
          "/profiles/work",
          { with_tasks: false, dry_run: false },
          credential,
        );
        expect(refused.status).toBe(422);
        expect(refused.body).toMatchObject({
          code: "profile_not_empty",
          details: { visible_task_count: 1 },
        });
        expect(
          (yield* request(
            "DELETE",
            "/profiles/work",
            { with_tasks: true, dry_run: true },
            credential,
          )).body,
        ).toMatchObject({
          dry_run: true,
          tasks_affected: 1,
          access_tokens_revoked: 1,
          sessions_revoked: 0,
        });
        expect(
          (yield* request("GET", "/profiles/work/tasks", undefined, credential))
            .body,
        ).toMatchObject([{ title: "Delete with History", row_version: 1 }]);
        expect(
          (yield* request(
            "DELETE",
            "/profiles/work",
            { with_tasks: true, dry_run: false },
            credential,
          )).body,
        ).toMatchObject({
          dry_run: false,
          tasks_affected: 1,
          access_tokens_revoked: 1,
          sessions_revoked: 0,
        });
        expect(
          (yield* request("GET", "/profiles", undefined, credential)).body,
        ).toMatchObject([{ id: "personal" }]);
        expect(
          (yield* request("GET", "/profiles/work/tasks", undefined, scoped))
            .status,
        ).toBe(401);
        for (const [method, path, body] of [
          ["GET", "/profiles/work/tasks", undefined],
          ["GET", `/profiles/work/tasks/${task.id}`, undefined],
          ["GET", `/profiles/work/tasks/${task.id}/history`, undefined],
          ["GET", "/profiles/work/projects", undefined],
          ["GET", "/profiles/work/tags", undefined],
          ["GET", "/profiles/work/views/inbox", undefined],
          ["GET", "/profiles/work/events", undefined],
          ["POST", "/profiles/work/tasks", { title: "Cannot resurrect" }],
          [
            "POST",
            "/profiles/work/import",
            {
              items: [
                { external_id: "deleted:one", title: "Cannot resurrect" },
              ],
              dry_run: true,
            },
          ],
          [
            "POST",
            "/profiles/work/import",
            {
              items: [
                { external_id: "deleted:one", title: "Cannot resurrect" },
              ],
              dry_run: false,
            },
          ],
          [
            "POST",
            "/profiles/work/quick-add/parse",
            {
              text: "Never parse",
              now: "2026-10-29T00:00:00Z",
              time_zone: "UTC",
            },
          ],
          [
            "POST",
            `/profiles/work/tasks/${task.id}/move`,
            { from_version: 2, destination_profile: "personal" },
          ],
          [
            "POST",
            `/profiles/work/tasks/${task.id}/copy`,
            { from_version: 2, destination_profile: "personal" },
          ],
          ["DELETE", "/profiles/work", { with_tasks: true, dry_run: false }],
        ] as const) {
          const response = yield* request(method, path, body, credential);
          expect(response.status, `${method} ${path}`).toBe(404);
          expect(response.body).toMatchObject({
            generated_at: expect.any(String),
            code: "not_found",
            message: expect.any(String),
          });
          expect(Object.keys(response.body ?? {}).sort()).toEqual([
            "code",
            "generated_at",
            "message",
          ]);
        }
        expect(
          (yield* request(
            "DELETE",
            "/profiles/personal",
            { with_tasks: true, dry_run: false },
            credential,
          )).body,
        ).toMatchObject({ code: "last_profile" });
      }),
    ),
);

it.effect(
  "quick add keeps multi-word names and null-ID Project edits survive reload",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { request, credential } = yield* fixture;
        const parsed = yield* request(
          "POST",
          "/profiles/work/quick-add/parse",
          {
            text: 'Prepare #"Deep Focus" @"Client Project" p1',
            now: "2026-10-28T15:00:00Z",
            time_zone: "America/Bogota",
          },
          credential,
        );
        expect(parsed.body).toEqual({
          title: "Prepare",
          due_at: null,
          scheduled_at: null,
          priority: "P1",
          tags: ["deep focus"],
          project: "Client Project",
        });
        const created = parseTask(
          (yield* request(
            "POST",
            "/profiles/work/tasks",
            {
              title: "Prepare",
              project_id: null,
              project_name: "Client Project",
              tag_names: ["deep focus"],
            },
            credential,
          )).body,
        );
        const projects = Schema.decodeUnknownSync(Schema.Array(ProjectSummary))(
          (yield* request(
            "GET",
            "/profiles/work/projects",
            undefined,
            credential,
          )).body,
        );
        expect(
          projects.map((p) => [p.id === created.project_id, p.name]),
        ).toEqual([[true, "Client Project"]]);
        const edited = parseTask(
          (yield* request(
            "PATCH",
            `/profiles/work/tasks/${created.id}`,
            {
              from_version: 1,
              changes: {
                project_id: null,
                project_name: "Release Project",
                tags: [],
                tag_names: ["ready"],
              },
            },
            credential,
          )).body,
        );
        const loaded = parseTask(
          (yield* request(
            "GET",
            `/profiles/work/tasks/${created.id}`,
            undefined,
            credential,
          )).body,
        );
        expect([loaded.project_id, loaded.tags, loaded.row_version]).toEqual([
          edited.project_id,
          edited.tags,
          2,
        ]);
        expect(
          Schema.decodeUnknownSync(Schema.Array(ProjectSummary))(
            (yield* request(
              "GET",
              "/profiles/work/projects",
              undefined,
              credential,
            )).body,
          )
            .map((p) => p.name)
            .sort(),
        ).toEqual(["Client Project", "Release Project"]);
      }),
    ),
);
