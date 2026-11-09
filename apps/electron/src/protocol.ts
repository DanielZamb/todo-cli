import {
  AttachManyItem,
  AttachManyReport,
  AttachManyRequest,
  Attachment,
  AttachTask,
  BatchEditReport,
  BatchEditRequest,
  CreateSeries,
  CreateTask,
  DeleteProfile,
  DetachTask,
  DiagnosticsSnapshot,
  EditSeries,
  EditTask,
  ExpectedVersion,
  ImageMime,
  ImportReport,
  ImportRequest,
  LabelAttachment,
  LookupMatch,
  LookupQuery,
  MoveTask,
  OpLogEntry,
  PlanningView,
  PlanningViewName,
  ProfileDeletionReport,
  ProfileId,
  ProfileSummary,
  ProjectSummary,
  QuickAddDraft,
  QuickAddInput,
  RevertTask,
  Series,
  SnapshotId,
  SnapshotList,
  SnapshotManifest,
  SnapshotRestoreReport,
  TagSummary,
  Task,
  TaskFilters,
  TaskId,
  TaskRead,
  TransitionTask,
  UploadAttachment,
} from "@todo/domain";
import { Schema } from "effect";
import { OutdatedServer } from "./server-compatibility.ts";

export const ViewName = Schema.Union([
  Schema.Literal("tasks"),
  PlanningViewName,
]);
export type ViewName = typeof ViewName.Type;
export const NativeAttachmentRequest = Schema.Union([
  Schema.TaggedStruct("copyTaskId", { task: TaskId }),
  Schema.TaggedStruct("attachmentClipboard", {}),
  Schema.TaggedStruct("pickAttachment", {}),
  Schema.TaggedStruct("pasteAttachment", {}),
  Schema.TaggedStruct("attachmentStatus", { attachment: Attachment }),
  Schema.TaggedStruct("openAttachment", {
    attachment: Attachment,
    action: Schema.Literals(["open", "reveal"]),
  }),
]);
export const Request = Schema.Union([
  Schema.TaggedStruct("diagnostics", {}),
  Schema.TaggedStruct("openDiagnostics", {}),
  Schema.TaggedStruct("snapshots", {}),
  Schema.TaggedStruct("snapshotCreate", { reason: Schema.NonEmptyString }),
  Schema.TaggedStruct("snapshotRestore", {
    id: SnapshotId,
    dryRun: Schema.Boolean,
  }),
  Schema.TaggedStruct("snapshotReveal", { id: SnapshotId }),
  NativeAttachmentRequest,
  Schema.TaggedStruct("attach", {
    profile: ProfileId,
    task: TaskId,
    payload: AttachTask,
  }),
  Schema.TaggedStruct("detach", {
    profile: ProfileId,
    task: TaskId,
    payload: DetachTask,
  }),
  Schema.TaggedStruct("labelAttachment", {
    profile: ProfileId,
    task: TaskId,
    payload: LabelAttachment,
  }),
  Schema.TaggedStruct("uploadAttachment", {
    profile: ProfileId,
    task: TaskId,
    payload: UploadAttachment,
  }),
  Schema.TaggedStruct("batchEdit", {
    profile: ProfileId,
    payload: BatchEditRequest,
  }),
  Schema.TaggedStruct("attachmentTargets", { profile: ProfileId }),
  Schema.TaggedStruct("attachmentBatch", {
    profile: ProfileId,
    payload: AttachManyRequest,
  }),
  Schema.TaggedStruct("attachMany", {
    profile: ProfileId,
    payload: AttachManyItem,
  }),
  Schema.TaggedStruct("importTasks", {
    profile: ProfileId,
    payload: ImportRequest,
  }),
  Schema.TaggedStruct("windowMode", {}),
  Schema.TaggedStruct("setWindowMode", { compact: Schema.Boolean }),
  Schema.TaggedStruct("restore", {}),
  Schema.TaggedStruct("signIn", { passphrase: Schema.NonEmptyString }),
  Schema.TaggedStruct("signOut", {}),
  Schema.TaggedStruct("profiles", {}),
  Schema.TaggedStruct("directory", {}),
  Schema.TaggedStruct("lookup", LookupQuery.fields),
  Schema.TaggedStruct("showTask", { profile: ProfileId, task: TaskId }),
  Schema.TaggedStruct("deleteProfile", {
    profile: ProfileId,
    payload: DeleteProfile,
  }),
  Schema.TaggedStruct("list", {
    profile: ProfileId,
    view: ViewName,
    filters: Schema.optionalKey(TaskFilters),
  }),
  Schema.TaggedStruct("parse", { profile: ProfileId, payload: QuickAddInput }),
  Schema.TaggedStruct("history", { profile: ProfileId, task: TaskId }),
  Schema.TaggedStruct("watch", { profile: ProfileId }),
  Schema.TaggedStruct("create", { profile: ProfileId, payload: CreateTask }),
  Schema.TaggedStruct("edit", {
    profile: ProfileId,
    task: TaskId,
    payload: EditTask,
  }),
  Schema.TaggedStruct("transition", {
    profile: ProfileId,
    task: TaskId,
    payload: TransitionTask,
  }),
  Schema.TaggedStruct("delete", {
    profile: ProfileId,
    task: TaskId,
    query: ExpectedVersion,
  }),
  Schema.TaggedStruct("move", {
    profile: ProfileId,
    task: TaskId,
    payload: MoveTask,
  }),
  Schema.TaggedStruct("copy", {
    profile: ProfileId,
    task: TaskId,
    payload: MoveTask,
  }),
  Schema.TaggedStruct("revert", {
    profile: ProfileId,
    task: TaskId,
    payload: RevertTask,
  }),
  Schema.TaggedStruct("createSeries", {
    profile: ProfileId,
    payload: CreateSeries,
  }),
  Schema.TaggedStruct("editSeries", {
    profile: ProfileId,
    task: TaskId,
    payload: EditSeries,
  }),
  Schema.TaggedStruct("skipOccurrence", {
    profile: ProfileId,
    task: TaskId,
    payload: ExpectedVersion,
  }),
  Schema.TaggedStruct("recurrence", { profile: ProfileId, task: TaskId }),
  Schema.TaggedStruct("draft", { profile: ProfileId, text: Schema.String }),
]);
export type Request = typeof Request.Type;
export const Reply = Schema.Union([
  Schema.TaggedStruct("directory", { profiles: Schema.Array(ProfileSummary) }),
  Schema.TaggedStruct("lookup", { matches: Schema.Array(LookupMatch) }),
  Schema.TaggedStruct("attachmentTargets", { tasks: Schema.Array(Task) }),
  Schema.TaggedStruct("batchEdit", { report: BatchEditReport }),
  Schema.TaggedStruct("attachmentBatch", { report: AttachManyReport }),
  OutdatedServer,
  Schema.TaggedStruct("diagnostics", { snapshot: DiagnosticsSnapshot }),
  Schema.TaggedStruct("snapshots", SnapshotList.fields),
  Schema.TaggedStruct("snapshot", { snapshot: SnapshotManifest }),
  Schema.TaggedStruct("snapshotRestore", { restore: SnapshotRestoreReport }),
  Schema.TaggedStruct("attachmentClipboard", { hasImage: Schema.Boolean }),
  Schema.TaggedStruct("attachmentPaths", {
    paths: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("attachmentStatus", {
    exists: Schema.NullOr(Schema.Boolean),
    preview: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("attachmentImage", {
    mime_type: ImageMime,
    data: Schema.String,
  }),
  Schema.TaggedStruct("importReport", { report: ImportReport }),
  Schema.TaggedStruct("windowMode", { compact: Schema.Boolean }),
  Schema.TaggedStruct("signedIn", { profiles: Schema.Array(ProfileSummary) }),
  Schema.TaggedStruct("signedOut", {
    message: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("tasks", {
    tasks: Schema.Array(Task),
    matching_tasks: Schema.optionalKey(Schema.Array(TaskRead)),
    profiles: Schema.Array(ProfileSummary),
    projects: Schema.Array(ProjectSummary),
    tags: Schema.Array(TagSummary),
    planning: Schema.NullOr(PlanningView),
    counts: Schema.Record(ViewName, Schema.Int),
    draft: Schema.String,
  }),
  Schema.TaggedStruct("profileDeleted", { report: ProfileDeletionReport }),
  Schema.TaggedStruct("task", { task: Task }),
  Schema.TaggedStruct("series", { series: Schema.NullOr(Series) }),
  Schema.TaggedStruct("ok", {}),
  Schema.TaggedStruct("parsed", { draft: QuickAddDraft }),
  Schema.TaggedStruct("history", { entries: Schema.Array(OpLogEntry) }),
  Schema.TaggedStruct("conflict", {
    latest: Schema.NullOr(Task),
    exit_detail: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("error", { message: Schema.String }),
]);
export type Reply = typeof Reply.Type;
export const Notice = Schema.Union([
  OutdatedServer,
  Schema.TaggedStruct("settings", {}),
  Schema.TaggedStruct("toggleTheme", {}),
  Schema.TaggedStruct("signedIn", {}),
  Schema.TaggedStruct("signedOut", {}),
  Schema.TaggedStruct("reload", {}),
  Schema.TaggedStruct("windowMode", { compact: Schema.Boolean }),
  Schema.TaggedStruct("connection", {
    profile: ProfileId,
    state: Schema.Literals(["connected", "reconnecting", "offline"]),
  }),
  Schema.TaggedStruct("profileDeleted", {
    profile: ProfileId,
    name: Schema.String,
  }),
  Schema.TaggedStruct("changed", { profile: ProfileId }),
  Schema.TaggedStruct("quickAdd", {}),
  Schema.TaggedStruct("notificationError", { message: Schema.String }),
]);
export type Notice = typeof Notice.Type;
export interface Desktop {
  filePath(file: File): string;
  request(request: Request): Promise<Reply>;
  subscribe(listener: (notice: Notice) => void): () => void;
}
declare global {
  interface Window {
    desktop: Desktop;
  }
}
