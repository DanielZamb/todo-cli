import { Recurrence, type Series, type TaskTime } from "@todo/domain";
import { Schema } from "effect";
import { useState } from "react";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import { Field, FieldGroup, FieldLabel } from "./components/ui/field.tsx";
import { Input } from "./components/ui/input.tsx";
import { NativeSelect } from "./components/ui/native-select.tsx";
import { DatePicker } from "./date-picker.tsx";
import { timeText } from "./model.ts";
import {
  defaultRule,
  Preset,
  presetNames,
  ruleDraft,
  ruleText,
  weekdayNames,
  weekdays,
} from "./recurrence.ts";

export function RecurrenceDialog({
  series,
  start,
  disabled,
  busy,
  error,
  onClose,
  onSave,
  onSkip,
}: {
  series: Series | null;
  start: TaskTime;
  disabled: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (recurrence: Recurrence) => void;
  onSkip: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    series ? ruleDraft(series.recurrence.rrule) : defaultRule,
  );
  const [dtstart, setStart] = useState<TaskTime | null>(
    series?.recurrence.dtstart ?? start,
  );
  const custom =
    series !== null && ruleDraft(series.recurrence.rrule).preset === "custom";
  const valid =
    dtstart !== null &&
    (draft.preset !== "weekly" || draft.days.length > 0) &&
    Number.isInteger(draft.day) &&
    draft.day >= 1 &&
    draft.day <= 31;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="recurrence-dialog">
        <DialogTitle>
          {series ? "Series recurrence" : "Create Series"}
        </DialogTitle>
        <DialogDescription>
          {series
            ? "Changes apply to this Occurrence and future Occurrences."
            : "Create a new Series using these task details. The current task stays in this Profile."}
        </DialogDescription>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="recurrence-preset">Repeat</FieldLabel>
            <NativeSelect
              id="recurrence-preset"
              disabled={disabled || custom}
              value={draft.preset}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  preset: Schema.decodeUnknownSync(Preset)(event.target.value),
                })
              }
            >
              {Object.entries(presetNames)
                .filter(([key]) => key !== "custom" || custom)
                .map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          {draft.preset === "weekly" && (
            <fieldset className="weekdays">
              <legend>Days</legend>
              {weekdays.map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={draft.days.includes(day)}
                    disabled={disabled}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        days: event.target.checked
                          ? [...draft.days, day]
                          : draft.days.filter((value) => value !== day),
                      })
                    }
                  />
                  {weekdayNames[day]}
                </label>
              ))}
            </fieldset>
          )}
          {draft.preset === "monthly-date" && (
            <Field>
              <FieldLabel htmlFor="month-day">Day of month</FieldLabel>
              <Input
                id="month-day"
                type="number"
                min={1}
                max={31}
                value={draft.day}
                disabled={disabled}
                onChange={(event) =>
                  setDraft({ ...draft, day: Number(event.target.value) })
                }
              />
            </Field>
          )}
          {draft.preset === "monthly-position" && (
            <div className="actions">
              <NativeSelect
                aria-label="Position in month"
                disabled={disabled}
                value={draft.position}
                onChange={(event) =>
                  setDraft({ ...draft, position: Number(event.target.value) })
                }
              >
                {[
                  [1, "First"],
                  [2, "Second"],
                  [3, "Third"],
                  [4, "Fourth"],
                  [-1, "Last"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label="Day of week"
                disabled={disabled}
                value={draft.weekday}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    weekday: Schema.decodeUnknownSync(
                      Schema.Literals(weekdays),
                    )(event.target.value),
                  })
                }
              >
                {weekdays.map((day) => (
                  <option key={day} value={day}>
                    {weekdayNames[day]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <Field>
            <FieldLabel>Starts</FieldLabel>
            <DatePicker
              label="Series start"
              value={dtstart}
              disabled={disabled || custom}
              onChange={setStart}
            />
          </Field>
          <div className="rule-preview">
            <span className="quiet">
              RFC 5545{custom ? " · Read only" : ""}
            </span>
            <code>{custom ? series.recurrence.rrule : ruleText(draft)}</code>
            {series && series.recurrence.exdate.length > 0 && (
              <p className="quiet">
                Excluded:{" "}
                {series.recurrence.exdate
                  .map((value) => timeText(value))
                  .join(", ")}
              </p>
            )}
            {custom && (
              <p className="quiet">
                This custom rule is preserved. Preset editing is unavailable.
              </p>
            )}
          </div>
          {error && <p role="alert">{error}</p>}
        </FieldGroup>
        <div className="recurrence-footer">
          {series && (
            <Button variant="outline" disabled={disabled} onClick={onSkip}>
              Skip Occurrence
            </Button>
          )}
          <Button
            disabled={disabled || custom || !valid}
            onClick={() => {
              if (dtstart)
                onSave(
                  Schema.decodeUnknownSync(Recurrence)({
                    dtstart,
                    rrule: ruleText(draft),
                    exdate: series?.recurrence.exdate ?? [],
                  }),
                );
            }}
          >
            {series ? "Save Series" : "Create Series"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
