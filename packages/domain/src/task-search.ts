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

function fieldWords(value: string): readonly Word[] {
  let normalized = "";
  const origins: { start: number; end: number }[] = [];
  for (const part of graphemes.segment(value)) {
    const folded = normalizeTaskSearch(part.segment);
    normalized += folded;
    for (let index = 0; index < folded.length; index++)
      origins.push({
        start: part.index,
        end: part.index + part.segment.length,
      });
  }
  return Array.from(words.segment(normalized)).flatMap((part) => {
    if (!part.isWordLike) return [];
    const first = origins[part.index];
    const last = origins[part.index + part.segment.length - 1];
    return first && last
      ? [{ text: part.segment, start: first.start, end: last.end }]
      : [];
  });
}

function prefixMatches(query: string, value: string, budget: number): boolean {
  if (value.startsWith(query)) return true;
  if (budget === 0) return false;
  const source = Array.from(query);
  const target = Array.from(value).slice(0, source.length + budget);
  const width = target.length + 2;
  const infinity = source.length + target.length;
  const matrix = new Float64Array((source.length + 2) * width).fill(infinity);
  const get = (row: number, column: number) =>
    matrix[row * width + column] ?? infinity;
  const set = (row: number, column: number, distance: number) => {
    matrix[row * width + column] = distance;
  };
  for (let row = 0; row <= source.length; row++) set(row + 1, 1, row);
  for (let column = 0; column <= target.length; column++)
    set(1, column + 1, column);
  const seen = new Map<string, number>();
  for (const [offset, character] of source.entries()) {
    const row = offset + 1;
    let lastMatch = 0;
    for (const [otherOffset, other] of target.entries()) {
      const column = otherOffset + 1;
      const previousRow = seen.get(other) ?? 0;
      const previousColumn = lastMatch;
      const cost = character === other ? 0 : 1;
      if (cost === 0) lastMatch = column;
      set(
        row + 1,
        column + 1,
        Math.min(
          get(row, column) + cost,
          get(row + 1, column) + 1,
          get(row, column + 1) + 1,
          get(previousRow, previousColumn) +
            (row - previousRow - 1) +
            1 +
            (column - previousColumn - 1),
        ),
      );
    }
    seen.set(character, row);
  }
  for (
    let length = Math.max(1, source.length - budget);
    length <= target.length;
    length++
  ) {
    if (get(source.length + 1, length + 1) <= budget) return true;
  }
  return false;
}

function phraseMatches(
  phrase: Phrase,
  field: readonly Word[],
): readonly Word[] {
  return field.flatMap((_, start) => {
    const candidate = field.slice(start, start + phrase.words.length);
    return candidate.length === phrase.words.length &&
      phrase.words.every((word, index) => {
        const target = candidate[index]?.text;
        return (
          target !== undefined &&
          (phrase.kind === "open-phrase" && index === phrase.words.length - 1
            ? target.startsWith(word)
            : target === word)
        );
      })
      ? candidate
      : [];
  });
}
function clauseMatches(
  clause: SearchClause,
  field: readonly Word[],
): readonly Word[] {
  switch (clause.kind) {
    case "word": {
      const length = Array.from(clause.word).length;
      return field.filter((word) =>
        prefixMatches(
          clause.word,
          word.text,
          length >= 9 ? 2 : length >= 5 ? 1 : 0,
        ),
      );
    }
    case "exclude-word":
      return field.filter((word) => word.text.startsWith(clause.word));
    case "phrase":
    case "open-phrase":
      return phraseMatches(clause, field);
    case "exclude-phrase":
      return phraseMatches(clause.phrase, field);
    default: {
      const exhaustive: never = clause;
      return exhaustive;
    }
  }
}

export function matchTaskSearch(
  task: { readonly title: string; readonly description: string | null },
  clauses: readonly SearchClause[],
): { readonly accepted: boolean; readonly matches: readonly SearchMatch[] } {
  if (clauses.length === 0) return { accepted: true, matches: [] };
  const fields = [
    { field: "title", words: fieldWords(task.title) },
    { field: "description", words: fieldWords(task.description ?? "") },
  ] satisfies { field: SearchMatch["field"]; words: readonly Word[] }[];
  const matches: SearchMatch[] = [];
  for (const clause of clauses) {
    const occurrences = fields.flatMap(({ field, words }) =>
      clauseMatches(clause, words).map(({ start, end }) => ({
        field,
        start,
        end,
      })),
    );
    if (clause.kind === "exclude-word" || clause.kind === "exclude-phrase") {
      if (occurrences.length) return { accepted: false, matches: [] };
    } else {
      if (!occurrences.length) return { accepted: false, matches: [] };
      matches.push(...occurrences);
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
