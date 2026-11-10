import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { uncheckedDesignRecipes } from "../scripts/verify-design-inventory.ts";

it("enumerates every current offscreen driver and verify.sh mode", () => {
  expect(
    uncheckedDesignRecipes(
      readdirSync(join(import.meta.dirname, "../scripts")),
      readFileSync(
        join(
          import.meta.dirname,
          "../../../.agents/skills/verify-electron/scripts/verify.sh",
        ),
        "utf8",
      ),
    ),
  ).toEqual({ offscreen: [], modes: [], uncoveredModes: [] });
});
it("refuses a newly added offscreen driver or shell mode outside the inventory", () => {
  expect(
    uncheckedDesignRecipes(
      ["verify-new-feature-offscreen.ts"],
      `if [ "\${TODO_VERIFY_NEW_MODE:-0}" = 1 ]; then`,
    ),
  ).toEqual({
    offscreen: ["verify-new-feature-offscreen.ts"],
    modes: ["TODO_VERIFY_NEW_MODE"],
    uncoveredModes: [],
  });
});
