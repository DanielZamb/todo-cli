import { cn } from "cn";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import type { DependencyDeleteController } from "./dependency-delete-state.ts";
import { DependencyErrorStatus } from "./dependency-dialog.tsx";
import { DependencyTaskLabel } from "./dependency-task-label.tsx";
import type { Reply, Request } from "./protocol.ts";
import type { FindTask } from "./task-lookup-status.tsx";

export function DependencyDeleteDialog({
  controller,
  request,
  canWrite,
  onDeleted,
  returnFocus,
  projects,
  onFindTask,
}: {
  controller: DependencyDeleteController;
  request: (request: Request) => Promise<Reply>;
  canWrite: boolean;
  onDeleted: () => void;
  returnFocus: () => HTMLElement | null;
  projects: readonly { id: string; name: string }[];
  onFindTask?: FindTask | undefined;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const cancel = useRef<HTMLButtonElement>(null);
  const review = state.kind === "Review" && state.change.kind === "Changed";
  useLayoutEffect(() => {
    if (review) cancel.current?.focus();
  }, [review]);
  if (state.kind === "Closed") return null;
  const reviewed =
    state.kind === "Review" || state.kind === "Applying" ? state : null;
  const edges = reviewed?.task.removed_dependencies ?? [];
  const blockers = edges.filter((edge) => edge.dependent_id === state.task.id);
  const dependents = edges.filter((edge) => edge.blocker_id === state.task.id);
  const endpoint = (id: string) => {
    const task = reviewed?.graph?.nodes.find(
      (node) => node.task.id === id,
    )?.task;
    return (
      <li key={id}>
        <DependencyTaskLabel task={task} id={id} projects={projects} />
      </li>
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) controller.close();
      }}
    >
      <DialogContent
        className={cn(
          "dependency-dialog dependency-delete",
          edges.length > 0 && "dependency-delete-has-edges",
        )}
        data-testid="dependency-delete-dialog"
        initialFocus={cancel}
        finalFocus={returnFocus}
        showCloseButton={false}
      >
        <DialogTitle>Delete Task?</DialogTitle>
        <DialogDescription>{state.task.title}</DialogDescription>
        {state.kind === "Loading" && (
          <p role="status">Loading Delete preview…</p>
        )}
        {state.change.kind === "Changed" ? (
          <div
            role="status"
            data-testid="dependency-delete-changed"
            className="space-y-2"
          >
            <p>
              {reviewed && edges.length === 0
                ? "This Task has no Dependencies now. Confirm again to delete it."
                : "Dependencies changed. Review the current list and confirm again."}
            </p>
            {state.change.exitDetail && (
              <p className="text-muted-foreground">{state.change.exitDetail}</p>
            )}
          </div>
        ) : (
          reviewed && (
            <p>
              {edges.length > 0
                ? "Review these Dependencies before deleting this Task."
                : "This Task has no Dependencies."}
            </p>
          )
        )}
        {reviewed && edges.length > 0 && (
          <div className="dependency-scroll">
            <section data-testid="dependency-delete-depends-on">
              <h3>Depends on · {blockers.length}</h3>
              <ul>{blockers.map((edge) => endpoint(edge.blocker_id))}</ul>
            </section>
            <section data-testid="dependency-delete-blocks">
              <h3>Blocks · {dependents.length}</h3>
              <ul>{dependents.map((edge) => endpoint(edge.dependent_id))}</ul>
            </section>
          </div>
        )}
        {state.kind !== "Loading" && state.failure && (
          <DependencyErrorStatus
            failure={state.failure}
            context="delete"
            tasks={reviewed?.graph?.nodes.map((node) => node.task) ?? []}
            reload={() =>
              void controller.open(state.task, request, {
                change: state.change,
              })
            }
            onFindTask={
              onFindTask
                ? (details) => {
                    controller.close();
                    onFindTask(details);
                  }
                : undefined
            }
          />
        )}
        {state.kind === "Error" && state.failure._tag !== "conflict" && (
          <Button
            variant="outline"
            data-testid="dependency-reload"
            disabled={!canWrite}
            onClick={() =>
              void controller.open(state.task, request, {
                change: state.change,
              })
            }
          >
            Reload
          </Button>
        )}
        {!canWrite && (
          <p role="status">
            Deleting Tasks is unavailable while offline or read-only.
          </p>
        )}
        <DialogFooter>
          <Button
            ref={cancel}
            variant="outline"
            data-testid="dependency-delete-cancel"
            onClick={() => controller.close()}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            data-testid="dependency-delete-confirm"
            disabled={!canWrite || state.kind !== "Review"}
            onClick={() =>
              void controller.confirm(request).then((deleted) => {
                if (deleted) onDeleted();
              })
            }
          >
            {state.kind === "Applying"
              ? "Deleting…"
              : edges.length > 0
                ? "Delete Task and remove Dependencies"
                : "Delete Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
