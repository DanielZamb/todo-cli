import type { Task } from "@todo/domain";
import { LoaderCircle } from "lucide-react";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "./components/ui/alert.tsx";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "./components/ui/empty.tsx";
import { Field, FieldLabel } from "./components/ui/field.tsx";
import { Input } from "./components/ui/input.tsx";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group.tsx";
import {
  type DependencyContext,
  dependencyRecovery,
  dependencyWarning,
} from "./dependency-presentation.ts";
import type { DependencyController } from "./dependency-state.ts";
import type { Reply, Request } from "./protocol.ts";

export function DependencyErrorStatus({
  failure,
  context,
  tasks,
  reload,
  followUp,
  attempted,
}: {
  failure: Extract<Reply, { _tag: "error" | "conflict" }>;
  context: DependencyContext;
  tasks: readonly Task[];
  attempted?: Task | null;
  reload?: () => void;
  followUp?: ((id: Task["id"]) => void) | undefined;
}) {
  const projection =
    failure._tag === "error" && failure.dependency
      ? dependencyRecovery(failure.dependency, context, tasks)
      : null;
  return (
    <Alert
      role="status"
      data-testid="dependency-error"
      className="dependency-error-region"
    >
      <AlertDescription className="flex flex-col gap-2 break-words">
        <p>
          {attempted ? `Can't add ${attempted.title}. ` : ""}
          {projection?.message ??
            (failure._tag === "conflict"
              ? "This Task changed. Reload its Dependencies before trying again."
              : failure.message)}
          {projection?.action === "choose" &&
            (failure._tag === "error" &&
            failure.dependency?.code === "dependency_profile_mismatch"
              ? " Choose a Task in this Profile."
              : " Choose another Task.")}
        </p>

        {projection?.advice && <p>{projection.advice}</p>}
        {projection && projection.witnesses.length > 0 && (
          <ol
            className="dependency-witness"
            aria-label={projection.witnesses
              .map((task) => task.title)
              .join(" blocks ")}
          >
            {projection.witnesses.map((task, index) => (
              <li key={`${task.id}:${index === 0 ? "start" : "step"}`}>
                {index > 0 &&
                  failure._tag === "error" &&
                  failure.dependency?.code === "dependency_cycle" && (
                    <span aria-hidden="true">→ </span>
                  )}
                {task.title}
                {task.status &&
                  ` · ${task.status === "cancelled" ? "Cancelled" : task.status}`}
              </li>
            ))}
          </ol>
        )}
        {failure._tag === "conflict" && (
          <Button
            variant="outline"
            data-testid="dependency-reload"
            onClick={reload}
          >
            Reload
          </Button>
        )}
        {projection?.action === "followUp" && projection.followUp && (
          <Button
            variant="outline"
            data-testid="dependency-follow-up"
            onClick={() =>
              projection.followUp && followUp?.(projection.followUp)
            }
            disabled={!followUp}
          >
            Create follow-up
          </Button>
        )}
        {(projection?.detail ?? failure.exit_detail) && (
          <p className="text-muted-foreground">
            {projection?.detail ?? failure.exit_detail}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function DependencyPicker({
  controller,
  request,
  canWrite,
  returnFocus,
  onChanged,
}: {
  controller: DependencyController;
  request: (request: Request) => Promise<Reply>;
  canWrite: boolean;
  returnFocus: () => HTMLElement | null;
  onChanged: () => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const search = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scroll = useRef<HTMLDivElement>(null);
  const failure = state.kind === "Open" ? state.failure : null;
  useLayoutEffect(() => {
    if (failure && scroll.current) scroll.current.scrollTop = 0;
  }, [failure]);
  if (state.kind === "Closed") return null;
  const tasks = state.graph?.nodes.map((node) => node.task) ?? [];
  const root = tasks.find((task) => task.id === state.scope.root);
  const choices = controller.choices();
  const close = () => {
    clearTimeout(debounce.current);
    controller.close();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="dependency-dialog"
        data-testid="dependency-picker"
        initialFocus={search}
        finalFocus={returnFocus}
        showCloseButton={false}
      >
        <DialogTitle>
          {root?.title ?? state.scope.root}{" "}
          {state.direction === "dependsOn" ? "depends on…" : "blocks…"}
        </DialogTitle>
        <DialogDescription>
          Changes save as you check or uncheck a Task.
        </DialogDescription>
        <ToggleGroup
          aria-label="Dependency direction"
          data-testid="dependency-direction"
          value={[state.direction]}
          onValueChange={(value) => {
            if (value[0] === "dependsOn" || value[0] === "blocks")
              controller.direction(value[0]);
          }}
          variant="outline"
        >
          <ToggleGroupItem
            value="dependsOn"
            data-testid="dependency-depends-on"
          >
            Depends on
          </ToggleGroupItem>
          <ToggleGroupItem value="blocks" data-testid="dependency-blocks">
            Blocks
          </ToggleGroupItem>
        </ToggleGroup>
        <Field>
          <FieldLabel htmlFor="dependency-search">
            Search this Profile
          </FieldLabel>
          <Input
            ref={search}
            id="dependency-search"
            data-testid="dependency-search"
            maxLength={200}
            defaultValue={state.query}
            onChange={(event) => {
              const query = event.target.value;
              clearTimeout(debounce.current);
              debounce.current = setTimeout(
                () => void controller.find(query, request),
                250,
              );
            }}
          />
        </Field>
        {state.failure && (
          <DependencyErrorStatus
            failure={state.failure}
            attempted={state.attempted}
            context="add"
            tasks={tasks}
            reload={() => void controller.reload(request)}
          />
        )}
        <div ref={scroll} className="dependency-scroll">
          {!canWrite && (
            <p role="status">
              Dependencies are read-only while offline or writes are
              unavailable.
            </p>
          )}
          {state.loading && (
            <p role="status" className="flex items-center gap-2">
              <LoaderCircle />
              Loading Dependencies…
            </p>
          )}

          {state.warnings.map((warning) => {
            const projected = dependencyWarning(warning, tasks);
            return (
              <Alert
                key={`${warning.code}:${warning.dependent_id}`}
                data-testid="dependency-warning"
              >
                <AlertDescription>
                  <p>{projected.message}</p>
                  {projected.path.length > 0 && (
                    <ol className="dependency-witness">
                      {projected.path.map((title) => (
                        <li key={title}>{title}</li>
                      ))}
                    </ol>
                  )}
                </AlertDescription>
              </Alert>
            );
          })}
          {state.notice && <p role="status">{state.notice}</p>}
          {!state.loading && choices.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No matching Tasks</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          <div className="dependency-choices">
            {choices.map(({ task, checked }) => {
              const pending = state.pending.has(task.id);
              const dependent =
                state.direction === "dependsOn" ? state.scope.root : task.id;
              return (
                <label
                  aria-busy={pending}
                  aria-label={pending ? `Updating ${task.title}` : undefined}
                  className={
                    pending
                      ? "dependency-choice dependency-choice-pending"
                      : "dependency-choice"
                  }
                  key={task.id}
                >
                  <span className="dependency-checkbox">
                    <input
                      onKeyDown={(event) => {
                        if (
                          event.key !== "ArrowDown" &&
                          event.key !== "ArrowUp"
                        )
                          return;
                        const inputs = [
                          ...(scroll.current?.querySelectorAll<HTMLInputElement>(
                            'input[type="checkbox"]:not(:disabled)',
                          ) ?? []),
                        ];
                        const index = inputs.indexOf(event.currentTarget);
                        const next =
                          inputs[index + (event.key === "ArrowDown" ? 1 : -1)];
                        if (next) {
                          event.preventDefault();
                          next.focus();
                        }
                      }}
                      type="checkbox"
                      data-testid={`dependency-choice-${task.id}`}
                      checked={state.pending.get(task.id) ?? checked}
                      disabled={
                        !canWrite ||
                        pending ||
                        state.loading ||
                        state.conflicts.has(dependent)
                      }
                      aria-busy={pending}
                      onChange={(event) => {
                        void controller
                          .toggle(task.id, event.target.checked, request)
                          .then(onChanged);
                      }}
                    />
                    {pending && (
                      <LoaderCircle
                        aria-label="Updating"
                        data-testid={`dependency-pending-${task.id}`}
                      />
                    )}
                  </span>
                  <span>
                    <span>{task.title}</span>
                    <small className="text-muted-foreground">
                      {task.status === "cancelled" ? "Cancelled" : task.status}{" "}
                      · Version {task.row_version}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            data-testid="dependency-picker-close"
            onClick={close}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
