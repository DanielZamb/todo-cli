import { DiagnosticRecorder } from "@todo/domain";
import { Schema } from "effect";

export const DiagnosticFaultPoint = Schema.Literals([
  "none",
  "configure",
  "root",
  "authorize",
  "serverTiming",
  "snapshot",
  "start-entry",
  "end-entry",
  "start-response_handoff",
  "end-response_handoff",
  "start-handler",
  "end-handler",
  "start-job",
  "end-job",
  "start-command",
  "end-command",
  "commitReceipt",
  "delivery",
  "awaitTransport",
  "transport",
  "releaseStream",
]);
export type DiagnosticFaultPoint = typeof DiagnosticFaultPoint.Type;

export function installDiagnosticFault(point: DiagnosticFaultPoint) {
  const prototype = DiagnosticRecorder.prototype;
  const original = {
    configure: prototype.configure,
    root: prototype.root,
    start: prototype.start,
    end: prototype.end,
    authorize: prototype.authorize,
    serverTiming: prototype.serverTiming,
    snapshot: prototype.snapshot,
    commitReceipt: prototype.commitReceipt,
    delivery: prototype.delivery,
    awaitTransport: prototype.awaitTransport,
    transport: prototype.transport,
    releaseStream: prototype.releaseStream,
  };
  let armed = false;
  let hits = 0;
  let releases = 0;
  const seen = new Set<DiagnosticRecorder>();
  function wrap<Args extends unknown[], Result>(
    method: (...args: Args) => Result,
    fails: (args: Args) => boolean,
  ) {
    return function (this: DiagnosticRecorder, ...args: Args): Result {
      seen.add(this);
      if (armed && fails(args)) {
        hits++;
        throw new Error("private recorder fault");
      }
      return method.apply(this, args);
    };
  }
  prototype.configure = wrap(original.configure, () => point === "configure");
  prototype.root = wrap(original.root, () => point === "root");
  prototype.start = wrap(
    original.start,
    (args) => point === `start-${args[1]}`,
  );
  prototype.end = wrap(
    original.end,
    (args) => point === `end-${args[0]?.stage}`,
  );
  prototype.authorize = wrap(original.authorize, () => point === "authorize");
  prototype.serverTiming = wrap(
    original.serverTiming,
    () => point === "serverTiming",
  );
  prototype.snapshot = wrap(original.snapshot, () => point === "snapshot");
  prototype.commitReceipt = wrap(
    original.commitReceipt,
    () => point === "commitReceipt",
  );
  prototype.delivery = wrap(original.delivery, () => point === "delivery");
  prototype.awaitTransport = wrap(
    original.awaitTransport,
    () => point === "awaitTransport",
  );
  prototype.transport = wrap(original.transport, () => point === "transport");
  prototype.releaseStream = wrap(original.releaseStream, () => {
    releases++;
    return point === "releaseStream";
  });
  return {
    arm: () => {
      armed = true;
    },
    disarm: () => {
      armed = false;
    },
    hits: () => hits,
    releases: () => releases,
    inspect: (recorder: DiagnosticRecorder) => original.snapshot.call(recorder),
    observations: () =>
      [...seen].map((recorder) => original.snapshot.call(recorder)),
    restore: () => {
      Object.assign(prototype, original);
    },
  };
}
