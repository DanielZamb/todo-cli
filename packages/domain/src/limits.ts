import { Schema } from "effect";

// Size limits on what a client may submit. Every accepted value is kept
// forever in History and copied into every Snapshot, so a credential holder
// must not be able to grow the database without bound. Stored entities are
// not limited, so rows written before these limits still decode.
export const inputLimits = {
  title: 1_000,
  description: 100_000,
  name: 200,
  externalId: 1_000,
  path: 4_096,
  url: 8_192,
  rrule: 1_000,
  quickAdd: 2_000,
  reason: 1_000,
  passphrase: 1_024,
  tagsPerTask: 100,
  attachmentsPerTask: 100,
  exdates: 1_000,
  batchItems: 1_000,
  closeMissingCandidates: 10_000,
} as const;

const characters = (maximum: number) => Schema.isMaxLength(maximum);
const items = (maximum: number) => Schema.isMaxLength(maximum);

export const TitleInput = Schema.NonEmptyString.check(
  Schema.isPattern(/\S/),
  characters(inputLimits.title),
);
export const DescriptionInput = Schema.String.check(
  characters(inputLimits.description),
);
export const NameInput = Schema.String.check(characters(inputLimits.name));
export const NonEmptyNameInput = Schema.NonEmptyString.check(
  characters(inputLimits.name),
);
export const ExternalIdInput = Schema.NonEmptyString.check(
  Schema.isPattern(/\S/),
  characters(inputLimits.externalId),
);
export const TagNamesInput = Schema.Array(NameInput).check(
  items(inputLimits.tagsPerTask),
);
export const limitedItems = <S extends Schema.Top>(
  item: S,
  maximum: number = inputLimits.batchItems,
) => Schema.Array(item).check(items(maximum));

// A rejected attempt is recorded with what was received (ADR-0007), so an
// input refused for being too large must not be stored in full. Anything
// over this many characters of JSON is replaced by its size and a preview.
export const rejectedInputCharacters = 32_768;
const previewCharacters = 2_000;
export const rejectedInputForHistory = (value: unknown): unknown => {
  const text = JSON.stringify(value) ?? "null";
  return text.length <= rejectedInputCharacters
    ? value
    : {
        truncated: true,
        characters: text.length,
        preview: text.slice(0, previewCharacters),
      };
};
