import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./candidate-inputs.mjs";
export function graphSchemaProperties(schema) {
  const keys = [
    "blocked",
    "depth",
    "in_degree",
    "mermaid_id",
    "out_degree",
    "ready",
    "remaining_energy",
    "task",
  ];
  assert.equal(
    schema.anyOf.length,
    2,
    "BEHAVIORAL_FAILURE:contract-root-fields",
  );
  for (const variant of schema.anyOf) {
    for (const key of ["ancestors", "descendants", "lightest_next"]) {
      assert.ok(
        variant.properties[key],
        "BEHAVIORAL_FAILURE:contract-root-fields",
      );
      assert.equal(
        variant.properties[key].type,
        "array",
        "BEHAVIORAL_FAILURE:contract-root-fields",
      );
      assert.ok(
        variant.required.includes(key),
        "BEHAVIORAL_FAILURE:contract-root-fields",
      );
    }
    const node = variant.properties.nodes.items;
    assert.deepEqual(
      Object.keys(node.properties).sort(),
      keys,
      "BEHAVIORAL_FAILURE:contract-node-fields",
    );
    assert.deepEqual(
      [...node.required].sort(),
      keys,
      "BEHAVIORAL_FAILURE:contract-node-fields",
    );
    assert.equal(variant.properties.nodes.minItems, 1);
    assert.equal(node.properties.mermaid_id.pattern, "^n[0-9]+$");
  }
}
export function verifyContractArtifacts(candidate, evidence) {
  const apiPath = join(candidate, "packages/api/openapi.json"),
    swiftPath = join(candidate, "apps/macos/API/Sources/TodoAPI/openapi.json");
  const api = readFileSync(apiPath),
    swift = readFileSync(swiftPath);
  assert.equal(
    digest(api),
    digest(swift),
    "Published API/Swift schema mismatch",
  );
  const schema =
    JSON.parse(api).paths["/profiles/{profile}/tasks/{task}/graph"].get
      .responses["200"].content["application/json"].schema;
  graphSchemaProperties(schema);
  const factory = readFileSync(
    join(candidate, "apps/electron/src/http-client.ts"),
    "utf8",
  );
  assert.match(factory, /credential:\s*\(\)\s*=>\s*string\s*\|\s*undefined/);
  const main = readFileSync(
      join(candidate, "apps/electron/src/main.ts"),
      "utf8",
    ),
    taskClient = readFileSync(
      join(candidate, "apps/electron/src/task-client.ts"),
      "utf8",
    );
  assert.match(
    main,
    /taskHttpClient\(server.origin,\s*\(\)\s*=>\s*credential\)/,
  );
  assert.match(taskClient, /taskHttpClient/);
  const callers = [
    "apps/electron/scripts/verify-auth-sequence.ts",
    "apps/electron/scripts/verify-graph-contract.ts",
    "apps/electron/scripts/write-host.ts",
  ].map((path) => {
    const bytes = readFileSync(join(candidate, path), "utf8");
    assert.match(bytes, /taskHttpClient\([\s\S]*?\(\)\s*=>/);
    return { path, sha256: digest(bytes), scope: "inspected getter caller" };
  });
  const receipt = {
    status: "pass",
    scope:
      "published OpenAPI copies and production factory caller mapping; not Swift/Electron runtime proof",
    openapiSha256: digest(api),
    swiftOpenapiSha256: digest(swift),
    factorySha256: digest(factory),
    mainSha256: digest(main),
    taskClientSha256: digest(taskClient),
    callers,
  };
  writeFileSync(
    join(evidence, "contract-source-map.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  return receipt;
}
