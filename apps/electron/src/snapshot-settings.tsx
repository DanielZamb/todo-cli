import type { SnapshotManifest, SnapshotRestoreReport } from "@todo/domain";
import { FolderOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import type { Reply, Request } from "./protocol.ts";
import {
  snapshotProfileName,
  snapshotReason,
  snapshotTaskCount,
} from "./snapshot-presentation.ts";

const date = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
export function SnapshotSettings({
  request,
  readOnly,
}: {
  request: (request: Request) => Promise<Reply>;
  readOnly: boolean;
}) {
  const [snapshots, setSnapshots] = useState<readonly SnapshotManifest[]>([]);
  const [confirmation, setConfirmation] = useState<{
    snapshot: SnapshotManifest;
    report: SnapshotRestoreReport;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const result = await request({ _tag: "snapshots" });
    if (result._tag === "snapshots") {
      setSnapshots(result.snapshots);
      setLoaded(true);
      setError("");
    } else if (result._tag === "error") setError(result.message);
  }, [request]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    setBusy(true);
    const reply = await request({ _tag: "snapshotCreate", reason: "manual" });
    if (reply._tag === "error") setError(reply.message);
    else await load();
    setBusy(false);
  }
  async function preview(snapshot: SnapshotManifest) {
    setBusy(true);
    const reply = await request({
      _tag: "snapshotRestore",
      id: snapshot.id,
      dryRun: true,
    });
    if (reply._tag === "snapshotRestore")
      setConfirmation({ snapshot, report: reply.restore });
    else if (reply._tag === "error") setError(reply.message);
    setBusy(false);
  }
  async function restore() {
    if (!confirmation) return;
    setBusy(true);
    const reply = await request({
      _tag: "snapshotRestore",
      id: confirmation.snapshot.id,
      dryRun: false,
    });
    if (reply._tag === "error") setError(reply.message);
    else {
      setConfirmation(null);
      await load();
    }
    setBusy(false);
  }
  return (
    <>
      <DialogTitle className="snapshot-dialog-title">Settings</DialogTitle>
      <section className="snapshot-settings" aria-label="Snapshots">
        <div className="snapshot-heading">
          <div>
            <h2>Snapshots</h2>
            <DialogDescription>
              A point-in-time copy of every Profile.
            </DialogDescription>
          </div>
          <Button onClick={() => void create()} disabled={readOnly || busy}>
            Create Snapshot
          </Button>
        </div>
        {error && (
          <p role="alert">
            {error}{" "}
            <Button variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </p>
        )}
        {!loaded && !error && <p className="quiet">Loading Snapshots…</p>}
        {loaded && snapshots.length === 0 && (
          <div className="snapshot-empty">
            <h3>No Snapshots yet</h3>
            <p className="quiet">
              Create one before making changes you may want to restore.
            </p>
          </div>
        )}
        <div className="snapshot-list">
          {snapshots.map((snapshot) => (
            <article key={snapshot.id} className="snapshot-row">
              <div className="snapshot-row-heading">
                <h3>{date(snapshot.created_at)}</h3>
                <div className="snapshot-actions">
                  <Button
                    variant="outline"
                    onClick={() => void preview(snapshot)}
                    disabled={readOnly || busy}
                  >
                    Restore…
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Reveal in Finder"
                    title="Reveal in Finder"
                    onClick={() =>
                      void request({ _tag: "snapshotReveal", id: snapshot.id })
                    }
                  >
                    <FolderOpen aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div className="snapshot-metadata-group">
                <p className="quiet snapshot-metadata">
                  {snapshotReason(snapshot.reason)} ·{" "}
                  {new Intl.NumberFormat("en-US", {
                    style: "unit",
                    unit: "kilobyte",
                    maximumFractionDigits: 0,
                  }).format(snapshot.size / 1024)}
                </p>
                <p className="quiet snapshot-metadata">
                  {snapshot.task_counts
                    .slice(0, 2)
                    .map(
                      (row) =>
                        `${snapshotProfileName(row.name)}: ${snapshotTaskCount(row.count)}`,
                    )
                    .join(" · ")}
                  {snapshot.task_counts.length > 2 &&
                    ` · +${snapshot.task_counts.length - 2}`}
                </p>
              </div>
            </article>
          ))}
        </div>
        <p className="quiet snapshot-note">
          Purged content stays erased.
          <span className="snapshot-note-detail">
            {" "}
            Todo saves your current state before a restore.
          </span>
        </p>
      </section>
      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <DialogContent className="snapshot-confirmation">
          <DialogTitle>Restore Snapshot?</DialogTitle>
          <DialogDescription>
            Return every Profile to{" "}
            {confirmation && date(confirmation.snapshot.created_at)}. Changes
            made after that time will be lost. Todo will save your current state
            first.
          </DialogDescription>
          <ul>
            {confirmation?.report.task_counts.map((row) => (
              <li key={row.profile}>
                {snapshotProfileName(row.name)}: {snapshotTaskCount(row.before)}{" "}
                now, {row.after} after restore
              </li>
            ))}
          </ul>
          {error && <p role="alert">{error}</p>}
          <div className="snapshot-actions">
            <Button
              variant="outline"
              onClick={() => setConfirmation(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void restore()}
              disabled={readOnly || busy}
            >
              Restore Snapshot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
