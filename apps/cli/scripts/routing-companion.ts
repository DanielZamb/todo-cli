import { readFileSync } from "node:fs";
import {
  BackendCommand,
  type BackendReply,
  executeBackendCommand,
} from "@todo/domain/backend-command";
import { CommandError, nowInstant } from "@todo/domain/commands";
import {
  ErrorResponse,
  renderError,
  renderTask,
} from "@todo/domain/presentation";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { withAttachmentStatus } from "../src/attachments.ts";
import { discoverServer } from "../src/server-connection.ts";

const NativeDate = Date;
const fixed = NativeDate.parse("2026-11-12T12:00:00Z");
class FixtureDate extends NativeDate {
  constructor(value: string | number = fixed) {
    super(value);
  }
  static override now() {
    return fixed;
  }
}
Object.defineProperty(globalThis, "Date", { value: FixtureDate });
let identifier = 0;
Object.defineProperty(globalThis.crypto, "randomUUID", {
  value: () =>
    `00000000-0000-4000-8000-${String(++identifier).padStart(12, "0")}`,
});

const [mode, path, file, credential, format = "json"] = process.argv.slice(2);
if (mode === "server") {
  process.argv = process.argv.slice(0, 2);
  await import("../../server/src/main.ts");
} else {
  if (!path || !file || !credential)
    throw new Error(
      "Usage: routing-companion direct|server-command database input credential [json|md|table]",
    );
  const command = Schema.decodeUnknownSync(BackendCommand)(
    JSON.parse(readFileSync(file, "utf8")),
  );
  const reply =
    mode === "direct"
      ? await Effect.runPromise(
          Effect.acquireUseRelease(
            openStore({ path }),
            (store) => executeBackendCommand(store, credential, command),
            (store) => store.close(),
          ),
        )
      : await (async () => {
          const server = await discoverServer(path, 1000);
          if (!server) throw new Error("Companion server not proven");
          try {
            return await server.run(command, credential);
          } finally {
            server.close();
          }
        })().catch(
          (
            error: unknown,
          ): Extract<typeof BackendReply.Type, { outcome: "failure" }> => {
            if (
              !(error instanceof CommandError) ||
              error.code !== "server_command_not_run"
            )
              throw error;
            return {
              outcome: "failure",
              error: Schema.decodeUnknownSync(ErrorResponse)(
                JSON.parse(
                  renderError(
                    error.exit,
                    error.code,
                    error.message,
                    "json",
                    nowInstant(),
                  ),
                ),
              ),
            };
          },
        );
  if (reply.outcome === "success") {
    if (format !== "md" && format !== "json" && format !== "table")
      throw new Error("Invalid format");
    process.stdout.write(
      renderTask(
        withAttachmentStatus(
          reply.result.view,
          reply.result.task.attachments ?? [],
        ),
        format,
        nowInstant(),
        reply.result.dependency_warnings,
      ),
    );
  } else if (reply.outcome === "failure") {
    if (format !== "md" && format !== "json" && format !== "table")
      throw new Error("Invalid format");
    const failure = reply.error;
    const latest =
      failure.details && "latest" in failure.details
        ? failure.details.latest
        : undefined;
    (format === "json" ? process.stdout : process.stderr).write(
      renderError(
        failure.exit_code,
        failure.code,
        failure.message,
        format,
        failure.generated_at,
        latest,
        latest ? undefined : failure.details,
      ),
    );
    process.exitCode = reply.error.exit_code;
  }
}
