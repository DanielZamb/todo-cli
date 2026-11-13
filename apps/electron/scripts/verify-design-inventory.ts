export const designRecipes = [
  { id: "attachment-batch", script: "verify-attachment-batch-offscreen.ts" },
  { id: "batch-edit", script: "verify-batch-edit-offscreen.ts" },
  { id: "discovery", script: "verify-discovery-offscreen.ts" },
  {
    id: "discovery-report-errors",
    script: "verify-discovery-offscreen.ts",
    mode: "TODO_VERIFY_REPORT_ERRORS",
  },
  {
    id: "dependencies",
    script: "verify-dependencies-offscreen.ts",
    relativeEvidence: true,
  },
  { id: "graph-browser", script: "verify-graph-browser.ts" },
  { id: "host-writes", host: true },
  { id: "host-task-search", host: true, mode: "TODO_VERIFY_TASK_SEARCH" },
  { id: "host-stream-wake", host: true, mode: "TODO_VERIFY_STREAM_WAKE" },
  { id: "host-priority", host: true, mode: "TODO_VERIFY_PRIORITY_GROUPS" },
  {
    id: "host-version-guardrails",
    host: true,
    mode: "TODO_VERIFY_VERSION_GUARDRAILS",
  },
  { id: "host-snapshots", host: true, mode: "TODO_VERIFY_SNAPSHOTS" },
  {
    id: "host-metadata",
    host: true,
    mode: "TODO_ELECTRON_VERIFY_METADATA_ONLY",
  },
  { id: "host-unauthorized", script: "verify-host-unauthorized.ts" },
  {
    id: "diagnostics",
    script: "verify-diagnostics-standalone.ts",
    relativeEvidence: true,
  },
] as const;
export const verifyShellModes = [
  "TODO_ELECTRON_VERIFY_HOST",
  "TODO_VERIFY_NATIVE_UI",
  "TODO_VERIFY_SNAPSHOTS",
  "TODO_VERIFY_TASK_SEARCH",
  "TODO_VERIFY_STREAM_WAKE",
  "TODO_VERIFY_PRIORITY_GROUPS",
  "TODO_VERIFY_VERSION_GUARDRAILS",
  "TODO_ELECTRON_VERIFY_METADATA_ONLY",
] as const;
const verifyShellInputs = [
  "TODO_SERVER_BINARY",
  "TODO_SEED_BINARY",
  "TODO_CLI_BINARY",
];
export const heldDesignRecipes = [
  {
    id: "signed-native",
    script: "verify.ts",
    reason:
      "Native HOLD: signing, safeStorage, native Session restoration, notifications and Keychain are not authorized.",
  },
] as const;
export function uncheckedDesignRecipes(
  files: readonly string[],
  helper: string,
) {
  const listed = new Set<string>(
    designRecipes.flatMap((recipe) =>
      "script" in recipe ? [recipe.script] : [],
    ),
  );
  const modes = [
    ...new Set(
      [...helper.matchAll(/\$\{(TODO_[A-Z_]+):-/gu)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      ),
    ),
  ];
  return {
    offscreen: files.filter(
      (name) => /^verify-.*-offscreen\.ts$/u.test(name) && !listed.has(name),
    ),
    modes: modes.filter(
      (mode) =>
        !verifyShellInputs.includes(mode) &&
        !verifyShellModes.some((known) => known === mode),
    ),
    uncoveredModes: verifyShellModes.filter(
      (mode) =>
        mode !== "TODO_VERIFY_NATIVE_UI" &&
        mode !== "TODO_ELECTRON_VERIFY_HOST" &&
        !designRecipes.some(
          (recipe) => "mode" in recipe && recipe.mode === mode,
        ),
    ),
  };
}
