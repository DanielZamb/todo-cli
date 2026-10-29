import { Fragment, memo, useLayoutEffect, useRef, useState } from "react";
import { wholeTagCount } from "./whole-tags.ts";

export const TaskTags = memo(
  function TaskTags({
    tags,
    compact,
  }: {
    tags: readonly string[];
    compact: boolean;
  }) {
    const container = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(0);
    const allTags = tags.map((tag) => `#${tag}`).join(" · ");
    useLayoutEffect(() => {
      const root = container.current;
      if (!compact || !root) return;
      const measure = () => {
        const separator = root.querySelector("[data-tag-separator]");
        if (!separator) return;
        const measured = new Map<string, number>();
        for (const element of root.querySelectorAll("[data-tag-measure]")) {
          const name = element.getAttribute("data-tag-measure");
          if (name !== null)
            measured.set(name, element.getBoundingClientRect().width);
        }
        const widths = tags.map(
          (tag) => measured.get(tag) ?? Number.POSITIVE_INFINITY,
        );
        const overflows = new Map<number, number>();
        for (const [index, element] of [
          ...root.querySelectorAll("[data-tag-overflow-measure]"),
        ].entries())
          overflows.set(index + 1, element.getBoundingClientRect().width);
        setVisible(
          wholeTagCount({
            tagWidths: widths,
            available: root.getBoundingClientRect().width,
            separatorWidth: separator.getBoundingClientRect().width,
            overflowWidth: (remaining) =>
              overflows.get(remaining) ?? Number.POSITIVE_INFINITY,
          }),
        );
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(root);
      return () => observer.disconnect();
    }, [compact, tags]);
    if (!compact)
      return (
        <span className="task-tags" title={allTags}>
          {allTags}
        </span>
      );
    const shown = tags.slice(0, visible);
    const remaining = tags.length - shown.length;
    return (
      <span ref={container} className="task-tags whole-tags" title={allTags}>
        <span className="tag-measure" aria-hidden="true">
          {tags.map((tag) => (
            <span key={tag} data-tag-measure={tag}>{`#${tag}`}</span>
          ))}
          {tags.map((tag, index) => (
            <span key={tag} data-tag-overflow-measure>{`+${index + 1}`}</span>
          ))}
          <span data-tag-separator>{" · "}</span>
        </span>
        {shown.map((tag, index) => (
          <Fragment key={tag}>
            {index > 0 && " · "}
            <span data-whole-tag>{`#${tag}`}</span>
          </Fragment>
        ))}
        {remaining > 0 && (
          <>
            {shown.length > 0 && " · "}
            <span className="tag-overflow">+{remaining}</span>
          </>
        )}
      </span>
    );
  },
  (previous, next) =>
    previous.compact === next.compact &&
    previous.tags.length === next.tags.length &&
    previous.tags.every((tag, index) => tag === next.tags[index]),
);
