import { dlopen, FFIType, ptr } from "bun:ffi";

type Mode = "exclusive" | "shared" | "release";
let lock: ((fd: number, mode: Mode) => boolean) | undefined;
function native() {
  if (!lock) {
    if (process.platform === "darwin") {
      const library = dlopen("/usr/lib/libSystem.B.dylib", {
        flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
      });
      lock = (fd, mode) =>
        library.symbols.flock(
          fd,
          mode === "shared" ? 5 : mode === "exclusive" ? 6 : 8,
        ) === 0;
    } else if (process.platform === "linux") {
      const library = dlopen("libc.so.6", {
        fcntl: {
          args: [FFIType.i32, FFIType.i32, FFIType.ptr],
          returns: FFIType.i32,
        },
      });
      const region = Buffer.alloc(32);
      region.writeBigInt64LE(0x40000000n, 8);
      region.writeBigInt64LE(512n, 16);
      lock = (fd, mode) => {
        region.writeInt16LE(
          mode === "shared" ? 0 : mode === "exclusive" ? 1 : 2,
          0,
        );
        return library.symbols.fcntl(fd, 37, ptr(region)) === 0;
      };
    } else throw new Error("Recording initialization exclusion unavailable");
  }
  return lock;
}
export function tryRecordingExclusion(fd: number, shared = false) {
  return native()(fd, shared ? "shared" : "exclusive");
}
export function releaseRecordingExclusion(fd: number) {
  return native()(fd, "release");
}
