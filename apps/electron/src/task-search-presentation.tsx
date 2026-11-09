import type { TaskRead } from "@todo/domain";
import { Fragment } from "react";

export function appliedSearchContext(text: string | undefined) {
  return text
    ? `Showing results for "${text}".`
    : "Showing tasks without search.";
}

export function SearchErrorMessage({
  kind,
  message,
  appliedText,
}: {
  kind: "transient" | "search_too_broad";
  message: string;
  appliedText: string | undefined;
}) {
  const context = appliedSearchContext(appliedText);
  return (
    <>
      <span>
        {kind === "search_too_broad" ? message : `Couldn't search. ${context}`}
      </span>
      {kind === "search_too_broad" && (
        <small className="search-error-context">{context}</small>
      )}
    </>
  );
}

export function SearchHighlight({
  text,
  matches,
  field,
}: {
  text: string;
  matches: TaskRead["search_matches"];
  field: "title" | "description";
}) {
  let cursor = 0;
  const pieces = (matches ?? []).flatMap((span) => {
    if (span.field !== field) return [];
    const before = text.slice(cursor, span.start);
    cursor = span.end;
    return [
      <Fragment key={span.start}>
        {before}
        <mark>{text.slice(span.start, span.end)}</mark>
      </Fragment>,
    ];
  });
  return (
    <>
      {pieces}
      {text.slice(cursor)}
    </>
  );
}

export function descriptionMatch(task: TaskRead) {
  const matches = task.search_matches ?? [];
  if (matches.some((span) => span.field === "title")) return null;
  const first = matches.find((span) => span.field === "description");
  if (!first || !task.description) return null;
  return first;
}

const excerptWords = new Intl.Segmenter("und", { granularity: "word" });
export function descriptionExcerpt(task: TaskRead) {
  const first = descriptionMatch(task);
  if (!first || !task.description) return null;
  let start = first.start;
  for (const part of excerptWords.segment(task.description)) {
    if (part.index > first.start) break;
    if (part.isWordLike && part.index >= Math.max(0, first.start - 28)) {
      start = part.index;
      break;
    }
  }
  return {
    start,
    text: task.description.slice(start),
    matches: (task.search_matches ?? [])
      .filter((span) => span.field === "description")
      .map((span) => ({
        ...span,
        start: span.start - start,
        end: span.end - start,
      })),
  };
}

export function DescriptionMatch({ task }: { task: TaskRead }) {
  const excerpt = descriptionExcerpt(task);
  if (!excerpt) return null;
  return (
    <span className="search-excerpt">
      {excerpt.start > 0 && "…"}
      <SearchHighlight
        text={excerpt.text}
        matches={excerpt.matches}
        field="description"
      />
    </span>
  );
}
