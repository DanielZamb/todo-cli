import { expect, it } from "@effect/vitest";
import { verifyMacPassword } from "../src/macos-password.ts";

// Uses an account that cannot exist, so no real login password is ever tried.
it("refuses a password macOS does not accept, and empty or multi-line input without asking", async () => {
  const account = "todo-no-such-account-for-tests";
  expect(await verifyMacPassword("not the password", account)).toBe(false);
  expect(await verifyMacPassword("", account)).toBe(false);
  expect(await verifyMacPassword("two\nlines", account)).toBe(false);
});
