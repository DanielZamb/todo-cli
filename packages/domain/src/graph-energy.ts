import { unresolved } from "./dependency-rules.ts";
import { dependencyState, indexGraph, type TaskGraph } from "./graph-model.ts";
import { topologicalOrder } from "./graph-order.ts";
import type { TaskId } from "./ids.ts";

export type RemainingEnergy = {
  readonly energy: number;
  readonly unweighted: number;
};
const popcount = (value: number) => {
  let bits = value - ((value >>> 1) & 0x55555555);
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
  return (((bits + (bits >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

export function graphEnergy(graph: TaskGraph) {
  const index = indexGraph(graph);
  const order = topologicalOrder(graph);
  const positions = new Map(order.map((id, position) => [id, position]));
  const words = Math.ceil(order.length / 32);
  const sets = new Map<TaskId, Uint32Array>();
  const masks = Array.from({ length: 6 }, () => new Uint32Array(words));
  for (const [id, position] of positions) {
    const task = index.tasks.get(id);
    const mask = masks[task?.energy ?? 0];
    if (mask)
      mask[position >>> 5] =
        (mask[position >>> 5] ?? 0) | (1 << (position & 31));
  }
  const values = new Map<TaskId, RemainingEnergy>();
  for (const [id, position] of positions) {
    const task = index.tasks.get(id);
    const set = new Uint32Array(words);
    if (task && unresolved(task)) {
      set[position >>> 5] = 1 << (position & 31);
      for (const blocker of index.upstream.get(id) ?? []) {
        const upstream = sets.get(blocker);
        if (upstream)
          for (let word = 0; word < words; word++)
            set[word] = (set[word] ?? 0) | (upstream[word] ?? 0);
      }
    }
    sets.set(id, set);
    let energy = 0;
    let unweighted = 0;
    for (const [weight, mask] of masks.entries())
      for (let word = 0; word < words; word++) {
        const count = popcount((set[word] ?? 0) & (mask[word] ?? 0));
        if (weight === 0) unweighted += count;
        else energy += weight * count;
      }
    values.set(id, { energy, unweighted });
  }
  const contains = (root: TaskId, id: TaskId) => {
    const position = positions.get(id);
    return (
      position !== undefined &&
      (((sets.get(root)?.[position >>> 5] ?? 0) >>> (position & 31)) & 1) === 1
    );
  };
  const ready = order
    .filter((id) => {
      const task = index.tasks.get(id);
      return task && dependencyState(task, index).ready;
    })
    .sort(
      (a, b) =>
        (index.tasks.get(a)?.energy ?? Number.POSITIVE_INFINITY) -
          (index.tasks.get(b)?.energy ?? Number.POSITIVE_INFINITY) ||
        (positions.get(a) ?? 0) - (positions.get(b) ?? 0),
    );
  const lightestNext = (id: TaskId) =>
    ready.filter((candidate) => contains(id, candidate));
  return { values, contains, lightestNext };
}
