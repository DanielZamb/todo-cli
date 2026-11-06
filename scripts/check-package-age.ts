// Refuses dependencies younger than the minimum age, before anything installs them.
// Usage: bun scripts/check-package-age.ts [minimum-days]
// Lists the npm packages `pnpm install --frozen-lockfile` would add or change,
// then checks every locked npm package and every pinned Swift package.
// Fails closed: an unknown publish time, a non-registry source or a network
// error is a failure, not a pass.
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const minimumDays = Number(process.argv[2] ?? 7);
if (!Number.isFinite(minimumDays) || minimumDays < 7) {
  console.error("Minimum package age must be a number of days, at least 7.");
  process.exit(2);
}
const now = Date.now();
const cutoff = now - minimumDays * 86_400_000;
const day = (iso: string) => iso.slice(0, 10);
const age = (iso: string) => Math.floor((now - Date.parse(iso)) / 86_400_000);

type Locked = { name: string; version: string };
type Result = { label: string; published?: string; problem?: string };

const lockedPackages = (file: string): Locked[] => {
  if (!existsSync(file)) return [];
  const section = readFileSync(file, "utf8").split(/^packages:\s*$/m)[1]?.split(/^\S/m)[0] ?? "";
  return [...section.matchAll(/^ {2}(\S.*?):\s*$/gm)].map(([, raw]) => {
    const key = raw.replace(/^'|'$/g, "");
    const at = key.lastIndexOf("@");
    return { name: key.slice(0, at), version: key.slice(at + 1) };
  });
};

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const checkNpm = async ({ name, version }: Locked): Promise<Result> => {
  const label = `${name} ${version}`;
  if (!semver.test(version)) return { label, problem: "not a registry version, cannot verify its age" };
  try {
    const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return { label, problem: `registry answered ${response.status}` };
    const published: string | undefined = (await response.json()).time?.[version];
    if (!published) return { label, problem: "registry has no publish time" };
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

// SwiftPM pins a git revision; its committer date is the closest available publish time.
const checkSwift = async (pin: Pin, token?: string): Promise<Result> => {
  const label = `${pin.identity} ${pin.version ?? pin.revision.slice(0, 12)} (Swift)`;
  const repo = pin.location.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1];
  if (!repo) return { label, problem: `not a GitHub repository, cannot verify its age: ${pin.location}` };
  if (!/^[0-9a-f]{40}$/.test(pin.revision)) return { label, problem: "pin has no full revision" };
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/${pin.revision}`, {
      headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) return { label, problem: `GitHub answered ${response.status}` };
    const published: string | undefined = (await response.json()).commit?.committer?.date;
    if (!published) return { label, problem: "GitHub has no commit date" };
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

const locked = lockedPackages("pnpm-lock.yaml");
if (locked.length === 0) {
  console.error("pnpm-lock.yaml lists no packages. Refusing to continue.");
  process.exit(1);
}
const installed = new Set(lockedPackages("node_modules/.pnpm/lock.yaml").map(({ name, version }) => `${name}@${version}`));
const npmResults = await inBatches(locked, checkNpm);
const token = githubToken();
const swiftResults = await inBatches(swiftPins(), (pin) => checkSwift(pin, token));

const describe = ({ label, published, problem }: Result) =>
  `  ${label}${published ? `  published ${day(published)} (${age(published)} days ago)` : ""}${problem ? `  ${problem.toUpperCase()}` : ""}`;

const incoming = npmResults.filter((_, index) => !installed.has(`${locked[index].name}@${locked[index].version}`));
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
