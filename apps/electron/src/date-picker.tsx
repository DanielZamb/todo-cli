import { TaskTime } from "@todo/domain";
import { DateTime, Schema } from "effect";
import { CalendarDays, Clock3 } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/ui/button.tsx";
import { Calendar } from "./components/ui/calendar.tsx";
import { Input } from "./components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./components/ui/popover.tsx";
import { timeText, zone } from "./model.ts";

const calendarMonth = (year: number, month: number) => {
  const value = new Date(0);
  value.setFullYear(year, month, 1);
  value.setHours(12, 0, 0, 0);
  return value;
};
export function DatePicker({
  label,
  value,
  disabled,
  onChange,
  dateOnly = false,
}: {
  label: string;
  value: typeof TaskTime.Type | null;
  disabled: boolean;
  onChange: (value: typeof TaskTime.Type | null) => void;
  dateOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>();
  const [displayedMonth, setDisplayedMonth] = useState(() => new Date());
  const [time, setTime] = useState("");
  const [withTime, setWithTime] = useState(false);
  const [timeZone, setTimeZone] = useState(zone);
  const [error, setError] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const text =
            value?.kind === "date"
              ? value.date
              : value
                ? new Intl.DateTimeFormat("en-CA", {
                    timeZone: value.time_zone,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date(value.utc))
                : "";
          const initial = text ? new Date(`${text}T12:00:00`) : undefined;
          setDate(initial);
          setDisplayedMonth(initial ?? new Date());
          setTime(
            value?.kind === "instant"
              ? new Date(value.utc).toLocaleTimeString("en-US", {
                  timeZone: value.time_zone,
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "",
          );
          setWithTime(!dateOnly && value?.kind === "instant");
          setTimeZone(value?.kind === "instant" ? value.time_zone : zone);
          setError("");
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="date-field"
            disabled={disabled}
          />
        }
        aria-label={`${label}: ${timeText(value) || "Choose date"}`}
      >
        <CalendarDays data-icon="inline-start" />
        {timeText(value) || "Choose date"}
      </PopoverTrigger>
      <PopoverContent
        className="max-h-(--available-height) w-auto overflow-y-auto p-3"
        align="end"
      >
        <Calendar
          captionLayout={dateOnly ? "dropdown" : "label"}
          {...(dateOnly
            ? {
                month: displayedMonth,
                onMonthChange: setDisplayedMonth,
                startMonth: calendarMonth(
                  Math.max(0, displayedMonth.getFullYear() - 100),
                  0,
                ),
                endMonth: calendarMonth(
                  Math.min(9999, displayedMonth.getFullYear() + 100),
                  11,
                ),
              }
            : {})}
          mode="single"
          selected={date}
          onSelect={setDate}
          defaultMonth={date ?? new Date()}
        />
        {withTime ? (
          <>
            <label className="date-time" htmlFor={`${label}-time`}>
              {label} time
              <Input
                id={`${label}-time`}
                value={time}
                placeholder="10:00 AM"
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <p className="quiet">{timeZone}</p>
          </>
        ) : !dateOnly ? (
          <Button
            type="button"
            variant="ghost"
            disabled={!date}
            onClick={() => setWithTime(true)}
          >
            <Clock3 data-icon="inline-start" />
            Add time
          </Button>
        ) : null}
        {error && <p role="alert">{error}</p>}
        <div className="actions">
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Clear date
          </Button>
          <Button
            type="button"
            disabled={!date || disabled}
            onClick={() => {
              if (!date) return;
              const day = [
                String(date.getFullYear()).padStart(4, "0"),
                String(date.getMonth() + 1).padStart(2, "0"),
                String(date.getDate()).padStart(2, "0"),
              ].join("-");
              const match = /^(0?[1-9]|1[0-2]):([0-5][0-9]) (AM|PM)$/.exec(
                time,
              );
              if (withTime && !match) {
                setError("Use a time such as 10:00 AM.");
                return;
              }
              const utc = match
                ? DateTime.formatIso(
                    DateTime.makeZonedUnsafe(
                      {
                        year: date.getFullYear(),
                        month: date.getMonth() + 1,
                        day: date.getDate(),
                        hour:
                          (Number(match[1]) % 12) +
                          (match[3] === "PM" ? 12 : 0),
                        minute: Number(match[2]),
                        second: 0,
                      },
                      { timeZone: timeZone, adjustForTimeZone: true },
                    ),
                  )
                : "";
              onChange(
                Schema.decodeUnknownSync(TaskTime)(
                  withTime
                    ? { kind: "instant", utc, time_zone: timeZone }
                    : { kind: "date", date: day },
                ),
              );
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
