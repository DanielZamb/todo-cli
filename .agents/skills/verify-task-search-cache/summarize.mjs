import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [path] = process.argv.slice(2);
const quantile = (xs, q) =>
  [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * q) - 1];
const output = [];
for (const side of ["before", "after"]) {
  const runs = Array.from({ length: 5 }, (_, i) =>
    JSON.parse(readFileSync(join(path, `${side}-${i + 1}/result.json`))),
  );
  for (const scenario of ["short", "long", "dense", "mixed", "churn"]) {
    const warm = runs.map((r) =>
      r.samples
        .filter((s) => s.scenario === scenario && s.phase === "warm")
        .map((s) => s.ms),
    );
    const medians = warm.map((x) => quantile(x, 0.5));
    output.push({
      side,
      scenario,
      medianMs: quantile(medians, 0.5),
      p95Ms: quantile(warm.flat(), 0.95),
      rangeMs: [Math.min(...medians), Math.max(...medians)],
      coldMs: runs.map(
        (r) =>
          r.samples.find((s) => s.scenario === scenario && s.phase === "cold")
            .ms,
      ),
      measuredOperations: warm.flat().length,
      errors: runs.reduce((a, r) => a + r.errors, 0),
      load: runs.map((r) => r.load),
    });
  }
}
writeFileSync(join(path, "summary.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
