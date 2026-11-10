import { useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "./components/ui/alert.tsx";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group.tsx";
import type { DependencyBatchController } from "./dependency-batch-state.ts";
import { DependencyErrorStatus } from "./dependency-dialog.tsx";
import {
  dependencyBatchFailure,
  dependencyWarning,
} from "./dependency-presentation.ts";
import { DependencySelectionDialog } from "./dependency-selection-dialog.tsx";
import { DependencyTaskLabel } from "./dependency-task-label.tsx";
import type { Reply, Request } from "./protocol.ts";

export function DependencyBatchDialog({
  controller,
  request,
  canWrite,
  projects,
  returnFocus,
  onChanged,
}: {
  controller: DependencyBatchController;
  request: (request: Request) => Promise<Reply>;
  canWrite: boolean;
  projects: readonly { id: string; name: string }[];
  returnFocus: () => HTMLElement | null;
  onChanged: () => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  if (state.kind === "Closed") return null;
  if (state.phase === "select")
    return (
      <DependencySelectionDialog
        profile={state.root.profile_id}
        title={state.root.title}
        direction={state.direction}
        description="Select Tasks for a batch Dependency preview. No changes are saved until Apply."
        limit={100}
        selected={state.selected}
        request={request}
        projects={projects}
        canWrite={canWrite}
        onSelect={(tasks) => controller.select(tasks)}
        onClose={controller.close}
        onDone={() => void controller.preview(request)}
        action="Preview Dependencies"
        returnFocus={returnFocus}
      />
    );
  const tasks = [
    ...new Map(
      [
        state.root,
        ...state.selected,
        ...(state.graph?.nodes.map((node) => node.task) ?? []),
      ].map((task) => [task.id, task]),
    ).values(),
  ];
  const rows = state.report?.results ?? [];
  const changed = rows.filter(
    (row) => "result" in row && row.result.outcome !== "unchanged",
  ).length;
  const unchanged = rows.filter(
    (row) => "result" in row && row.result.outcome === "unchanged",
  ).length;
  const errors = rows.filter((row) => "error" in row).length;
  const applying = state.busy && state.report?.dry_run === true;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !applying) controller.close();
      }}
    >
      <DialogContent
        className="dependency-dialog dependency-batch-dialog"
        data-testid="dependency-batch-preview"
        finalFocus={returnFocus}
        showCloseButton={false}
      >
        <DialogTitle>
          {state.report?.dry_run === false
            ? "Dependency results"
            : "Preview Dependencies"}
        </DialogTitle>
        <DialogDescription>
          {state.root.title}{" "}
          {state.direction === "dependsOn" ? "depends on…" : "blocks…"}
        </DialogDescription>
        <ToggleGroup
          variant="segment"
          spacing={0}
          size="sm"
          aria-label="Batch Dependency action"
          value={[state.action]}
          disabled={state.busy}
          onValueChange={(value) => {
            if (value[0] === "depend" || value[0] === "undepend")
              controller.action(value[0]);
          }}
        >
          <ToggleGroupItem value="depend">Add</ToggleGroupItem>
          <ToggleGroupItem value="undepend">Remove</ToggleGroupItem>
        </ToggleGroup>
        {state.failure && (
          <DependencyErrorStatus
            failure={state.failure}
            context="add"
            tasks={tasks}
          />
        )}
        {!canWrite && (
          <p role="status">
            Dependency writes are unavailable while offline or read-only.
          </p>
        )}
        {state.needsReload && (
          <Alert role="status">
            <AlertDescription>
              This Task changed. Reload its Dependencies before trying again.
              <Button
                variant="outline"
                data-testid="dependency-reload"
                disabled={!canWrite || state.busy}
                onClick={() => void controller.preview(request)}
              >
                Reload
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <p data-testid="dependency-batch-summary" role="status">
          {state.busy
            ? "Updating Dependencies…"
            : state.report
              ? `${state.report.dry_run ? "Preview" : "Results"}: ${changed} changed · ${unchanged} unchanged · ${errors} refused`
              : "Preview again to review this action."}
        </p>
        <div className="dependency-scroll">
          {rows.map((row) => {
            const item = state.items?.[row.index];
            const id =
              state.direction === "dependsOn"
                ? item?.blocker_id
                : item?.dependent_id;
            const task = tasks.find((task) => task.id === id);
            return (
              <section
                className="batch-edit-row"
                key={row.index}
                data-testid={`dependency-batch-row-${row.index}`}
              >
                <DependencyTaskLabel
                  metadata={false}
                  task={task}
                  {...(id ? { id } : {})}
                  projects={projects}
                />
                {"error" in row ? (
                  <DependencyErrorStatus
                    failure={{
                      _tag: "error",
                      ...dependencyBatchFailure(row.error),
                    }}
                    context="add"
                    tasks={tasks}
                    attempted={task ?? null}
                    attemptedAction={
                      state.action === "depend" ? "add" : "remove"
                    }
                  />
                ) : (
                  <>
                    <p>
                      {row.result.outcome === "unchanged"
                        ? state.action === "depend"
                          ? "Already linked"
                          : "Already removed"
                        : row.result.outcome === "added"
                          ? state.report?.dry_run
                            ? "Will add Dependency"
                            : "Dependency added"
                          : state.report?.dry_run
                            ? "Will remove Dependency"
                            : "Dependency removed"}
                    </p>
                    {row.result.warnings.map((warning) => {
                      const projected = dependencyWarning(warning, tasks);
                      return (
                        <Alert
                          key={`${warning.code}:${warning.dependent_id}`}
                          data-testid="dependency-warning"
                        >
                          <AlertDescription>
                            {projected.message}
                            {projected.path.length > 0 && (
                              <ol className="dependency-witness">
                                {projected.path.map((task) => (
                                  <li key={task.id}>{task.title}</li>
                                ))}
                              </ol>
                            )}
                          </AlertDescription>
                        </Alert>
                      );
                    })}
                  </>
                )}
              </section>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={applying}
            onClick={controller.close}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={state.busy}
            onClick={() => controller.back()}
          >
            Selection
          </Button>
          {!state.report && (
            <Button
              disabled={!canWrite || state.busy}
              onClick={() => void controller.preview(request)}
            >
              Preview
            </Button>
          )}
          {state.report?.dry_run && (
            <Button
              data-testid="dependency-batch-apply"
              disabled={!canWrite || state.busy || state.needsReload}
              onClick={() =>
                void controller.apply(request).then((applied) => {
                  if (applied) onChanged();
                })
              }
            >
              Apply {changed} {changed === 1 ? "Dependency" : "Dependencies"}
            </Button>
          )}
          {state.report?.dry_run === false && (
            <Button onClick={controller.close}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
