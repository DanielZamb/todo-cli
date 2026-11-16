// The Swift client's contract identity must describe the Swift sources next
// to it. Those sources implement whatever apps/macos/API/.../openapi.json
// describes, which generate-api.sh makes by normalizing packages/api/openapi.json.
//
//   bun packages/api/scripts/swift-contract.ts           check (root check, Mac build)
//   bun packages/api/scripts/swift-contract.ts --write   after generate-api.sh
//
// States:
// - regenerated: the Mac document is the normalized server document and the
//   identity names the server's contract;
// - not regenerated: the documents differ and the identity is not the server's
//   contract (honest; a Mac app built here refuses this server as outdated).
//   swift-client-pending.json must name the pair and what stays red;
// - dishonest: the documents differ and the identity claims the server's
//   contract. A Mac app built here would pass the health check and then fail
//   to decode replies the server has already committed. Refused.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const at = (path: string) => join(root, path);
const serverDocument = at("packages/api/openapi.json");
const macDocument = at("apps/macos/API/Sources/TodoAPI/openapi.json");
const swiftIdentity = at(
  "apps/macos/API/Sources/TodoAPI/ContractIdentity.swift",
);
const pendingFile = at("apps/macos/API/swift-client-pending.json");

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
const idIn = (path: string) => {
  const id = readFileSync(path, "utf8").match(/"([a-f0-9]{64})"/)?.[1];
  if (!id) throw new Error(`No contract id in ${path}`);
  return id;
};

/** Whether the Mac document is exactly the normalized server document. */
const regenerated = () => {
  const scratch = mkdtempSync(join(tmpdir(), "todo-swift-contract-"));
  try {
    const normalized = join(scratch, "openapi.json");
    const result = spawnSync(
      "python3",
      [
        "-I",
        at("apps/macos/scripts/normalize-openapi.py"),
        serverDocument,
        normalized,
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0)
      throw new Error(`normalize-openapi.py failed: ${result.stderr}`);
    return (
      canonical(JSON.parse(readFileSync(normalized, "utf8"))) ===
      canonical(JSON.parse(readFileSync(macDocument, "utf8")))
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

const serverContract = idIn(at("packages/api/src/contract.ts"));
const swiftContract = idIn(swiftIdentity);
const synced = regenerated();

if (process.argv.includes("--write")) {
  if (!synced)
    throw new Error(
      "The Mac openapi.json is not the normalized server document; run apps/macos/scripts/generate-api.sh before writing the Swift identity.",
    );
  writeFileSync(
    swiftIdentity,
    `// Written by packages/api/scripts/swift-contract.ts --write, after generate-api.sh.\npublic enum TodoContract {\n    public static let id = "${serverContract}"\n}\n`,
  );
  writeFileSync(
    pendingFile,
    `${JSON.stringify({ about: "Nothing pending: the Swift client is regenerated for the server's contract.", swiftContract: serverContract, serverContract, expectedRed: [] }, null, 2)}\n`,
  );
  console.log(`Swift identity written: ${serverContract}`);
} else if (synced) {
  if (swiftContract !== serverContract)
    throw new Error(
      `The Swift sources implement ${serverContract} but ContractIdentity.swift says ${swiftContract}. Run bun packages/api/scripts/swift-contract.ts --write.`,
    );
  console.log(`Swift client regenerated for contract ${serverContract}.`);
} else {
  if (swiftContract === serverContract)
    throw new Error(
      `Dishonest Swift identity: ContractIdentity.swift claims ${serverContract}, but the Swift sources were generated from another document. A Mac app built from this would pass the health check and fail to decode replies. Restore the id its sources implement, or regenerate with apps/macos/scripts/generate-api.sh.`,
    );
  const pending = JSON.parse(readFileSync(pendingFile, "utf8")) as {
    swiftContract: string;
    serverContract: string;
    expectedRed: { check: string; reason: string }[];
  };
  if (
    pending.swiftContract !== swiftContract ||
    pending.serverContract !== serverContract
  )
    throw new Error(
      `apps/macos/API/swift-client-pending.json must name this pair (Swift ${swiftContract}, server ${serverContract}) and what stays red until the Swift client is regenerated.`,
    );
  console.log(
    `The Swift client is not regenerated for this contract: its sources implement ${swiftContract}, the server serves ${serverContract}. A Mac app built here refuses this server as outdated. Expected red until apps/macos/scripts/generate-api.sh runs:\n${pending.expectedRed.map((item) => `- ${item.check}: ${item.reason}`).join("\n")}`,
  );
}
