import { expect, it } from "@effect/vitest";
import { fieldWords } from "../src/task-search.ts";
import { fieldWords as original } from "./task-search-reference.ts";

it("keeps original words and UTF-16 origins across preparation checkpoints", () => {
  let seed = 0xf01d512;
  const next = (n: number) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % n;
  };
  const atoms = [
    "ﷺ",
    "ﷻ",
    "㌀",
    "㌖",
    "ß",
    "ﬃ",
    "😀",
    "𐐀",
    "Cafe\u0301",
    "👩‍👩‍👧‍👦",
    "İ",
    "Σ",
    "a",
    " ",
    "\n",
    "\ud800",
    "\u0301",
  ];
  const corpus = [
    "ﷺﷺ",
    "a".repeat(511) + "ﷺCafe\u0301",
    "\u0301".repeat(1000),
    "😀 𐐀bc",
    "ﷺ".repeat(1025),
    "a ".repeat(1025),
  ];
  for (let index = 0; index < 512; index++)
    corpus.push(
      Array.from(
        { length: 1 + next(100) },
        () => atoms[next(atoms.length)],
      ).join(""),
    );
  for (const text of corpus) {
    const expected = original(text);
    for (const size of [1, 7, 512]) {
      const steps = fieldWords(text, size);
      let step = steps.next();
      while (!step.done) step = steps.next();
      expect(step.value.words, JSON.stringify({ text, size })).toEqual(
        expected,
      );
      expect(JSON.stringify(step.value.words)).toBe(JSON.stringify(expected));
    }
  }
  const first = fieldWords("ﷺ".repeat(1000), 1).next();
  expect(first).toEqual({ done: false, value: undefined });
});

it("counts folded UTF-16 units including whitespace and punctuation", () => {
  const steps = fieldWords("ﷺ A!\n", 1);
  let step = steps.next();
  while (!step.done) step = steps.next();
  expect(step.value).toEqual({
    preparedUnits: 22,
    words: [
      { text: "صلى", start: 0, end: 1 },
      { text: "الله", start: 0, end: 1 },
      { text: "عليه", start: 0, end: 1 },
      { text: "وسلم", start: 0, end: 1 },
      { text: "a", start: 2, end: 3 },
    ],
  });
});
