import { dlopen, FFIType, ptr } from "bun:ffi";

let lock: ((fd: number, shared: boolean) => boolean) | undefined;
export function tryRecordingExclusion(fd: number, shared = false) {
  if (!lock) {
    if (process.platform === "darwin") {
      const native = dlopen("/usr/lib/libSystem.B.dylib", {
        flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
      });
      lock = (fd, shared) => native.symbols.flock(fd, shared ? 5 : 6) === 0;
    } else if (process.platform === "linux") {
      const native = dlopen("libc.so.6", {
        fcntl: {
          args: [FFIType.i32, FFIType.i32, FFIType.ptr],
          returns: FFIType.i32,
        },
      });
      const region = Buffer.alloc(32);
      region.writeInt16LE(1, 0);
      region.writeBigInt64LE(0x40000000n, 8);
      region.writeBigInt64LE(512n, 16);
      lock = (fd, shared) => {
        region.writeInt16LE(shared ? 0 : 1, 0);
        return native.symbols.fcntl(fd, 37, ptr(region)) === 0;
      };
    } else throw new Error("Recording initialization exclusion unavailable");
  }
  return lock(fd, shared);
}
