// Refuses dependencies younger than the minimum age, before anything installs them.
// Usage: bun scripts/check-package-age.ts [minimum-days]
// Lists the npm packages `pnpm install --frozen-lockfile` would add or change,
// then checks every locked npm package and every pinned Swift package.
// Fails closed: an unknown or invalid publish time, a source other than the
// npm registry or a GitHub Release, a lockfile hash that differs from the
// registry's, or a network error is a failure, not a pass.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { installScriptProblems } from "./check-install-scripts.ts";

const minimumDays = Number(process.argv[2] ?? 7);
if (!Number.isFinite(minimumDays) || minimumDays < 7) {
  console.error("Minimum package age must be a number of days, at least 7.");
  process.exit(2);
}
const now = Date.now();
const cutoff = now - minimumDays * 86_400_000;
const day = (iso: string) => iso.slice(0, 10);
const age = (iso: string) => Math.floor((now - Date.parse(iso)) / 86_400_000);
// A publish time must be a real timestamp in the past; anything else fails.
const timestamp = (value: unknown) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) <= now
    ? value
    : undefined;

type Locked = { key: string; name: string; version: string; resolution: Record<string, unknown> };
type Result = { label: string; published?: string; problem?: string };

const lockedPackages = (file: string): Locked[] => {
  if (!existsSync(file)) return [];
  const lock = Bun.YAML.parse(readFileSync(file, "utf8")) as {
    packages?: Record<string, { resolution?: Record<string, unknown> }>;
  };
  return Object.entries(lock.packages ?? {}).map(([key, entry]) => {
    const at = key.lastIndexOf("@");
    return { key, name: key.slice(0, at), version: key.slice(at + 1), resolution: entry?.resolution ?? {} };
  });
};

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const checkNpm = async ({ name, version, resolution }: Locked): Promise<Result> => {
  const label = `${name} ${version}`;
  if (!semver.test(version)) return { label, problem: "not a registry version, cannot verify its age" };
  // Only a bare registry integrity is allowed: a tarball, git, directory or
  // other resolution would make pnpm fetch something this check never saw.
  const keys = Object.keys(resolution);
  if (keys.length !== 1 || keys[0] !== "integrity" || typeof resolution.integrity !== "string")
    return { label, problem: `resolved outside the npm registry (${keys.join(", ") || "no resolution"})` };
  try {
    const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return { label, problem: `registry answered ${response.status}` };
    const document = await response.json();
    if (document.versions?.[version]?.dist?.integrity !== resolution.integrity)
      return { label, problem: "lockfile integrity does not match the npm registry's artifact" };
    const published = timestamp(document.time?.[version]);
    if (!published) return { label, problem: "registry has no valid publish time" };
    return { label, published, problem: Date.parse(published) > cutoff ? "too new" : undefined };
  } catch (error) {
    return { label, problem: `registry request failed: ${(error as Error).message}` };
  }
};

const githubToken = () => {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
};

type Pin = { identity: string; location: string; version?: string; revision: string };

