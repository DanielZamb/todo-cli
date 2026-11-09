import type { TaskId } from "@todo/domain";
import { useEffect, useState } from "react";
import { Button } from "./components/ui/button.tsx";
import type { Reply, Request } from "./protocol.ts";

export function TaskIdCopy({
  task,
  request,
}: {
  task: typeof TaskId.Type;
  request: (request: Request) => Promise<Reply>;
}) {
  const [feedback, setFeedback] = useState<{
    task: string;
    kind: "copied" | "failed";
  } | null>(null);
  useEffect(() => {
    if (feedback?.kind !== "copied") return;
    const timer = setTimeout(() => setFeedback(null), 2000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const current = feedback?.task === task ? feedback.kind : null;
  return (
    <div className="task-id-copy">
      <fieldset className="task-id-value" aria-label="Task id">
        <code>{task}</code>
      </fieldset>
      <Button
        type="button"
        variant="outline"
        aria-label="Copy task id"
        onClick={async () => {
          const reply = await request({ _tag: "copyTaskId", task });
          setFeedback({
            task,
            kind: reply._tag === "ok" ? "copied" : "failed",
          });
        }}
      >
        {current === "copied" ? "Copied" : "Copy"}
      </Button>
      <span
        role={current === "failed" ? "alert" : "status"}
        className={current === "failed" ? "copy-error" : "sr-only"}
      >
        {current === "copied"
          ? "Task id copied"
          : current === "failed"
            ? "Couldn't copy task id. Try again."
            : ""}
      </span>
      {current === "failed" && (
        <Button type="button" variant="ghost" onClick={() => setFeedback(null)}>
          Dismiss copy error
        </Button>
      )}
    </div>
  );
}
