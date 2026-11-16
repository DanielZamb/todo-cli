import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { loadavg } from "node:os";
import { coldPathHostGate } from "../../verify-diagnostics/scripts/cold-path-host.ts";
const [out, command, ...args] = process.argv.slice(2);
assert.ok(out && command);
const evidence = resolve(out);
mkdirSync(evidence, { recursive: true });
const pressure = process.env.TODO_RECORDINGS_STRESS === "1",
  gate = coldPathHostGate();
if (pressure && !gate.allowed) {
  writeFileSync(
    join(evidence, "stress.json"),
    JSON.stringify({ result: "HOLD", gate }),
  );
  process.exit(3);
}
const children: ChildProcess[] = [],
  loads: object[] = [];
let ended = false;
const stop = () => {
  for (const c of children)
    if (c.exitCode === null && c.signalCode === null) c.kill("SIGTERM");
};
const limit = setTimeout(() => {
  ended = true;
  stop();
}, 85000);
const monitor = setInterval(() => {
  loads.push({ at: Date.now(), load: loadavg() });
  if (pressure && !coldPathHostGate().allowed) {
    ended = true;
    stop();
  }
}, 5000);
try {
  if (pressure) {
    for (let i = 0; i < 6; i++)
      children.push(
        spawn(
          process.execPath,
          ["-e", "let x=1;for(;;)x=Math.imul(x+1,1664525)"],
          { stdio: "ignore" },
        ),
      );
    await Bun.sleep(35000);
  }
  assert.equal(ended, false);
  const start = loadavg(),
    child = spawn(command, args, { stdio: "inherit" });
  children.push(child);
  const result = await new Promise<{
    code: number | null;
    signal: string | null;
  }>((r) => child.once("exit", (code, signal) => r({ code, signal })));
  writeFileSync(
    join(evidence, "stress.json"),
    JSON.stringify(
      {
        pressure,
        gate,
        loads,
        load_start: start,
        load_end: loadavg(),
        ended,
        ...result,
      },
      null,
      2,
    ),
  );
  process.exitCode = result.code ?? 1;
} finally {
  clearTimeout(limit);
  clearInterval(monitor);
  stop();
  await Promise.all(
    children
      .filter((c) => c.exitCode === null && c.signalCode === null)
      .map((c) => new Promise((r) => c.once("exit", r))),
  );
}
