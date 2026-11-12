import { DiagnosticRecordings } from "../../src/store/diagnostic-recordings.ts";

const store = await DiagnosticRecordings.open(process.argv[2] ?? "");
process.stdout.write(`${store.status().loss.storage_failures}\n`);
setInterval(() => {}, 1000);
