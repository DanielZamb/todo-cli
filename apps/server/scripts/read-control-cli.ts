import { setSystemTime } from "bun:test";

setSystemTime(new Date("2026-11-11T18:00:00Z"));
Object.defineProperty(globalThis.crypto, "randomUUID", {
  value: () =>
    process.env.READ_CONTROL_UUID ?? "00000000-0000-4000-8000-000000000001",
});
await import("../../cli/src/main.ts");
