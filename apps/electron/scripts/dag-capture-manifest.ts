import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repositoryInput } from "../../../scripts/verification-inputs.ts";
export function writeDagCaptureManifest(
  root: string,
  evidence: string,
  entries: readonly { png: string; receipt: string }[],
) {
  for (const entry of entries) {
    repositoryInput(
      root,
      relative(root, join(evidence, entry.png)),
      "DAG capture PNG",
    );
    repositoryInput(
      root,
      relative(root, join(evidence, entry.receipt)),
      "DAG behavior receipt",
    );
  }
  writeFileSync(
    join(evidence, "manifest.json"),
    `${JSON.stringify(entries, null, 2)}\n`,
  );
}
