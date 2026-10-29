import { Schema } from "effect";

export const AttachmentId = Schema.NonEmptyString.pipe(
  Schema.brand("AttachmentId"),
);
export type AttachmentId = typeof AttachmentId.Type;

export const ProfileId = Schema.NonEmptyString.pipe(Schema.brand("ProfileId"));
export type ProfileId = typeof ProfileId.Type;

export const ProjectId = Schema.NonEmptyString.pipe(Schema.brand("ProjectId"));
export type ProjectId = typeof ProjectId.Type;

export const TaskId = Schema.NonEmptyString.pipe(Schema.brand("TaskId"));
export type TaskId = typeof TaskId.Type;

export const TagId = Schema.NonEmptyString.pipe(Schema.brand("TagId"));
export type TagId = typeof TagId.Type;

export const SeriesId = Schema.NonEmptyString.pipe(Schema.brand("SeriesId"));
export type SeriesId = typeof SeriesId.Type;

export const OccurrenceId = Schema.NonEmptyString.pipe(
  Schema.brand("OccurrenceId"),
);
export type OccurrenceId = typeof OccurrenceId.Type;

export const ActorId = Schema.NonEmptyString.pipe(Schema.brand("ActorId"));
export type ActorId = typeof ActorId.Type;

export const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(
  Schema.brand("Version"),
);
export type Version = typeof Version.Type;

export const Sequence = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).pipe(
  Schema.brand("Sequence"),
);
export type Sequence = typeof Sequence.Type;
