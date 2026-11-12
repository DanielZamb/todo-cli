export interface DiagnosticCandidate<A> {
  readonly value: A;
  readonly important: boolean;
  readonly order: number;
}

export function rankDiagnosticItems<A>(
  items: readonly A[],
  important: (value: A) => boolean,
  order: (value: A, index: number) => number,
): DiagnosticCandidate<A>[] {
  return items
    .map((value, index) => ({
      value,
      important: important(value),
      order: order(value, index),
    }))
    .sort(
      (a, b) => Number(b.important) - Number(a.important) || b.order - a.order,
    );
}

export const importantDiagnosticDuration = (duration: number, failed = false) =>
  duration >= 20 || failed;
