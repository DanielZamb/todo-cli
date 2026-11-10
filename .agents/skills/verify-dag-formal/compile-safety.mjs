import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { repositoryInput, verificationRoot } from "../../../scripts/verification-inputs.ts";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  readFileSync,
  unlinkSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { digest } from "./candidate-inputs.mjs";
let stopped = false;
export class DiskStop extends Error {
  constructor(receipt) {
    super("DISK STOP " + receipt.stdout.trim());
    this.receipt = receipt;
    stopped = true;
  }
}
export const diskStopped = () => stopped;
export function guardContext(evidence) {
  process.env.DAG_F_GUARD_EVIDENCE = evidence;
  process.env.DAG_F_DISK_STOP_FILE ??= join(evidence, "DISK-STOP.json");
}
export function beforeCompile({ evidence, label }) {
  guardContext(evidence);
  if (existsSync(process.env.DAG_F_DISK_STOP_FILE))
    throw new DiskStop(
      JSON.parse(readFileSync(process.env.DAG_F_DISK_STOP_FILE, "utf8")),
    );
  if (stopped)
    throw new DiskStop({
      stdout: "prior disk guard stopped this process",
      exitCode: 3,
    });
  const result = spawnSync(
    "sh",
    [repositoryInput(verificationRoot(dirname(fileURLToPath(import.meta.url))), "scripts/disk-guard.sh", "DAG compiler guard")],
    { encoding: "utf8" },
  );
  const exitCode = result.status;
  const receipt = {
    label,
    time: new Date().toISOString(),
    exitCode,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  const receiptPath = join(
    evidence,
    `guard-${label.replaceAll(/[^a-zA-Z0-9_.-]/g, "_")}-${process.pid}-${Date.now()}.json`,
  );
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  if (exitCode === 3) {
    writeFileSync(
      process.env.DAG_F_DISK_STOP_FILE,
      JSON.stringify(receipt, null, 2) + "\n",
    );
    throw new DiskStop(receipt);
  }
  assert.equal(result.error, undefined);
  assert.equal(exitCode, 0, "Disk guard failed before compile");
  return { ...receipt, receiptPath };
}
export function retiredArtifact({ root, evidence, label, binary, keep = [] }) {
  if (!binary || keep.includes(binary) || !existsSync(binary)) return;
  const cache = join(root, ".scratch/bin");
  assert.equal(
    dirname(resolve(binary)),
    cache,
    "Only owned cache binaries may be retired",
  );
  assert.ok(!lstatSync(cache).isSymbolicLink());
  const stat = lstatSync(binary);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  const metadataPath = binary + ".provenance.json";
  assert.ok(!lstatSync(metadataPath).isSymbolicLink());
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  assert.equal(metadata.binarySha256, digest(readFileSync(binary)));
  assert.ok(
    metadata.imports.some((input) =>
      input.path.startsWith(join(root, "docs/evidence/dag-formal") + "/"),
    ),
    "Unproven artifact ownership",
  );
  const ps = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  assert.equal(ps.status, 0);
  const open = spawnSync("/usr/sbin/lsof", ["-nP", "-Fpcn", binary], {
    encoding: "utf8",
  });
  assert.ok(open.status === 0 || open.status === 1);
  assert.equal(open.stderr, "");
  const inUse =
    ps.stdout.split("\n").some((line) => line.includes(binary)) ||
    open.stdout.includes(binary);
  const free = () => {
    const result = spawnSync("df", ["-k", root], { encoding: "utf8" });
    assert.equal(result.status, 0);
    const fields = result.stdout.trim().split("\n").at(-1).trim().split(/\s+/);
    return { availableBytes: Number(fields[3]) * 1024, stdout: result.stdout };
  };
  const before = free();
  const receipt = {
    label,
    binary,
    metadataPath,
    sourceHash: metadata.sourceHash,
    productCommit: metadata.productCommit,
    bytes: stat.size,
    sha256: metadata.binarySha256,
    inUse,
    action: inUse ? "retained-in-use" : "unlinked-superseded-mutant",
    time: new Date().toISOString(),
    before,
  };
  if (!inUse) unlinkSync(binary);
  receipt.after = free();
  receipt.capacityNote =
    "Logical bytes unlinked and observed APFS free capacity are separate; concurrent activity and sharing prevent equating them.";
  writeFileSync(
    join(
      evidence,
      `retired-${label.replaceAll(/[^a-zA-Z0-9_.-]/g, "_")}-${Date.now()}.json`,
    ),
    JSON.stringify(receipt, null, 2) + "\n",
  );
}
