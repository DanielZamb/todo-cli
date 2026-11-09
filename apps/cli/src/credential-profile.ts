import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CommandError } from "@todo/domain/commands";
import { Option, Schema } from "effect";

export type CredentialSelection = {
  readonly profile: string;
  readonly credentialProfile: Option.Option<string>;
};

export const credentialSelectionDescription =
  "Global --credential-profile <name> selects the stored credential file for authenticated commands and overrides --profile for credential selection. Without it, --profile (default default) selects the credential as before. The target Profile remains --profile. Discovery uses the chosen credential's authorization. No other credential file is tried. Login stores and logout reads/removes the chosen credential file. Schema and help remain auth-free.";

export const credentialProfileName = (selection: CredentialSelection) => {
  const name = Option.getOrElse(
    selection.credentialProfile,
    () => selection.profile,
  );
  if (!name)
    throw new CommandError(
      2,
      "invalid_args",
      "--credential-profile must name a credential Profile",
    );
  return name;
};

export const credentialFile = (name: string) =>
  join(homedir(), ".todo-cli", `session_${encodeURIComponent(name)}.json`);

export const loadCredential = (selection: CredentialSelection) => {
  const name = credentialProfileName(selection);
  try {
    return Schema.decodeUnknownSync(
      Schema.Struct({
        token: Schema.NonEmptyString.check(Schema.isPattern(/^\S+$/)),
      }),
    )(JSON.parse(readFileSync(credentialFile(name), "utf8"))).token;
  } catch {
    throw new CommandError(
      3,
      "auth_required",
      Option.isSome(selection.credentialProfile)
        ? `No stored credential for credential Profile ${JSON.stringify(name)}. Run todo login with --credential-profile.`
        : "run todo login",
    );
  }
};
