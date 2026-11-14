import { dlopen, FFIType } from "bun:ffi";

if (process.platform !== "darwin")
  throw new Error("Stream measurements require the macOS host monotonic clock");

const system = dlopen("/usr/lib/libSystem.B.dylib", {
  clock_gettime_nsec_np: { args: [FFIType.i32], returns: FFIType.u64 },
});

export const now = () => Number(system.symbols.clock_gettime_nsec_np(4)) / 1e6;
