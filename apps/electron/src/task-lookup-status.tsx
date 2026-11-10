import type { TaskLookupDetails } from "@todo/domain";
import { Alert, AlertDescription } from "./components/ui/alert.tsx";
import { Button } from "./components/ui/button.tsx";

export type FindTask = (details: typeof TaskLookupDetails.Type) => void;

export function TaskLookupStatus({
  details,
  onFind,
  reasonClassName,
}: {
  details: typeof TaskLookupDetails.Type;
  reasonClassName?: string | undefined;
  onFind?: (() => void) | undefined;
}) {
  return (
    <Alert role="status" data-testid="task-lookup-status">
      <AlertDescription className="space-y-2 break-words">
        <p className={reasonClassName}>
          Task not found in {details.profile.name}.
        </p>
        <p className="text-muted-foreground">
          error 3 - not found or auth missing
        </p>
        <Button variant="outline" onClick={onFind} disabled={!onFind}>
          Find Task by id
        </Button>
      </AlertDescription>
    </Alert>
  );
}
