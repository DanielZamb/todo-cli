import { expect, it } from "@effect/vitest";
import { matchTaskSearch, parseTaskSearch } from "../src/task-search.ts";
import { searchCases } from "./task-search-cases.ts";
import {
  matchTaskSearch as reference,
  parseTaskSearch as referenceParse,
} from "./task-search-reference.ts";

it("equals the original unrestricted matcher on literal Unicode and syntax cases", () => {
  for (const entry of searchCases) {
    const task = {
      title: entry.title,
      description: "description" in entry ? entry.description : null,
    };
    expect(matchTaskSearch(task, parseTaskSearch(entry.text))).toEqual(
      reference(task, referenceParse(entry.text)),
    );
  }
});
it("equals the original matrix on seeded words, repeated occurrences and clauses", () => {
  let seed = 0x51ec1001;
  const next = (n: number) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % n;
  };
  const atoms = [
    "a",
    "b",
    "c",
    "z",
    "𐐀",
    "é",
    "ß",
    "ﬃ",
    "ﷺ",
    "㌀",
    "㌖",
    "Σ",
    "\u0301",
  ];
  const word = (max: number) =>
    Array.from({ length: 1 + next(max) }, () => atoms[next(atoms.length)]).join(
      "",
    );
  for (let index = 0; index < 3000; index++) {
    const term = word(16);
    const other = word(16);
    const task = {
      title: other,
      description: `${other} ${term} ${other} ${term}`,
    };
    const query =
      [
        term,
        `${term} ${term}`,
        `-${term}`,
        `"${term} ${other}"`,
        `${term} -${other}`,
        `"${term} ${other}`,
      ][next(6)] ?? term;
    expect(
      matchTaskSearch(task, parseTaskSearch(query)),
      JSON.stringify({ index, task, query }),
    ).toEqual(reference(task, referenceParse(query)));
  }
  const alphabet = ["a", "b", "c"];
  for (let index = 0; index < 12000; index++) {
    const query = Array.from(
      { length: 5 + next(9) },
      () => alphabet[next(3)],
    ).join("");
    const title = Array.from(
      { length: 1 + next(18) },
      () => alphabet[next(3)],
    ).join("");
    const task = { title, description: null };
    expect(
      matchTaskSearch(task, parseTaskSearch(query)),
      JSON.stringify({ index, query, title }),
    ).toEqual(reference(task, referenceParse(query)));
  }
}, 30_000);
