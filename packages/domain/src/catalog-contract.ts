// The Catalog read's request and reply (CONTEXT.md: Catalog).
import { Schema } from "effect";
import { ProfileSummary, ProjectSummary, TagSummary } from "./client-reads.ts";
import { ProjectId, TagId, TaskId } from "./ids.ts";
import { TaskFilters } from "./task-filters.ts";
import { TaskRead } from "./task-read.ts";
import { CalendarDate, Instant } from "./time.ts";

export const CatalogViewName = Schema.Literals([
  "all",
  "today",
  "overdue",
  "scheduled",
  "inbox",
]);
export type CatalogViewName = typeof CatalogViewName.Type;

/** A closed set; clients own the words they show. */
export const CatalogGroupName = Schema.Literals([
  "P1",
  "P2",
  "P3",
  "P4",
  "Dependency order",
  "Lightest first",
  "Overdue",
  "Due today",
  "Scheduled today",
  "Scheduled",
  "Inbox",
]);
export type CatalogGroupName = typeof CatalogGroupName.Type;

export const CatalogPosition = Schema.Struct({
  generation: Schema.String.annotate({
    description:
      "The restore generation: the same string as the stream's reload event and the x-todo-generation header.",
  }),
  seq: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
    description:
      "Every committed operation with seq up to this one is reflected, and none after it. Counts every Profile's operations and rejected attempts, so it can rise with no change here.",
  }),
});
export type CatalogPosition = typeof CatalogPosition.Type;

export const CatalogQuery = Schema.Struct({
  view: Schema.optionalKey(CatalogViewName),
  tasks: Schema.optionalKey(
    Schema.Literals(["all", "matching"]).annotate({
      description:
        "all (default): every visible Task of the Profile, as a full refresh needs. matching: only the Tasks in the groups.",
    }),
  ),
  project_id: Schema.optionalKey(ProjectId),
  tag_id: Schema.optionalKey(TagId),
  ...TaskFilters.fields,
  now: Schema.optionalKey(Instant),
  time_zone: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The client's IANA time zone. Today is the date of now there. Without it, today is the date of now in the server's own zone. An instant falls on its date in the zone stored with it either way. An unknown zone is invalid_args.",
    }),
  ),
  known_generation: Schema.optionalKey(Schema.String),
  known_seq: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  known_day: Schema.optionalKey(
    CalendarDate.annotate({
      description:
        "With known_generation, known_seq and known_stamp, the position, day and stamp of an earlier reply to the same request. If nothing can have changed since, the reply is unchanged: true and no lists.",
    }),
  ),
  known_stamp: Schema.optionalKey(Schema.String),
});
export type CatalogQuery = typeof CatalogQuery.Type;

export const CatalogTask = Schema.Struct({
  ...TaskRead.fields,
  open_blocker_count: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
      description:
        "How many direct Dependencies are open or snoozed; present with depends_on.",
    }),
  ),
});
export type CatalogTask = typeof CatalogTask.Type;

const counts = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const CatalogCounts = Schema.Struct({
  all: counts,
  today: counts,
  overdue: counts,
  scheduled: counts,
  inbox: counts,
}).annotate({
  description:
    "Distinct open Tasks per view. Filters, search, Project and Tag never change a count.",
});

const CatalogStamp = Schema.String.annotate({
  description:
    "A digest of what the reply holds that History does not record: the Profiles this credential sees and the schema version. Send it back as known_stamp.",
});
export const CatalogChanged = Schema.Struct({
  unchanged: Schema.Literal(false),
  position: CatalogPosition,
  day: CalendarDate,
  stamp: CatalogStamp,
  now: Instant,
  profiles: Schema.Array(ProfileSummary),
  projects: Schema.Array(ProjectSummary),
  tags: Schema.Array(TagSummary),
  counts: CatalogCounts,
  view: Schema.Struct({
    name: CatalogViewName,
    groups: Schema.Array(
      Schema.Struct({
        name: CatalogGroupName,
        task_ids: Schema.Array(TaskId),
      }),
    ),
  }),
  tasks: Schema.Array(CatalogTask),
}).annotate({ identifier: "Catalog" });
export type CatalogChanged = typeof CatalogChanged.Type;

export const CatalogUnchanged = Schema.Struct({
  unchanged: Schema.Literal(true),
  position: CatalogPosition,
  day: CalendarDate,
  stamp: CatalogStamp,
}).annotate({ identifier: "CatalogUnchanged" });
export type CatalogUnchanged = typeof CatalogUnchanged.Type;

export const CatalogReply = Schema.Union([CatalogChanged, CatalogUnchanged]);
export type CatalogReply = typeof CatalogReply.Type;
