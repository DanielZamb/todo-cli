import {
  type BatchEditReport,
  BatchEditRequest,
  type ProfileId,
  type Task,
} from "@todo/domain";
import { Option, Schema } from "effect";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import { Input } from "./components/ui/input.tsx";
import { NativeSelect } from "./components/ui/native-select.tsx";
import type { Reply, Request } from "./protocol.ts";

const fields = [
  ["priority", "Priority"],
  ["project_name", "Project"],
  ["tag_names", "Tags"],
  ["due_at", "Due date"],
  ["scheduled_at", "Scheduled date"],
  ["energy", "Energy"],
  ["estimate_min", "Estimate in minutes"],
  ["title", "Title"],
  ["description", "Description"],
] as const;
const change = (field: string, value: string) => {
  const raw =
    field === "tag_names"
      ? value
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      : field === "due_at" || field === "scheduled_at"
        ? value
          ? { kind: "date", date: value }
          : null
        : field === "energy" || field === "estimate_min"
          ? value
            ? Number(value)
            : null
          : field === "description"
            ? value || null
            : value;
  return Schema.decodeUnknownOption(BatchEditRequest.fields.changes)({
    [field]: raw,
  });
};

export function BatchEditDialog({
  profile,
  request,
  canWrite,
  onClose,
  onApplied,
}: {
  profile: ProfileId;
  request: (request: Request) => Promise<Reply>;
  canWrite: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [field, setField] = useState("priority");
  const [value, setValue] = useState("P1");
  const [report, setReport] = useState<BatchEditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const fieldId = useId();
  const valueId = useId();
  const changes = change(field, value);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setReport(null);
    setError("");
    void request({ _tag: "attachmentTargets", profile })
      .then((reply) => {
        if (!live || reload !== generation.current) return;
        if (reply._tag === "attachmentTargets") {
          setTasks(
            [...reply.tasks].sort((a, b) => a.title.localeCompare(b.title)),
          );
          setSelected(
            (old) =>
              new Set(
                [...old].filter((id) =>
                  reply.tasks.some((task) => task.id === id),
                ),
              ),
          );
        } else
          setError(
            reply._tag === "error"
              ? reply.message
              : "Could not load Tasks. Reload and try again.",
          );
      })
      .catch((error) => {
        if (live) setError(String(error));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [profile, request, reload]);
  const apply = async (dry_run: boolean) => {
    if (
      !canWrite ||
      busy ||
      loading ||
      !selected.size ||
      Option.isNone(changes)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const reply = await request({
        _tag: "batchEdit",
        profile,
        payload: {
          items: tasks
            .filter((task) => selected.has(task.id))
            .map((task) => ({
              task_id: task.id,
              from_version: task.row_version,
            })),
          changes: changes.value,
          dry_run,
        },
      });
      if (reply._tag === "batchEdit") {
        setReport(reply.report);
        if (!dry_run) onApplied();
      } else
        setError(
          reply._tag === "error"
            ? reply.message
            : "Could not edit Tasks. Reload and preview again.",
        );
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const hasConflicts =
    report?.items.some((row) => row.error?.code === "occ_conflict") ?? false;
  const disabled =
    busy || loading || !canWrite || !selected.size || Option.isNone(changes);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="batch-edit-dialog">
        <DialogTitle>Edit Tasks</DialogTitle>
        <DialogDescription>
          Choose Tasks and one shared change.
        </DialogDescription>
        <div className="batch-edit-fields">
          <label className="batch-edit-field" htmlFor={fieldId}>
            Field
            <NativeSelect
              id={fieldId}
              aria-label="Shared field"
              disabled={busy}
              value={field}
              onChange={(event) => {
                const field = event.target.value;
                setField(field);
                setValue(field === "priority" ? "P1" : "");
                setReport(null);
              }}
            >
              {fields.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="batch-edit-field" htmlFor={valueId}>
            {fields.find(([key]) => key === field)?.[1]}
            {field === "priority" ? (
              <NativeSelect
                id={valueId}
                aria-label="Shared value"
                disabled={busy}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setReport(null);
                }}
              >
                {["P1", "P2", "P3", "P4"].map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                id={valueId}
                aria-label="Shared value"
                disabled={busy}
                value={value}
                type={
                  field.endsWith("_at")
                    ? "date"
                    : field === "energy" || field === "estimate_min"
                      ? "number"
                      : "text"
                }
                placeholder={
                  field === "tag_names"
                    ? "Comma-separated names"
                    : field === "title"
                      ? "Required"
                      : "Empty clears"
                }
                onChange={(event) => {
                  setValue(event.target.value);
                  setReport(null);
                }}
              />
            )}
          </label>
        </div>
        <section
          className="batch-edit-list"
          aria-label="Tasks to edit"
          aria-busy={loading}
        >
          {loading ? (
            <p>Loading Tasks…</p>
          ) : tasks.length === 0 ? (
            <p>No Tasks in this Profile.</p>
          ) : (
            tasks.map((task) => {
              const row = report?.items.find((row) => row.task_id === task.id);
              return (
                <label key={task.id} className="batch-edit-row">
                  <input
                    className="batch-edit-checkbox"
                    type="checkbox"
                    aria-label={`Select ${task.title}`}
                    disabled={busy}
                    checked={selected.has(task.id)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(task.id);
                      else next.delete(task.id);
                      setSelected(next);
                      setReport(null);
                    }}
                  />
                  <span>
                    <span title={task.title}>{task.title}</span>
                    <small role={row?.error ? "alert" : undefined}>
                      {row?.error
                        ? row.error.code === "occ_conflict"
                          ? `Conflict · Version ${row.current_version}. Reload Tasks.`
                          : row.error.message
                        : row
                          ? report?.dry_run
                            ? `Ready · Version ${task.row_version}`
                            : `Updated · Version ${row.current_version}`
                          : `P${task.priority.slice(1)} · Version ${task.row_version}`}
                    </small>
                  </span>
                </label>
              );
            })
          )}
        </section>
        {error && <p role="alert">{error}</p>}
        <div className="batch-edit-footer">
          <Button
            variant={hasConflicts ? "default" : "ghost"}
            aria-label="Reload Tasks"
            disabled={busy || loading}
            onClick={() => {
              generation.current++;
              setReload(generation.current);
            }}
          >
            {hasConflicts ? "Reload Tasks" : "Reload"}
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => void apply(true)}
          >
            Preview
          </Button>
          <Button
            variant={hasConflicts ? "outline" : "default"}
            disabled={
              disabled ||
              report?.dry_run !== true ||
              report.totals.updated === 0
            }
            onClick={() => void apply(false)}
          >
            Apply to {selected.size}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
