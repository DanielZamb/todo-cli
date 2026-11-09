import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
export default function clientMutants(candidate) {
  const file = "apps/electron/src/http-client.ts",
    source = readFileSync(join(candidate, file), "utf8"),
    point = "HttpApiClient.make(TodoApi, {";
  assert.equal(
    source.split(point).length,
    2,
    "Portable factory mutation point changed; review actual function",
  );
  assert.ok(
    source.trimEnd().endsWith("});"),
    "Portable factory return shape changed; review actual function",
  );
  const wrap = (getter) =>
    source
      .replace(point, "((credential: () => string | undefined) => " + point)
      .replace(/\}\);\s*$/, "}))(" + getter + ");\n");
  return [
    {
      name: "client-freezes-signed-out-value",
      file,
      from: source,
      to: wrap(
        "(() => { const captured = credential(); return () => captured; })()",
      ),
      driver: "graph-response",
      mode: "all",
      property: "client-credential-refresh",
    },
    {
      name: "client-retains-revoked-bearer",
      file,
      from: source,
      to: wrap(
        "(() => { const source = credential; let prior: string | undefined; return () => { prior = source() ?? prior; return prior; }; })()",
      ),
      driver: "graph-response",
      mode: "all",
      property: "client-no-stale-authorization",
    },
  ];
}
