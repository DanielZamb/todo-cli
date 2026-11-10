import type { ProfileId, TaskRead } from "@todo/domain";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button.tsx";
import { Checkbox } from "./components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "./components/ui/empty.tsx";
import { Field } from "./components/ui/field.tsx";
import { Input } from "./components/ui/input.tsx";
import { DependencyErrorStatus } from "./dependency-dialog.tsx";
import { DependencyTaskLabel } from "./dependency-task-label.tsx";
import type { Reply, Request } from "./protocol.ts";
export function InitialDependencySection({
  tasks,
  disabled,
  onRemove,
  onChoose,
}: {
  tasks: readonly TaskRead[];
  disabled: boolean;
  onRemove: (id: TaskRead["id"]) => void;
  onChoose: (button: HTMLButtonElement) => void;
}) {
  return (
    <section className="editor-dependencies">
      <h3>Dependencies</h3>
      <div className="chips">
        {tasks.map((task) => (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            key={task.id}
            data-testid={`dependency-initial-${task.id}`}
            aria-label={`Remove Dependency ${task.title}`}
            onClick={() => onRemove(task.id)}
          >
            {task.title}
            <X data-icon="inline-end" />
          </Button>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={(event) => onChoose(event.currentTarget)}
      >
        Choose Dependencies
      </Button>
    </section>
  );
}

export function DependencySelectionDialog({
  profile,
  title,
  selected,
  request,
  projects,
  canWrite,
  onSelect,
  onClose,
  onDone,
  action = "Done",
  returnFocus,
}: {
  profile: ProfileId;
  title: string;
  selected: readonly TaskRead[];
  request: (request: Request) => Promise<Reply>;
  projects: readonly { id: string; name: string }[];
  canWrite: boolean;
  onSelect: (tasks: readonly TaskRead[]) => void;
  onClose: () => void;
  onDone: () => void;
  action?: string;
  returnFocus: () => HTMLElement | null;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<readonly TaskRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<Extract<
    Reply,
    { _tag: "error" }
  > | null>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let current = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void request({
        _tag: "dependencyCandidates",
        profile,
        filters: query ? { text: query } : {},
      })
        .then((reply) => {
          if (!current) return;
          if (reply._tag === "dependencyCandidates") {
            setCandidates(reply.tasks);
            setFailure(null);
          } else
            setFailure(
              reply._tag === "error"
                ? reply
                : {
                    _tag: "error",
                    message: "Couldn't load Dependencies. Try again.",
                  },
            );
          setLoading(false);
        })
        .catch(() => {
          if (current) {
            setFailure({
              _tag: "error",
              message: "Couldn't load Dependencies. Try again when connected.",
            });
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, profile, request]);
  const choices = [
    ...new Map(
      [...selected, ...candidates].map((task) => [task.id, task]),
    ).values(),
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="dependency-dialog"
        data-testid="dependency-initial-picker"
        initialFocus={search}
        finalFocus={returnFocus}
        showCloseButton={false}
      >
        <DialogTitle>{title} depends on…</DialogTitle>
        <DialogDescription>
          Dependencies are saved with the new Task. Choose up to 13 Tasks in
          this Profile.
        </DialogDescription>
        <Field>
          <Input
            ref={search}
            aria-label="Search Tasks in this Profile"
            placeholder="Search Tasks in this Profile"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        {failure && (
          <DependencyErrorStatus
            failure={failure}
            context="add"
            tasks={choices}
            dismiss={() => setFailure(null)}
          />
        )}
        <div className="dependency-scroll">
          {!canWrite && (
            <p role="status">
              Dependencies are read-only while offline or writes are
              unavailable.
            </p>
          )}
          {loading && <p role="status">Loading Tasks…</p>}
          {!loading && choices.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No matching Tasks</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          {choices.map((task) => {
            const checked = selected.some((value) => value.id === task.id);
            return (
              <label
                className="dependency-choice"
                key={task.id}
                htmlFor={`dependency-initial-${task.id}`}
              >
                <Checkbox
                  id={`dependency-initial-${task.id}`}
                  data-testid={`dependency-choice-${task.id}`}
                  checked={checked}
                  disabled={!canWrite || (!checked && selected.length >= 13)}
                  onCheckedChange={(checked) =>
                    onSelect(
                      checked
                        ? [...selected, task]
                        : selected.filter((value) => value.id !== task.id),
                    )
                  }
                />
                <DependencyTaskLabel task={task} projects={projects} />
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            data-testid="dependency-initial-cancel"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            data-testid="dependency-initial-done"
            disabled={!canWrite || loading}
            onClick={onDone}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
