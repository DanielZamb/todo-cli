import { expect, it } from "@effect/vitest";
import { TaskRead } from "@todo/domain";
import { Schema } from "effect";
import { renderToStaticMarkup } from "react-dom/server";
import { errorReply } from "../src/error-reply.ts";
import { Reply } from "../src/protocol.ts";
import {
  DescriptionMatch,
  descriptionMatch,
  SearchErrorMessage,
  SearchHighlight,
} from "../src/task-search-presentation.tsx";
import { searchGroups } from "../src/task-search-results.ts";

const task = Schema.decodeUnknownSync(TaskRead)({
  id: "6aa2647d-0000-4000-8000-000000000001",
  profile_id: "work",
  entity_version: 1,
  row_version: 1,
  title: "Canción de cuna",
  description: "A quiet song",
  project_id: null,
  priority: "P1",
  scheduled_at: null,
  due_at: null,
  energy: null,
  estimate_min: null,
  source: "electron",
  tags: [],
  status: "open",
  occurrence: null,
  created_at: "2026-10-27T00:00:00Z",
  updated_at: "2026-10-27T00:00:00Z",
  completed_at: null,
  deleted_at: null,
  search_matches: [{ field: "title", start: 0, end: 7 }],
});

it("shows the refusal first and names the retained search snapshot", () => {
  expect(
    renderToStaticMarkup(
      <SearchErrorMessage
        kind="search_too_broad"
        message="Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase."
        appliedText="rent"
      />,
    ),
  ).toBe(
    '<span class="whitespace-pre-line">Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase.</span><small class="search-error-context">Showing results for &quot;rent&quot;.</small>',
  );
});

it("shows the refusal first and identifies an unsearched snapshot", () => {
  expect(
    renderToStaticMarkup(
      <SearchErrorMessage
        kind="search_too_broad"
        message="Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase."
        appliedText={undefined}
      />,
    ),
  ).toBe(
    '<span class="whitespace-pre-line">Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase.</span><small class="search-error-context">Showing tasks without search.</small>',
  );
});

it("preserves a deterministic search refusal through IPC", () => {
  expect(
    Schema.decodeUnknownSync(Reply)({
      _tag: "error",
      code: "search_too_broad",
      message: "Narrow the search with a Project, Tag or Status filter.",
    }),
  ).toEqual({
    _tag: "error",
    code: "search_too_broad",
    message: "Narrow the search with a Project, Tag or Status filter.",
  });
});

it("starts a trimmed description at a whole word and marks the original match", () => {
  expect(
    renderToStaticMarkup(
      <DescriptionMatch
        task={{
          ...task,
          description:
            "This is a deliberately long introductory phrase. Find the blue Canción receipt in the cabinet.",
          search_matches: [{ field: "description", start: 63, end: 70 }],
        }}
      />,
    ),
  ).toBe(
    '<span class="search-excerpt">…phrase. Find the blue <mark>Canción</mark> receipt in the cabinet.</span>',
  );
});
const catalog = () =>
  Schema.decodeUnknownSync(Reply)({
    _tag: "tasks",
    tasks: [{ ...task, title: "Independently read newer title" }],
    matching_tasks: [task],
    profiles: [],
    projects: [],
    tags: [],
    planning: null,
    counts: { tasks: 1, today: 0, overdue: 0, scheduled: 0, inbox: 1 },
    draft: "",
  });
it("keeps response-only spans and their original strings through IPC decoding", () => {
  const reply = catalog();
  if (reply._tag !== "tasks") throw new Error("Expected Task catalog");
  expect(
    reply.matching_tasks?.map((task) => [task.title, task.search_matches]),
  ).toEqual([["Canción de cuna", [{ field: "title", start: 0, end: 7 }]]]);
  expect(searchGroups(reply)[0]?.tasks[0]?.title).toBe("Canción de cuna");
});
it("uses planning only for membership and order, joining same-response strings and spans", () => {
  const reply = catalog();
  if (reply._tag !== "tasks") throw new Error("Expected Task catalog");
  const groups = searchGroups({
    ...reply,
    planning: {
      name: "inbox",
      now: task.created_at,
      groups: [
        {
          name: "Inbox",
          tasks: [{ ...task, title: "Planning's independent title" }],
        },
      ],
    },
  });
  expect(
    groups.map((group) =>
      group.tasks.map((task) => [task.title, task.search_matches]),
    ),
  ).toEqual([[["Canción de cuna", [{ field: "title", start: 0, end: 7 }]]]]);
});
it("renders original UTF-16 spans without normalization or matching", () => {
  expect(
    renderToStaticMarkup(
      <SearchHighlight
        text="😀 Canción"
        field="title"
        matches={[{ field: "title", start: 3, end: 10 }]}
      />,
    ),
  ).toBe("😀 <mark>Canción</mark>");
  expect(
    descriptionMatch({
      ...task,
      search_matches: [{ field: "description", start: 8, end: 12 }],
    }),
  ).toEqual({ field: "description", start: 8, end: 12 });
  expect(descriptionMatch(task)).toBeNull();
});

