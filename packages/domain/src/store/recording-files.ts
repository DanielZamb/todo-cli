import { Database } from "bun:sqlite";
import { constants } from "node:fs";
import { chmod, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
export async function acquireRecordingLease(directory: string) {
  const path = join(directory, "writer.lock");
  const file = await open(
    path,
    constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
    0o600,
  );
  await file.close();
  await chmod(path, 0o600);
  const lease = new Database(path);
  try {
    lease.exec("PRAGMA busy_timeout=0");
    lease.query("PRAGMA journal_mode=MEMORY").get();
    lease.exec("BEGIN EXCLUSIVE");
    return lease;
  } catch {
    lease.close();
    return undefined;
  }
}
export async function readRecordingFile(directory: string, name: string) {
  const file = await open(
    join(directory, name),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}
export async function writeRecordingFile(
  directory: string,
  name: string,
  text: string,
) {
  const temp = join(directory, `${name}.tmp`);
  const file = await open(
    temp,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      await file.writeFile(text);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, join(directory, name));
  } catch (error) {
    await removeRecordingFile(directory, `${name}.tmp`).catch(() => {});
    throw error;
  }
}

export async function removeRecordingFile(directory: string, name: string) {
  try {
    await unlink(join(directory, name));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
}
