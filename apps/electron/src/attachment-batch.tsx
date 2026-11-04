import type {
  AttachManyReport,
  Attachment,
  ProfileId,
  Task,
} from "@todo/domain";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import { Input } from "./components/ui/input.tsx";
import type { Reply, Request } from "./protocol.ts";

export function AttachmentBatchDialog({
  attachment,
  profile,
  request,
  canWrite,
  onClose,
  sourceTaskId,
  onAccepted,
}: {
  attachment: Attachment;
  profile: ProfileId;
  request: (request: Request) => Promise<Reply>;
  canWrite: boolean;
  onClose: () => void;
  sourceTaskId: Task["id"];
  onAccepted: (task: Task) => void;
}) {
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [label, setLabel] = useState(attachment.label ?? "");
  const [report, setReport] = useState<AttachManyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const labelId = useId();
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void request({ _tag: "attachmentTargets", profile })
      .then((reply) => {
        if (!live || reload !== generation.current) return;
        if (reply._tag === "attachmentTargets") {
          setTasks(
            [...reply.tasks].sort((a, b) => a.title.localeCompare(b.title)),
          );
          setReport(null);
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
    if (!canWrite || busy || loading || !selected.size) return;
    setBusy(true);
    setError("");
    try {
      const location =
        attachment.kind === "link"
          ? { kind: attachment.kind, url: attachment.url }
          : { kind: attachment.kind, path: attachment.path };
      const reply = await request({
        _tag: "attachmentBatch",
        profile,
        payload: {
          dry_run,
          items: tasks
            .filter((task) => selected.has(task.id))
            .map((task) => ({
              task_id: task.id,
              from_version: task.row_version,
              attachments: [
                {
                  ...location,
                  ...(label.trim() ? { label: label.trim() } : {}),
                  ...(attachment.name ? { name: attachment.name } : {}),
                },
              ],
            })),
        },
      });
      if (reply._tag === "attachmentBatch") {
        setReport(reply.report);
        if (!dry_run && selected.has(sourceTaskId)) {
          const latest = await request({ _tag: "attachmentTargets", profile });
          if (latest._tag === "attachmentTargets") {
            const source = latest.tasks.find(
              (task) => task.id === sourceTaskId,
            );
            if (source) onAccepted(source);
          }
        }
      } else
        setError(
          reply._tag === "error"
            ? reply.message
            : "Could not attach. Reload Tasks and try again.",
        );
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="attachment-batch-dialog">
        <DialogTitle>Attach to Tasks</DialogTitle>
        <DialogDescription>
          Choose Tasks. Existing Attachments stay.
        </DialogDescription>
        <p
          className="attachment-batch-reference"
          title={attachment.kind === "link" ? attachment.url : attachment.path}
        >
          {attachment.kind === "link" ? attachment.url : attachment.path}
        </p>
        <label className="attachment-batch-label" htmlFor={labelId}>
          Label{" "}
          <Input
            id={labelId}
            aria-label="Attachment label for selected Tasks"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              setReport(null);
            }}
            disabled={busy}
            placeholder="Optional"
          />
        </label>
        <section
          className="attachment-batch-list"
          aria-label="Attachment target Tasks"
          aria-busy={loading}
        >
          {loading ? (
            <p>Loading Tasks…</p>
          ) : tasks.length === 0 ? (
            <p>No Tasks in this Profile.</p>
          ) : (
            tasks.map((task) => {
              const result = report?.items.find(
                (row) => row.task_id === task.id,
              );
              return (
                <label key={task.id} className="attachment-batch-row">
                  <input
                    type="checkbox"
                    aria-label={`Select ${task.title}`}
                    checked={selected.has(task.id)}
                    disabled={busy}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(task.id);
                      else next.delete(task.id);
                      setSelected(next);
                      setReport(null);
                    }}
                  />
                  <span>
                    <span>{task.title}</span>
                    {result && (
                      <small
                        role={
                          result.outcome === "rejected" ? "alert" : undefined
                        }
                      >
                        {result.error?.message ??
                          (report?.dry_run
                            ? result.outcome === "attached"
                              ? "Ready to attach"
                              : "Already attached"
                            : result.outcome === "attached"
                              ? "Attached"
                              : "Already attached")}
                      </small>
                    )}
                  </span>
                </label>
              );
            })
          )}
        </section>
        {error && <p role="alert">{error}</p>}
        <div className="attachment-batch-footer">
          <Button
            aria-label="Reload Tasks"
            variant="ghost"
            disabled={busy || loading}
            onClick={() => {
              generation.current++;
              setReload(generation.current);
            }}
          >
            Reload
          </Button>
          <Button
            variant="outline"
            disabled={busy || loading || !canWrite || !selected.size}
            onClick={() => void apply(true)}
          >
            Preview
          </Button>
          <Button
            disabled={busy || loading || !canWrite || !selected.size}
            onClick={() => void apply(false)}
          >
            Attach to {selected.size} {selected.size === 1 ? "Task" : "Tasks"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
