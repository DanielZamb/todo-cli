import { readFile, stat } from "node:fs/promises";
import {
  DiagnosticRunId,
  type RecordingBatch,
  RecordingCompare,
  RecordingExport,
  RecordingReceipt,
  RecordingRunList,
  RecordingShow,
  type RecordingStatus,
  validateRecordingBatch,
} from "@todo/domain";
import { CommandError } from "@todo/domain/commands";
import { Effect, Schema } from "effect";

const invalid = () =>
  new CommandError(
    2,
    "invalid_args",
    "Invalid recording arguments or metadata; use todo man diagnostics",
  );
const request = <S extends Schema.ConstraintDecoder<unknown>>(
  server: string,
  credential: string,
  path: string,
  schema: S,
  body?: typeof RecordingBatch.Type,
) =>
  Effect.tryPromise({
    try: async (signal) => {
      const url = new URL(server);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw invalid();
      if (url.hostname === "localhost") url.hostname = "127.0.0.1";
      const response = await fetch(new URL(path, url), {
        method: body ? "POST" : "GET",
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
          "X-Todo-Client": "cli",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
      });
      if ([401, 403].includes(response.status))
        throw new CommandError(
          3,
          "auth_required",
          "Recordings require an active owner Session",
        );
      if (response.status === 400) throw invalid();
      if (!response.ok)
        throw new CommandError(1, "server_error", "Recording request failed");
      return Schema.decodeUnknownSync(schema)(await response.json());
    },
    catch: (error) =>
      error instanceof CommandError
        ? error
        : new CommandError(
            1,
            "recording_unavailable",
            "Cannot read or write recording; check the local server",
          ),
  });
const runId = (value: string) =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(DiagnosticRunId)(value),
    catch: invalid,
  });
const cursor = (value: string) => {
  const n = Number(value || 0);
  if (!Number.isSafeInteger(n) || n < 0) throw invalid();
  return n;
};
export const recordingCommand = (
  name: string,
  input: {
    server: string;
    run: string;
    before: string;
    after: string;
    file: string;
    dryRun: boolean;
    cursor: string;
    ndjson: boolean;
  },
  credential: string,
  emit: (value: unknown, ndjson: boolean) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    if (name === "import") {
      const batches = yield* Effect.tryPromise({
        try: async () => {
          if ((await stat(input.file)).size > 64 * 1024 * 1024) throw invalid();
          const text = await readFile(input.file, "utf8");
          let values: unknown[];
          try {
            values = [JSON.parse(text)];
          } catch {
            values = text
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line));
          }
          return values
            .flatMap((value) => {
              const page = Schema.decodeUnknownOption(RecordingExport, {
                onExcessProperty: "error",
              })(value);
              return page._tag === "Some"
                ? [...page.value.batches]
                : [validateRecordingBatch(value)];
            })
            .map(validateRecordingBatch);
        },
        catch: invalid,
      });
      let status: typeof RecordingStatus.Type | undefined;
      let accepted = 0,
        events = 0;
      for (const batch of batches) {
        const receipt = yield* request(
          input.server,
          credential,
          `/diagnostics/profiler/ingest${input.dryRun ? "?dry_run=true" : ""}`,
          RecordingReceipt,
          batch,
        );
        if (!receipt.accepted)
          return yield* Effect.fail(
            new CommandError(
              1,
              "recording_unavailable",
              `Recording queue or storage unavailable after ${accepted} batches and ${events} events`,
            ),
          );
        status = receipt.status;
        accepted++;
        events += batch.events.length;
      }
      if (!status) return yield* Effect.fail(invalid());
      return yield* emit(
        {
          status,
          generated_at: new Date().toISOString(),
          dry_run: input.dryRun,
          accepted_batches: accepted,
          events,
        },
        input.ndjson,
      );
    }
    if (name === "compare")
      return yield* emit(
        yield* request(
          input.server,
          credential,
          `/diagnostics/profiler/compare?before=${yield* runId(input.before)}&after=${yield* runId(input.after)}`,
          RecordingCompare,
        ),
        input.ndjson,
      );
    if (name === "runs") {
      const offset = yield* Effect.try({
        try: () => cursor(input.cursor),
        catch: invalid,
      });
      return yield* emit(
        yield* request(
          input.server,
          credential,
          `/diagnostics/profiler/runs?cursor=${offset}`,
          RecordingRunList,
        ),
        input.ndjson,
      );
    }
    const id = yield* runId(input.run);
    if (name === "show")
      return yield* emit(
        yield* request(
          input.server,
          credential,
          `/diagnostics/profiler/runs/${id}`,
          RecordingShow,
        ),
        input.ndjson,
      );
    let offset = input.cursor;
    for (;;) {
      if (offset) yield* runId(offset);
      const page = yield* request(
        input.server,
        credential,
        `/diagnostics/profiler/runs/${id}/export${offset ? `?cursor=${offset}` : ""}`,
        RecordingExport,
      );
      yield* emit(page, input.ndjson);
      if (!input.ndjson || page.next_cursor === null) break;
      offset = page.next_cursor;
    }
  });
