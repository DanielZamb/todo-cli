import { Schema } from "effect";
import { Task } from "./entities.ts";
import { SearchMatches } from "./task-search.ts";

export const TaskRead = Schema.Struct({
  ...Task.fields,
  search_matches: Schema.optionalKey(SearchMatches),
});
export type TaskRead = typeof TaskRead.Type;
