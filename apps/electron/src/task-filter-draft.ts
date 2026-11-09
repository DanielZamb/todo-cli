import { TaskFilters } from "@todo/domain";
import { Schema } from "effect";

const Readiness = Schema.Struct({
  ready: TaskFilters.fields.ready,
  blocked: TaskFilters.fields.blocked,
});
export type TaskFilterDraft = {
  readonly fields: {
    [Key in keyof Omit<TaskFilters, "ready" | "blocked">]?: string;
  };
  readonly readiness: typeof Readiness.Type;
};
const DraftInput = Schema.Struct({
  fields: Schema.Record(Schema.String, Schema.String),
  readiness: Readiness,
});
export function taskFilterDraft(input: unknown): TaskFilterDraft {
  const { ready, blocked, ...fields } =
    Schema.decodeUnknownSync(TaskFilters)(input);
  return {
    fields,
    readiness: {
      ...(ready === undefined ? {} : { ready }),
      ...(blocked === undefined ? {} : { blocked }),
    },
  };
}
export function applyTaskFilterDraft(
  input: unknown,
  dates: {
    readonly due?: TaskFilters["due"];
    readonly scheduled?: TaskFilters["scheduled"];
  },
): TaskFilters {
  const draft = Schema.decodeUnknownSync(DraftInput)(input);
  const { due: _due, scheduled: _scheduled, ...fields } = draft.fields;
  return Schema.decodeUnknownSync(TaskFilters)({
    ...Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== ""),
    ),
    ...draft.readiness,
    ...(dates.due === undefined ? {} : { due: dates.due }),
    ...(dates.scheduled === undefined ? {} : { scheduled: dates.scheduled }),
  });
}
