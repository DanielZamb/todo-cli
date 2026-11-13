// Pin audit: account for every 64-hex string in every file under .agents/skills.
// Usage, from the checkout root:
//   node .agents/skills/verify-cli-routing/scripts/pin-audit.mjs [commit|--worktree] [out.json]
// With a commit (default HEAD), skill files and the files they pin both come
// from that commit; --worktree reads both from the working tree.
//
// Every occurrence of 64 hex digits (any case, not part of a longer hex run)
// in every text file under every .agents/skills directory gets exactly one class:
//   compared    a pin of a file, hashed at the commit (case-insensitive);
//               "match" or "drift"
//   historical  a value the audit knows not to compare, with the rule that says so
//   unknown     anything else
// Exit 1 on any drift or unknown, printing file and line. Unknown is the
// default: a new shape is never skipped silently.
//
// Rules, in order:
// - JSON: a 64-hex value (or a 64-hex key, the map form) is a pin when its
//   object has a sibling string naming a file, or when its key is a path. The
//   path may be repo-relative, ./ or ../ relative to the pin file, absolute
//   inside the checkout, or relative to packages/domain/src. A path that
//   resolves nowhere is unknown. Paths under docs/evidence/ are local receipts,
//   Git-ignored by design (AGENTS.md), so they are historical, not comparable.
// - JSON: values under a key named changes, previous, before or after are
//   change records (historical). A top-level "contract" is compared with the
//   commit's CONTRACT_ID; a nested "contract" belongs to a review record
//   (historical). A sha256 beside a "url" pins a downloaded tool (historical:
//   the artifact is not in the repository; the skill checks it on download).
// - Text: a line carrying a backticked product path and a hash is a
//   function-body hash; it is covered when the same path has a whole-file pin
//   that matched in this run, otherwise unknown.
// - Text and JSON: 64 hex digits inside a longer file name (such as a
//   content-addressed binary under .scratch/bin) are a name, not a pin.
// - A JSON key modelSha256 pins the one .tla model in the same directory.
// - Anything left must be listed in the ledger beside this script
//   (pin-ledger.json: file, value, reason, optional path), or it is unknown.
//   An entry with a path is compared like any pin; one without is historical
//   for the stated reason. Each entry names one value in one file, so a new
//   value in a ledgered file is still unknown. The ledger's own values are
//   counted as ledger entries.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative } from "node:path";

const root = process.cwd();
const realRoot = realpathSync(root);
const [commitArg = "HEAD", out] = process.argv.slice(2);
const worktree = commitArg === "--worktree";
const commit = worktree
  ? "worktree"
  : execFileSync("git", ["rev-parse", commitArg], { encoding: "utf8" }).trim();
const ledgerPath = ".agents/skills/verify-cli-routing/scripts/pin-ledger.json";
const hexRun = /[0-9a-fA-F]+/g;
const isHex64 = (value) => typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value);
const productPath = /\b((?:apps|packages|scripts)\/[\w@.+/-]+)/;

