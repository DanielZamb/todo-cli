import { expect, it } from "@effect/vitest";
import { TaskRead } from "@todo/domain";
import { Schema } from "effect";
import { renderToStaticMarkup } from "react-dom/server";
import { Reply } from "../src/protocol.ts";
import {
  descriptionMatch,
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
