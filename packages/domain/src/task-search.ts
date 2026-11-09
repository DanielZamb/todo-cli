import { Schema } from "effect";
import { taskSearchCaseFold } from "./task-search-case-fold.ts";

export const SearchMatch = Schema.Struct({
  field: Schema.Literals(["title", "description"]),
  start: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  end: Schema.Int.check(Schema.isGreaterThan(0)),
}).annotate({
  description:
    "Whole matched word in the same response's original title or description. start is inclusive and end exclusive, in UTF-16 code units on grapheme boundaries. Ordered, deduplicated and overlap-merged; exclusions and id prefixes have no spans.",
});
export type SearchMatch = typeof SearchMatch.Type;
export const SearchMatches = Schema.Array(SearchMatch);

type Phrase =
  | { readonly kind: "phrase"; readonly words: readonly string[] }
  | { readonly kind: "open-phrase"; readonly words: readonly string[] };
export type SearchClause =
  | { readonly kind: "word"; readonly word: string }
  | { readonly kind: "exclude-word"; readonly word: string }
  | Phrase
  | { readonly kind: "exclude-phrase"; readonly phrase: Phrase };
type Word = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};
export type PreparedField = {
  readonly words: readonly Word[];
  readonly preparedUnits: number;
};
export const taskSearchWorkLimits = {
  budget: 5_000_000,
  evaluationWeight: { numerator: 1, denominator: 10 },
} as const;
export const searchTooBroadMessage =
  "Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase.";
export class SearchTooBroad extends Error {
  readonly _tag = "SearchTooBroad";
  readonly code = "search_too_broad";
  constructor(readonly work: number) {
    super(searchTooBroadMessage);
  }
}
export class TaskSearchWork {
  preparedUnits = 0;
  damerauCells = 0;
  clauseVisits = 0;
  constructor(readonly limit: number = taskSearchWorkLimits.budget) {}
  get units() {
    const { numerator, denominator } = taskSearchWorkLimits.evaluationWeight;
    return (
      (this.preparedUnits * denominator +
        (this.damerauCells + this.clauseVisits) * numerator) /
      denominator
    );
  }
  check() {
    const { numerator, denominator } = taskSearchWorkLimits.evaluationWeight;
    if (
      this.preparedUnits * denominator +
        (this.damerauCells + this.clauseVisits) * numerator >
      this.limit * denominator
    )
      throw new SearchTooBroad(this.units);
  }
}
export type TaskSearchExecution = {
  readonly work: TaskSearchWork;
  readonly prepare: (value: string) => Generator<void, PreparedField>;
};
export const taskSearchExecution = (): TaskSearchExecution => ({
  work: new TaskSearchWork(),
  prepare: fieldWords,
});
const words = new Intl.Segmenter("und", { granularity: "word" });
const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });

export function normalizeTaskSearch(value: string): string {
  return Array.from(
    value.normalize("NFKD").replace(/\p{M}/gu, ""),
    (character) => taskSearchCaseFold.get(character) ?? character,
  )
    .join("")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}
const queryWords = (value: string) =>
  Array.from(words.segment(normalizeTaskSearch(value)))
    .filter((part) => part.isWordLike)
    .map((part) => part.segment);

