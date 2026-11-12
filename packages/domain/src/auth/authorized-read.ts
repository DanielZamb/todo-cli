import type { ProfileId } from "../ids.ts";
import type { AccessScope, CredentialInfo } from "./model.ts";

export const freezeRead = <A>(value: A): Readonly<A> => {
  if (value !== null && typeof value === "object")
    for (const child of Object.values(value)) freezeRead(child);
  return Object.freeze(value);
};

class ReadAuthority<
  Kind extends "read" | "profiles" | "owner",
  Profile,
  Fields,
> {
  readonly #scope: AccessScope;
  readonly #credential: string;
  constructor(
    readonly kind: Kind,
    readonly profile: Profile,
    credential: string,
    readonly fields: Readonly<Fields>,
    info: CredentialInfo,
  ) {
    this.#scope = info.scope;
    this.#credential = credential;
    freezeRead(fields);
    Object.freeze(this);
  }
  get scope() {
    return this.#scope;
  }
  get credential() {
    return this.#credential;
  }
}

export type AuthorizedRead<Fields = unknown> = ReadAuthority<
  "read",
  ProfileId,
  Fields
>;
export type AuthorizedProfiles<Fields = unknown> = ReadAuthority<
  "profiles",
  null,
  Fields
>;
export type AuthorizedOwnerRead<Fields = unknown> = ReadAuthority<
  "owner",
  null,
  Fields
>;

export const bindRead = <Fields>(
  profile: ProfileId,
  credential: string,
  fields: Fields,
  info: CredentialInfo,
): AuthorizedRead<Fields> =>
  new ReadAuthority("read", profile, credential, fields, info);
export const bindProfiles = <Fields>(
  credential: string,
  fields: Fields,
  info: CredentialInfo,
): AuthorizedProfiles<Fields> =>
  new ReadAuthority("profiles", null, credential, fields, info);
export const bindOwnerRead = <Fields>(
  credential: string,
  fields: Fields,
  info: CredentialInfo,
): AuthorizedOwnerRead<Fields> =>
  new ReadAuthority("owner", null, credential, fields, info);
