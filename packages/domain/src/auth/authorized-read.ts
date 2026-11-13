export type {
  AuthorizedOwnerRead,
  AuthorizedProfiles,
  AuthorizedRead,
  AuthorizedTerminalRead,
} from "./auth.ts";
export {
  checkedRead,
  consumeTerminalRead,
  freezeRead,
  readAuthority,
} from "./auth.ts";

import { Schema } from "effect";
import { ProfileId } from "../ids.ts";

export const readRequest = (
  selection: { readonly credential: string } & (
    | { readonly kind: "read"; readonly profile: ProfileId }
    | { readonly kind: "absent"; readonly requested: string }
  ),
) =>
  Object.freeze({
    credential: selection.credential,
    profile: Schema.decodeUnknownSync(ProfileId)(
      selection.kind === "read" ? selection.profile : selection.requested,
    ),
  });
