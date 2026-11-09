import { Schema } from "effect";
import { AttachmentId, TaskId } from "./ids.ts";
import { Instant, TaskTime } from "./time.ts";

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
  searchText: 200,
  reason: 1_000,
  passphrase: 1_024,
  tagsPerTask: 100,
  attachmentsPerTask: 100,
  exdates: 1_000,
  batchItems: 1_000,
  closeMissingCandidates: 10_000,
  time: 128,
  instant: 40,
  id: 200,
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
// Tag names split on commas and are stored lowercased, which can lengthen
// them, so each stored part is checked too.
const TagNameInput = NameInput.check(
  Schema.makeFilter(
    (value) =>
      value
        .split(",")
        .every(
          (part) => part.trim().toLowerCase().length <= inputLimits.name,
        ) || `Tag names have at most ${inputLimits.name} characters.`,
  ),
);
export const TagNamesInput = Schema.Array(TagNameInput).check(
  items(inputLimits.tagsPerTask),
);
// Ids a client names. Stored ids are unlimited; real ones are short.
export const TaskIdInput = TaskId.check(Schema.isMaxLength(inputLimits.id));
export const AttachmentIdInput = AttachmentId.check(
  Schema.isMaxLength(inputLimits.id),
);
// The stored time schemas accept any number of fractional-second digits.
export const InstantInput = Instant.check(
  Schema.isMaxLength(inputLimits.instant),
);
export const TaskTimeInput = TaskTime.check(
  Schema.makeFilter(
    (value) =>
      (JSON.stringify(value)?.length ?? 0) <= inputLimits.time ||
      `A time must be at most ${inputLimits.time} characters of JSON.`,
  ),
);
export const limitedItems = <S extends Schema.Top>(
  item: S,
  maximum: number = inputLimits.batchItems,
) => Schema.Array(item).check(items(maximum));

// A rejected attempt is recorded with what was received (ADR-0007), so an
// input refused for being too large must not be stored in full. Anything
// over this many characters of JSON is replaced by its size alone. No
// preview is kept: Purge could not find a Task's content inside one.
export const rejectedInputCharacters = 32_768;
export const rejectedInputForHistory = (value: unknown): unknown => {
  const text = JSON.stringify(value) ?? "null";
  return text.length <= rejectedInputCharacters
    ? value
    : { truncated: true, characters: text.length };
};
