import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
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

const identity = (descriptor: number) => {
  const stat = fstatSync(descriptor, { bigint: true });
  if (!stat.isFile()) throw new Error("Server database is not a regular file");
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    birth: String(stat.birthtimeNs),
  };
};
const sameIdentity = (
  a: ReturnType<typeof identity>,
  b: ReturnType<typeof identity>,
) => a.device === b.device && a.inode === b.inode && a.birth === b.birth;

// SQLite's unix VFS retains the main-file descriptor until connection close.
// Only descriptors opened by this synchronous store acquisition count as evidence.
const descriptors = () => {
  try {
    const directory =
      process.platform === "linux"
        ? "/proc/self/fd"
        : process.platform === "darwin"
          ? "/dev/fd"
          : undefined;
    if (!directory) return undefined;
    const result = new Map<number, ReturnType<typeof identity>>();
    for (const entry of readdirSync(directory)) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        result.set(Number(entry), identity(Number(entry)));
      } catch {}
    }
    return result;
  } catch {
    return undefined;
  }
};

export function databaseEndpoint(path: string) {
  if (path === ":memory:") return undefined;
  mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const descriptor = openSync(path, "a", 0o600);
  let guard: Database | undefined;
  let lockDescriptor: number | undefined;
  try {
    const canonical = realpathSync(path);
    const binding = {
      identity: identity(descriptor),
      path: canonical,
      attachment_root: resolve(
        process.env.TODO_ATTACHMENT_ROOT ??
          join(dirname(resolve(path)), "attachments"),
      ),
    };
    // Hard links in different directories have no common beside-file registry.
    // Refuse startup rather than create independent guards for one inode.
    if (fstatSync(descriptor).nlink !== 1)
      throw new Error("Cannot start a server on a multiply linked database");
    const registry = join(dirname(canonical), ".todo-routing");
    mkdirSync(registry, { mode: 0o700, recursive: true });
    if (!privateEntry(registry, true))
      throw new Error("Unsafe server lock directory");
    const guardPath = join(
      registry,
      `${binding.identity.device}-${binding.identity.inode}-${binding.identity.birth}.sqlite`,
    );
    lockDescriptor = openSync(guardPath, "a", 0o600);
    const lockedIdentity = identity(lockDescriptor);
    if (!privateEntry(guardPath, false))
      throw new Error("Unsafe server lock file");
    const beforeGuard = descriptors();
    guard = new Database(guardPath);
    guard.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
    const afterGuard = descriptors();
    if (
      beforeGuard &&
      afterGuard &&
      ![...afterGuard].some(
        ([fd, id]) => !beforeGuard.has(fd) && sameIdentity(id, lockedIdentity),
      )
    )
      throw new Error(
        "Server guard connection file differs from its kept descriptor",
      );
    const incarnation = randomBytes(32).toString("hex");
    const secret = randomBytes(32).toString("hex");
    let record: EndpointRecord | undefined;
    let verified = false;
    let withdrawn = false;
    const file = endpointPath(binding.path);
    const removeRecord = () => {
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
      record = undefined;
    };
    const withdraw = (cause: string) => {
      if (withdrawn) return;
      withdrawn = true;
      removeRecord();
      process.stderr.write(
        JSON.stringify({ event: "local_routing_disabled", cause }) + "\n",
      );
    };
    const current = () => {
      if (withdrawn) return false;
      try {
        const stat = statSync(guardPath, { bigint: true });
        if (
          !privateEntry(guardPath, false) ||
          !sameIdentity(lockedIdentity, {
            device: String(stat.dev),
            inode: String(stat.ino),
            birth: String(stat.birthtimeNs),
          })
        ) {
          withdraw("Server guard path no longer names the locked file");
          return false;
        }
      } catch {
        withdraw("Server guard path is unavailable");
        return false;
      }
      const now = databaseBinding(path);
      if (!now || !sameBinding(binding, now)) {
        withdraw("Server database path no longer names the held file");
        return false;
      }
      return verified;
    };
    return {
      beforeStore: descriptors,
      verifyStore(before: ReturnType<typeof descriptors>) {
        const after = descriptors();
        if (!before || !after) {
          withdraw(
            "Cannot obtain store file descriptor evidence on this platform",
          );
          return;
        }
        if (
          ![...after].some(
            ([fd, id]) =>
              fd !== descriptor &&
              !before.has(fd) &&
              sameIdentity(id, binding.identity),
          )
        )
          throw new Error(
            "Server startup refused: SQLite store file differs from the kept database descriptor",
          );
        verified = true;
      },
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
        if (!current() || !record) return undefined;
        const value = {
          protocol: 1,
          contract: CONTRACT_ID,
          binding,
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
          current() &&
          record !== undefined &&
          instance === incarnation &&
          mac !== undefined &&
          validMac(routeMac(secret, purpose, incarnation), mac)
        );
      },
      close() {
        removeRecord();
        guard?.close();
        if (lockDescriptor !== undefined) closeSync(lockDescriptor);
        closeSync(descriptor);
      },
    };
  } catch (error) {
    guard?.close();
    if (lockDescriptor !== undefined) closeSync(lockDescriptor);
    closeSync(descriptor);
    throw new Error("Server database binding or singleton guard unavailable", {
      cause: error,
    });
  }
}
