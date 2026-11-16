import { spawnSync } from "node:child_process";
import { expect, it } from "@effect/vitest";
import { Schema } from "effect";

it("imports the shared guard in a browser bundle without Node globals or dependencies", async () => {
  const bundle = await Bun.build({
    entrypoints: [
      new URL("./fixtures/diagnostic-guard-browser.ts", import.meta.url)
        .pathname,
    ],
    target: "browser",
    format: "esm",
  });
  expect(bundle.success, bundle.logs.map(String).join("\n")).toBe(true);
  const output = bundle.outputs[0];
  expect(output).toBeDefined();
  if (!output) throw new Error("Missing browser bundle");
  const browser = spawnSync(
    "node",
    [
      "--experimental-vm-modules",
      "--input-type=module",
      "-e",
      `
    import { readFileSync } from "node:fs";
    import { createContext, runInContext, SourceTextModule } from "node:vm";
    const context = createContext({});
    const module = new SourceTextModule(readFileSync(0, "utf8"), { context });
    await module.link(() => { throw new Error("Browser guard imported a dependency"); });
    await module.evaluate();
    const { observeDiagnostic, diagnosticFailureCounts } = module.namespace;
    const owner = {};
    const value = observeDiagnostic(owner, () => 37);
    const lost = observeDiagnostic(owner, () => { throw new Error("private browser fault"); }, "start");
    process.stdout.write(JSON.stringify({
      globals: runInContext("[typeof process, typeof Buffer, typeof require, typeof Bun, typeof global]", context),
      value,
      lost: lost === undefined,
      counts: diagnosticFailureCounts(owner),
    }));
  `,
    ],
    { input: await output.text(), encoding: "utf8", timeout: 10000 },
  );
  expect(browser.status, browser.stderr).toBe(0);
  expect(
    Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(
      browser.stdout,
    ),
  ).toEqual({
    globals: ["undefined", "undefined", "undefined", "undefined", "undefined"],
    value: 37,
    lost: true,
    counts: { total: 1, lost_starts: 1, lost_events: 0 },
  });
});
