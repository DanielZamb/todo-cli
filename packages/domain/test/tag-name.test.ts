import { describe, expect, it } from "vitest";
import {
  tagKey,
  tagNameMatches,
  tagNameParts,
  tagNames,
} from "../src/tag-name.ts";
import {
  filterTagMatches,
  importTagNames,
  legacyFilterQuery,
  limitPartLength,
  metadataTagNames,
  submittedNameParts,
} from "./fixtures/extracted/pre-catalog-rules.ts";

// Pieces chosen to hit every edge the copies could disagree on: commas,
// every ECMAScript whitespace and line terminator, characters JS trim keeps
// (U+0085, U+180E, U+200B), case mappings that change length or need context.
const pieces = [
  "",
  " ",
  "a",
  "A",
  "Work",
  "WORK",
  "work ",
  " home",
  "x,y",
  ",",
  ",,",
  "\t",
  "\n",
  "\r",
  "\v",
  "\f",
  " ",
  "\u0085",
  " ",
  "᠎",
  " ",
  "​",
  " ",
  " ",
  " ",
  "　",
  "﻿",
  "İ",
  "ẞ",
  "Σ",
  "ΑΣ",
  "ǅ",
  "ﬀ",
  "é",
  "é",
  "😀",
  "Ñ",
];
const strings = (() => {
  const out: string[] = [];
  for (const a of pieces)
    for (const b of pieces) {
      out.push(a + b);
      for (const c of ["", ",", " ", "A", " "]) out.push(a + b + c);
    }
  return out;
})();
let seed = 20261113;
const next = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed;
};
const arrays = Array.from({ length: 20_000 }, () =>
  Array.from(
    { length: next() % 5 },
    () => strings[next() % strings.length] ?? "",
  ),
);

describe("one Tag-name rule replaces the five copies", () => {
  it("returns what each write-side copy returned, in the same order", () => {
    expect(strings.length).toBe(8_214);
    for (const input of arrays) {
      expect(tagNames(input)).toEqual(metadataTagNames(input));
      expect(tagNameParts(input)).toEqual(importTagNames(input));
    }
    for (const value of strings) {
      expect(value.split(",").map(tagKey)).toEqual(submittedNameParts(value));
      expect(tagKey(value).length).toBe(limitPartLength(value));
      expect(tagKey(value)).toBe(legacyFilterQuery(value));
    }
  });

  it("changes the name filter only for a stored name with edges", () => {
    let changed = 0;
    for (const stored of strings)
      for (const query of ["work", " Work", "home", "a", "é", "x"]) {
        const before = filterTagMatches(stored, query);
        const after = tagNameMatches(stored, query);
        if (before === after) continue;
        changed++;
        expect(stored.trim()).not.toBe(stored);
        expect([before, after]).toEqual([false, true]);
      }
    expect(changed).toBeGreaterThan(0);
    expect(filterTagMatches(" Work", "work")).toBe(false);
    expect(tagNameMatches(" Work", "work")).toBe(true);
  });

  it("states the rule on literal inputs", () => {
    expect(tagNames([" Work , home,WORK", ",", "Ünïcode"])).toEqual([
      "home",
      "work",
      "ünïcode",
    ]);
    expect(tagKey(" Work ")).toBe("work");
    expect(tagKey("\u0085Work")).toBe("\u0085work");
    expect(tagNameParts(["B,a", "a"])).toEqual(["b", "a", "a"]);
  });
});
