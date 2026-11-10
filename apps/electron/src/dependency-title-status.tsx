import { useLayoutEffect, useRef } from "react";

function baseline(element: HTMLElement) {
  const marker = document.createElement("span");
  Object.assign(marker.style, {
    display: "inline-block",
    width: "0",
    height: "0",
    padding: "0",
    margin: "0",
    fontSize: "0",
    lineHeight: "0",
    verticalAlign: "baseline",
  });
  element.append(marker);
  const value = marker.getBoundingClientRect().top;
  marker.remove();
  return value;
}
export function DependencyTitleStatus({
  text,
  accessibilityValue,
  compact,
}: {
  text: string;
  accessibilityValue: string;
  compact: boolean;
}) {
  const root = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    const row = element?.closest(".task-row");
    const heading = row?.querySelector(".task-title");
    if (
      !(element instanceof HTMLElement) ||
      !(row instanceof HTMLElement) ||
      !(heading instanceof HTMLElement)
    )
      return;
    let pending = 0;
    const schedule = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        measure();
      });
    };
    const mutation = new MutationObserver(schedule);
    function measure() {
      if (
        !element?.isConnected ||
        !(row instanceof HTMLElement) ||
        !(heading instanceof HTMLElement)
      )
        return;
      mutation.disconnect();
      const rowBox = row.getBoundingClientRect();
      const titleBox = heading.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(heading);
      const titleText = range.getBoundingClientRect();
      const trailing = [
        ...row.querySelectorAll(
          "button[aria-haspopup], .priority, .task-dates, .task-jira-marker, .task-external-id",
        ),
      ]
        .map((control) => control.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.left > titleBox.left);
      const end = Math.min(
        rowBox.right - row.clientLeft - 8,
        ...trailing.map((box) => box.left - 8),
      );
      const textRight = Math.min(titleText.right, titleBox.right);
      const inlineStart = textRight + 12;
      const inline = !compact && end + 8 - textRight >= 160;
      const available =
        rowBox.bottom -
        parseFloat(getComputedStyle(row).borderBottomWidth) -
        titleText.bottom;
      const fontSize = parseFloat(getComputedStyle(element).fontSize);
      const height = compact || inline ? 18 : Math.max(fontSize, available);
      const start = inline ? inlineStart : titleBox.left;
      Object.assign(element.style, {
        left: `${start - rowBox.left - row.clientLeft}px`,
        top: "0px",
        width: `${Math.max(0, end - start)}px`,
        height: `${height}px`,
        lineHeight: `${height}px`,
      });
      const y = inline
        ? baseline(heading) - baseline(element)
        : compact
          ? rowBox.height -
            row.clientTop -
            parseFloat(getComputedStyle(row).borderBottomWidth) -
            height
          : titleText.bottom - rowBox.top - row.clientTop;
      element.style.top = `${y}px`;
      element.dataset.placement = inline ? "inline-title" : "under-title";
      element.dataset.availableHeight = String(available);
      element.dataset.ready = "true";
      mutation.observe(heading, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(row);
    resize.observe(heading);
    for (const control of row.querySelectorAll(
      "button[aria-haspopup], .task-dates, .task-jira-marker, .task-external-id",
    ))
      resize.observe(control);
    document.fonts.addEventListener("loadingdone", schedule);
    measure();
    return () => {
      cancelAnimationFrame(pending);
      resize.disconnect();
      mutation.disconnect();
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [compact]);
  return (
    <span
      ref={root}
      className="dependency-title-status"
      role="status"
      aria-label={accessibilityValue}
      data-testid="dependency-drop-status"
    >
      {text}
    </span>
  );
}
