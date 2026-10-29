import { Combobox } from "@base-ui/react/combobox";
import { ChevronDown, Plus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "./components/ui/input-group.tsx";

export function NameCombobox({
  id,
  label,
  options,
  value,
  disabled,
  multiple = false,
  wrapValue = false,
  onCommit,
  children,
}: {
  id: string;
  label: string;
  options: readonly string[];
  value: string;
  disabled: boolean;
  multiple?: boolean;
  wrapValue?: boolean;
  onCommit: (name: string) => void;
  children?: ReactNode;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(value), [value]);
  const name = multiple ? text.trim().toLowerCase() : text.trim();
  const existing = options.find(
    (option) => option.toLowerCase() === name.toLowerCase(),
  );
  const items = [
    ...options.filter((option) =>
      option.toLowerCase().includes(name.toLowerCase()),
    ),
    ...(name && !existing ? [name] : []),
    ...(!multiple && !name ? [""] : []),
  ];
  const commit = (name: string) => {
    onCommit(name);
    setOpen(false);
    setText(multiple ? "" : name);
  };
  const input = (
    <Combobox.Input
      id={id}
      aria-label={multiple ? "Add Tag" : label}
      placeholder={multiple ? "Add Tag" : "No Project"}
      render={<InputGroupInput />}
      onKeyDown={(event) => {
        if (multiple && event.key === "," && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit(existing ?? name);
        }
      }}
    />
  );
  return (
    <Combobox.Root
      autoHighlight
      open={open}
      onOpenChange={setOpen}
      items={items}
      filter={null}
      value={multiple ? null : value}
      inputValue={text}
      disabled={disabled}
      onInputValueChange={(text, details) => {
        if (
          details.reason === "input-change" ||
          details.reason === "input-clear"
        )
          setText(text);
      }}
      onValueChange={(name) => {
        if (name !== null) commit(name);
      }}
    >
      <Combobox.InputGroup
        render={
          <InputGroup
            className={
              multiple
                ? "tag-input"
                : wrapValue
                  ? "project-name-field"
                  : undefined
            }
          />
        }
      >
        {multiple ? (
          <div className="tag-values">
            {children}
            {input}
          </div>
        ) : (
          <>
            {wrapValue && (
              <span className="project-value" aria-hidden="true">
                {text || "No Project"}
              </span>
            )}
            {input}
          </>
        )}
        <InputGroupAddon
          align="inline-end"
          className={multiple ? "tag-trigger" : undefined}
        >
          <Combobox.Trigger
            className="combobox-chevron"
            aria-label={`Choose ${label}`}
          >
            <ChevronDown className="size-4" />
          </Combobox.Trigger>
        </InputGroupAddon>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="isolate">
          <Combobox.Popup className="w-(--anchor-width) rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
            <Combobox.List className="max-h-52 overflow-auto">
              {(name: string) => (
                <Combobox.Item
                  key={name}
                  value={name}
                  className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {name && !options.includes(name) && (
                    <Plus className="size-4" aria-hidden="true" />
                  )}
                  {!name
                    ? "No Project"
                    : !options.includes(name)
                      ? `Create “${name}”`
                      : name}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
