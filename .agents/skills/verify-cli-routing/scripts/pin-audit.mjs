// Pin audit: compare every product path pinned anywhere under
// .agents/skills/verify-* with the bytes at a commit (default HEAD).
// Usage, from the checkout root:
//   node .agents/skills/verify-cli-routing/scripts/pin-audit.mjs [commit|--worktree] [out.json]
// With a commit (default HEAD), pin files and product bytes both come from that
// commit; --worktree reads both from the working tree. It enumerates files; it
// never uses a list of known pin files.
// - Every JSON file under every verify-* skill is parsed. Any object with a
//   path-like string (path/file) and a 64-hex sha256/hash is a pin row.
//   Historical records (keys changes, previous, before) are reported but not
//   compared, because they hold old values on purpose.
// - A pinned path that names a product file (apps/, packages/, scripts/) is
//   hashed at the commit. A relative path that is not found at the root is
//   tried under packages/domain/src/ (the Task search cache's convention);
//   if neither exists the row fails as unresolved.
// - Every other text file is scanned for a product path and a 64-hex value on
//   the same line; those lines are listed as unstructured pins for review, so a
//   pin kept outside JSON is never silent.
// Exit 1 on any drifted or unresolved current row, or an unreadable JSON file.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const [commitArg = "HEAD", out] = process.argv.slice(2);
const worktree = commitArg === "--worktree";
const commit = worktree
  ? "worktree"
  : execFileSync("git", ["rev-parse", commitArg], { encoding: "utf8" }).trim();
const product = /^(apps|packages|scripts)\//;
const hex = /^[a-f0-9]{64}$/;
const historical = new Set(["changes", "previous", "before"]);

const at = (path) => {
  try {
    if (worktree) return readFileSync(path);
    return execFileSync("git", ["show", `${commit}:${path}`], {
      maxBuffer: 256e6,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const walkFiles = (directory) =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });

const skills = join(root, ".agents/skills");
const files = (
  worktree
    ? readdirSync(skills)
        .filter((name) => name.startsWith("verify-"))
        .flatMap((name) => walkFiles(join(skills, name)))
        .map((path) => relative(root, path))
    : execFileSync("git", ["ls-tree", "-r", "--name-only", commit, ".agents/skills"], {
        encoding: "utf8",
        maxBuffer: 64e6,
      })
        .split("\n")
        .filter((path) => /^\.agents\/skills\/verify-[^/]+\//.test(path))
).sort();
const content = (file) => (worktree ? readFileSync(file, "utf8") : at(file)?.toString("utf8"));

const rows = [], unreadable = [], unstructured = [], scanned = [];
for (const file of files) {
  if (file.endsWith(".json")) {
    let value;
    try {
      value = JSON.parse(content(file) ?? "");
    } catch (error) {
      unreadable.push({ file, error: String(error) });
      continue;
    }
    let count = 0;
    const visit = (node, where, old) => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => visit(item, `${where}[${index}]`, old));
        return;
      }
      if (!node || typeof node !== "object") return;
      const path = typeof node.path === "string" ? node.path : node.file;
      const pinned = [node.sha256, node.hash].find((h) => typeof h === "string" && hex.test(h));
      if (typeof path === "string" && pinned) {
        count++;
        const candidates = product.test(path)
          ? [path]
          : [path, `packages/domain/src/${path}`].filter((p) => product.test(p));
        const resolved = candidates.find((p) => at(p) !== undefined);
        const isProduct = candidates.length > 0 && (product.test(path) || resolved !== undefined);
        if (isProduct) {
          const actual = resolved ? sha(at(resolved)) : undefined;
          rows.push({
            file,
            where,
            path: resolved ?? path,
            pinned,
            actual: actual ?? null,
            historical: old,
            status: old
              ? "historical"
              : actual === undefined
                ? "unresolved"
                : actual === pinned
                  ? "match"
                  : "drift",
          });
        }
      }
      for (const [key, child] of Object.entries(node))
        visit(child, `${where}.${key}`, old || historical.has(key));
    };
    visit(value, "", false);
    scanned.push({ file, kind: "json", pinRows: count });
  } else {
    const text = content(file);
    if (text === undefined) continue;
    if (text.includes("\u0000")) continue;
    const lines = text.split("\n");
    let count = 0;
    lines.forEach((line, index) => {
      if (/\b(apps|packages)\/[\w./-]+/.test(line) && /\b[a-f0-9]{64}\b/.test(line)) {
        count++;
        unstructured.push({ file, line: index + 1, text: line.trim().slice(0, 240) });
      }
    });
    scanned.push({ file, kind: "text", unstructuredLines: count });
  }
}

const current = rows.filter((row) => row.status !== "historical");
const failures = current.filter((row) => row.status !== "match");
const byFile = {};
for (const row of current) byFile[row.file] = (byFile[row.file] ?? 0) + 1;
const result = {
  commit,
  filesScanned: files.length,
  jsonFiles: scanned.filter((s) => s.kind === "json").length,
  pinFiles: byFile,
  currentRows: current.length,
  historicalRows: rows.length - current.length,
  failures,
  unreadable,
  unstructured,
};
if (out) writeFileSync(out, `${JSON.stringify({ ...result, rows, scanned }, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      commit,
      filesScanned: result.filesScanned,
      pinFiles: byFile,
      currentRows: result.currentRows,
      historicalRows: result.historicalRows,
      failures: failures.map((f) => `${f.status} ${f.file} ${f.path}`),
      unreadable: unreadable.length,
      unstructuredLines: unstructured.length,
    },
    null,
    2,
  ),
);
process.exit(failures.length || unreadable.length ? 1 : 0);
