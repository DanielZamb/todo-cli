import { Schema } from "effect";

export const recordingRefusals = {
  action_conflict:
    "Recording action phases conflict; use a new action id for each interaction.",
  sequence_conflict:
    "Recording sequence conflicts; resend the original data or begin a new run.",
  batch_conflict:
    "Recording batch conflicts; resend the original batch or use a new batch id.",
  run_conflict: "Recording run metadata conflicts; begin a new run.",
  missing_run: "Recording unavailable: the run is missing or expired.",
  expired_cursor: "Recording export cursor expired; restart the export.",
  missing_comparison:
    "Recording comparison refused: comparison conditions are missing.",
  unknown_build: "Recording comparison refused: build identity is unknown.",
  unknown_contract:
    "Recording comparison refused: contract identity is unknown.",
  unknown_configuration:
    "Recording comparison refused: build configuration is unknown.",
  unknown_render_stage:
    "Recording comparison refused: render capability is unknown.",
  app_mismatch: "Recording comparison refused: app differs.",
  contract_mismatch: "Recording comparison refused: contract differs.",
  fixture_mismatch: "Recording comparison refused: fixture differs.",
  script_mismatch: "Recording comparison refused: script differs.",
  environment_mismatch: "Recording comparison refused: environment differs.",
  configuration_mismatch:
    "Recording comparison refused: build configuration differs.",
  render_stage_mismatch:
    "Recording comparison refused: render capability differs.",
  concurrency_mismatch: "Recording comparison refused: concurrency differs.",
} as const;
export class RecordingRefusal extends Error {
  constructor(readonly reason: keyof typeof recordingRefusals) {
    super(recordingRefusals[reason]);
  }
}
const messageSchema = Schema.Struct({ message: Schema.String });
export function recordingRefusalMessage(body: unknown) {
  const parsed = Schema.decodeUnknownOption(messageSchema)(body);
  return parsed._tag === "Some"
    ? Object.values(recordingRefusals).find(
        (message) => message === parsed.value.message,
      )
    : undefined;
}
