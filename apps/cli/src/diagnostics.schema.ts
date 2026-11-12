import {
  DiagnosticEvent,
  DiagnosticObservation,
  DiagnosticsSnapshot,
  RecordingBatch,
  RecordingCompare,
  RecordingExport,
  RecordingImportResult,
  RecordingRunList,
  RecordingShow,
} from "@todo/domain";
import { registerCommandSchema } from "./schema.ts";

registerCommandSchema("diagnostics", DiagnosticsSnapshot);
registerCommandSchema("top", DiagnosticsSnapshot);

registerCommandSchema("diagnostics event", DiagnosticEvent, "input");
registerCommandSchema(
  "diagnostics observation",
  DiagnosticObservation,
  "input",
);

registerCommandSchema("diagnostics runs", RecordingRunList);
registerCommandSchema("diagnostics show", RecordingShow);
registerCommandSchema("diagnostics export", RecordingExport);
registerCommandSchema("diagnostics compare", RecordingCompare);
registerCommandSchema("diagnostics import", RecordingImportResult);
registerCommandSchema("diagnostics batch", RecordingBatch, "input");
