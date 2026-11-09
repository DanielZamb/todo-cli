import type { Edge } from "./dependencies.ts";
import type { Task } from "./entities.ts";
import type { TaskId } from "./ids.ts";

const label = (title: string) =>
  Array.from(title.replace(/[\r\n\u2028\u2029]+/gu, " "), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || /["&#<>[\]{}|`\\]/u.test(character)
      ? `#${code};`
      : character;
  }).join("");
export const mermaidNodeIds = (tasks: readonly Pick<Task, "id">[]) =>
  new Map<TaskId, string>(
    [...tasks]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((task, index) => [task.id, `n${index}`]),
  );
export function graphMermaid(graph: {
  readonly tasks: readonly Pick<Task, "id" | "title">[];
  readonly edges: readonly Edge[];
}): string {
  const tasks = [...graph.tasks].sort((a, b) => a.id.localeCompare(b.id));
  const names = mermaidNodeIds(tasks);
  const lines = [
    "flowchart TD",
    ...tasks.map((task) => `  ${names.get(task.id)}["${label(task.title)}"]`),
  ];
  const edges = [...graph.edges].sort(
    (a, b) =>
      a.blocker_id.localeCompare(b.blocker_id) ||
      a.dependent_id.localeCompare(b.dependent_id),
  );
  for (const edge of edges) {
    const blocker = names.get(edge.blocker_id);
    const dependent = names.get(edge.dependent_id);
    if (blocker && dependent) lines.push(`  ${blocker} --> ${dependent}`);
  }
  return `${lines.join("\n")}\n`;
}