const swiftPins = (): Pin[] => {
  const files = execFileSync("git", ["ls-files", "*Package.resolved"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file && !file.includes("/.build/"));
  const pins = new Map<string, Pin>();
  for (const file of files) {
    for (const pin of JSON.parse(readFileSync(file, "utf8")).pins ?? []) {
      pins.set(`${pin.location}@${pin.state.revision}`, {
        identity: pin.identity,
        location: pin.location,
        version: pin.state.version,
        revision: pin.state.revision,
      });
    }
  }
  return [...pins.values()];
};

// A commit date is set by whoever made the commit, so it alone proves nothing.
// A Swift pin needs a GitHub Release for its version, whose publish time GitHub
// records, and that version's tag must point at the pinned revision. Both the
// Release and the commit must be at least the minimum age.
const checkSwift = async (pin: Pin, token?: string): Promise<Result> => {
  const label = `${pin.identity} ${pin.version ?? pin.revision.slice(0, 12)} (Swift)`;
  const repo = pin.location.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1];
  if (!repo) return { label, problem: `not a GitHub repository, cannot verify its age: ${pin.location}` };
  if (!/^[0-9a-f]{40}$/.test(pin.revision)) return { label, problem: "pin has no full revision" };
  if (!pin.version || !/^[0-9A-Za-z.+-]+$/.test(pin.version))
    return { label, problem: "pin has no released version, cannot verify its age" };
  const github = async (path: string) => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    return { status: response.status, body: response.ok ? await response.json() : undefined };
  };
  try {
    const release = await github(`releases/tags/${encodeURIComponent(pin.version)}`);
    if (release.status === 404) return { label, problem: "no GitHub Release for this version" };
    if (!release.body) return { label, problem: `GitHub answered ${release.status}` };
    const tagged = await github(`commits/${encodeURIComponent(pin.version)}`);
    if (!tagged.body) return { label, problem: `GitHub answered ${tagged.status} for the version tag` };
    if (tagged.body.sha !== pin.revision) return { label, problem: "version tag does not point at the pinned revision" };
    const released = timestamp(release.body.published_at);
    const committed = timestamp(tagged.body.commit?.committer?.date);
    if (!released || !committed) return { label, problem: "GitHub has no valid Release or commit time" };
    const published = Date.parse(released) > Date.parse(committed) ? released : committed;
    return { label, published, problem: Date.parse(published) > cutoff ? "too new" : undefined };
  } catch (error) {
    return { label, problem: `GitHub request failed: ${(error as Error).message}` };
  }
};

const inBatches = async <T, R>(items: T[], run: (item: T) => Promise<R>) => {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += 12) {
    results.push(...(await Promise.all(items.slice(index, index + 12).map(run))));
  }
  return results;
};

const installProblems = installScriptProblems();
if (installProblems.length) {
  console.error("Refusing to install. Repository code would run during pnpm install:");
  for (const problem of installProblems) console.error(`  ${problem}`);
  process.exit(1);
}
const locked = lockedPackages("pnpm-lock.yaml");
if (locked.length === 0) {
  console.error("pnpm-lock.yaml lists no packages. Refusing to continue.");
  process.exit(1);
}
const installed = new Set(lockedPackages("node_modules/.pnpm/lock.yaml").map(({ key, resolution }) => `${key} ${JSON.stringify(resolution)}`));
const npmResults = await inBatches(locked, checkNpm);
const token = githubToken();
const swiftResults = await inBatches(swiftPins(), (pin) => checkSwift(pin, token));

const describe = ({ label, published, problem }: Result) =>
  `  ${label}${published ? `  published ${day(published)} (${age(published)} days ago)` : ""}${problem ? `  ${problem.toUpperCase()}` : ""}`;

const incoming = npmResults.filter((_, index) => !installed.has(`${locked[index].key} ${JSON.stringify(locked[index].resolution)}`));
console.log(`Package age check: every dependency must be at least ${minimumDays} days old.`);
if (incoming.length === 0) {
  console.log(`pnpm install adds or changes no npm packages. All ${locked.length} locked packages are already installed.`);
} else {
  console.log(`WARNING: pnpm install will add or change ${incoming.length} npm package${incoming.length === 1 ? "" : "s"}:`);
  for (const result of incoming) console.log(describe(result));
}

const problems = [...npmResults, ...swiftResults].filter(({ problem }) => problem);
if (problems.length > 0) {
  console.error(`\nRefusing to install. ${problems.length} dependenc${problems.length === 1 ? "y fails" : "ies fail"} the ${minimumDays}-day rule:`);
  for (const result of problems) console.error(describe(result));
  process.exit(1);
}
console.log(`Checked ${npmResults.length} npm packages and ${swiftResults.length} Swift pins. All are at least ${minimumDays} days old.`);