export function parseTaskSearch(value: string): readonly SearchClause[] {
  const clauses: SearchClause[] = [];
  let index = 0;
  while (index < value.length) {
    if (/\s/u.test(value.charAt(index))) {
      index++;
      continue;
    }
    const exclude =
      value.charAt(index) === "-" &&
      (index === 0 || /\s/u.test(value.charAt(index - 1)));
    if (exclude) index++;
    while (index < value.length && !/\s/u.test(value.charAt(index))) {
      if (value.charAt(index) === '"') {
        const end = value.indexOf('"', index + 1);
        const content = queryWords(
          value.slice(index + 1, end === -1 ? value.length : end),
        );
        if (content.length) {
          const phrase: Phrase = {
            kind: end === -1 ? "open-phrase" : "phrase",
            words: content,
          };
          clauses.push(exclude ? { kind: "exclude-phrase", phrase } : phrase);
        }
        index = end === -1 ? value.length : end + 1;
      } else {
        const start = index;
        while (index < value.length && !/[\s"]/u.test(value.charAt(index)))
          index++;
        for (const word of queryWords(value.slice(start, index)))
          clauses.push({ kind: exclude ? "exclude-word" : "word", word });
      }
    }
  }
  const unique = new Map<string, SearchClause>();
  for (const clause of clauses) unique.set(JSON.stringify(clause), clause);
  return Array.from(unique.values());
}

export function* fieldWords(
  value: string,
  chunkSize = 512,
): Generator<void, PreparedField> {
  let normalized = "";
  const origins: { start: number; end: number }[] = [];
  let processed = 0;
  for (const part of graphemes.segment(value)) {
    const folded = normalizeTaskSearch(part.segment);
    normalized += folded;
    const origin = { start: part.index, end: part.index + part.segment.length };
    for (let index = 0; index < folded.length; index++) origins.push(origin);
    if (++processed % chunkSize === 0) yield;
  }
  const result: Word[] = [];
  for (const part of words.segment(normalized)) {
    if (part.isWordLike) {
      const first = origins[part.index];
      const last = origins[part.index + part.segment.length - 1];
      if (first && last)
        result.push({ text: part.segment, start: first.start, end: last.end });
    }
    if (++processed % chunkSize === 0) yield;
  }
  return { words: result, preparedUnits: normalized.length };
}

function prefixMatcher(query: string, budget: number, work: TaskSearchWork) {
  const source = Array.from(query);
  const width = 2 * budget + 1;
  const rows = budget + 2;
  const infinity = budget + 1;
  const matrix = new Uint8Array(rows * width);
  const get = (row: number, column: number) =>
    row < 0 || column < 0 || Math.abs(row - column) > budget
      ? infinity
      : (matrix[(row % rows) * width + column - row + budget] ?? infinity);
  const set = (row: number, column: number, distance: number) => {
    matrix[(row % rows) * width + column - row + budget] = Math.min(
      infinity,
      distance,
    );
  };
  return (value: string): boolean => {
    if (value.startsWith(query)) return true;
    if (budget === 0 || value.length < source.length - budget) return false;
    const target: string[] = [];
    for (const character of value) {
      target.push(character);
      if (target.length === source.length + budget) break;
    }
    if (target.length < source.length - budget) return false;
    matrix.fill(infinity);
    for (let column = 0; column <= Math.min(target.length, budget); column++)
      set(0, column, column);
    const seen = new Map<string, number>();
    for (let row = 1; row <= source.length; row++) {
      const character = source[row - 1];
      const first = Math.max(1, row - budget);
      const last = Math.min(target.length, row + budget);
      const offset = (row % rows) * width;
      matrix.fill(infinity, offset, offset + width);
      if (row <= budget) set(row, 0, row);
      let lastMatch = 0;
      for (
        let column = Math.max(1, first - budget - 1);
        column < first;
        column++
      )
        if (target[column - 1] === character) lastMatch = column;
      let minimum = infinity;
      for (let column = first; column <= last; column++) {
        work.damerauCells++;
        const other = target[column - 1] ?? "";
        const previousRow = seen.get(other) ?? 0;
        const previousColumn = lastMatch;
        const cost = character === other ? 0 : 1;
        if (cost === 0) lastMatch = column;
        const transposition =
          previousRow > 0 && previousColumn > 0 && row - previousRow <= budget
            ? get(previousRow - 1, previousColumn - 1) +
              (row - previousRow) +
              (column - previousColumn) -
              1
            : infinity;
        const distance = Math.min(
          get(row - 1, column - 1) + cost,
          get(row, column - 1) + 1,
          get(row - 1, column) + 1,
          transposition,
        );
        set(row, column, distance);
        minimum = Math.min(minimum, distance);
      }
      if (character !== undefined) seen.set(character, row);
      if (minimum > budget) return false;
    }
    for (
      let length = Math.max(1, source.length - budget);
      length <= target.length;
      length++
    )
      if (get(source.length, length) <= budget) return true;
    return false;
  };
}

const searchChunkWords = 512;
function* clauseMatches(
  clause: SearchClause,
  field: readonly Word[],
  work: TaskSearchWork,
): Generator<void, readonly Word[]> {
  const matches: Word[] = [];
  if (clause.kind === "word" || clause.kind === "exclude-word") {
    const length = Array.from(clause.word).length;
    const accepts = prefixMatcher(
      clause.word,
      clause.kind === "exclude-word"
        ? 0
        : length >= 9
          ? 2
          : length >= 5
            ? 1
            : 0,
      work,
    );
    const evaluated = new Map<string, boolean>();
    for (const [index, word] of field.entries()) {
      work.clauseVisits++;
      let accepted = evaluated.get(word.text);
      if (accepted === undefined) {
        accepted = accepts(word.text);
        evaluated.set(word.text, accepted);
      }
      if (accepted) matches.push(word);
      if ((index + 1) % searchChunkWords === 0) yield;
    }
  } else {
    const phrase = clause.kind === "exclude-phrase" ? clause.phrase : clause;
    const matchedWords = new Set<Word>();
    for (let start = 0; start < field.length; start++) {
      work.clauseVisits++;
      const candidate = field.slice(start, start + phrase.words.length);
      if (
        candidate.length === phrase.words.length &&
        phrase.words.every((word, index) => {
          const target = candidate[index]?.text;
          return (
            target !== undefined &&
            (phrase.kind === "open-phrase" && index === phrase.words.length - 1
              ? target.startsWith(word)
              : target === word)
          );
        })
      )
        for (const word of candidate) matchedWords.add(word);
      if ((start + 1) % searchChunkWords === 0) yield;
    }
    return Array.from(matchedWords);
  }
  return matches;
}

function* evaluateTaskSearchSteps(
  task: { readonly title: string; readonly description: string | null },
  clauses: readonly SearchClause[],
  execution: TaskSearchExecution,
): Generator<
  void,
  { readonly accepted: boolean; readonly matches: readonly SearchMatch[] }
> {
  if (clauses.length === 0) return { accepted: true, matches: [] };
  const fields: (PreparedField & { field: SearchMatch["field"] })[] = [];
  for (const [field, value] of [
    ["title", task.title],
    ["description", task.description ?? ""],
  ] as const) {
    const prepared = yield* execution.prepare(value);
    execution.work.preparedUnits += prepared.preparedUnits;
    execution.work.check();
    fields.push({ field, ...prepared });
  }
  const matches: SearchMatch[] = [];
  for (const clause of clauses) {
    const occurrences: SearchMatch[] = [];
    for (const { field, words } of fields) {
      const matched = yield* clauseMatches(clause, words, execution.work);
      for (const { start, end } of matched)
        occurrences.push({ field, start, end });
    }
    if (clause.kind === "exclude-word" || clause.kind === "exclude-phrase") {
      if (occurrences.length) return { accepted: false, matches: [] };
    } else {
      if (!occurrences.length) return { accepted: false, matches: [] };
      for (const occurrence of occurrences) matches.push(occurrence);
    }
  }
  matches.sort((a, b) =>
    a.field === b.field
      ? a.start - b.start || a.end - b.end
      : a.field === "title"
        ? -1
        : 1,
  );
  const merged: SearchMatch[] = [];
  for (const match of matches) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.field === match.field &&
      match.start < previous.end
    )
      merged[merged.length - 1] = {
        ...previous,
        end: Math.max(previous.end, match.end),
      };
    else merged.push(match);
  }
  return { accepted: true, matches: merged };
}

export function* matchTaskSearchSteps(
  task: { readonly title: string; readonly description: string | null },
  clauses: readonly SearchClause[],
  execution: TaskSearchExecution = taskSearchExecution(),
): Generator<
  void,
  { readonly accepted: boolean; readonly matches: readonly SearchMatch[] }
> {
  const steps = evaluateTaskSearchSteps(task, clauses, execution);
  let completed = false;
  try {
    while (true) {
      let step: ReturnType<typeof steps.next>;
      try {
        step = steps.next();
        completed = step.done === true;
      } catch (error) {
        completed = true;
        throw error;
      }
      execution.work.check();
      if (step.done) return step.value;
      yield;
    }
  } finally {
    if (!completed) steps.return({ accepted: false, matches: [] });
  }
}

export function matchTaskSearch(
  task: { readonly title: string; readonly description: string | null },
  clauses: readonly SearchClause[],
  execution: TaskSearchExecution = taskSearchExecution(),
) {
  const steps = matchTaskSearchSteps(task, clauses, execution);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
