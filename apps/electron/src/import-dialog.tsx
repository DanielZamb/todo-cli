import {
  ImportItem,
  type ImportReport,
  type ImportRequest,
  type ProfileId,
  parseImportText,
} from "@todo/domain";
import { Option, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import { Input } from "./components/ui/input.tsx";
import { importChangesText } from "./import-presentation.ts";
import { countTasks } from "./presentation.ts";

type Preview = Omit<ImportReport, "items"> & {
  items: readonly (ImportReport["items"][number] & { key: string })[];
  input: ImportRequest["items"];
  fileName: string;
  generation: number;
};
export function ImportDialog({
  profile,
  profileName,
  compact,
  canWrite,
  onClose,
  onApplied,
}: {
  profile: ProfileId;
  profileName: string;
  compact: boolean;
  canWrite: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [items, setItems] = useState<ImportRequest["items"]>([]);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<Preview | null>(null);
  const [closeMissing, setCloseMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const choose = async (file: File | undefined) => {
    const run = ++generation.current;
    setItems([]);
    setFileName("");
    setReport(null);
    setError("");
    setReading(!!file);
    if (!file) return;
    try {
      const parsed = parseImportText(await file.text());
      if (run !== generation.current) return;
      setItems(parsed);
      setFileName(file.name);
    } catch {
      if (run === generation.current)
        setError(
          "This file is not a JSON array or NDJSON. Check its contents and choose it again.",
        );
    } finally {
      if (run === generation.current) setReading(false);
    }
  };
  const run = async (dry_run: boolean) => {
    const version = generation.current;
    const source = dry_run ? items : report?.input;
    if (!source || (!dry_run && report?.generation !== version)) return;
    const name = dry_run ? fileName : (report?.fileName ?? fileName);
    setBusy(true);
    setError("");
    try {
      const pinned =
        dry_run || !report
          ? source
          : source.map((raw, index) => {
              const item = Schema.decodeUnknownOption(ImportItem, {
                onExcessProperty: "error",
              })(raw);
              return Option.isSome(item)
                ? {
                    ...item.value,
                    task_id:
                      item.value.task_id === undefined
                        ? (report.items[index]?.task_id ?? null)
                        : item.value.task_id,
                    from_version:
                      item.value.from_version === undefined
                        ? (report.items[index]?.from_version ?? null)
                        : item.value.from_version,
                  }
                : raw;
            });
      const candidates =
        !dry_run && closeMissing && report
          ? report.items.slice(source.length).flatMap((row) =>
              row.task_id &&
              row.from_version !== null &&
              row.outcome === "updated"
                ? [
                    {
                      external_id: row.external_id,
                      task_id: row.task_id,
                      from_version: row.from_version,
                    },
                  ]
                : [],
            )
          : undefined;
      const reply = await window.desktop.request({
        _tag: "importTasks",
        profile,
        payload: {
          items: pinned,
          dry_run,
          file_name: name,
          close_missing: closeMissing,
          ...(candidates === undefined
            ? {}
            : { close_missing_candidates: candidates }),
        },
      });
      if (version !== generation.current) return;
      if (reply._tag !== "importReport") {
        setError(
          reply._tag === "error"
            ? reply.message
            : "Import unavailable. Try previewing again.",
        );
        return;
      }
      setReport({
        ...reply.report,
        items: reply.report.items.map((row) => ({
          ...row,
          key: crypto.randomUUID(),
        })),
        input: source,
        fileName: name,
        generation: version,
      });
      if (!dry_run) onApplied();
    } catch (error) {
      if (version === generation.current) setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const rows = report?.items.map((row, index) => {
    const item = report.input[index];
    const title =
      Schema.is(ImportItem)(item) && item.title
        ? item.title
        : index >= report.input.length
          ? "Cancel missing Task"
          : "Untitled Task";
    return {
      row,
      title,
      outcome:
        row.error?.code === "occ_conflict"
          ? "Conflict"
          : row.outcome.charAt(0).toUpperCase() + row.outcome.slice(1),
      changes: row.error?.message ?? importChangesText(row),
    };
  });
  const count = (report?.totals.created ?? 0) + (report?.totals.updated ?? 0);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className={`import-dialog ${compact ? "import-compact" : ""}`}
      >
        <DialogTitle>
          {report
            ? report.dry_run
              ? "Preview import"
              : "Import results"
            : "Import Tasks"}
        </DialogTitle>
        {fileName ? (
          <div className="import-file-heading">
            <DialogDescription
              className="import-file-name"
              title={report?.fileName ?? fileName}
            >
              {report?.fileName ?? fileName} · {profileName} ·
            </DialogDescription>
            <Button
              variant="link"
              className="import-change-file"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              Change…
            </Button>
          </div>
        ) : (
          <DialogDescription>
            Choose a JSON array or NDJSON file to match Tasks by external id.
          </DialogDescription>
        )}
        {!report && (
          <label className="import-close-missing">
            <input
              type="checkbox"
              checked={closeMissing}
              disabled={busy || reading}
              onChange={(event) => setCloseMissing(event.target.checked)}
            />
            Cancel missing Tasks with external ids
          </label>
        )}
        <div className="import-file" hidden={!!report}>
          <label className="import-file-label" htmlFor="import-file">
            Import file
          </label>
          <Input
            id="import-file"
            ref={fileInput}
            type="file"
            accept=".json,.ndjson,.jsonl,application/json"
            disabled={busy}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
          {fileName && (
            <p className="quiet">
              {countTasks(items.length, true)} ready to preview
            </p>
          )}
        </div>
        {report && (
          <>
            <div className="import-summary" aria-live="polite">
              {Object.entries(report.totals)
                .filter(([, total]) => !compact || total > 0)
                .map(([outcome, total], index) => (
                  <span key={outcome}>
                    {compact && index > 0 && (
                      <span aria-hidden="true"> · </span>
                    )}
                    <span
                      className={
                        compact && outcome === "rejected"
                          ? "import-rejected"
                          : ""
                      }
                    >
                      <strong>{total}</strong> {outcome}
                    </span>
                  </span>
                ))}
              {compact &&
                Object.values(report.totals).every((total) => total === 0) &&
                "No changes"}
            </div>
            <div className="import-list-scroll">
              {compact ? (
                <ul className="import-stack" aria-label="Import preview">
                  {rows?.map(({ row, title, outcome, changes }) => (
                    <li className="import-row" key={row.key}>
                      <div className="import-row-heading">
                        <span className="import-row-title" title={title}>
                          {title}
                        </span>
                        <span
                          className={
                            row.outcome === "rejected" ? "import-rejected" : ""
                          }
                        >
                          {outcome}
                        </span>
                      </div>
                      <small className="import-row-id" title={row.external_id}>
                        {row.external_id || "Missing external id"}
                      </small>
                      <p
                        title={changes}
                        className={
                          row.error
                            ? "import-rejected import-row-changes"
                            : "import-row-changes"
                        }
                      >
                        {changes}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <table className="import-table" aria-label="Import preview">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Outcome</th>
                      <th>Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows?.map(({ row, title, outcome, changes }) => (
                      <tr key={row.key}>
                        <td>
                          <span>{title}</span>
                          <small title={row.external_id}>
                            {row.external_id || "Missing external id"}
                          </small>
                        </td>
                        <td
                          className={
                            row.outcome === "rejected" ? "import-rejected" : ""
                          }
                        >
                          {outcome}
                        </td>
                        <td>{changes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {report.items.length === 0 && (
                <p className="quiet">The file contains no Tasks.</p>
              )}
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {!canWrite && (
          <p className="quiet">Offline. Reconnect to preview or apply.</p>
        )}
        <div className="import-footer-region">
          {report && report.totals.rejected > 0 && (
            <p className="import-skip-notice">
              {report.totals.rejected} rejected{" "}
              {report.totals.rejected === 1 ? "item" : "items"}{" "}
              {report.dry_run
                ? "will be skipped."
                : report.totals.rejected === 1
                  ? "was skipped."
                  : "were skipped."}
            </p>
          )}
          <div className="import-footer">
            <div className="import-footer-actions">
              <Button
                variant={report && !report.dry_run ? "default" : "outline"}
                disabled={busy}
                size="default"
                onClick={onClose}
              >
                {report && !report.dry_run ? "Done" : "Cancel"}
              </Button>
              {!report && (
                <Button
                  disabled={!fileName || reading || busy || !canWrite}
                  size="default"
                  onClick={() => void run(true)}
                >
                  {busy ? "Previewing…" : "Preview changes"}
                </Button>
              )}
              {report?.dry_run && (
                <Button
                  disabled={busy || !canWrite || count === 0}
                  size="default"
                  onClick={() => void run(false)}
                >
                  {busy
                    ? "Applying…"
                    : `Apply ${count} ${count === 1 ? "change" : "changes"}`}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
