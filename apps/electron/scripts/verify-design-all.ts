import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { Schema } from "effect";
import {
  repositoryInput,
  repositoryPath,
  verificationRoot,
} from "../../../scripts/verification-inputs.ts";
import {
  designRecipes,
  heldDesignRecipes,
  uncheckedDesignRecipes,
} from "./verify-design-inventory.ts";

const root = verificationRoot(import.meta.dirname);
const evidence = repositoryPath(
  root,
  process.argv[2] ?? "",
  "Full Electron evidence",
);
assert.ok(!existsSync(evidence), "Choose a fresh evidence directory");
mkdirSync(evidence, { recursive: true });
type Receipt = {
  id: string;
  argv: readonly string[];
  exit: number | null;
  status: "PASS" | "FAIL" | "MISSING" | "SKIPPED";
  evidence: string;
  reason?: string;
};
const receipts: Receipt[] = [];
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
let complete = false;
const summary = () =>
  writeFileSync(
    join(evidence, "summary.json"),
    `${JSON.stringify(
      {
        status: receipts.some(
          (item) => item.status === "FAIL" || item.status === "MISSING",
        )
          ? "FAIL"
          : complete
            ? "PASS_WITH_NAMED_HOLDS"
            : "RUNNING",
        constituents: receipts,
        head,
        inputs: {
          cache: ".scratch/bin/build.json",
          chromium: process.env.TODO_HEADLESS_CHROMIUM ?? null,
        },
        limits: [
          "Unsigned hidden Electron host and Chromium only. Native storage, Session restoration, notifications and VoiceOver are unproven.",
          "Missing new-client scripts on a retained counterpart base are missing coverage, never a pass.",
        ],
      },
      null,
      2,
    )}\n`,
  );
const env: NodeJS.ProcessEnv = {
  ...process.env,
  TODO_ELECTRON_VERIFY_HOST: "1",
  TODO_ELECTRON_VERIFY_BACKGROUND: "1",
};
for (const key of Object.keys(env))
  if (
    /^TODO_(?:VERIFY_|SNAPSHOT_|ELECTRON_VERIFY_)/u.test(key) &&
    key !== "TODO_ELECTRON_VERIFY_HOST" &&
    key !== "TODO_ELECTRON_VERIFY_BACKGROUND"
  )
    delete env[key];
const scripts = repositoryInput(
  root,
  "apps/electron/scripts",
  "Electron recipe directory",
);
const helper = repositoryPath(
  root,
  ".agents/skills/verify-electron/scripts/verify.sh",
  "unsigned host recipe",
);
const unchecked = uncheckedDesignRecipes(
  readdirSync(scripts),
  existsSync(helper) ? readFileSync(helper, "utf8") : "",
);
const guard = join(root, "apps/electron/scripts/guarded-run.sh");
let blocked = "";
if (!existsSync(guard))
  blocked =
    "Missing apps/electron/scripts/guarded-run.sh; the full suite requires compiler guards.";
if (!env.TODO_HEADLESS_CHROMIUM || !existsSync(env.TODO_HEADLESS_CHROMIUM))
  blocked =
    "Set TODO_HEADLESS_CHROMIUM to an existing executable headless Chromium/Chrome path. The suite never downloads a browser.";
