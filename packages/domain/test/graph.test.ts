import { it } from "@effect/vitest";
import { proveGraphAlgorithms } from "../scripts/graph-proof.ts";

it(
  "computes literal DAG queries, orders, distinct pruned energy and safe Mermaid",
  proveGraphAlgorithms,
);
