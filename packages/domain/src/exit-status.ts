import { Effect, Schema } from "effect";

const statuses = [
  { exit_code: 0, exit_meaning: "success" },
  { exit_code: 1, exit_meaning: "runtime failure" },
  { exit_code: 2, exit_meaning: "validation or usage" },
  { exit_code: 3, exit_meaning: "not found or auth missing" },
  { exit_code: 4, exit_meaning: "Conflict" },
] as const;
export type ExitCode = (typeof statuses)[number]["exit_code"];
export const exitStatus = <C extends ExitCode>(code: C) => statuses[code];
export const exitStatusFields = <C extends ExitCode>(code: C) => ({
  exit_code: Schema.Literal(code).pipe(
    Schema.withConstructorDefault(Effect.succeed(code)),
  ),
  exit_meaning: Schema.Literal<(typeof statuses)[C]["exit_meaning"]>(
    exitStatus(code).exit_meaning,
  ).pipe(
    Schema.withConstructorDefault(
      Effect.succeed(exitStatus(code).exit_meaning),
    ),
  ),
});

export const ExitStatus = Schema.Union([
  Schema.Struct(exitStatusFields(0)),
  Schema.Struct(exitStatusFields(1)),
  Schema.Struct(exitStatusFields(2)),
  Schema.Struct(exitStatusFields(3)),
  Schema.Struct(exitStatusFields(4)),
]);
