// Refuses repository code that pnpm would run during `pnpm install`.
// Usage: bun scripts/check-install-scripts.ts
// The package-age check vets dependencies, but pnpm also runs the root's and
// every workspace package's install-time scripts, and any .pnpmfile hooks,
// regardless of onlyBuiltDependencies. None are needed, so any is refused.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const installScripts = new Set([
  "preinstall",
  "install",
  "postinstall",
  "preprepare",
  "prepare",
  "postprepare",
  "dependencies",
  "pnpm:devPreinstall",
]);

export const installScriptProblems = (root = process.cwd()) => {
  const problems: string[] = [];
  const workspace = Bun.YAML.parse(
    readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"),
  ) as { packages?: string[]; pnpmfile?: unknown };
  const manifests = ["package.json"];
  for (const pattern of workspace.packages ?? []) {
    const match = pattern.match(/^([\w.-]+)\/\*$/);
    if (!match) {
      problems.push(`pnpm-workspace.yaml: unsupported package pattern ${pattern}`);
      continue;
    }
    const directory = join(root, match[1]);
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory).sort())
      if (existsSync(join(directory, name, "package.json")))
        manifests.push(join(match[1], name, "package.json"));
  }
  for (const manifest of manifests) {
    const scripts = JSON.parse(readFileSync(join(root, manifest), "utf8")).scripts ?? {};
    for (const name of Object.keys(scripts))
      if (installScripts.has(name)) problems.push(`${manifest}: install-time script "${name}"`);
  }
  for (const name of [".pnpmfile.cjs", ".pnpmfile.mjs", ".pnpmfile.js"])
    if (existsSync(join(root, name))) problems.push(`${name}: pnpm runs it during install`);
  if (workspace.pnpmfile !== undefined) problems.push("pnpm-workspace.yaml: pnpmfile is set");
  const npmrc = existsSync(join(root, ".npmrc")) ? readFileSync(join(root, ".npmrc"), "utf8") : "";
  for (const line of npmrc.split("\n"))
    if (/^\s*(global-)?pnpmfile\s*=/.test(line)) problems.push(`.npmrc: ${line.trim()}`);
  return problems;
};

if (import.meta.main) {
  const problems = installScriptProblems();
  if (problems.length) {
    console.error("Refusing to install. Repository code would run during pnpm install:");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log("No install-time scripts or pnpmfile hooks in the workspace.");
}
