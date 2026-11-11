import {
  DiagnosticEvent,
  DiagnosticObservation,
  DiagnosticsSnapshot,
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