it("resolves synthetic same-name Projects and raw-append case-fold Tags while preserving dialog names", async () => {
  const { taskSearchQuery } = await import("../src/task-search-results.ts");
  const definitions = Schema.decodeUnknownSync(Reply)({
    ...catalog(),
    projects: [
      {
        id: "small-a",
        profile_id: "work",
        name: "Small",
        created_at: task.created_at,
        updated_at: task.created_at,
        open_task_count: 1,
      },
      {
        id: "small-b",
        profile_id: "work",
        name: "Small",
        created_at: task.created_at,
        updated_at: task.created_at,
        open_task_count: 1,
      },
    ],
    tags: [
      { id: "keep-a", profile_id: "work", name: "keep", open_task_count: 1 },
      { id: "keep-b", profile_id: "work", name: "KEEP", open_task_count: 1 },
    ],
  });
  if (definitions._tag !== "tasks") throw new Error("Expected Task catalog");
  const identity = {
    profile: task.profile_id,
    view: "tasks",
    filters: { status: "open" },
    project: "small-b",
    tag: "keep-b",
    text: "probe",
  } satisfies import("../src/task-search-results.ts").SearchIdentity;
  expect(taskSearchQuery(identity, definitions)).toEqual({
    project: "Small",
    tag: "KEEP",
    status: "open",
    text: "probe",
  });
  expect(
    taskSearchQuery(
      { ...identity, filters: { project: "Dialog", tag: "explicit" } },
      definitions,
    ),
  ).toEqual({ project: "Dialog", tag: "explicit", text: "probe" });
  expect(
    taskSearchQuery(
      { ...identity, project: "deleted", tag: "deleted" },
      definitions,
    ),
  ).toEqual({ status: "open", text: "probe" });
  const catalogWith = (
    projects: readonly unknown[],
    tags: readonly unknown[],
  ) => {
    const decoded = Schema.decodeUnknownSync(Reply)({
      ...catalog(),
      projects,
      tags,
    });
    if (decoded._tag !== "tasks") throw new Error("Expected Task catalog");
    return decoded;
  };
  for (const name of [" keep ", "keep\t", "﻿keep", " keep", " "])
    expect(
      taskSearchQuery(
        { ...identity, project: null, tag: "padded" },
        catalogWith(
          [],
          [{ id: "padded", profile_id: "work", name, open_task_count: 1 }],
        ),
      ),
    ).toEqual({ status: "open", text: "probe" });
  expect(
    taskSearchQuery(
      { ...identity, project: "padded-project" },
      catalogWith(
        [
          {
            id: "padded-project",
            profile_id: "work",
            name: " Small ",
            created_at: task.created_at,
            updated_at: task.created_at,
            open_task_count: 1,
          },
        ],
        definitions.tags,
      ),
    ),
  ).toEqual({ project: " Small ", tag: "KEEP", status: "open", text: "probe" });
});

it("keeps the exit meaning in a deterministic refusal", () => {
  const reply = errorReply({
    code: "search_too_broad",
    message: "Narrow the search.",
    exit_code: 2,
    exit_meaning: "validation or usage",
  });
  expect(reply.message).toBe(
    "Narrow the search.\nerror 2 - validation or usage",
  );
  expect(
    renderToStaticMarkup(
      <SearchErrorMessage
        kind="search_too_broad"
        message={reply.message}
        appliedText="rent"
      />,
    ),
  ).toBe(
    '<span class="whitespace-pre-line">Narrow the search.\nerror 2 - validation or usage</span><small class="search-error-context">Showing results for &quot;rent&quot;.</small>',
  );
});
