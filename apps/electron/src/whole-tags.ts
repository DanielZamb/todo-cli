export function wholeTagCount(input: {
  readonly tagWidths: readonly number[];
  readonly available: number;
  readonly separatorWidth: number;
  readonly overflowWidth: (remaining: number) => number;
}): number {
  let used = 0;
  let visible = 0;
  let best = 0;
  for (const width of input.tagWidths) {
    used += width + (visible > 0 ? input.separatorWidth : 0);
    visible++;
    const remaining = input.tagWidths.length - visible;
    const required =
      used +
      (remaining > 0
        ? input.separatorWidth + input.overflowWidth(remaining)
        : 0);
    if (required <= input.available) best = visible;
  }
  return best;
}
