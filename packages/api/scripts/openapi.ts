import { Effect } from "effect";
import { OpenApi } from "effect/http-api";
import { TodoApi } from "../src/index.ts";

await Effect.runPromise(
  Effect.tryPromise(() =>
    Bun.write(
      new URL("../openapi.json", import.meta.url),
      `${JSON.stringify(OpenApi.fromApi(TodoApi), null, 2)}\n`,
    ),
  ),
);
