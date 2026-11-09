import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

export type AuthRequest = {
  method: string;
  path: string;
  has_authorization: boolean;
  status: number;
};

export async function verifyHostAuth(input: {
  page: Page;
  evidence: string;
  requests: readonly AuthRequest[];
}) {
  const { page, evidence, requests } = input;
  assert.ok(
    requests.some(
      (request) =>
        request.method === "POST" &&
        request.path === "/auth/sessions" &&
        !request.has_authorization &&
        request.status === 200,
    ),
  );
  assert.ok(
    requests.some(
      (request) =>
        request.method === "GET" &&
        request.path === "/profiles" &&
        request.has_authorization &&
        request.status === 200,
    ),
  );
  const start = requests.length;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Owner passphrase")).toBeVisible();
  await page.screenshot({ path: join(evidence, "auth-signed-out.png") });
  await page
    .getByLabel("Owner passphrase")
    .fill("scratch verification passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Owner passphrase")).toHaveCount(0);
  const sequence = requests.slice(start);
  const signOut = sequence.findIndex(
    (request) =>
      request.method === "DELETE" && request.path === "/auth/session",
  );
  const signIn = sequence.findIndex(
    (request) => request.method === "POST" && request.path === "/auth/sessions",
  );
  const profiles = sequence.findIndex(
    (request, index) =>
      index > signIn &&
      request.method === "GET" &&
      request.path === "/profiles",
  );
  assert.ok(signOut >= 0 && signIn > signOut && profiles > signIn);
  assert.deepEqual(sequence[signOut], {
    method: "DELETE",
    path: "/auth/session",
    has_authorization: true,
    status: 204,
  });
  assert.deepEqual(sequence[signIn], {
    method: "POST",
    path: "/auth/sessions",
    has_authorization: false,
    status: 200,
  });
  assert.deepEqual(sequence[profiles], {
    method: "GET",
    path: "/profiles",
    has_authorization: true,
    status: 200,
  });
  await page.screenshot({ path: join(evidence, "auth-signed-in.png") });
  writeFileSync(
    join(evidence, "auth-host.json"),
    JSON.stringify(
      {
        passed: true,
        factory: "production taskHttpClient credential getter",
        one_host_client: true,
        requests,
      },
      null,
      2,
    ),
  );
}
