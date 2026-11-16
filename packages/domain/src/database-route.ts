import { createHmac, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Schema } from "effect";

export const DatabaseIdentity = Schema.Struct({
  device: Schema.String,
  inode: Schema.String,
  birth: Schema.String,
});
export const DatabaseBinding = Schema.Struct({
  identity: DatabaseIdentity,
  path: Schema.String,
  attachment_root: Schema.String,
});
export const EndpointRecord = Schema.Struct({
  protocol: Schema.Literal(1),
  contract: Schema.String,
  binding: DatabaseBinding,
  port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  incarnation: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  secret: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
export const ProofRequest = Schema.Struct({
  nonce: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
export const ProofResponse = Schema.Struct({
  protocol: Schema.Literal(1),
  contract: Schema.String,
  binding: DatabaseBinding,
  incarnation: EndpointRecord.fields.incarnation,
  nonce: ProofRequest.fields.nonce,
  mac: Schema.String,
});
export type DatabaseBinding = typeof DatabaseBinding.Type;
export type EndpointRecord = typeof EndpointRecord.Type;

export const endpointPath = (canonicalPath: string) =>
  join(
    dirname(canonicalPath),
    ".todo-routing",
    Buffer.from(basename(canonicalPath)).toString("hex"),
    "endpoint.json",
  );

export function databaseBinding(
  path: string,
  allowLinks = false,
): DatabaseBinding | undefined {
  if (path === ":memory:") return undefined;
  let descriptor: number | undefined;
  try {
    const canonical = realpathSync(path);
    descriptor = openSync(canonical, "r");
    const stat = fstatSync(descriptor, { bigint: true });
    if (!stat.isFile() || (!allowLinks && stat.nlink !== 1n)) return undefined;
    return {
      identity: {
        device: String(stat.dev),
        inode: String(stat.ino),
        birth: String(stat.birthtimeNs),
      },
      path: canonical,
      attachment_root: resolve(
        process.env.TODO_ATTACHMENT_ROOT ??
          join(dirname(resolve(path)), "attachments"),
      ),
    };
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export const sameBinding = (a: DatabaseBinding, b: DatabaseBinding) =>
  a.path === b.path &&
  a.attachment_root === b.attachment_root &&
  a.identity.device === b.identity.device &&
  a.identity.inode === b.identity.inode &&
  a.identity.birth === b.identity.birth;

export const privateEntry = (path: string, directory: boolean) => {
  const stat = lstatSync(path);
  return (
    stat.uid === process.getuid?.() &&
    !stat.isSymbolicLink() &&
    (directory
      ? stat.isDirectory() && (stat.mode & 0o777) === 0o700
      : stat.isFile() && (stat.mode & 0o777) === 0o600)
  );
};

export const routeMac = (secret: string, purpose: string, value: unknown) =>
  createHmac("sha256", Buffer.from(secret, "hex"))
    .update(JSON.stringify([purpose, value]))
    .digest("hex");

export const validMac = (expected: string, actual: string) =>
  /^[a-f0-9]{64}$/.test(actual) &&
  timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