if (Object.values(unchecked).some((items) => items.length)) {
  receipts.push({
    id: "inventory",
    argv: [],
    exit: 1,
    status: "FAIL",
    evidence: relative(root, evidence),
    reason: JSON.stringify(unchecked),
  });
  blocked ||=
    "The recipe inventory is incomplete; update the explicit inventory before running the full suite.";
}
let cache: { cli: string; server: string; seed: string } | null = null;
try {
  cache = Schema.decodeUnknownSync(
    Schema.Struct({
      cli: Schema.String,
      server: Schema.String,
      seed: Schema.String,
    }),
  )(
    JSON.parse(
      readFileSync(
        repositoryInput(
          root,
          ".scratch/bin/build.json",
          "compiled scratch cache",
        ),
        "utf8",
      ),
    ),
  );
  for (const key of ["cli", "server", "seed"] as const)
    repositoryInput(root, relative(root, cache[key]), `compiled ${key}`);
  env.TODO_CLI_BINARY = cache.cli;
  env.TODO_SERVER_BINARY = cache.server;
  env.TODO_SEED_BINARY = cache.seed;
} catch {
  blocked ||=
    "Missing or incompatible .scratch/bin/build.json. Run bun apps/electron/scripts/prepare-dag-proof.ts through guarded-run.sh at the final source commit.";
}
const run = async (
  argv: readonly string[],
  output: string,
  environment: NodeJS.ProcessEnv,
) => {
  const log = openSync(output, "w");
  try {
    const child = spawn(argv[0] ?? "", argv.slice(1), {
      cwd: root,
      env: environment,
      stdio: ["ignore", log, log],
    });
    return await new Promise<number>((resolve) => {
      child.once("error", () => resolve(1));
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    closeSync(log);
  }
};
if (!blocked) {
  const disk = await run(
    ["df", "-k", "/System/Volumes/Data"],
    join(evidence, "disk.log"),
    env,
  );
  const available = Number(
    readFileSync(join(evidence, "disk.log"), "utf8")
      .trim()
      .split("\n")
      .at(-1)
      ?.trim()
      .split(/\s+/u)[3],
  );
  if (disk !== 0 || !Number.isFinite(available) || available < 30 * 1024 * 1024)
    blocked =
      "DISK STOP: the full build batch needs at least 30 GB free; see disk.log.";
}
for (const recipe of designRecipes) {
  const directory = join(evidence, recipe.id);
  const path = "host" in recipe ? helper : join(scripts, recipe.script);
  const outputArg =
    "relativeEvidence" in recipe ? relative(root, directory) : directory;
  const argv = [
    "env",
    "TODO_ELECTRON_VERIFY_HOST=1",
    "TODO_ELECTRON_VERIFY_BACKGROUND=1",
    ...("mode" in recipe ? [`${recipe.mode}=1`] : []),
    "sh",
    guard,
    ...("host" in recipe
      ? ["sh", path, outputArg]
      : [
          "/usr/bin/lockf",
          "-k",
          "/tmp/todo-search-electron.lock",
          "bun",
          path,
          outputArg,
        ]),
  ];
  let missing = "";
  try {
    repositoryInput(root, relative(root, path), recipe.id);
  } catch (error) {
    missing = String(error);
  }
  if (missing)
    receipts.push({
      id: recipe.id,
      argv,
      exit: null,
      status: "MISSING",
      evidence: relative(root, directory),
      reason: `${missing}; this base does not prove that recipe.`,
    });
  else if (blocked)
    receipts.push({
      id: recipe.id,
      argv,
      exit: null,
      status: "SKIPPED",
      evidence: relative(root, directory),
      reason: blocked,
    });
  else {
    process.stdout.write(`Running ${recipe.id}\n`);
    const code = await run(argv, join(evidence, `${recipe.id}.log`), {
      ...env,
      ...("mode" in recipe ? { [recipe.mode]: "1" } : {}),
    });
    const result = join(directory, "result.json");
    let missingProof = "";
    if (code === 0) {
      try {
        const receipt = JSON.parse(readFileSync(result, "utf8"));
        if (
          recipe.id === "dependencies" &&
          Schema.is(
            Schema.Struct({
              status: Schema.Literal("DAG_INTERMEDIATE_PARTIAL"),
            }),
          )(receipt)
        )
          missingProof =
            "The DAG driver reported intermediate partial coverage; the final new-client matrix remains missing.";
      } catch {
        missingProof =
          "A zero-exit command did not produce a readable result.json receipt.";
      }
    }
    receipts.push({
      id: recipe.id,
      argv,
      exit: code,
      status: code !== 0 ? "FAIL" : missingProof ? "MISSING" : "PASS",
      evidence: relative(root, directory),
      ...(missingProof
        ? {
            reason: missingProof,
          }
        : {}),
    });
    process.stdout.write(`${recipe.id} exit ${code}\n`);
  }
  summary();
}
for (const held of heldDesignRecipes)
  receipts.push({
    id: held.id,
    argv: ["bun", `apps/electron/scripts/${held.script}`],
    exit: null,
    status: "SKIPPED",
    evidence: "",
    reason: held.reason,
  });
if (
  blocked &&
  !receipts.some((item) => item.status === "FAIL" || item.status === "MISSING")
)
  receipts.push({
    id: "preflight",
    argv: [],
    exit: 1,
    status: "FAIL",
    evidence: relative(root, evidence),
    reason: blocked,
  });
const code = receipts.some(
  (item) => item.status === "FAIL" || item.status === "MISSING",
)
  ? 1
  : 0;
complete = true;
summary();
process.stdout.write(
  `Full Electron offscreen suite exit ${code}; ${relative(root, join(evidence, "summary.json"))}\n`,
);
process.exitCode = code;
