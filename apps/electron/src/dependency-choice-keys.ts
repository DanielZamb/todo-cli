import type { KeyboardEvent } from "react";

export function moveDependencyChoice(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const choices = [
    ...(event.currentTarget
      .closest('[role="dialog"]')
      ?.querySelectorAll<HTMLElement>('[role="checkbox"]') ?? []),
  ].filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-disabled") !== "true",
  );
  const index = choices.indexOf(event.currentTarget);
  const next =
    index < 0
      ? choices[event.key === "ArrowDown" ? 0 : choices.length - 1]
      : choices[index + (event.key === "ArrowDown" ? 1 : -1)];
  if (next) {
    event.preventDefault();
    next.focus();
  }
}
