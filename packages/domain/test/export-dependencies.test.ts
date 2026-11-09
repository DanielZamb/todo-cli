import { it } from "@effect/vitest";
import { proveExportDependencies } from "../scripts/export-dependency-proof.ts";

it(
  "exports nonempty Dependencies and stable escaped blocks inside one Obsidian note",
  proveExportDependencies,
);
