import { createHash } from "node:crypto";
import type { Edge } from "./dependencies.ts";

export function dependencyFingerprint(edges: readonly Edge[]) {
  const sorted = edges
    .map(({ profile_id, dependent_id, blocker_id }) => ({
      profile_id,
      dependent_id,
      blocker_id,
    }))
    .sort(
      (a, b) =>
        a.profile_id.localeCompare(b.profile_id) ||
        a.dependent_id.localeCompare(b.dependent_id) ||
        a.blocker_id.localeCompare(b.blocker_id),
    );
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}
