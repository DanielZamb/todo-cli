import { expect, it } from "@effect/vitest";
import { vi } from "vitest";

const { writeText } = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock("electron", () => ({
  clipboard: { writeText },
  dialog: {},
  shell: {},
}));

import { nativeAttachmentRequest } from "../src/attachment-native.ts";

it("copies a valid Task id exactly", async () => {
  writeText.mockClear();
  expect(
    await nativeAttachmentRequest({
      _tag: "copyTaskId",
      task: "6aa2647d-1234-4567-89ab-0123456789ab",
    }),
  ).toEqual({ _tag: "ok" });
  expect(writeText.mock.calls).toEqual([
    ["6aa2647d-1234-4567-89ab-0123456789ab"],
  ]);
});
it("rejects a newline without touching the clipboard", async () => {
  writeText.mockClear();
  expect(
    (await nativeAttachmentRequest({ _tag: "copyTaskId", task: "task\nnext" }))
      ._tag,
  ).toBe("error");
  expect(writeText.mock.calls).toEqual([]);
});
it("rejects 10,000 UTF-16 units without touching the clipboard", async () => {
  writeText.mockClear();
  expect(
    (
      await nativeAttachmentRequest({
        _tag: "copyTaskId",
        task: "a".repeat(10000),
      })
    )._tag,
  ).toBe("error");
  expect(writeText.mock.calls).toEqual([]);
});
it("rejects a non-string without touching the clipboard", async () => {
  writeText.mockClear();
  expect(
    (await nativeAttachmentRequest({ _tag: "copyTaskId", task: 42 }))._tag,
  ).toBe("error");
  expect(writeText.mock.calls).toEqual([]);
});

it("rejects Unicode format characters without touching the clipboard", async () => {
  for (const task of [
    "6aa2647d-\u202e1234",
    "6aa2647d-\u20661234",
    "6aa2647d-\u200b1234",
  ]) {
    writeText.mockClear();
    expect(await nativeAttachmentRequest({ _tag: "copyTaskId", task })).toEqual(
      {
        _tag: "error",
        message:
          "Task id must be at most 128 UTF-16 units and contain no control characters or format characters.",
      },
    );
    expect(writeText.mock.calls).toEqual([]);
  }
});

it("uses UTF-16 units at the boundary and rejects each control range", async () => {
  writeText.mockClear();
  expect(
    await nativeAttachmentRequest({
      _tag: "copyTaskId",
      task: "x".repeat(128),
    }),
  ).toEqual({ _tag: "ok" });
  expect(writeText.mock.calls).toEqual([["x".repeat(128)]]);
  for (const task of [
    "x".repeat(129),
    "😀".repeat(65),
    "",
    "a\u0000",
    "a\u001f",
    "a\u007f",
    "a\u0080",
    "a\u009f",
    "a\u2028",
    "a\u2029",
    "a\n",
  ]) {
    writeText.mockClear();
    expect(
      (await nativeAttachmentRequest({ _tag: "copyTaskId", task }))._tag,
    ).toBe("error");
    expect(writeText.mock.calls).toEqual([]);
  }
});
