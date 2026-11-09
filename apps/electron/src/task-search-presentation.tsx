import type { TaskRead } from "@todo/domain";
import { Fragment, useLayoutEffect, useRef } from "react";

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

export function DescriptionMatch({ task }: { task: TaskRead }) {
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!task.description) return;
    const excerpt = element.current;
    if (!excerpt) return;
    const center = () => {
      const first = excerpt.querySelector("mark");
      if (!first) return;
      const span = first.getBoundingClientRect();
      const viewport = excerpt.getBoundingClientRect();
      excerpt.scrollLeft +=
        span.left + span.width / 2 - viewport.left - viewport.width / 2;
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(excerpt);
    return () => observer.disconnect();
  }, [task]);
  return (
    <span ref={element} className="search-excerpt">
      <SearchHighlight
        text={task.description ?? ""}
        matches={task.search_matches}
        field="description"
      />
    </span>
  );
}
