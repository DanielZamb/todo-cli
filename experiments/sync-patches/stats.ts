export function stats(values: readonly number[]) {
  const a = [...values].sort((a, b) => a - b),
    p = (n: number) => a[Math.max(0, Math.ceil(n * a.length) - 1)] ?? 0;
  return {
    n: a.length,
    median: p(0.5),
    p90: p(0.9),
    p99: p(0.99),
    min: a[0] ?? 0,
    max: a.at(-1) ?? 0,
  };
}
