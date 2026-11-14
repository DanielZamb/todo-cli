import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import {
  dependencyBatchFailure,
  dependencyFailureText,
  isDependencyConflict,
} from "../src/dependency-presentation.ts";
import { errorReply } from "../src/error-reply.ts";
import { taskHttpClient } from "../src/http-client.ts";
import type { Request } from "../src/protocol.ts";
import { taskRequest } from "../src/task-client.ts";
import { dependencyTask } from "./fixtures/dependencies.ts";
import {
  dependencyAgentMessage,
  dependencyRefusals,
} from "./fixtures/dependency-errors.ts";

for (const { error, human } of dependencyRefusals)
  it(`projects direct and nested ${error.code} without either agent message`, () => {
    for (const input of [
      error,
      {
        code: "invalid_args",
        message: dependencyAgentMessage,
        exit_code: 2,
        exit_meaning: "validation or usage",
        details: { dependency_error: error },
      },
    ]) {
      const failure = dependencyBatchFailure(input);
      expect(failure.message).toBe(human);
      expect(failure.exit_detail).toBe("error 2 - validation or usage");
      expect(failure.dependency).toEqual(error);
      const text = dependencyFailureText(input, "add", [
        dependencyTask("root"),
        dependencyTask("candidate"),
      ]);
      expect(text).toContain(human);
      expect(text).not.toContain("AGENT ONLY");
      expect(text.endsWith("error 2 - validation or usage")).toBe(true);
    }
  });

for (const code of ["occ_conflict"])
  it(`uses safe Conflict recovery for ${code}`, () => {
    const error = {
      code,
      message: dependencyAgentMessage,
      exit_code: 4,
      exit_meaning: "Conflict",
    };
    expect(isDependencyConflict(code)).toBe(true);
    expect(dependencyBatchFailure(error)).toEqual({
      message:
        "This Task changed. Reload its Dependencies before trying again.",
      exit_detail: "error 4 - Conflict",
    });
    expect(dependencyFailureText(error, "add")).toBe(
      "This Task changed. Reload its Dependencies before trying again.\nerror 4 - Conflict",
    );
  });

it("keeps an unknown item code on the generic error path", () => {
  expect(isDependencyConflict("conflict")).toBe(false);
  expect(
    dependencyBatchFailure({
      code: "conflict",
      message: dependencyAgentMessage,
      exit_code: 4,
      exit_meaning: "Conflict",
    }),
  ).toEqual({
    message: "Couldn't update Dependencies. Try again.",
    exit_detail: "error 4 - Conflict",
  });
});

it("rejects missing pairs and malformed nested witnesses instead of displaying agent copy", () => {
  for (const error of [
    { code: "occ_conflict", message: dependencyAgentMessage },
    {
      code: "invalid_args",
      message: dependencyAgentMessage,
      exit_code: 2,
      exit_meaning: "validation or usage",
      details: {
        dependency_error: { code: "blocked", message: dependencyAgentMessage },
      },
    },
  ])
    expect(dependencyBatchFailure(error)).toEqual({
      message:
        "Todo returned an incompatible Dependency response. Reload after updating the server.",
    });
});
const dependencyRequest: Request = {
  _tag: "depend",
  profile: dependencyTask("root").profile_id,
  task: dependencyTask("root").id,
  payload: {
    blocker_id: dependencyTask("candidate").id,
    from_version: dependencyTask("root").row_version,
  },
};
for (const [_tag, exit_code, exit_meaning, human] of [
  [
    "BadRequest",
    2,
    "validation or usage",
    "Check this Dependency and try again.",
  ],
  [
    "InvalidTask",
    2,
    "validation or usage",
    "Check this Dependency and try again.",
  ],
  [
    "Forbidden",
    3,
    "not found or auth missing",
    "Dependencies are read-only with this access.",
  ],
  ["NotFound", 3, "not found or auth missing", "Task not found."],
  [
    "InternalError",
    1,
    "runtime failure",
    "Couldn't update Dependencies. Try again.",
  ],
])
  it(`projects typed ${_tag} at the Dependency request boundary without agent text`, () => {
    expect(
      errorReply(
        { _tag, message: dependencyAgentMessage, exit_code, exit_meaning },
        dependencyRequest,
      ),
    ).toEqual({
      _tag: "error",
      message: human,
      ...(_tag === "NotFound" ? { code: "not_found" } : {}),
      exit_detail: `error ${exit_code} - ${exit_meaning}`,
    });
  });
it("distinguishes malformed public pairs from a transport failure without fabricating a pair", () => {
  expect(
    errorReply(
      { _tag: "BadRequest", message: dependencyAgentMessage },
      dependencyRequest,
    ),
  ).toEqual({
    _tag: "error",
    message:
      "Todo returned an incompatible Dependency response. Reload after updating the server.",
  });
  expect(
    errorReply(new Error(dependencyAgentMessage), dependencyRequest),
  ).toEqual({
    _tag: "error",
    message: "Couldn't update Dependencies. Try again.",
  });
});
for (const status of [200, 502])
  it(`treats a real HttpApi rejection at ${status} as compatibility failure without exposing its route`, async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        new Response(dependencyAgentMessage, {
          status,
          headers: { "content-type": "text/plain" },
        }),
    });
    const graph: Request = {
      _tag: "graph",
      profile: dependencyRequest.profile,
      task: dependencyRequest.task,
    };
    try {
      const run = <A, E>(
        effect: Effect.Effect<
          A,
          E,
          import("effect/http").HttpClient.HttpClient
        >,
      ) =>
        Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
      const client = await run(
        taskHttpClient(server.url.origin, () => undefined),
      );
      const reply = await run(
        taskRequest(client, graph).pipe(
          Effect.catch((error) => Effect.succeed(errorReply(error, graph))),
        ),
      );
      expect(reply).toEqual({
        _tag: "error",
        message:
          "Todo returned an incompatible Dependency response. Reload after updating the server.",
      });
    } finally {
      server.stop(true);
    }
  });
