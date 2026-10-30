import { CalendarDate, TaskFilters } from "@todo/domain";
import { Schema } from "effect";
import { useState } from "react";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import { Field, FieldGroup, FieldLabel } from "./components/ui/field.tsx";
import { Input } from "./components/ui/input.tsx";
import { NativeSelect } from "./components/ui/native-select.tsx";
import { DatePicker } from "./date-picker.tsx";

type DateFilterDraft =
  | { kind: "any" }
  | { kind: "none" }
  | { kind: "on"; date: typeof CalendarDate.Type | "" };
const dateDraft = (value: string | undefined): DateFilterDraft =>
  value === undefined || value === ""
    ? { kind: "any" }
    : value === "none"
      ? { kind: "none" }
      : { kind: "on", date: Schema.decodeUnknownSync(CalendarDate)(value) };
const dateValue = (draft: DateFilterDraft) =>
  draft.kind === "any"
    ? undefined
    : draft.kind === "none"
      ? "none"
      : draft.date;

export function taskFilterSummary(filters: TaskFilters) {
  return [
    filters.status,
    filters.priority,
    filters.due &&
      (filters.due === "none" ? "No due date" : `Due ${filters.due}`),
    filters.scheduled &&
      (filters.scheduled === "none"
        ? "Not scheduled"
        : `Scheduled ${filters.scheduled}`),
    filters.attachment && `Attachment: ${filters.attachment}`,
    filters.energy &&
      (filters.energy === "none" ? "No Energy" : `Energy ${filters.energy}`),
    filters.estimate &&
      (filters.estimate === "none" ? "No estimate" : `${filters.estimate} min`),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function TaskFilterDialog({
  filters,
  onApply,
  onClose,
  planning = false,
}: {
  planning?: boolean;
  filters: TaskFilters;
  onApply: (filters: TaskFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] =
    useState<{ [Key in keyof TaskFilters]: string }>(filters);
  const [dates, setDates] = useState(() => ({
    due: dateDraft(filters.due),
    scheduled: dateDraft(filters.scheduled),
  }));
  const [error, setError] = useState("");
  const change = (field: keyof TaskFilters, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const select = (
    field: "status" | "priority" | "energy",
    label: string,
    options: readonly (readonly [string, string])[],
  ) => (
    <Field>
      <FieldLabel htmlFor={`filter-${field}`}>{label}</FieldLabel>
      <NativeSelect
        id={`filter-${field}`}
        value={draft[field] ?? ""}
        onChange={(event) => change(field, event.target.value)}
        className="w-full"
        disabled={field === "status" && planning}
        aria-describedby={
          field === "status" && planning ? "planning-status-help" : undefined
        }
      >
        <option value="">Any</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </NativeSelect>
      {field === "status" && planning && (
        <p id="planning-status-help" className="quiet">
          Planning views show open Tasks only.
        </p>
      )}
    </Field>
  );
  const date = (field: "due" | "scheduled", label: string) => {
    const value = dates[field];
    return (
      <Field>
        <FieldLabel htmlFor={`filter-${field}-mode`}>{label}</FieldLabel>
        <NativeSelect
          id={`filter-${field}-mode`}
          value={value.kind}
          className="w-full"
          onChange={(event) => {
            const mode = event.target.value;
            setDates((current) => ({
              ...current,
              [field]:
                mode === "on"
                  ? {
                      kind: "on",
                      date: Schema.decodeUnknownSync(CalendarDate)(
                        new Date().toLocaleDateString("en-CA"),
                      ),
                    }
                  : mode === "none"
                    ? { kind: "none" }
                    : { kind: "any" },
            }));
          }}
        >
          <option value="any">Any date</option>
          <option value="none">No date</option>
          <option value="on">On date</option>
        </NativeSelect>
        {value.kind === "on" && (
          <DatePicker
            label={`${label} on`}
            value={
              value.date
                ? {
                    kind: "date",
                    date: value.date,
                  }
                : null
            }
            dateOnly
            disabled={false}
            onChange={(selected) =>
              setDates((current) => ({
                ...current,
                [field]: {
                  kind: "on",
                  date: selected?.kind === "date" ? selected.date : "",
                },
              }))
            }
          />
        )}
      </Field>
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="task-filter-dialog">
        <DialogTitle>Filter tasks</DialogTitle>
        <DialogDescription>
          Tasks must match every selected filter.
        </DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const value = Schema.decodeUnknownSync(TaskFilters)({
                ...Object.fromEntries(
                  Object.entries(draft).filter(
                    ([field, value]) =>
                      field !== "due" &&
                      field !== "scheduled" &&
                      !(field === "status" && planning) &&
                      value !== "",
                  ),
                ),
                ...(dates.due.kind === "any"
                  ? {}
                  : { due: dateValue(dates.due) }),
                ...(dates.scheduled.kind === "any"
                  ? {}
                  : { scheduled: dateValue(dates.scheduled) }),
              });
              onApply(value);
              onClose();
            } catch {
              setError(
                "Enter a valid date and a positive whole number of minutes.",
              );
            }
          }}
        >
          <FieldGroup className="task-filter-grid">
            {select("status", "Status", [
              ["open", "Open"],
              ["closed", "Closed"],
              ["done", "Done"],
              ["cancelled", "Cancelled"],
              ["snoozed", "Snoozed"],
            ])}
            {select("priority", "Priority", [
              ["P1", "P1"],
              ["P2", "P2"],
              ["P3", "P3"],
              ["P4", "P4"],
            ])}
            {date("due", "Due date")}
            {date("scheduled", "Scheduled date")}
            {select("energy", "Energy", [
              ["1", "1"],
              ["2", "2"],
              ["3", "3"],
              ["4", "4"],
              ["5", "5"],
              ["none", "No Energy"],
            ])}
            <Field>
              <FieldLabel htmlFor="filter-estimate">
                Estimated time, minutes
              </FieldLabel>
              <Input
                id="filter-estimate"
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                placeholder="Any"
                value={draft.estimate === "none" ? "" : (draft.estimate ?? "")}
                onChange={(event) => change("estimate", event.target.value)}
              />
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={draft.estimate === "none"}
                  onChange={(event) =>
                    change("estimate", event.target.checked ? "none" : "")
                  }
                />
                No estimate
              </label>
            </Field>
            <Field className="filter-attachment-query">
              <FieldLabel htmlFor="filter-attachment">
                Attachment contains
              </FieldLabel>
              <Input
                id="filter-attachment"
                placeholder="Name, label, path or URL"
                value={draft.attachment ?? ""}
                onChange={(event) => change("attachment", event.target.value)}
              />
            </Field>
          </FieldGroup>
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft({});
                setDates({ due: { kind: "any" }, scheduled: { kind: "any" } });
                setError("");
              }}
            >
              Clear all
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Apply filters</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
