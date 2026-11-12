import type { Replica, Patch } from "./model.ts";
export const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function listEdits(before: readonly string[], after: readonly string[]) {
  const position = new Map(before.map((id, i) => [id, i])),
    tails: number[] = [],
    nodes: number[] = [],
    parent = new Map<number, number>();
  for (let i = 0; i < after.length; i++) {
    const id = after[i];
    if (id === undefined) continue;
    const p = position.get(id);
    if (p === undefined) continue;
    let lo = 0,
      hi = tails.length;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if ((tails[m] ?? Infinity) < p) lo = m + 1;
      else hi = m;
    }
    parent.set(i, nodes[lo - 1] ?? -1);
    tails[lo] = p;
    nodes[lo] = i;
  }
  const keep = new Set<string>();
  for (let i = nodes.at(-1) ?? -1; i >= 0; i = parent.get(i) ?? -1) {
    const id = after[i];
    if (id !== undefined) keep.add(id);
  }
  return {
    remove: before.flatMap((id, i) => (keep.has(id) ? [] : [i])).reverse(),
    insert: after.flatMap((id, index) => (keep.has(id) ? [] : [{ index, id }])),
  };
}
export function difference(
  before: Replica,
  after: Replica,
  mode: Patch["mode"],
): Patch {
  if (before.generation !== after.generation)
    throw Error("generation requires Baseline");
  const patch: Patch = {
    from: before.cursor,
    to: after.cursor,
    generation: after.generation,
    mode,
    rows: Object.fromEntries(
      Object.entries(after.rows).filter(
        ([id, row]) => !same(before.rows[id], row),
      ),
    ),
    remove: Object.keys(before.rows).filter((id) => !after.rows[id]),
    computed: Object.fromEntries(
      Object.entries(after.computed).filter(
        ([id, row]) => !same(before.computed[id], row),
      ),
    ),
    remove_computed: Object.keys(before.computed).filter(
      (id) => !after.computed[id],
    ),
    lists: {},
    edits: {},
  };
  const lists: Record<string, readonly string[]> = {},
    edits: Record<string, ReturnType<typeof listEdits>> = {};
  for (const [key, ids] of Object.entries(after.lists))
    if (!same(before.lists[key], ids)) {
      if (mode === "whole") lists[key] = ids;
      else edits[key] = listEdits(before.lists[key] ?? [], ids);
    }
  return {
    ...patch,
    lists,
    edits,
    ...(!same(before.profiles, after.profiles)
      ? { profiles: after.profiles }
      : {}),
    ...(!same(before.projects, after.projects)
      ? { projects: after.projects }
      : {}),
    ...(!same(before.tags, after.tags) ? { tags: after.tags } : {}),
    ...(!same(before.series, after.series) ? { series: after.series } : {}),
  };
}
export function applyPatch(before: Replica, patch: Patch): Replica {
  if (before.cursor !== patch.from || before.generation !== patch.generation)
    throw Error("gap requires Baseline");
  const rows = { ...before.rows, ...patch.rows },
    computed = { ...before.computed, ...patch.computed },
    lists = { ...before.lists, ...patch.lists };
  for (const id of patch.remove) delete rows[id];
  for (const id of patch.remove_computed) delete computed[id];
  for (const [key, edit] of Object.entries(patch.edits)) {
    const list = [...(before.lists[key] ?? [])];
    for (const index of edit.remove) {
      if (index < 0 || index >= list.length) throw Error("bad remove");
      list.splice(index, 1);
    }
    for (const item of edit.insert) {
      if (item.index < 0 || item.index > list.length) throw Error("bad insert");
      list.splice(item.index, 0, item.id);
    }
    lists[key] = list;
  }
  return {
    ...before,
    cursor: patch.to,
    rows,
    computed,
    lists,
    ...(patch.profiles ? { profiles: patch.profiles } : {}),
    ...(patch.projects ? { projects: patch.projects } : {}),
    ...(patch.tags ? { tags: patch.tags } : {}),
    ...(patch.series ? { series: patch.series } : {}),
  };
}
