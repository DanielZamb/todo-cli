import { expect, it } from "@effect/vitest";
import { wholeTagCount } from "../src/whole-tags.ts";

it("fits whole Tags and reserves space for the remaining count", () => {
  const input = {
    tagWidths: [40, 50, 60],
    separatorWidth: 8,
    overflowWidth: () => 20,
  };
  expect(
    [166, 150, 100, 60].map((available) =>
      wholeTagCount({ ...input, available }),
    ),
  ).toEqual([3, 2, 1, 0]);
  expect(wholeTagCount({ ...input, tagWidths: [], available: 150 })).toBe(0);
  expect(
    wholeTagCount({
      tagWidths: Array.from({ length: 12 }, () => 5),
      separatorWidth: 8,
      available: 60,
      overflowWidth: (remaining) => (remaining > 9 ? 30 : 20),
    }),
  ).toBe(3);
});
