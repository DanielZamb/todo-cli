import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";
import { ProfileId, TaskId } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import type { taskHttpClient } from "../src/http-client.ts";
import type { Reply, Request } from "../src/protocol.ts";
import { settleRenderer } from "./settle-renderer.ts";

const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const Created = Schema.Struct({
  task: Schema.Struct({ id: TaskId, title: Schema.String }),
});
export async function verifyDependencyPickerRecovery({
  page,
  client,
  cli,
  capture,
  deliveries,
  failures,
  readGate,
  replyGate,
  signOut,
}: {
  page: Page;
  client: Effect.Success<ReturnType<typeof taskHttpClient>>;
  cli: (...args: string[]) => unknown;
  capture: (
    state: string,
    description: string,
    layout?: string,
  ) => Promise<void>;
  deliveries: readonly { request: Request; reply: Reply["_tag"] }[];
  failures: readonly { request: Request; tag: string; detail?: string }[];
  readGate: { pause: () => void; pending: () => boolean; resume: () => void };
  replyGate: {
    pause: () => void;
    pending: () => Reply | null;
    resume: () => void;
  };
  signOut: () => Promise<void>;
}) {
  const root = Schema.decodeUnknownSync(Created)(
    cli("add", "Picker fence private root"),
  ).task;
  const candidate = Schema.decodeUnknownSync(Created)(
    cli("add", "Picker fence private candidate"),
  ).task;
  const search = page.getByRole("textbox", {
    name: "Search tasks",
    exact: true,
  });
  const delivered = () =>
    deliveries.filter(
      ({ request }) =>
        request._tag === "dependencyCandidates" && request.profile === profile,
    ).length;
  const openPending = async () => {
    await search.fill(root.title);
    await page
      .getByRole("button", {
        name: `Task actions for ${root.title}`,
        exact: true,
      })
      .click();
    readGate.pause();
    await page
      .getByRole("menuitem", { name: "Add dependency", exact: true })
      .click();
    await expect(page.getByTestId("dependency-search")).toBeFocused();
    await expect.poll(readGate.pending).toBe(true);
  };
  try {
    await search.fill(root.title);
    await expect(
      page.getByTestId(`dependency-drag-source-${root.id}`),
    ).toBeVisible();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await expect(
      page.locator('[role="menuitemradio"][data-profile-id="recovery-other"]'),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    const beforeProfile = delivered();
    await openPending();
    await page.getByTestId("dependency-picker-close").click();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page
      .locator('[role="menuitemradio"][data-profile-id="recovery-other"]')
      .click();
    await expect(
      page.getByRole("button", { name: "Profile", exact: true }),
    ).toHaveAttribute("data-profile-id", "recovery-other");
    readGate.resume();
    await expect.poll(delivered).toBe(beforeProfile + 1);
    await settleRenderer(page);
    await expect(page.getByTestId("dependency-picker")).toHaveCount(0);
    await expect(page.getByTestId("dependency-error")).toHaveCount(0);
    await expect(
      page.getByTestId(`dependency-drag-source-${root.id}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`dependency-drag-source-${candidate.id}`),
    ).toHaveCount(0);
    await capture(
      "picker-profile-reset",
      "A real Profile switch clears the picker and private candidates before its old authorized SDK success is delivered",
    );
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page
      .locator('[role="menuitemradio"][data-profile-id="work"]')
      .click();
    await expect(
      page.getByRole("button", { name: "Profile", exact: true }),
    ).toHaveAttribute("data-profile-id", "work");
    const beforeAuth = delivered();
    await openPending();
    await signOut();
    await expect(
      page.getByRole("textbox", { name: "Owner passphrase", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("dependency-picker")).toHaveCount(0);
    replyGate.pause();
    readGate.resume();
    await expect.poll(() => replyGate.pending() !== null).toBe(true);
    const unauthorized = replyGate.pending();
    assert.ok(unauthorized?._tag === "error");
    assert.equal(unauthorized.message, "Sign in to update Dependencies.");
    assert.equal(
      unauthorized.exit_detail,
      "error 3 - not found or auth missing",
    );
    const transportFailure = failures
      .filter(
        ({ request }) =>
          request._tag === "dependencyCandidates" &&
          request.profile === profile,
      )
      .at(-1);
    assert.ok(transportFailure);
    assert.equal(transportFailure.tag, "Unauthorized");
    assert.equal(
      transportFailure.detail,
      "error 3 - not found or auth missing",
    );
    await page
      .getByRole("textbox", { name: "Owner passphrase", exact: true })
      .fill("scratch verification passphrase");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(search).toBeVisible();
    replyGate.resume();
    await expect.poll(delivered).toBe(beforeAuth + 1);
    await settleRenderer(page);
    await expect(
      page.getByRole("textbox", { name: "Owner passphrase", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId("dependency-picker")).toHaveCount(0);
    await expect(page.getByTestId("dependency-error")).toHaveCount(0);
    const protectedRead = await run(
      client.tasks.graph({ params: { profile, task: root.id } }),
    );
    assert.equal(protectedRead.task_id, root.id);
    await search.fill(root.title);
    await expect(
      page.getByTestId(`dependency-drag-source-${root.id}`),
    ).toBeVisible();
    await capture(
      "picker-auth-reset",
      "Actual Unauthorized from the old candidate read is held until a replacement Session signs in; its stale reply cannot sign out the replacement or reopen the picker",
    );
    await search.fill("");
    return {
      root,
      candidate,
      unauthorized,
      transportFailure,
      protectedRead,
      limits: [
        "Production renderer and retained shared HttpApi client with real scratch Sessions; no native safeStorage, Session restoration or native sign-out notice proof.",
      ],
    };
  } finally {
    readGate.resume();
    replyGate.resume();
  }
}
