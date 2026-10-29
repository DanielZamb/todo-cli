import {
  ProfileId,
  type QuickAddDraft,
  QuickAddInput,
  type Recurrence,
  type Sequence,
  type Series,
  Task,
  type TaskFilters,
  TaskTime,
} from "@todo/domain";
import { cn } from "cn";
import { Schema } from "effect";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  ClockAlert,
  Flag,
  Folder,
  Hash,
  History,
  Inbox,
  ListTodo,
  Maximize2,
  Minimize2,
  Moon,
  MoreHorizontal,
  Plus,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { acceptAttachmentTask } from "./attachment-model.ts";
import { AttachmentsSection, JiraMarker } from "./attachments.tsx";
import { Alert, AlertDescription } from "./components/ui/alert.tsx";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "./components/ui/empty.tsx";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "./components/ui/field.tsx";
import { Input } from "./components/ui/input.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "./components/ui/input-group.tsx";
import { NativeSelect } from "./components/ui/native-select.tsx";
import { Textarea } from "./components/ui/textarea.tsx";
import { DatePicker } from "./date-picker.tsx";
import { Diagnostics } from "./diagnostics.tsx";
import {
  canRevertHistory,
  editedChanges,
  historyLabel,
  localHistoryTime,
  rejectionReason,
  relativeHistoryTime,
  revertedSequences,
} from "./history.ts";
import { ImportDialog } from "./import-dialog.tsx";
import {
  conflicts,
  conflictText,
  Editor,
  editorFor,
  type FieldName,
  merge,
  rebaseEditor,
  taskPayload,
  taskTagNames,
  timeText,
  zone,
} from "./model.ts";
import { NameCombobox } from "./name-combobox.tsx";
import { countTasks, rowDateText } from "./presentation.ts";
import { Reply, type Request, type ViewName } from "./protocol.ts";
import { RecurrenceDialog } from "./recurrence-dialog.tsx";
import { RowMetadata } from "./row-metadata.tsx";
import { SnapshotSettings } from "./snapshot-settings.tsx";
import { TaskFilterDialog, taskFilterSummary } from "./task-filter-dialog.tsx";
import { TaskTags } from "./task-tags.tsx";
import "./index.css";
import "./app.css";

const decodeProfile = Schema.decodeUnknownSync(ProfileId);
const filterApplyError =
  "Could not apply filters. Your previous filters are still active.";
const views = [
  { name: "tasks", icon: ListTodo },
  { name: "today", icon: Sun },
  { name: "overdue", icon: ClockAlert },
  { name: "scheduled", icon: CalendarDays },
  { name: "inbox", icon: Inbox },
] as const;
const fieldLabels: Record<FieldName, string> = {
  title: "Title",
  description: "Description",
  priority: "Priority",
  project_id: "Project",
  tags: "Tags",
  due_at: "Due",
  scheduled_at: "Scheduled",
  energy: "Energy",
  estimate_min: "Estimate",
};
const profileName = (name: string) =>
  name.charAt(0).toUpperCase() + name.slice(1);
function Difference({ value, other }: { value: string; other: string }) {
  const words = value.split(/(\s+)/);
  const compared = other.split(/(\s+)/);
  let start = 0;
  while (start < words.length && words[start] === compared[start]) start++;
  let end = words.length;
  let comparedEnd = compared.length;
  while (
    end > start &&
    comparedEnd > start &&
    words[end - 1] === compared[comparedEnd - 1]
  ) {
    end--;
    comparedEnd--;
  }
  return (
    <>
      {words.slice(0, start).join("")}
      <mark>{words.slice(start, end).join("")}</mark>
      {words.slice(end).join("")}
    </>
  );
}
const defaultProfile = decodeProfile(localStorage.getItem("profile") || "work");

function WindowModeButton({
  compact,
  onToggle,
}: {
  compact: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={compact ? "Expand window" : "Compact mode"}
      aria-pressed={compact}
      title={
        compact ? "Restore the full window" : "Collapse to a single column"
      }
      onClick={onToggle}
    >
      {compact ? <Maximize2 /> : <Minimize2 />}
    </Button>
  );
}
const taskDraftKey = (profile: typeof ProfileId.Type, task: Task["id"]) =>
  `task-editor:${JSON.stringify([profile, task])}`;
const storedEditor = (profile = defaultProfile, task?: Task["id"]) => {
  try {
    const text = localStorage.getItem(
      task ? taskDraftKey(profile, task) : `editor:${profile}`,
    );
    const editor = text
      ? Schema.decodeUnknownSync(Editor)(JSON.parse(text))
      : null;
    return editor?.base.profile_id === profile &&
      (!task || editor.base.id === task)
      ? editor
      : null;
  } catch {
    return null;
  }
};
const preserveDraft = (editor: Editor) => {
  const key = taskDraftKey(editor.base.profile_id, editor.base.id);
  if (
    JSON.stringify(taskPayload(editor.changes)) !==
    JSON.stringify(taskPayload(editorFor(editor.base).changes))
  )
    localStorage.setItem(key, JSON.stringify(editor));
  else localStorage.removeItem(key);
};
const draftForTask = (task: Task, current: Editor | null) => {
  if (current) {
    preserveDraft(current);
    if (
      current.base.id === task.id &&
      current.base.profile_id === task.profile_id
    )
      return current;
  }
  return storedEditor(task.profile_id, task.id) ?? editorFor(task);
};

type WriteIntent =
  | { kind: "move" | "copy"; destination: typeof ProfileId.Type }
  | { kind: "revert"; seq: Sequence }
  | { kind: "editSeries"; recurrence: Recurrence }
  | { kind: "skipOccurrence" };
