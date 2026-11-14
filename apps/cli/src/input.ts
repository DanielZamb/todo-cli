import { CommandError } from "@todo/domain/commands";
import { Effect } from "effect";

export const decodeInput = <A>(decode: () => A, recovery: string) =>
  Effect.try({
    try: decode,
    catch: () => new CommandError(2, "invalid_args", recovery),
  });
