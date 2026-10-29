import { useLayoutEffect, useRef, useState } from "react";
import { wholeTagCount } from "./whole-tags.ts";

export function RowMetadata({
  items,
}: {
  items: readonly { id: string; label: string; overdue?: boolean }[];
}) {
  const root = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(0);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const widths = [...element.querySelectorAll("[data-item-measure]")].map(
        (item) => item.getBoundingClientRect().width,
      );
      const overflow = [
        ...element.querySelectorAll("[data-overflow-measure]"),
      ].map((item) => item.getBoundingClientRect().width);
      setVisible(
        wholeTagCount({
          tagWidths: items.map((_, index) => widths[index] ?? Infinity),
          available: element.clientWidth,
          separatorWidth: 8,
          overflowWidth: (remaining) => overflow[remaining - 1] ?? Infinity,
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items]);
  if (items.length === 0) return null;
  return (
    <span
      ref={root}
      className="compact-row-metadata"
      title={items.map((item) => item.label).join(" · ")}
    >
      <span className="sr-only">
        {items.map((item) => item.label).join(" · ")}
      </span>
      <span className="tag-measure" aria-hidden="true">
        {items.map((item) => (
          <span key={item.id} data-item-measure>
            {item.label}
          </span>
        ))}
        {items.map((item, index) => (
          <span key={item.id} data-overflow-measure>
            +{index + 1}
          </span>
        ))}
      </span>
      {items.slice(0, visible).map((item) => (
        <span
          key={item.id}
          data-whole-metadata
          aria-hidden="true"
          className={item.overdue ? "overdue" : undefined}
        >
          {item.label}
        </span>
      ))}
      {visible < items.length && (
        <span
          className="metadata-overflow"
          aria-hidden="true"
          title={items
            .slice(visible)
            .map((item) => item.label)
            .join(" · ")}
        >
          +{items.length - visible}
        </span>
      )}
    </span>
  );
}