function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [restored, setRestored] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [profile, setProfile] = useState(defaultProfile);
  const [view, setView] = useState<ViewName>("tasks");
  const [catalog, setCatalog] = useState<Extract<
    Reply,
    { _tag: "tasks" }
  > | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<TaskFilters>({});
  const advancedFiltersRef = useRef<TaskFilters>({});
  const appliedFiltersRef = useRef<TaskFilters>({});
  const [applyingFilters, setApplyingFilters] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [presentationNow, setPresentationNow] = useState(Date.now);
  const [history, setHistory] = useState<Extract<
    Reply,
    { _tag: "history" }
  > | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setPresentationNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const reverted = revertedSequences(history?.entries ?? []);
  const [importOpen, setImportOpen] = useState(false);
  const [profileDelete, setProfileDelete] = useState<{
    name: string;
    count: number;
    step: "confirm" | "tasks";
    error: string | null;
  } | null>(null);
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [transferKind, setTransferKind] = useState<"move" | "copy">("move");
  const [contextTask, setContextTask] = useState<Task | null>(null);
  const [destination, setDestination] = useState("");
  const [seriesDialog, setSeriesDialog] = useState<{
    task: string;
    series: Series | null;
  } | null>(null);
  const [writeIntent, setWriteIntent] = useState<WriteIntent | null>(null);
  const [parsed, setParsed] = useState<typeof QuickAddDraft.Type | null>(null);
  const [ignored, setIgnored] = useState<readonly string[]>([]);
  const draftRef = useRef("");
  const needsDraft = useRef(true);
  const [tasks, setTasks] = useState<readonly (typeof Task.Type)[]>([]);
  const [connection, setConnection] = useState<
    "connected" | "reconnecting" | "offline"
  >("reconnecting");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [transferResult, setTransferResult] = useState<
    | ({ task: Task; profileName: string } & (
        | { kind: "copy" }
        | { kind: "move"; editor: Editor }
      ))
    | null
  >(null);
  const [pending, setPending] = useState(false);
  const [quick, setQuick] = useState(false);
  const [draft, setDraft] = useState("");
  const [editor, setEditor] = useState<Editor | null>(() => storedEditor());
  const [latest, setLatest] = useState<typeof Task.Type | null>(null);
  const transferIntent =
    writeIntent && (writeIntent.kind === "move" || writeIntent.kind === "copy")
      ? writeIntent
      : null;
  const [choices, setChoices] = useState<
    Partial<Record<FieldName, "mine" | "latest">>
  >({});
  const [dark, setDark] = useState(localStorage.getItem("theme") === "dark");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const profileNames = useRef(new Map<typeof ProfileId.Type, string>());
  const active = useRef(profile);
  active.current = profile;
  const selected = useRef(editor?.base.id);
  selected.current = editor?.base.id;
  const activeQuery = useRef(`${profile}:${view}`);
  activeQuery.current = `${profile}:${view}`;
  const refreshGeneration = useRef(0);
  const profileGeneration = useRef(0);
  const activateProfile = useCallback((next: typeof ProfileId.Type) => {
    const restored = storedEditor(next);
    active.current = next;
    profileGeneration.current++;
    selected.current = restored?.base.id;
    refreshGeneration.current++;
    setProfileDelete(null);
    setEditor(restored);
    setLatest(null);
    setChoices({});
    setIgnored([]);
    setParsed(null);
    setHistory(null);
    setMoveOpen(false);
    setSeriesDialog(null);
    setWriteIntent(null);
    setTasks([]);
    setCatalog(null);
    setProject(null);
    setTag(null);
    setAdvancedFilters({});
    advancedFiltersRef.current = {};
    appliedFiltersRef.current = {};
    setApplyingFilters(false);
    setFiltersOpen(false);
    needsDraft.current = true;
    setDraft("");
    setProfile(next);
    localStorage.setItem("profile", next);
    setError("");
    setLoadError("");
    setTransferResult(null);
  }, []);
  const activateEditor = (next: Editor) => {
    if (editor && editor.base.id !== next.base.id) preserveDraft(editor);
    const saved = storedEditor(next.base.profile_id);
    if (saved && saved.base.id !== next.base.id) preserveDraft(saved);
    activateProfile(next.base.profile_id);
    setEditor(next);
  };
  const endAuthentication = useCallback(() => {
    refreshGeneration.current++;
    profileGeneration.current++;
    setSignedIn(false);
    setConnection("offline");
    setTasks([]);
    setCatalog(null);
    setEditor(null);
    setLatest(null);
    setHistory(null);
    setProfileDelete(null);
    setWriteIntent(null);
    setAdvancedFilters({});
    advancedFiltersRef.current = {};
    appliedFiltersRef.current = {};
    setApplyingFilters(false);
    setFiltersOpen(false);
  }, []);
  const request = useCallback(
    async (request: Request): Promise<Reply> => {
      try {
        const reply = Schema.decodeUnknownSync(Reply)(
          await window.desktop.request(request),
        );
        if (reply._tag === "signedIn" || reply._tag === "tasks")
          for (const entry of reply.profiles)
            profileNames.current.set(entry.id, entry.name);

        if (reply._tag === "task") {
          localStorage.removeItem(
            taskDraftKey(reply.task.profile_id, reply.task.id),
          );
          if (
            "profile" in request &&
            "task" in request &&
            request._tag !== "copy"
          )
            localStorage.removeItem(
              taskDraftKey(request.profile, request.task),
            );
        }
        if (
          reply._tag === "error" &&
          request._tag !== "list" &&
          (!("profile" in request) || active.current === request.profile)
        )
          setError(reply.message);
        if (reply._tag === "signedOut") {
          endAuthentication();
        }
        return reply;
      } catch {
        const reply: Reply = {
          _tag: "error",
          message: "Could not contact Todo. Retry.",
        };
        if (request._tag !== "list") setError(reply.message);
        return reply;
      }
    },
    [endAuthentication],
  );
  const refresh = useCallback(async () => {
    const target = profile;
    const query = `${profile}:${view}`;
    const generation = ++refreshGeneration.current;
    const requestedFilters = advancedFiltersRef.current;
    const changingFilters =
      JSON.stringify(requestedFilters) !==
      JSON.stringify(appliedFiltersRef.current);
    const result = await request({
      _tag: "list",
      profile: target,
      view,
      ...(Object.keys(requestedFilters).length
        ? { filters: requestedFilters }
        : {}),
    });
    if (
      activeQuery.current !== query ||
      refreshGeneration.current !== generation
    )
      return;
    if (result._tag === "tasks") {
      setLoadError("");
      setTasks(result.tasks);
      setCatalog(result);
      appliedFiltersRef.current = requestedFilters;
      setAdvancedFilters(requestedFilters);
      setApplyingFilters(false);
      if (changingFilters)
        setError((current) => (current === filterApplyError ? "" : current));
      if (needsDraft.current) {
        needsDraft.current = false;
        setDraft(result.draft);
      }
    } else if (result._tag === "error") {
      advancedFiltersRef.current = appliedFiltersRef.current;
      setApplyingFilters(false);
      if (changingFilters) setError(filterApplyError);
      setLoadError(result.message);
    }
  }, [profile, request, view]);
  useEffect(() => {
    void request({ _tag: "windowMode" }).then((reply) => {
      if (reply._tag === "windowMode") setCompact(reply.compact);
    });
    return window.desktop.subscribe((notice) => {
      if (notice._tag === "windowMode") setCompact(notice.compact);
      if (notice._tag === "settings") setSettingsOpen(true);
      if (notice._tag === "toggleTheme") setDark((value) => !value);
      if (notice._tag === "signedOut") endAuthentication();
    });
  }, [request, endAuthentication]);
  const toggleCompact = () => {
    void request({ _tag: "setWindowMode", compact: !compact }).then((reply) => {
      if (reply._tag === "windowMode") setCompact(reply.compact);
    });
  };
  useEffect(() => {
    void request({ _tag: "restore" }).then((reply) => {
      if (reply._tag === "signedIn") {
        const next =
          reply.profiles.find((entry) => entry.id === defaultProfile) ??
          reply.profiles[0];
        if (next) activateProfile(next.id);
      }
      setSignedIn(reply._tag === "signedIn");
      setRestored(true);
    });
  }, [request, activateProfile]);
  const leaveDeletedProfile = useCallback(
    async (deletedProfile: typeof ProfileId.Type, name?: string) => {
      if (active.current !== deletedProfile) return;
      const generation = profileGeneration.current;
      const deletedName =
        name ?? profileNames.current.get(deletedProfile) ?? deletedProfile;
      const result = await request({ _tag: "profiles" });
      if (
        result._tag !== "signedIn" ||
        result.profiles.some((p) => p.id === deletedProfile)
      )
        return;
      const next = result.profiles.find((p) => p.id !== deletedProfile);
      if (
        next &&
        active.current === deletedProfile &&
        profileGeneration.current === generation
      ) {
        activateProfile(next.id);
        setProfileNotice(
          `"${deletedName}" was deleted. Switched to ${next.name}.`,
        );
      }
    },
    [request, activateProfile],
  );
  const beginProfileDeletion = () => {
    const selected = catalog?.profiles.find((p) => p.id === profile);
    if (selected)
      setProfileDelete({
        name: selected.name,
        count: selected.visible_task_count ?? catalog?.tasks.length ?? 0,
        step: "confirm",
        error: null,
      });
  };
  const deleteCurrentProfile = async (withTasks: boolean) => {
    setDeletingProfile(true);
    const result = await request({
      _tag: "deleteProfile",
      profile,
      payload: { with_tasks: withTasks, dry_run: false },
    });
    setDeletingProfile(false);
    if (result._tag === "profileDeleted") {
      setProfileDelete(null);
      await leaveDeletedProfile(profile, result.report.profile.name);
    } else if (result._tag === "error") {
      const discovery = await request({ _tag: "profiles" });
      const latest =
        discovery._tag === "signedIn"
          ? discovery.profiles.find((p) => p.id === profile)
          : undefined;
      setProfileDelete(
        (current) =>
          current && {
            ...current,
            count: latest?.visible_task_count ?? current.count,
            error: result.message,
          },
      );
    }
  };
  useEffect(() => {
    if (!signedIn) return;
    setConnection("reconnecting");
    void refresh();
    void request({ _tag: "watch", profile });
    return window.desktop.subscribe((notice) => {
      if (notice._tag === "profileDeleted" && notice.profile === profile)
        void leaveDeletedProfile(notice.profile, notice.name);
      if (notice._tag === "changed" && notice.profile === profile)
        void refresh();
      if (notice._tag === "reload") {
        refreshGeneration.current++;
        setTasks([]);
        setCatalog(null);
        setEditor(null);
        setHistory(null);
        setLatest(null);
        setSeriesDialog(null);
        setProject(null);
        setTag(null);
        setAdvancedFilters({});
        advancedFiltersRef.current = {};
        appliedFiltersRef.current = {};
        setApplyingFilters(false);
        setFiltersOpen(false);
        setParsed(null);
        setMoveOpen(false);
        setImportOpen(false);
        setTransferResult(null);
        setContextTask(null);
        setProfileDelete(null);
        setProfileNotice(null);
        setWriteIntent(null);
        for (const key of Object.keys(localStorage))
          if (key.startsWith("editor:")) localStorage.removeItem(key);
        void request({ _tag: "restore" }).then((reply) => {
          if (
            reply._tag === "signedIn" &&
            !reply.profiles.some((entry) => entry.id === profile) &&
            reply.profiles[0]
          )
            activateProfile(reply.profiles[0].id);
          else void refresh();
        });
      }
      if (notice._tag === "connection") {
        setConnection(notice.state);
        if (notice.state === "offline")
          void request({ _tag: "profiles" }).then((result) => {
            if (
              result._tag === "signedIn" &&
              !result.profiles.some((p) => p.id === profile)
            )
              void leaveDeletedProfile(profile);
          });
      }
      if (notice._tag === "notificationError") setError(notice.message);
      if (notice._tag === "quickAdd") setQuick(true);
    });
  }, [
    signedIn,
    profile,
    refresh,
    request,
    activateProfile,
    leaveDeletedProfile,
  ]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (editor) {
      localStorage.setItem(`editor:${profile}`, JSON.stringify(editor));
      preserveDraft(editor);
    } else localStorage.removeItem(`editor:${profile}`);
  }, [editor, profile]);
  const readOnly = connection !== "connected" || pending;
  const change = (patch: Partial<Editor["changes"]>) => {
    if (editor)
      setEditor({ ...editor, changes: { ...editor.changes, ...patch } });
  };
  const save = async (resolving = false) => {
    if (!editor || readOnly) return;
    setPending(true);
    setError("");
    const base = resolving && latest ? latest : editor.base;
    const changes =
      resolving && latest ? merge(editor, latest, choices) : editor.changes;
    const result = await request({
      _tag: "edit",
      profile,
      task: base.id,
      payload: {
        from_version: base.row_version,
        changes: {
          ...taskPayload(changes),
          description: changes.description || null,
        },
      },
    });
    if (active.current !== profile || selected.current !== base.id) {
      setPending(false);
      return;
    }
    if (result._tag === "task") {
      setEditor(editorFor(result.task));
      setLatest(null);
      setAnnouncement("Changes saved");
      await refresh();
    }
    if (result._tag === "conflict") {
      await refresh();
      if (active.current !== profile || selected.current !== base.id) {
        setPending(false);
        return;
      }
      setEditor({ base, changes });
      setLatest(result.latest);
      setChoices({});
      if (!result.latest)
        setError("This task was deleted. Your draft is preserved.");
    }
    setPending(false);
  };
  const transition = async (
    task: typeof Task.Type,
    action: "complete" | "cancel" | "reopen",
  ) => {
    if (readOnly) return;
    setPending(true);
    setError("");
    const result = await request({
      _tag: "transition",
      profile,
      task: task.id,
      payload: { from_version: task.row_version, action },
    });
    if (active.current !== profile) {
      setPending(false);
      return;
    }
    if (result._tag === "task") {
      setEditor((current) =>
        current?.base.id === task.id
          ? rebaseEditor(current, result.task)
          : current,
      );
      setAnnouncement(
        `Task ${action === "complete" ? "completed" : action === "cancel" ? "cancelled" : "reopened"}`,
      );
      await refresh();
    }
    if (result._tag === "conflict") {
      if (selected.current === task.id) {
        setLatest(result.latest);
        setChoices({});
      }
      setError(
        "This task changed. Review the latest accepted Version and try the action again.",
      );
    }
    setPending(false);
  };
  const write = async (intent: WriteIntent, resolving = false) => {
    if (!editor || readOnly) return;
    const base = resolving && latest ? latest : editor.base;
    const changes =
      resolving && latest ? merge(editor, latest, choices) : editor.changes;
    const payload = { from_version: base.row_version };
    const target = { profile, task: base.id };
    setPending(true);
    setTransferResult(null);
    setError("");
    const command: Request =
      intent.kind === "move" || intent.kind === "copy"
        ? {
            _tag: intent.kind,
            ...target,
            payload: { ...payload, destination_profile: intent.destination },
          }
        : intent.kind === "revert"
          ? {
              _tag: "revert",
              ...target,
              payload: { ...payload, seq: intent.seq },
            }
          : intent.kind === "editSeries"
            ? {
                _tag: "editSeries",
                ...target,
                payload: {
                  ...payload,
                  changes: {
                    ...taskPayload(changes),
                    description: changes.description || null,
                  },
                  recurrence: intent.recurrence,
                },
              }
            : { _tag: "skipOccurrence", ...target, payload };
    const reply = await request(command);
    if (active.current !== profile || selected.current !== base.id) {
      setPending(false);
      return;
    }
    if (reply._tag === "task") {
      setLatest(null);
      setWriteIntent(null);
      setHistory(null);
      setMoveOpen(false);
      setSeriesDialog(null);
      if (intent.kind === "move" || intent.kind === "copy") {
        const name = profileName(
          catalog?.profiles.find((entry) => entry.id === intent.destination)
            ?.name ?? intent.destination,
        );
        if (intent.kind === "move") {
          const movedEditor = {
            base: reply.task,
            changes: {
              ...merge(editor, reply.task, {}),
              project_id: reply.task.project_id,
              project_name: undefined,
              tag_names: [],
              tags: reply.task.tags,
            },
          };
          localStorage.removeItem(`editor:${profile}`);
          preserveDraft(movedEditor);
          setEditor(null);
          setTransferResult({
            task: reply.task,
            kind: "move",
            profileName: name,
            editor: movedEditor,
          });
        } else {
          setEditor(rebaseEditor(editor, base));
          setTransferResult({
            task: reply.task,
            kind: "copy",
            profileName: name,
          });
        }
        await refresh();
      } else if (reply.task.profile_id !== profile) {
        localStorage.removeItem(`editor:${profile}`);
        activateEditor({
          base: reply.task,
          changes: {
            ...merge(editor, reply.task, {}),
            project_id: reply.task.project_id,
            project_name: undefined,
            tag_names: [],
            tags: reply.task.tags,
          },
        });
      } else if (reply.task.deleted_at) {
        setEditor(null);
        await refresh();
      } else {
        setEditor(
          intent.kind === "editSeries"
            ? editorFor(reply.task)
            : rebaseEditor(editor, reply.task),
        );
        await refresh();
      }
      setAnnouncement(
        intent.kind === "copy"
          ? "Task copied to Profile"
          : intent.kind === "move"
            ? "Task moved"
            : intent.kind === "revert"
              ? "Change reverted"
              : intent.kind === "skipOccurrence"
                ? "Occurrence skipped"
                : "Series saved",
      );
    }
    if (reply._tag === "conflict") {
      await refresh();
      if (active.current !== profile || selected.current !== base.id) {
        setPending(false);
        return;
      }
      setWriteIntent(
        reply.latest || intent.kind === "move" || intent.kind === "copy"
          ? intent
          : null,
      );
      setLatest(reply.latest);
      setChoices({});
      setHistory(null);
      setMoveOpen(false);
      setSeriesDialog(null);
      setError(
        intent.kind === "move" || intent.kind === "copy"
          ? ""
          : reply.latest
            ? "This Task changed. Review the latest accepted Version before retrying."
            : "This Task is unavailable. Your draft is preserved.",
      );
    }
    setPending(false);
  };
  const openRecurrence = async () => {
    if (!editor || readOnly) return;
    const reply = await request({
      _tag: "recurrence",
      profile,
      task: editor.base.id,
    });
    if (
      reply._tag === "series" &&
      active.current === profile &&
      selected.current === editor.base.id
    ) {
      setError("");
      setSeriesDialog({ task: editor.base.id, series: reply.series });
    }
  };
  const saveSeries = async (recurrence: Recurrence) => {
    if (!editor || !seriesDialog || readOnly) return;
    if (seriesDialog.series) {
      void write({ kind: "editSeries", recurrence });
      return;
    }
    setPending(true);
    setError("");
    const reply = await request({
      _tag: "createSeries",
      profile,
      payload: {
        task: {
          ...taskPayload(editor.changes),
          description: editor.changes.description || null,
          source: "manual",
        },
        recurrence,
      },
    });
    if (
      active.current === profile &&
      selected.current === editor.base.id &&
      reply._tag === "task"
    ) {
      setEditor(editorFor(reply.task));
      setSeriesDialog(null);
      setAnnouncement("Series created");
      await refresh();
    }
    setPending(false);
  };
  const deleteTask = async () => {
    if (!editor || readOnly) return;
    setPending(true);
    setError("");
    const reply = await request({
      _tag: "delete",
      profile,
      task: editor.base.id,
      query: { from_version: editor.base.row_version },
    });
    if (active.current !== profile || selected.current !== editor.base.id) {
      setPending(false);
      return;
    }
    if (reply._tag === "task") {
      setEditor(null);
      setAnnouncement("Task deleted");
      await refresh();
    }
    if (reply._tag === "conflict") {
      setLatest(reply.latest);
      setChoices({});
      setError(
        "This task changed. Review the latest accepted Version before deleting.",
      );
    }
    setPending(false);
  };
  useEffect(() => {
    draftRef.current = draft;
    if (!draft.trim() || !quick || !signedIn || connection !== "connected") {
      setParsed(null);
      return;
    }
    const timer = setTimeout(() => {
      void request({
        _tag: "parse",
        profile,
        payload: Schema.decodeUnknownSync(QuickAddInput)({
          text: draft,
          now: new Date().toISOString(),
          time_zone: zone,
        }),
      }).then((reply) => {
        if (
          active.current === profile &&
          draftRef.current === draft &&
          reply._tag === "parsed"
        )
          setParsed(reply.draft);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, profile, quick, signedIn, request, connection]);
  const add = async (edit = false) => {
    if (!draft.trim() || readOnly) return;
    setPending(true);
    setError("");
    const resultDraft = await request({
      _tag: "parse",
      profile,
      payload: Schema.decodeUnknownSync(QuickAddInput)({
        text: draft,
        now: new Date().toISOString(),
        time_zone: zone,
      }),
    });
    if (resultDraft._tag !== "parsed") {
      setPending(false);
      return;
    }
    if (active.current !== profile) {
      setPending(false);
      return;
    }
    const details = resultDraft.draft;
    const result = await request({
      _tag: "create",
      profile,
      payload: {
        title: details.title,
        source: "manual",
        priority: ignored.includes("priority") ? "P3" : details.priority,
        due_at: ignored.includes("due") ? null : details.due_at,
        scheduled_at: ignored.includes("scheduled")
          ? null
          : details.scheduled_at,
        project_name: ignored.includes("project")
          ? ""
          : (details.project ?? ""),
        tag_names: details.tags.filter(
          (tag) => !ignored.includes(`tag:${tag}`),
        ),
      },
    });
    if (active.current !== profile) {
      setPending(false);
      return;
    }
    if (result._tag === "task") {
      setDraft("");
      setIgnored([]);
      setParsed(null);
      void request({ _tag: "draft", profile, text: "" });
      setQuick(false);
      if (edit) setEditor(editorFor(result.task));
      setAnnouncement("Task added");
      await refresh();
    }
    setPending(false);
  };
  const filtered =
    project !== null || tag !== null || Object.keys(advancedFilters).length > 0;
  const clearFilters = () => {
    setProject(null);
    setTag(null);
    setAdvancedFilters({});
    advancedFiltersRef.current = {};
    appliedFiltersRef.current = {};
    setApplyingFilters(false);
    setError((current) => (current === filterApplyError ? "" : current));
    void refresh();
  };
  const groups = (
    catalog?.planning?.groups ?? [{ name: "All tasks", tasks }]
  ).map((group) => ({
    ...group,
    tasks: group.tasks.filter(
      (task) =>
        (project === null || task.project_id === project) &&
        (tag === null || task.tags.some((id) => id === tag)) &&
        (Object.keys(advancedFilters).length === 0 ||
          catalog?.matching_task_ids === undefined ||
          catalog.matching_task_ids.some((id) => id === task.id)),
    ),
  }));
  const overlaps = editor && latest ? conflicts(editor, latest) : [];
  const rowDateOptions = { now: new Date(presentationNow) };
  const date = rowDateOptions.now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (!restored)
    return (
      <main className={cn("sign-in", compact && "compact")}>
        <p>Opening Todo…</p>
      </main>
    );
  if (!signedIn)
    return (
      <main className={cn("sign-in", compact && "compact")}>
        <div className="sign-in-window-mode">
          <WindowModeButton compact={compact} onToggle={toggleCompact} />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setError("");
            void request({ _tag: "signIn", passphrase }).then((reply) => {
              if (reply._tag === "signedIn") {
                setPassphrase("");
                const next =
                  reply.profiles.find((entry) => entry.id === profile) ??
                  reply.profiles[0];
                if (next) activateProfile(next.id);
                setSignedIn(true);
              }
              setPending(false);
            });
          }}
        >
          <ListTodo />
          <h1>Welcome to Todo</h1>
          <p className="quiet">Sign in to your local tasks.</p>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="passphrase">Owner passphrase</FieldLabel>
              <Input
                id="passphrase"
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending || !passphrase}>
              Sign in
            </Button>
          </FieldGroup>
          {error && <p role="alert">{error}</p>}
        </form>
      </main>
    );
  return (
    <div
      className={cn(
        "shell",
        compact && "compact",
        compact && editor && "editing",
      )}
    >
      {filtersOpen && (
        <TaskFilterDialog
          filters={advancedFilters}
          onClose={() => setFiltersOpen(false)}
          onApply={(value) => {
            advancedFiltersRef.current = value;
            setApplyingFilters(true);
            void refresh();
          }}
        />
      )}
      <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen}>
        <DialogContent className="appearance-settings">
          <DialogTitle>Appearance</DialogTitle>
          <p>Choose your appearance.</p>
          <Button
            onClick={() => setDark(!dark)}
            aria-label={dark ? "Light appearance" : "Dark appearance"}
          >
            {dark ? <Sun /> : <Moon />}
            {dark ? "Use light appearance" : "Use dark appearance"}
          </Button>
        </DialogContent>
      </Dialog>
      {importOpen && (
        <ImportDialog
          key={profile}
          profile={profile}
          profileName={profileName(
            catalog?.profiles.find((entry) => entry.id === profile)?.name ??
              profile,
          )}
          compact={compact}
          canWrite={connection === "connected" && !pending}
          onClose={() => setImportOpen(false)}
          onApplied={() => {
            void refresh();
          }}
        />
      )}
      <Dialog
        open={profileDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingProfile) setProfileDelete(null);
        }}
      >
        <DialogContent showCloseButton={!compact}>
          <DialogTitle>
            {profileDelete?.step === "tasks"
              ? `Delete "${profileDelete.name}" and its ${profileDelete.count === 1 ? "Task" : countTasks(profileDelete.count, true)}?`
              : `Delete "${profileDelete?.name}"?`}
          </DialogTitle>
          <DialogDescription
            className={profileDelete?.error ? "text-destructive" : undefined}
          >
            {profileDelete?.error ??
              (profileDelete?.step === "confirm" && profileDelete.count > 0
                ? `"${profileDelete.name}" has ${countTasks(profileDelete.count, true)}. Delete ${profileDelete.count === 1 ? "it" : "them"} too, or move ${profileDelete.count === 1 ? "it" : "them"} to another Profile first.`
                : "Todo saves a Snapshot first, so you can undo this in Settings › Snapshots. You'll switch to another Profile.")}
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={deletingProfile}
              onClick={() => setProfileDelete(null)}
            >
              Cancel
            </Button>
            {profileDelete &&
            profileDelete.count > 0 &&
            profileDelete.step === "confirm" ? (
              <Button
                variant={compact ? "default" : "outline"}
                onClick={() =>
                  setProfileDelete({
                    ...profileDelete,
                    step: "tasks",
                    error: null,
                  })
                }
              >
                Delete Tasks too…
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={deletingProfile}
                onClick={() =>
                  void deleteCurrentProfile(profileDelete?.step === "tasks")
                }
              >
                {deletingProfile
                  ? "Deleting…"
                  : profileDelete?.step === "tasks"
                    ? profileDelete.count === 1
                      ? "Delete Profile and Task"
                      : "Delete Profile and Tasks"
                    : "Delete Profile"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {profileNotice && (
        <div
          role="status"
          aria-label="Profile deleted"
          className="fixed bottom-4 right-4 z-50 rounded-lg border bg-popover p-4 text-sm shadow-lg"
        >
          {profileNotice}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setProfileNotice(null)}
          >
            Dismiss
          </Button>
        </div>
      )}
      <aside className="sidebar">
        <Field className="profile">
          <FieldLabel htmlFor="profile">Profile</FieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  id="profile"
                  aria-label="Profile"
                  variant="outline"
                  className="w-full justify-between"
                  data-profile-id={profile}
                />
              }
            >
              {profileName(
                catalog?.profiles.find((p) => p.id === profile)?.name ??
                  profile,
              )}
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup value={profile}>
                {catalog?.profiles.map((entry) => (
                  <DropdownMenuRadioItem
                    closeOnClick
                    key={entry.id}
                    value={entry.id}
                    data-profile-id={entry.id}
                    onClick={() => activateProfile(entry.id)}
                  >
                    {profileName(entry.name)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={
                  !catalog ||
                  catalog.profiles.length < 2 ||
                  connection !== "connected" ||
                  Boolean(editor)
                }
                onClick={beginProfileDeletion}
              >
                Delete "
                {catalog?.profiles.find((p) => p.id === profile)?.name ??
                  profile}
                "…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>
        <nav aria-label="Planning views">
          {views.map(({ name, icon: Icon }) => (
            <Button
              key={name}
              variant="ghost"
              data-selected={view === name}
              aria-current={view === name ? "page" : undefined}
              className="nav-row"
              onClick={() => {
                clearFilters();
                setView(name);
              }}
            >
              <Icon data-icon="inline-start" />
              <span className="nav-title">
                {name.charAt(0).toUpperCase() + name.slice(1)}
              </span>
              <span className="nav-count">{catalog?.counts[name] ?? 0}</span>
            </Button>
          ))}
        </nav>
        <nav aria-label="Projects">
          <p className="quiet">Projects</p>
          {catalog?.projects.map((entry) => (
            <Button
              key={entry.id}
              variant="ghost"
              data-selected={project === entry.id}
              className="nav-row"
              onClick={() => {
                clearFilters();
                setProject(entry.id);
                setTag(null);
                setView("tasks");
              }}
            >
              <Folder data-icon="inline-start" />
              <span className="nav-title">{entry.name}</span>
              <span className="nav-count">{entry.open_task_count}</span>
            </Button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void request({ _tag: "signOut" });
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="task-pane">
        <header className="view-header">
          <div className="view-title">
            {compact ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      aria-label="Navigate tasks"
                      disabled={!catalog}
                    />
                  }
                >
                  <ListTodo data-icon="inline-start" />
                  {view === "tasks"
                    ? "All tasks"
                    : view[0]?.toUpperCase() + view.slice(1)}
                </DropdownMenuTrigger>
                <DropdownMenuContent className="compact-navigation">
                  <DropdownMenuRadioGroup value={view}>
                    <DropdownMenuLabel>Planning views</DropdownMenuLabel>
                    {views.map(({ name, icon: Icon }) => (
                      <DropdownMenuRadioItem
                        closeOnClick
                        key={name}
                        value={name}
                        onClick={() => {
                          clearFilters();
                          setView(name);
                        }}
                      >
                        <Icon data-icon="inline-start" />
                        {name === "tasks"
                          ? "All tasks"
                          : name.charAt(0).toUpperCase() + name.slice(1)}
                        <span className="nav-count">
                          {catalog?.counts[name] ?? 0}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuRadioGroup value={project ?? ""}>
                    <DropdownMenuLabel>Projects</DropdownMenuLabel>
                    {catalog?.projects.map((entry) => (
                      <DropdownMenuRadioItem
                        closeOnClick
                        key={entry.id}
                        value={entry.id}
                        onClick={() => {
                          clearFilters();
                          setProject(entry.id);
                          setTag(null);
                          setView("tasks");
                        }}
                      >
                        <Folder data-icon="inline-start" />
                        {entry.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={readOnly}
                      onClick={() => setImportOpen(true)}
                    >
                      Import…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        void request({ _tag: "signOut" });
                      }}
                    >
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <h1>
                {view[0]?.toUpperCase()}
                {view.slice(1)}
              </h1>
            )}
            {compact ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      aria-label="Profile"
                      className="quiet w-full gap-1"
                      data-profile-id={profile}
                    />
                  }
                >
                  <span className="min-w-0 truncate">
                    {profileName(
                      catalog?.profiles.find((entry) => entry.id === profile)
                        ?.name ?? profile,
                    )}
                  </span>
                  <span className="shrink-0">
                    ·{" "}
                    {countTasks(
                      groups.reduce(
                        (sum, group) => sum + group.tasks.length,
                        0,
                      ),
                    )}
                  </span>
                  <ChevronDown className="shrink-0" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="compact-profile-menu">
                  <DropdownMenuRadioGroup value={profile}>
                    <DropdownMenuLabel>Profile</DropdownMenuLabel>
                    {catalog?.profiles.map((entry) => (
                      <DropdownMenuRadioItem
                        closeOnClick
                        key={entry.id}
                        value={entry.id}
                        data-profile-id={entry.id}
                        onClick={() => activateProfile(entry.id)}
                      >
                        {profileName(entry.name)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={
                      !catalog ||
                      catalog.profiles.length < 2 ||
                      connection !== "connected" ||
                      Boolean(editor)
                    }
                    onClick={beginProfileDeletion}
                  >
                    Delete "
                    {catalog?.profiles.find((p) => p.id === profile)?.name ??
                      profile}
                    "…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <p className="quiet">{date}</p>
            )}
          </div>
          <div className="actions">
            {!compact && (
              <Button
                variant="outline"
                disabled={connection !== "connected" || pending}
                onClick={() => setImportOpen(true)}
              >
                Import…
              </Button>
            )}
            <WindowModeButton compact={compact} onToggle={toggleCompact} />
            {!compact && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={dark ? "Light appearance" : "Dark appearance"}
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun /> : <Moon />}
              </Button>
            )}
            {!(
              compact &&
              (connection === "offline" ||
                loadError ||
                groups.every((group) => group.tasks.length === 0))
            ) && (
              <Button
                onClick={() => setQuick(true)}
                aria-label="Quick add"
                size={compact ? "icon" : "default"}
              >
                <Plus data-icon="inline-start" />
                {!compact && "Quick add"}
              </Button>
            )}
          </div>
        </header>
        <FieldSet className="task-filters" aria-label="Task filters">
          <FieldGroup className="task-filter-fields">
            <Field>
              <FieldLabel htmlFor="filter-project">Project</FieldLabel>
              <NativeSelect
                id="filter-project"
                aria-label="Filter by Project"
                value={project ?? ""}
                onChange={(event) => setProject(event.target.value || null)}
                className="w-full"
              >
                <option value="">All Projects</option>
                {catalog?.projects.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="filter-tag">Tag</FieldLabel>
              <NativeSelect
                id="filter-tag"
                aria-label="Filter by Tag"
                value={tag ?? ""}
                onChange={(event) => setTag(event.target.value || null)}
                className="w-full"
              >
                <option value="">All Tags</option>
                {catalog?.tags.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FieldGroup>
          <Button
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            aria-label="More filters"
            disabled={applyingFilters}
          >
            Filters
            {Object.keys(advancedFilters).length > 0
              ? ` · ${Object.keys(advancedFilters).length}`
              : ""}
          </Button>
          {filtered && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </FieldSet>
        {applyingFilters && (
          <p role="status" className="filter-summary">
            Applying filters…
          </p>
        )}
        {Object.keys(advancedFilters).length > 0 && (
          <p
            className="filter-summary"
            role="status"
            aria-label="Active filters"
          >
            {taskFilterSummary(advancedFilters)}
          </p>
        )}
        {transferResult && (
          <Alert>
            <Check />
            <AlertDescription>
              <span>
                Task {transferResult.kind === "copy" ? "copied" : "moved"} to{" "}
                {transferResult.profileName}
              </span>
              <Button
                variant="link"
                onClick={() => {
                  const result = transferResult;
                  activateEditor(
                    result.kind === "move"
                      ? result.editor
                      : editorFor(result.task),
                  );
                }}
              >
                Open in {transferResult.profileName}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Dismiss transfer result"
                onClick={() => setTransferResult(null)}
              >
                <X />
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {compact && (connection === "offline" || loadError) && (
          <div
            className="compact-state"
            role="status"
            title={loadError || undefined}
          >
            <p>
              {connection === "offline"
                ? "Your tasks are read only while offline."
                : "Could not load tasks."}
            </p>
            <Button
              onClick={() => {
                setError("");
                setLoadError("");
                void request({ _tag: "watch", profile });
                void refresh();
              }}
            >
              {connection === "offline" ? "Reconnect" : "Retry"}
            </Button>
          </div>
        )}
        {(error || (!compact && loadError)) && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              {error || loadError}
              <Button
                variant="ghost"
                onClick={() => {
                  setError("");
                  setLoadError("");
                  void refresh();
                }}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!(compact && (connection === "offline" || loadError)) &&
          groups.map((group) => (
            <section key={group.name} aria-label={group.name}>
              {(!compact ||
                groups.filter((group) => group.tasks.length > 0).length >
                  1) && (
                <div className="list-heading">
                  <span>{group.name}</span>
                  <span>{countTasks(group.tasks.length)}</span>
                </div>
              )}
              <div className="task-list">
                {group.tasks.map((task) => {
                  const projectName = catalog?.projects.find(
                    (entry) => entry.id === task.project_id,
                  )?.name;
                  const tags = taskTagNames(task, catalog?.tags ?? []);
                  const tagNames = tags.map((name) => `#${name}`).join(" · ");
                  const metadata = [projectName, tagNames]
                    .filter(Boolean)
                    .join(" · ");
                  const overdue =
                    task.status === "open" &&
                    task.due_at &&
                    (task.due_at.kind === "date"
                      ? task.due_at.date <
                        rowDateOptions.now.toLocaleDateString("en-CA")
                      : Date.parse(task.due_at.utc) < presentationNow);
                  return (
                    <div
                      className={cn(
                        "task-row",
                        editor?.base.id === task.id && "selected",
                      )}
                      key={task.id}
                      data-task-id={task.id}
                    >
                      <button
                        type="button"
                        className="complete"
                        aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
                        disabled={readOnly}
                        onClick={() => {
                          void transition(
                            task,
                            task.status === "done" ? "reopen" : "complete",
                          );
                        }}
                      >
                        {task.status === "done" ? <Check /> : <Circle />}
                      </button>
                      <button
                        type="button"
                        className="task-content"
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setContextTask(task);
                        }}
                        onClick={() => {
                          setEditor((current) => draftForTask(task, current));
                          setLatest(null);
                          setWriteIntent(null);
                          setSeriesDialog(null);
                          setHistory(null);
                          setMoveOpen(false);
                        }}
                        title={task.title}
                      >
                        <span
                          className={`priority priority-${task.priority.toLowerCase()}`}
                        >
                          {task.priority}
                          {compact && task.status !== "open" && (
                            <span className="task-status"> {task.status}</span>
                          )}
                        </span>
                        <span className="task-title">{task.title}</span>
                        <JiraMarker task={task} />
                        {!compact && task.external_id && (
                          <span
                            className="task-external-id"
                            title={task.external_id}
                          >
                            {task.external_id}
                          </span>
                        )}
                        {compact ? (
                          <RowMetadata
                            items={[
                              ...(task.due_at
                                ? [
                                    {
                                      id: "due",
                                      label: `Due ${rowDateText(task.due_at, rowDateOptions)}`,
                                      overdue: Boolean(overdue),
                                    },
                                  ]
                                : []),
                              ...(!task.due_at && task.scheduled_at
                                ? [
                                    {
                                      id: "scheduled",
                                      label: `Scheduled ${rowDateText(task.scheduled_at, rowDateOptions)}`,
                                    },
                                  ]
                                : []),
                              ...(projectName
                                ? [{ id: "project", label: projectName }]
                                : []),
                              ...tags.map((tag) => ({
                                id: `tag:${tag}`,
                                label: `#${tag}`,
                              })),
                              ...(task.external_id
                                ? [{ id: "external", label: task.external_id }]
                                : []),
                            ]}
                          />
                        ) : (
                          <>
                            <span className="task-meta" title={metadata}>
                              {projectName && (
                                <span className="task-project">
                                  {projectName}
                                </span>
                              )}
                              {projectName && tagNames && " · "}
                              {tagNames && (
                                <TaskTags tags={tags} compact={compact} />
                              )}
                            </span>
                            <span
                              className={cn("task-dates", overdue && "overdue")}
                            >
                              <span>
                                {task.due_at &&
                                  `Due ${rowDateText(task.due_at, rowDateOptions)}`}
                              </span>
                              <span className="quiet">
                                {task.scheduled_at &&
                                  `Scheduled ${rowDateText(task.scheduled_at, rowDateOptions)}`}
                              </span>
                              {task.status !== "open" && (
                                <span className="quiet">{task.status}</span>
                              )}
                            </span>
                          </>
                        )}
                      </button>
                      <DropdownMenu
                        open={contextTask?.id === task.id}
                        onOpenChange={(open) =>
                          setContextTask(open ? task : null)
                        }
                      >
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Task actions for ${task.title}`}
                              disabled={readOnly}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuGroup>
                            {(["move", "copy"] as const).map((kind) => (
                              <DropdownMenuItem
                                key={kind}
                                onClick={() => {
                                  setEditor((current) =>
                                    draftForTask(task, current),
                                  );
                                  setLatest(null);
                                  setWriteIntent(null);
                                  setHistory(null);
                                  setSeriesDialog(null);
                                  setDestination(
                                    catalog?.profiles.find(
                                      (entry) => entry.id !== profile,
                                    )?.id ?? "",
                                  );
                                  setError("");
                                  setTransferKind(kind);
                                  setMoveOpen(true);
                                  setContextTask(null);
                                }}
                              >
                                {kind === "move"
                                  ? "Move to Profile"
                                  : "Copy to Profile"}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        {!(compact && (connection === "offline" || loadError)) &&
          groups.every((group) => group.tasks.length === 0) && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {filtered
                    ? "No matching tasks"
                    : compact
                      ? "No tasks here."
                      : "No tasks in this view"}
                </EmptyTitle>
              </EmptyHeader>
              {filtered ? (
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setQuick(true)}>Quick add</Button>
              )}
            </Empty>
          )}
        {(!compact || connection === "reconnecting") && (
          <footer className="view-footer">
            {!compact && (
              <span className="quiet">
                {countTasks(
                  groups.reduce((sum, group) => sum + group.tasks.length, 0),
                )}
              </span>
            )}
            {connection !== "connected" && (
              <div className="connection-status" role="alert">
                <CircleAlert />
                <span>
                  {connection === "offline"
                    ? "Offline (read only)"
                    : "Reconnecting"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void request({ _tag: "watch", profile });
                    void refresh();
                  }}
                >
                  Reconnect
                </Button>
              </div>
            )}
          </footer>
        )}
      </main>
      {editor && (
        <section className="editor" aria-label="Task editor">
          <div className="editor-heading">
            {compact ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditor(null);
                  setError("");
                }}
                disabled={pending}
              >
                <ArrowLeft data-icon="inline-start" />
                Back to tasks
              </Button>
            ) : (
              <h2>Task details</h2>
            )}
            <div className="editor-heading-actions">
              {compact && (
                <WindowModeButton compact={compact} onToggle={toggleCompact} />
              )}
              <span className="quiet version">
                Version {editor.base.row_version}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Task actions"
                      disabled={readOnly}
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    {compact && (
                      <DropdownMenuLabel>
                        Version {editor.base.row_version}
                      </DropdownMenuLabel>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        void transition(editor.base, "cancel");
                      }}
                    >
                      Cancel task
                    </DropdownMenuItem>
                    {(editor.base.status === "done" ||
                      editor.base.status === "cancelled") && (
                      <DropdownMenuItem
                        onClick={() => {
                          void transition(editor.base, "reopen");
                        }}
                      >
                        Reopen task
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        void deleteTask();
                      }}
                    >
                      Delete task
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDestination(
                          catalog?.profiles.find(
                            (entry) => entry.id !== profile,
                          )?.id ?? "",
                        );
                        setError("");
                        setTransferKind("move");
                        setMoveOpen(true);
                      }}
                    >
                      Move to Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDestination(
                          catalog?.profiles.find(
                            (entry) => entry.id !== profile,
                          )?.id ?? "",
                        );
                        setError("");
                        setTransferKind("copy");
                        setMoveOpen(true);
                      }}
                    >
                      Copy to Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditor(null)}>
                      Close editor
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <form
            id="task-editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <Input
                  id="title"
                  value={editor.changes.title}
                  onChange={(e) => change({ title: e.target.value })}
                  disabled={readOnly}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="description">
                  Description <span className="quiet">Markdown</span>
                </FieldLabel>
                <Textarea
                  id="description"
                  rows={3}
                  value={editor.changes.description}
                  onChange={(e) => change({ description: e.target.value })}
                  disabled={readOnly}
                />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel>Due</FieldLabel>
                <DatePicker
                  label="Due"
                  value={editor.changes.due_at}
                  disabled={readOnly}
                  onChange={(due_at) => change({ due_at })}
                />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel>Scheduled</FieldLabel>
                <DatePicker
                  label="Scheduled"
                  value={editor.changes.scheduled_at}
                  disabled={readOnly}
                  onChange={(scheduled_at) => change({ scheduled_at })}
                />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="priority">Priority</FieldLabel>
                <NativeSelect
                  id="priority"
                  disabled={readOnly}
                  value={editor.changes.priority}
                  onChange={(e) =>
                    change({
                      priority: Schema.decodeUnknownSync(Task.fields.priority)(
                        e.target.value,
                      ),
                    })
                  }
                >
                  {["P1", "P2", "P3", "P4"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="project">Project</FieldLabel>
                <NameCombobox
                  key={`${profile}:${editor.base.id}:project`}
                  id="project"
                  label="Project"
                  wrapValue={compact}
                  options={(catalog?.projects ?? []).map((entry) => entry.name)}
                  value={
                    editor.changes.project_name ??
                    catalog?.projects.find(
                      (entry) => entry.id === editor.changes.project_id,
                    )?.name ??
                    ""
                  }
                  disabled={readOnly}
                  onCommit={(name) => {
                    const existing = catalog?.projects.find(
                      (entry) => entry.name === name,
                    );
                    change({
                      project_id: existing?.id ?? null,
                      project_name: existing || !name ? undefined : name,
                    });
                  }}
                />
              </Field>
              <Field orientation="horizontal" className="tag-field">
                <FieldLabel htmlFor="tags">Tags</FieldLabel>
                <NameCombobox
                  key={`${profile}:${editor.base.id}:tags`}
                  id="tags"
                  label="Tag"
                  multiple
                  options={(catalog?.tags ?? [])
                    .filter((entry) => !editor.changes.tags.includes(entry.id))
                    .map((entry) => entry.name)}
                  value=""
                  disabled={readOnly}
                  onCommit={(text) => {
                    const name = text.trim().toLowerCase();
                    if (!name) return;
                    const existing = catalog?.tags.find(
                      (entry) => entry.name === name,
                    );
                    if (existing)
                      change({
                        tags: [
                          ...new Set([...editor.changes.tags, existing.id]),
                        ],
                      });
                    else
                      change({
                        tag_names: [
                          ...new Set([
                            ...(editor.changes.tag_names ?? []),
                            name,
                          ]),
                        ],
                      });
                  }}
                >
                  {editor.changes.tags.map((id) => (
                    <Button
                      key={id}
                      type="button"
                      size="xs"
                      variant="secondary"
                      disabled={readOnly}
                      aria-label={`Remove Tag ${catalog?.tags.find((tag) => tag.id === id)?.name ?? id}`}
                      onClick={() =>
                        change({
                          tags: editor.changes.tags.filter((tag) => tag !== id),
                        })
                      }
                    >
                      <span className="tag-name">
                        {catalog?.tags.find((tag) => tag.id === id)?.name ?? id}
                      </span>
                      <X data-icon="inline-end" />
                    </Button>
                  ))}
                  {(editor.changes.tag_names ?? []).map((name) => (
                    <Button
                      key={name}
                      type="button"
                      size="xs"
                      variant="secondary"
                      disabled={readOnly}
                      aria-label={`Remove Tag ${name}`}
                      onClick={() =>
                        change({
                          tag_names: (editor.changes.tag_names ?? []).filter(
                            (tag) => tag !== name,
                          ),
                        })
                      }
                    >
                      <span className="tag-name">{name}</span>
                      <X data-icon="inline-end" />
                    </Button>
                  ))}
                </NameCombobox>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel>Recurrence</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  className="date-field"
                  aria-label="Recurrence"
                  disabled={readOnly}
                  onClick={() => {
                    void openRecurrence();
                  }}
                >
                  {editor.base.occurrence ? "Edit Series…" : "Create Series…"}
                </Button>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="energy">Energy</FieldLabel>
                <NativeSelect
                  id="energy"
                  disabled={readOnly}
                  value={editor.changes.energy ?? ""}
                  onChange={(e) =>
                    change({
                      energy: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">None</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="estimate">Estimate</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="estimate"
                    type="number"
                    min={1}
                    disabled={readOnly}
                    value={editor.changes.estimate_min ?? ""}
                    onChange={(e) =>
                      change({
                        estimate_min: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                  <InputGroupAddon align="inline-end">min</InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>
            <AttachmentsSection
              key={editor.base.id}
              task={
                tasks.find((task) => task.id === editor.base.id) ?? editor.base
              }
              readOnly={readOnly || latest !== null}
              request={request}
              onAccepted={(accepted) => {
                if (
                  active.current === accepted.profile_id &&
                  selected.current === accepted.id
                ) {
                  setEditor((current) =>
                    current ? acceptAttachmentTask(current, accepted) : null,
                  );
                  void refresh();
                }
              }}
            />
          </form>
          <div className="editor-foot">
            <div className="actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  void request({
                    _tag: "history",
                    profile,
                    task: editor.base.id,
                  }).then((reply) => {
                    if (
                      reply._tag === "history" &&
                      active.current === profile &&
                      selected.current === editor.base.id
                    )
                      setHistory(reply);
                  });
                }}
              >
                <History data-icon="inline-start" />
                History
              </Button>
            </div>
            <Button
              type="submit"
              form="task-editor-form"
              disabled={readOnly || !editor.changes.title.trim()}
            >
              <Check data-icon="inline-start" />
              Save changes
            </Button>
          </div>
        </section>
      )}
      <Dialog
        open={moveOpen && editor !== null}
        onOpenChange={(open) => {
          if (!pending) setMoveOpen(open);
        }}
      >
        <DialogContent className="move-dialog">
          <DialogTitle>
            {transferKind === "move" ? "Move to Profile" : "Copy to Profile"}
          </DialogTitle>
          <DialogDescription>
            {transferKind === "move"
              ? "Move this task to another Profile."
              : "Create a copy in another Profile. The source stays unchanged."}{" "}
            Project and Tags are matched by name. An Occurrence becomes a plain
            Task.
          </DialogDescription>
          <Field>
            <FieldLabel htmlFor="destination">Destination Profile</FieldLabel>
            <NativeSelect
              id="destination"
              value={destination}
              disabled={readOnly}
              onChange={(event) => setDestination(event.target.value)}
            >
              {catalog?.profiles
                .filter((entry) => entry.id !== profile)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {profileName(entry.name)}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setMoveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={readOnly || !destination}
              onClick={() => {
                void write({
                  kind: transferKind,
                  destination: decodeProfile(destination),
                });
              }}
            >
              {transferKind === "move" ? "Move task" : "Copy task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {editor && seriesDialog?.task === editor.base.id && (
        <RecurrenceDialog
          key={editor.base.id}
          series={seriesDialog.series}
          start={
            editor.changes.scheduled_at ??
            editor.changes.due_at ??
            Schema.decodeUnknownSync(TaskTime)({
              kind: "date",
              date: new Date().toLocaleDateString("en-CA"),
            })
          }
          disabled={readOnly}
          busy={pending}
          error={error}
          onClose={() => setSeriesDialog(null)}
          onSave={(recurrence) => {
            void saveSeries(recurrence);
          }}
          onSkip={() => {
            void write({ kind: "skipOccurrence" });
          }}
        />
      )}
      <Dialog open={quick} onOpenChange={setQuick}>
        <DialogContent className="quick-dialog">
          <div className="quick-heading">
            <DialogTitle>New task</DialogTitle>
            <DialogDescription className="profile-chip">
              {profileName(
                catalog?.profiles.find((entry) => entry.id === profile)?.name ??
                  "",
              )}
            </DialogDescription>
          </div>
          <form
            className="quick-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <FieldGroup className="quick-input-preview">
              <div className="quick-input-group">
                <Field>
                  <FieldLabel htmlFor="quick-title" className="sr-only">
                    Task title
                  </FieldLabel>
                  <Input
                    id="quick-title"
                    placeholder="What needs doing?"
                    value={draft}
                    disabled={pending}
                    onChange={(e) => {
                      needsDraft.current = false;
                      setError("");
                      setDraft(e.target.value);
                      setIgnored([]);
                      void request({
                        _tag: "draft",
                        profile,
                        text: e.target.value,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault();
                        void add(true);
                      }
                    }}
                  />
                </Field>
                <p className="quiet quick-hint">
                  Try: tomorrow p1 #tag @"Client Project"
                </p>
              </div>
              {parsed && (
                <div className="parsed-draft">
                  <p className="quiet">Task title: {parsed.title}</p>
                  <div className="chips">
                    {[
                      {
                        key: "due",
                        icon: CalendarDays,
                        label: "Clear due",
                        text: parsed.due_at
                          ? `Due ${timeText(parsed.due_at)}`
                          : null,
                      },
                      {
                        key: "scheduled",
                        icon: CalendarDays,
                        label: "Clear scheduled",
                        text: parsed.scheduled_at
                          ? `Scheduled ${timeText(parsed.scheduled_at)}`
                          : null,
                      },
                      {
                        key: "priority",
                        text: parsed.priority,
                        icon: Flag,
                        label: "Clear priority",
                      },
                      {
                        key: "project",
                        text: parsed.project,
                        icon: Folder,
                        label: "Clear project",
                      },
                      ...parsed.tags.map((tag) => ({
                        key: `tag:${tag}`,
                        text: tag,
                        icon: Hash,
                        label: `Remove Tag ${tag}`,
                      })),
                    ]
                      .filter(
                        (chip) => chip.text && !ignored.includes(chip.key),
                      )
                      .map(({ icon: Icon, ...chip }) => (
                        <Button
                          type="button"
                          variant="secondary"
                          key={chip.key}
                          aria-label={chip.label}
                          disabled={pending}
                          onClick={() => setIgnored([...ignored, chip.key])}
                        >
                          <Icon data-icon="inline-start" />
                          {chip.text}
                          <X data-icon="inline-end" />
                        </Button>
                      ))}
                  </div>
                </div>
              )}
              {error && <p role="alert">{error}</p>}
            </FieldGroup>
            <div className="quick-add-footer">
              <span className="quiet">
                <kbd>↵</kbd> add · <kbd>⌘ ↵</kbd> add and edit
              </span>
              <Button type="submit" disabled={readOnly || !draft.trim()}>
                <Plus data-icon="inline-start" />
                Add task
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={transferIntent !== null && editor !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setLatest(null);
            setWriteIntent(null);
            setError("");
          }
        }}
      >
        <DialogContent className="conflict-dialog" showCloseButton={false}>
          <DialogTitle>This Task changed</DialogTitle>
          <DialogDescription>
            {latest && transferIntent
              ? `It was edited elsewhere and is now Version ${latest.row_version}. ${transferIntent.kind === "copy" ? "Copy" : "Move"} the latest Version to ${profileName(catalog?.profiles.find((entry) => entry.id === transferIntent.destination)?.name ?? transferIntent.destination)}?`
              : "This Task is no longer available."}
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setLatest(null);
                setWriteIntent(null);
                setError("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={readOnly || latest === null || transferIntent === null}
              onClick={() => {
                if (transferIntent) void write(transferIntent, true);
              }}
            >
              {transferIntent?.kind === "move" ? "Move latest" : "Copy latest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={latest !== null && editor !== null && transferIntent === null}
        onOpenChange={(open) => {
          if (!open) {
            setLatest(null);
            setWriteIntent(null);
          }
        }}
      >
        <DialogContent className="conflict-dialog">
          <DialogTitle>Resolve task conflict</DialogTitle>
          <DialogDescription>
            {writeIntent
              ? "The server rejected this action with conflict. Review the latest accepted Version and retry."
              : "Another client changed this task while you were editing."}
          </DialogDescription>
          {error && <p role="alert">{error}</p>}
          {editor && latest && (
            <>
              <Alert>
                <CircleAlert />
                <AlertDescription>
                  {overlaps.length === 1 && overlaps[0] === "title"
                    ? "Choose the title to keep"
                    : "Choose each field to keep"}
                  . Non-overlapping changes merge.
                </AlertDescription>
              </Alert>
              <div className="conflict-versions quiet">
                <span>Your base: Version {editor.base.row_version}</span>
                <span>Latest: Version {latest.row_version}</span>
              </div>
              {(writeIntent && writeIntent.kind !== "editSeries"
                ? []
                : overlaps
              ).map((key) => (
                <fieldset key={key} className="resolution-field">
                  <legend>{fieldLabels[key]}</legend>
                  {(["mine", "latest"] as const).map((choice) => {
                    const mine = conflictText(
                      key,
                      editor.changes,
                      catalog?.projects ?? [],
                      catalog?.tags ?? [],
                    );
                    const accepted = conflictText(
                      key,
                      editorFor(latest).changes,
                      catalog?.projects ?? [],
                      catalog?.tags ?? [],
                    );
                    return (
                      <label className="resolution-option" key={choice}>
                        <input
                          type="radio"
                          name={key}
                          disabled={readOnly}
                          checked={choices[key] === choice}
                          aria-label={
                            choice === "mine"
                              ? "Your change"
                              : "Latest accepted"
                          }
                          onChange={() =>
                            setChoices({ ...choices, [key]: choice })
                          }
                        />
                        <span>
                          <small>
                            {choice === "mine"
                              ? "Your change"
                              : "Latest accepted"}
                          </small>
                          {key === "title" || key === "description" ? (
                            <Difference
                              value={choice === "mine" ? mine : accepted}
                              other={choice === "mine" ? accepted : mine}
                            />
                          ) : choice === "mine" ? (
                            mine
                          ) : (
                            accepted
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
              {(!writeIntent || writeIntent.kind === "editSeries") &&
                overlaps.length === 0 && (
                  <p>No overlapping changes. Your changes can merge.</p>
                )}
              <p className="quiet">
                The next save uses the latest Version. History keeps the
                rejected attempt.
              </p>
              <Button
                disabled={
                  readOnly ||
                  ((!writeIntent || writeIntent.kind === "editSeries") &&
                    overlaps.some((key) => !choices[key]))
                }
                onClick={() => {
                  if (writeIntent) void write(writeIntent, true);
                  else void save(true);
                }}
              >
                <Check data-icon="inline-start" />
                {writeIntent ? "Retry action" : "Save resolution"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={history !== null}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      >
        <DialogContent className="history-dialog">
          <DialogTitle>Task History</DialogTitle>
          <DialogDescription>
            Every accepted change and rejected attempt for this Task.
          </DialogDescription>
          {error && <p role="alert">{error}</p>}
          <ol>
            {history?.entries.toReversed().map((entry) => (
              <li key={entry.seq} data-rejected={entry.outcome === "rejected"}>
                <div className="history-heading">
                  <strong>{historyLabel(entry)}</strong>
                  <time
                    dateTime={entry.event.occurred_at}
                    title={localHistoryTime(entry.event.occurred_at)}
                  >
                    {relativeHistoryTime(
                      entry.event.occurred_at,
                      presentationNow,
                    )}
                  </time>
                </div>
                {entry.outcome === "rejected" && (
                  <p className="history-rejection">
                    Rejected attempt. {rejectionReason(entry.reason)}
                  </p>
                )}
                {entry.event.kind === "TaskHistoryRedacted" && (
                  <p>Content erased by Purge.</p>
                )}
                {entry.event.kind === "TaskEdited" && (
                  <dl className="history-changes">
                    {editedChanges(entry.event).map((change) => (
                      <div key={change.field}>
                        <dt>{change.field}</dt>
                        <dd>
                          <span>{change.before}</span>
                          <span aria-hidden="true"> → </span>
                          <span className="sr-only"> changed to </span>
                          <span>{change.after}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {canRevertHistory(entry, reverted) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={readOnly}
                    aria-label={`Revert ${historyLabel(entry).toLowerCase()} change`}
                    onClick={() => {
                      void write({ kind: "revert", seq: entry.seq });
                    }}
                  >
                    Revert
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
      <span className="sr-only" role="status">
        {announcement}
      </span>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="snapshot-settings-dialog sm:max-w-[680px]">
          <Button
            className="settings-appearance-entry"
            variant="ghost"
            onClick={() => {
              setSettingsOpen(false);
              setAppearanceOpen(true);
            }}
          >
            Appearance…
          </Button>
          <SnapshotSettings request={request} readOnly={readOnly} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  new URLSearchParams(location.search).get("view") === "diagnostics" ? (
    <Diagnostics />
  ) : (
    <App />
  ),
);
