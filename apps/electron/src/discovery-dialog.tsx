import { LoaderCircle } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "./components/ui/alert.tsx";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "./components/ui/empty.tsx";
import { Field, FieldError, FieldLabel } from "./components/ui/field.tsx";
import { Input } from "./components/ui/input.tsx";
import { Separator } from "./components/ui/separator.tsx";
import type { DiscoveryStateController } from "./discovery-state.ts";
import type { Reply, Request } from "./protocol.ts";
import { TaskIdCopy } from "./task-id-copy.tsx";

function DiscoveryIdentity({ id, name }: { id: string; name: string }) {
  return id === name ? null : (
    <p className="discovery-profile-id text-muted-foreground">
      <span>id </span>
      <code className="type-code">{id}</code>
    </p>
  );
}

export function DiscoveryDialog({
  controller,
  request,
  connected,
  show,
  onClose,
  returnFocus,
}: {
  controller: DiscoveryStateController;
  request: (request: Request) => Promise<Reply>;
  connected: boolean;
  show: Parameters<DiscoveryStateController["show"]>[2];
  onClose: () => void;
  returnFocus: () => HTMLElement | null;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  if (state.kind === "Closed") return null;
  const identity =
    state.kind === "Showing"
      ? state.appliedSnapshot.requestedIdentity
      : state.kind === "Editing" || state.kind === "Invalid"
        ? { kind: state.dialog, prefix: state.prefix }
        : state.requestedIdentity;
  const lookup = identity.kind === "lookup";
  const snapshot = state.kind === "Showing" ? state.appliedSnapshot : null;
  const result = snapshot?.result;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        finalFocus={() => returnFocus()}
        className="discovery-dialog"
        showCloseButton={false}
        data-testid={lookup ? "discovery-lookup" : "discovery-directory"}
        data-discovery-state={state.kind}
      >
        <div className="discovery-header">
          <DialogTitle>
            {lookup ? "Find Task by id" : "Profiles and Projects"}
          </DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            data-testid="discovery-close"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
        <DialogDescription>
          {lookup
            ? "Search Profiles available to this credential"
            : "Profiles and Projects available to this credential"}
        </DialogDescription>
        {lookup && (
          <form
            className="discovery-form"
            onSubmit={(event) => {
              event.preventDefault();
              void controller.submit(request, identity.prefix, "lookup");
            }}
          >
            <Field data-invalid={state.kind === "Invalid" || undefined}>
              <FieldLabel htmlFor="discovery-prefix">Id starts with</FieldLabel>
              <Input
                id="discovery-prefix"
                data-testid="discovery-prefix"
                value={identity.prefix}
                aria-invalid={state.kind === "Invalid"}
                aria-describedby={
                  state.kind === "Invalid" ? "discovery-validation" : undefined
                }
                onChange={(event) => controller.editPrefix(event.target.value)}
                autoComplete="off"
                autoFocus
              />
              {state.kind === "Invalid" && (
                <FieldError id="discovery-validation">
                  Use 1 to 36 hexadecimal digits or hyphens. Spaces are not
                  allowed.
                </FieldError>
              )}
            </Field>
            <Button
              type="submit"
              data-testid="discovery-find"
              disabled={state.kind === "Requesting" || !connected}
            >
              Find
            </Button>
          </form>
        )}
        <Separator />
        <div className="discovery-scroll" aria-live="polite">
          {state.kind === "Editing" && lookup && (
            <p className="text-muted-foreground">
              Enter the start of a Task id, then choose Find.
            </p>
          )}
          {state.kind === "Requesting" && (
            <p role="status" className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" />
              {lookup ? "Finding Tasks…" : "Loading Profiles and Projects…"}
            </p>
          )}
          {state.kind === "ResponseError" && (
            <div className="space-y-3">
              <Alert data-testid="discovery-error">
                <AlertDescription className="whitespace-pre-wrap break-words">
                  {state.message}
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                data-testid={
                  lookup
                    ? "discovery-lookup-retry"
                    : "discovery-directory-retry"
                }
                disabled={!connected}
                onClick={() => void controller.retry(request)}
              >
                Retry
              </Button>
            </div>
          )}
          {result?._tag === "directory" && (
            <div data-testid="discovery-directory-list" className="space-y-4">
              {result.profiles.length === 0 && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No Profiles</EmptyTitle>
                    <EmptyDescription>
                      No Profiles are available to this credential.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {result.profiles.map((profile) => (
                <section key={profile.id} className="discovery-profile">
                  <header>
                    <h3 className="font-semibold">{profile.name}</h3>
                    <DiscoveryIdentity id={profile.id} name={profile.name} />
                  </header>
                  <div className="discovery-projects">
                    <p className="text-muted-foreground">Projects</p>
                    {profile.projects?.length ? (
                      <ul className="space-y-2 pl-3">
                        {profile.projects.map((project) => (
                          <li key={project.id}>
                            <p>{project.name}</p>
                            <DiscoveryIdentity
                              id={project.id}
                              name={project.name}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="pl-3 text-muted-foreground">No Projects</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
          {result?._tag === "lookup" && snapshot && (
            <div data-testid="discovery-results" className="space-y-4">
              {result.matches.length === 0 && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No matching Tasks</EmptyTitle>
                    <EmptyDescription>Try another id prefix.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {result.matches.map((match) => (
                <section
                  key={`${match.profile.id}:${match.task_id}`}
                  className="discovery-match"
                >
                  <h3 className="font-medium">{match.title}</h3>
                  <p>
                    {match.profile.name} · {match.project ?? "No Project"}
                  </p>
                  <DiscoveryIdentity
                    id={match.profile.id}
                    name={match.profile.name}
                  />
                  <TaskIdCopy
                    task={match.task_id}
                    request={request}
                    testId={`discovery-copy-${match.task_id}`}
                  />
                  <Button
                    variant="outline"
                    data-testid={`discovery-show-${match.task_id}`}
                    onClick={() => void controller.show(snapshot, match, show)}
                  >
                    Show in {match.profile.name}
                  </Button>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
