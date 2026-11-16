import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    // The CLI takes today in the machine's zone (ADR-0006). Every compiled
    // CLI a test spawns inherits this zone unless the test names another, so
    // no test depends on the machine's zone.
    env: { TZ: "UTC" },
  },
});
