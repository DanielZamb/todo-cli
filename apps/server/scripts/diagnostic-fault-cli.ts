import { writeFileSync } from "node:fs";
import { Schema } from "effect";
import {
  DiagnosticFaultPoint,
  installDiagnosticFault,
} from "./diagnostic-fault-recorder.ts";

const point = Schema.decodeUnknownSync(DiagnosticFaultPoint)(
  process.env.DIAG_PROBE_POINT ?? "none",
);
const evidence = process.env.DIAG_PROBE_EVIDENCE;
if (!evidence)
  throw new Error("The compiled fault CLI requires its evidence file");
const fault = installDiagnosticFault(point);
fault.arm();
process.on("exit", () => {
  writeFileSync(
    evidence,
    JSON.stringify(
      { point, hits: fault.hits(), observations: fault.observations() },
      null,
      2,
    ),
  );
});
await import("../../cli/src/main.ts");
