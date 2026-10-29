import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "@effect/vitest";

it("removes a partial copied image after a real filesystem write failure", () => {
  const scratch = mkdtempSync(join(tmpdir(), "todo-f11-image-write-"));
  try {
    const binary = join(scratch, "verify-image-write");
    const build = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        resolve(import.meta.dirname, "../scripts/verify-image-write.ts"),
        "--outfile",
        binary,
      ],
      { cwd: scratch, encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stderr).toBe(0);
    const proof = spawnSync(
      "/bin/sh",
      ["-c", 'ulimit -f 1; exec "$@"', "write-proof", binary],
      { cwd: scratch, encoding: "utf8", timeout: 30000 },
    );
    expect(proof.status, proof.stderr).toBe(0);
    expect(JSON.parse(proof.stdout)).toEqual({
      status: "PASS",
      realWriteFailure: "EFBIG",
      partialFiles: 0,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 60000);
