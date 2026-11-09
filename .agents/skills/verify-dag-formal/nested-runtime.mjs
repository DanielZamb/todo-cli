import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { digest } from "./candidate-inputs.mjs";

const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
export function installNestedRuntime() {
  const evidence = process.env.DAG_F_GUARD_EVIDENCE;
  assert.ok(evidence);
  const found = Bun.which("bun");
  assert.ok(found);
  const delegate = realpathSync(
    found === process.env.DAG_F_NESTED_SHIM_BUN
      ? process.env.DAG_F_NESTED_ORIGINAL_BUN
      : found,
  );
  assert.ok(isAbsolute(delegate));
  const host = realpathSync(process.execPath);
  const wrapper = join(
    dirname(fileURLToPath(import.meta.url)),
    "guarded-runtime.mjs",
  );
  const directory = mkdtempSync(join(evidence, "atomiccas-runtime-"));
  const shim = join(directory, "bun");
  const source = `#!/bin/sh\nDAG_F_REAL_BUN=${quote(delegate)} exec ${quote(host)} ${quote(wrapper)} "$@"\n`;
  writeFileSync(shim, source, { mode: 0o700 });
  process.env.DAG_F_NESTED_ORIGINAL_BUN = delegate;
  process.env.DAG_F_NESTED_SHIM_BUN = shim;
  process.env.PATH = directory + ":" + process.env.PATH;
  writeFileSync(
    join(directory, "manifest.json"),
    JSON.stringify(
      {
        scope: "AtomicCAS preload process and descendants only",
        pid: process.pid,
        host,
        delegate,
        wrapper,
        shim,
        sha256: digest(source),
        preserves:
          "original PATH-resolved Bun delegate, argv and stdio; no B source edits",
      },
      null,
      2,
    ) + "\n",
  );
}
