import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CONTRACT_ID } from "@todo/api";
import {
  databaseBinding,
  type EndpointRecord,
  endpointPath,
  type ProofResponse,
  privateEntry,
  routeMac,
  sameBinding,
  validMac,
} from "@todo/domain/database-route";

export function databaseEndpoint(path: string) {
  if (path === ":memory:") return undefined;
  mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const descriptor = openSync(path, "a", 0o600);
  const binding = databaseBinding(path, true);
  if (!binding) {
    closeSync(descriptor);
    throw new Error("Cannot identify server database");
  }
  const registry = `/tmp/todo-server-${process.getuid?.()}`;
  mkdirSync(registry, { mode: 0o700, recursive: true });
  if (!privateEntry(registry, true)) {
    closeSync(descriptor);
    throw new Error("Unsafe server lock directory");
  }
  const guardPath = join(
    registry,
    `${binding.identity.device}-${binding.identity.inode}-${binding.identity.birth}.sqlite`,
  );
  let guard: Database | undefined;
  const incarnation = randomBytes(32).toString("hex");
  const secret = randomBytes(32).toString("hex");
  let record: EndpointRecord | undefined;
  const file = endpointPath(binding.path);
  try {
    const lockDescriptor = openSync(guardPath, "a", 0o600);
    closeSync(lockDescriptor);
    if (!privateEntry(guardPath, false))
      throw new Error("Unsafe server lock file");
    guard = new Database(guardPath);
    guard.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
  } catch (error) {
    guard?.close();
    closeSync(descriptor);
    throw new Error(
      "Another server owns this database, or the server guard is unavailable",
      { cause: error },
    );
  }
  const current = () => {
    const now = databaseBinding(path);
    return now !== undefined && sameBinding(binding, now);
  };
  return {
    publish(port: number) {
      if (!current()) return;
      const parent = dirname(file);
      mkdirSync(parent, { mode: 0o700, recursive: true });
      if (!privateEntry(dirname(parent), true) || !privateEntry(parent, true))
        throw new Error("Unsafe endpoint directory");
      record = {
        protocol: 1,
        contract: CONTRACT_ID,
        binding,
        port,
        incarnation,
        secret,
      };
      const temp = `${file}.${incarnation}`;
      try {
        writeFileSync(temp, JSON.stringify(record), {
          mode: 0o600,
          flag: "wx",
        });
        chmodSync(temp, 0o600);
        renameSync(temp, file);
      } finally {
        rmSync(temp, { force: true });
      }
    },
    proof(nonce: string) {
      if (!record || !current()) return undefined;
      const fresh = databaseBinding(path);
      if (!fresh) return undefined;
      const value = {
        protocol: 1,
        contract: CONTRACT_ID,
        binding: fresh,
        incarnation,
        nonce,
      } satisfies Omit<typeof ProofResponse.Type, "mac">;
      return { ...value, mac: routeMac(secret, "proof", value) };
    },
    authorize(
      instance: string | undefined,
      mac: string | undefined,
      purpose: string,
    ) {
      return (
        record !== undefined &&
        current() &&
        instance === incarnation &&
        mac !== undefined &&
        validMac(routeMac(secret, purpose, incarnation), mac)
      );
    },
    close() {
      try {
        const existing: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (
          existing &&
          typeof existing === "object" &&
          "incarnation" in existing &&
          existing.incarnation === incarnation
        )
          rmSync(file);
      } catch {}
      guard.close();
      closeSync(descriptor);
    },
  };
}