const read = (path) => {
  try {
    if (worktree) return readFileSync(join(root, path));
    return execFileSync("git", ["show", `${commit}:${path}`], {
      maxBuffer: 256e6,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
};
const exists = (path) =>
  worktree ? existsSync(join(root, path)) && statSync(join(root, path)).isFile() : read(path) !== undefined;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const walkFiles = (directory) =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
const files = (
  worktree
    ? walkFiles(join(root, ".agents/skills")).map((path) => relative(root, path))
    : execFileSync("git", ["ls-tree", "-r", "--name-only", commit, ".agents/skills"], {
        encoding: "utf8",
        maxBuffer: 64e6,
      })
        .split("\n")
        .filter(Boolean)
).sort();

const contractId = read("packages/api/src/contract.ts")
  ?.toString("utf8")
  .match(/"([a-f0-9]{64})"/)?.[1];
// The script and its ledger are the tool, read from the working tree; the
// skill files and the files they pin are the subject, read from the commit.
const ledger = existsSync(join(root, ledgerPath))
  ? JSON.parse(readFileSync(join(root, ledgerPath), "utf8"))
  : { entries: [] };
const ledgerKey = (file, value) => `${file}\u0000${value.toLowerCase()}`;
const ledgered = new Map(ledger.entries.map((entry) => [ledgerKey(entry.file, entry.value), entry]));
// A ledger entry with a path is a pin in a shape no rule reads; compare it.
const fromLedger = (file, value) => {
  const entry = ledgered.get(ledgerKey(file, value));
  if (!entry) return undefined;
  if (!entry.path) return { class: "historical", rule: `ledger: ${entry.reason}` };
  const bytes = read(entry.path);
  if (!bytes) return { class: "unknown", rule: `ledger path ${entry.path} resolves nowhere` };
  const actual = sha(bytes);
  return { class: "compared", status: actual === value.toLowerCase() ? "match" : "drift", rule: `ledger pin: ${entry.reason}`, path: entry.path, actual };
};

// Resolve a path written in a pin file to a repository path, or undefined.
const resolvePath = (raw, pinFile) => {
  if (typeof raw !== "string" || raw.length === 0 || /\s/.test(raw) || /^[a-z]+:\/\//.test(raw)) return undefined;
  const candidates = [];
  if (isAbsolute(raw)) {
    // Compare real paths, so /var and /private/var name the same checkout.
    const real = (() => {
      try {
        return join(realpathSync(dirname(raw)), basename(raw));
      } catch {
        return raw;
      }
    })();
    for (const path of [raw, real])
      for (const base of [root, realRoot]) if (path.startsWith(`${base}/`)) candidates.push(relative(base, path));
  } else {
    candidates.push(normalize(raw), normalize(join(dirname(pinFile), raw)), normalize(join("packages/domain/src", raw)));
  }
  const inside = candidates.filter((path) => !path.startsWith("..") && !isAbsolute(path));
  return inside.find((path) => path.startsWith("docs/evidence/")) ?? inside.find(exists);
};
const looksLikePath = (value) =>
  typeof value === "string" && !isHex64(value) && /^[./\w@+-][\w@.+/-]*$/.test(value) && /[/.]/.test(value) && !/^\d/.test(value);

// Every occurrence of exactly 64 hex digits, with its line and whether it sits
// inside a longer token (a file name, say).
const occurrences = (text) => {
  const found = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(hexRun)) {
      if (match[0].length !== 64) continue;
      const before = line[match.index - 1] ?? "", after = line[match.index + 64] ?? "";
      found.push({ line: index + 1, value: match[0], embedded: /[\w.-]/.test(before) || /[\w.-]/.test(after) });
    }
  });
  return found;
};

const records = [];
const wholeFileMatches = new Set();
const classify = (file, line, value, verdict) => records.push({ file, line, value, ...verdict });

for (const file of files) {
  const bytes = read(file);
  if (!bytes || bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  const found = occurrences(text);
  if (found.length === 0) continue;
  // Structured verdicts for JSON, keyed by value; consumed in file order.
  const verdicts = new Map();
  const push = (value, verdict) => {
    const key = value.toLowerCase();
    verdicts.set(key, [...(verdicts.get(key) ?? []), verdict]);
  };
  if (file.endsWith(".json")) {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const visit = (node, keyPath, depth, history) => {
      if (Array.isArray(node)) return node.forEach((item, index) => visit(item, `${keyPath}[${index}]`, depth + 1, history));
      if (!node || typeof node !== "object") return;
      const siblings = Object.entries(node).filter(([, child]) => looksLikePath(child));
      for (const [key, child] of Object.entries(node)) {
        const here = `${keyPath}.${key}`;
        const old = history || (["changes", "previous", "before", "after"].includes(key) ? key : false);
        if (file === ledgerPath) {
          if (isHex64(child)) push(child, { class: "historical", rule: "ledger entry value", where: here });
          visit(child, here, depth + 1, old);
          continue;
        }
        if (isHex64(key)) {
          push(key, { class: "unknown", rule: "64-hex object key", where: here });
        } else if (isHex64(child)) {
          if (old) {
            push(child, { class: "historical", rule: `change record (under key ${old})`, where: here });
            continue;
          }
          if (key === "contract") {
            if (depth === 0)
              push(child, contractId && child.toLowerCase() === contractId
                ? { class: "compared", status: "match", rule: "top-level contract equals CONTRACT_ID", where: here }
                : { class: "compared", status: "drift", rule: "top-level contract differs from CONTRACT_ID", where: here });
            else push(child, { class: "historical", rule: "contract inside a review record", where: here });
            continue;
          }
          if (key === "modelSha256") {
            const directory = dirname(file);
            const models = files.filter((f) => dirname(f) === directory && f.endsWith(".tla"));
            if (models.length !== 1) push(child, { class: "unknown", rule: `modelSha256 with ${models.length} .tla files beside it`, where: here });
            else {
              const actual = sha(read(models[0]));
              push(child, { class: "compared", status: actual === child.toLowerCase() ? "match" : "drift", rule: "modelSha256 pins the skill's .tla model", where: here, path: models[0], actual });
            }
            continue;
          }
          if (typeof node.url === "string" && /^https?:\/\//.test(node.url)) {
            push(child, { class: "historical", rule: "downloaded tool pinned by url", where: here });
            continue;
          }
          const ordered = [
            ...siblings.filter(([name]) => ["path", "file", "source", "target"].includes(name)),
            ...siblings.filter(([name]) => !["path", "file", "source", "target"].includes(name)),
          ];
          const pin = ordered.map(([, raw]) => ({ raw, path: resolvePath(raw, file) })).find((p) => p.path);
          if (!pin) {
            push(child, { class: "unknown", rule: ordered.length ? `path ${JSON.stringify(ordered[0][1])} resolves nowhere` : "no sibling path", where: here });
          } else if (pin.path.startsWith("docs/evidence/")) {
            push(child, { class: "historical", rule: "local evidence receipt (docs/evidence is Git-ignored)", where: here, path: pin.path });
          } else {
            const actual = sha(read(pin.path));
            const match = actual === child.toLowerCase();
            if (match) wholeFileMatches.add(pin.path);
            push(child, { class: "compared", status: match ? "match" : "drift", rule: "file pin", where: here, path: pin.path, actual });
          }
        } else {
          // Map form: a path as the key and the hash as the value.
          visit(child, here, depth + 1, old);
        }
      }
      for (const [key, child] of Object.entries(node))
        if (isHex64(child) && looksLikePath(key) && !history) {
          const path = resolvePath(key, file);
          const verdicts_ = verdicts.get(child.toLowerCase()) ?? [];
          const last = verdicts_.at(-1);
          if (last && last.where === `${keyPath}.${key}`) {
            verdicts_.pop();
            if (!path) verdicts_.push({ class: "unknown", rule: `map key ${JSON.stringify(key)} resolves nowhere`, where: `${keyPath}.${key}` });
            else {
              const actual = sha(read(path));
              verdicts_.push({ class: "compared", status: actual === child.toLowerCase() ? "match" : "drift", rule: "file pin (map form)", where: `${keyPath}.${key}`, path, actual });
            }
          }
        }
    };
    if (json !== undefined) visit(json, "", 0, false);
  }
  for (const hit of found) {
    if (hit.embedded) {
      classify(file, hit.line, hit.value, { class: "historical", rule: "inside a longer name (content-addressed file name), not a pin" });
      continue;
    }
    const queue = verdicts.get(hit.value.toLowerCase());
    if (queue?.length) {
      const verdict = queue.shift();
      classify(file, hit.line, hit.value, verdict.class === "unknown" ? (fromLedger(file, hit.value) ?? verdict) : verdict);
      continue;
    }
    const lineText = text.split("\n")[hit.line - 1] ?? "";
    const path = lineText.match(productPath)?.[1]?.replace(/[`.,;)]+$/, "");
    if (!file.endsWith(".json") && path && /`/.test(lineText)) {
      classify(file, hit.line, hit.value, { pendingFunction: path });
      continue;
    }
    classify(file, hit.line, hit.value, fromLedger(file, hit.value) ??
      { class: "unknown", rule: file.endsWith(".json") ? "JSON value not classified by any rule" : "text hash not classified by any rule" });
  }
}
for (const record of records)
  if (record.pendingFunction) {
    const path = record.pendingFunction;
    delete record.pendingFunction;
    Object.assign(record, wholeFileMatches.has(path)
      ? { class: "historical", rule: `function-body hash in a text mapping, covered by the matching whole-file pin of ${path}` }
      : fromLedger(record.file, record.value) ??
        { class: "unknown", rule: `function-body hash for ${path} with no matching whole-file pin` });
  }

const count = (predicate) => records.filter(predicate).length;
const byRule = {};
for (const record of records.filter((r) => r.class === "historical")) {
  const rule = record.rule.startsWith("function-body") ? "function-body hash covered by a matching whole-file pin" : record.rule;
  byRule[rule] = (byRule[rule] ?? 0) + 1;
}
const problems = records.filter((r) => r.class === "unknown" || r.status === "drift");
const summary = {
  commit,
  filesScanned: files.length,
  occurrences: records.length,
  compared: { match: count((r) => r.status === "match"), drift: count((r) => r.status === "drift") },
  historical: byRule,
  unknown: count((r) => r.class === "unknown"),
  problems: problems.map((r) => `${r.class === "unknown" ? "unknown" : "drift"} ${r.file}:${r.line} ${r.path ?? ""} ${r.rule}`),
};
if (out) writeFileSync(out, `${JSON.stringify({ ...summary, records }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
process.exit(problems.length ? 1 : 0);
