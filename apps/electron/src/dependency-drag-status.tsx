import type { Task } from "@todo/domain";
import { Alert, AlertDescription } from "./components/ui/alert.tsx";
import { Button } from "./components/ui/button.tsx";
import { DependencyErrorStatus } from "./dependency-dialog.tsx";
import type { DependencyDragState } from "./dependency-drag-state.ts";
import { dependencyWarning } from "./dependency-presentation.ts";

export function DependencyDragStatus({
  state,
  tasks,
  close,
  choose,
}: {
  state: DependencyDragState;
  tasks: readonly Task[];
  close: () => void;
  choose: (target: Task) => void;
}) {
  if (state.kind === "Dragging")
    return (
      <p className="sr-only" role="status">
        Drop onto a Task to make it depend on {state.source.title}.
      </p>
    );
  if (state.kind !== "Result") return null;
  const message = state.message;
  return (
    <Alert
      data-testid="dependency-drop-status"
      role="status"
      className="dependency-drop-status"
    >
      <AlertDescription>
        {message && <p>{message}</p>}
        {state.kind === "Result" && state.failure && (
          <>
            <DependencyErrorStatus
              failure={state.failure}
              context="add"
              tasks={tasks}
              attempted={state.source}
              reload={() => choose(state.target)}
            />
            {state.failure._tag !== "conflict" && (
              <Button variant="outline" onClick={() => choose(state.target)}>
                Choose another Task
              </Button>
            )}
          </>
        )}
        {state.kind === "Result" &&
          state.warnings.map((warning) => {
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
        {state.kind === "Result" && (
          <Button variant="ghost" size="sm" onClick={close}>
            Dismiss
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
