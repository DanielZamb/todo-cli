import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { xcodeCompilerGuards } from "../scripts/xcode-compiler-guards.ts";

it("preserves compiler feature discovery, literal arguments, streams and hard3", () => {
  const fixture = mkdtempSync(join(tmpdir(), "todo-xcode-guards-"));
  try {
    const helpers = join(fixture, "apps/electron/scripts");
    const sdk = join(fixture, "sdk/usr");
    mkdirSync(helpers, { recursive: true });
    mkdirSync(join(sdk, "bin"), { recursive: true });
    mkdirSync(join(sdk, "share/swift"), { recursive: true });
    const features = '{"features":[{"name":"package-name-if-supported"}]}\n';
    writeFileSync(join(sdk, "share/swift/features.json"), features);
    const guard = join(helpers, "guarded-disk.sh");
    writeFileSync(guard, "#!/bin/sh\nexit 0\n");
    const delegate = join(sdk, "bin/compiler");
    writeFileSync(
      delegate,
      "#!/bin/sh\nprintf '%s\\0' \"$@\"\nprintf 'delegate stderr\\n' >&2\nexit 7\n",
      { mode: 0o755 },
    );
    const result = xcodeCompilerGuards(fixture, join(fixture, "guards"), {
      swiftc: delegate,
      clang: delegate,
      "clang++": delegate,
    });
    expect(readFileSync(result.features.path, "utf8")).toBe(features);
    const args = [
      "-package-name",
      "swift_collections",
      "a b",
      "literal$(none)",
      "literal`none`",
      "'quoted'",
    ];
    for (const wrapper of Object.values(result.wrappers)) {
      const output = spawnSync(wrapper, args);
      expect(output.status).toBe(7);
      expect(output.stdout.toString()).toBe(`${args.join("\0")}\0`);
      expect(output.stderr.toString()).toBe("delegate stderr\n");
    }
    writeFileSync(
      guard,
      "#!/bin/sh\nprintf 'DISK STOP fixture\\n' >&2\nexit 3\n",
    );
    for (const wrapper of Object.values(result.wrappers)) {
      const output = spawnSync(wrapper, args);
      expect(output.status).toBe(3);
      expect(output.stdout.toString()).toBe("");
      expect(output.stderr.toString()).toBe("DISK STOP fixture\n");
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
