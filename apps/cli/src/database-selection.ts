import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CommandError } from "@todo/domain/commands";
import { Schema } from "effect";

export const WriteMode = Schema.Literals(["automatic", "direct", "server"]);
export type WriteMode = typeof WriteMode.Type;
export const CliConfig = Schema.Struct({
  db_path: Schema.optionalKey(Schema.String),
  write_mode: Schema.optionalKey(Schema.Unknown),
});
export const loadConfig = () => {
  const file = join(homedir(), ".todo-cli", "config.json");
  const config = existsSync(file)
    ? Schema.decodeUnknownSync(CliConfig)(
        JSON.parse(readFileSync(file, "utf8")),
      )
    : {};
  if (
    config.write_mode !== undefined &&
    !Schema.is(WriteMode)(config.write_mode)
  )
    throw new CommandError(
      2,
      "invalid_args",
      "write-mode must be automatic, direct or server",
    );
  return config;
};

export const writeMode = (
  direct: boolean,
  requireServer: boolean,
): WriteMode => {
  if (direct && requireServer)
    throw new CommandError(
      2,
      "invalid_args",
      "--direct and --require-server are mutually exclusive",
    );
  const configured = loadConfig().write_mode;
  return direct
    ? "direct"
    : requireServer
      ? "server"
      : Schema.decodeUnknownSync(WriteMode)(configured ?? "automatic");
};

export const selectDatabase = (db: string) =>
  db ||
  process.env.TODO_DB ||
  loadConfig().db_path ||
  join(homedir(), ".todo-cli", "todo.db");

export const routingDescription =
  "Global --direct and --require-server are mutually exclusive and override config write-mode, which overrides the default automatic mode. Set with todo config set write-mode automatic|direct|server. Reads, init and reset-passphrase stay direct in every mode. This slice keeps production commands direct until protocol 2 and durable auth-denial handling are reviewed; server mode and --require-server refuse writing commands even when a server is proven, because no command is routable yet. Automatic and direct mode both write directly now. Every writing command that reaches the store sends one best-effort nudge on success, refusal or dry run to a proven server, including in lasting direct mode; a needless nudge only causes an empty pass (discovery at most 50 ms, nudge at most 50 ms). Write discovery uses only the selected database's private record, never --server or TODO_SERVER_URL. No automatic retry after write_outcome_unknown (exit 1).";
