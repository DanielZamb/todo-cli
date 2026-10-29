import { DiagnosticsSnapshot } from "@todo/domain";
import { registerCommandSchema } from "./schema.ts";

registerCommandSchema("diagnostics", DiagnosticsSnapshot);
registerCommandSchema("top", DiagnosticsSnapshot);
