"use client";

import { useId, useState } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Composition parts ───────────────────────────────────────────────────────

export const Select = SelectPrimitive.Root;

/**
 * Trigger styled to match `.input-base`: 36px tall, surface-950 bg,
 * surface-700 border, accent-300 focus ring.
 */
export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-md",
        "border border-surface-700 bg-surface-950 px-3 text-sm text-text-primary",
        "transition-all duration-150 outline-none",
        "focus:border-accent-300 focus:ring-2 focus:ring-accent-300/20",
        "data-[placeholder]:text-surface-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown size={16} className="shrink-0 text-surface-400" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export const SelectValue = SelectPrimitive.Value;

export function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-md",
          "border border-surface-800 bg-surface-900 p-1 shadow-elevation-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2",
        "text-sm text-text-primary outline-none",
        "data-[highlighted]:bg-surface-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={14} className="text-brand-400" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

// ─── Convenience component ───────────────────────────────────────────────────

export interface SimpleSelectOption {
  value: string;
  label: string;
}

interface SimpleSelectProps {
  options: SimpleSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Show the search input only when options exceed this count. */
  searchThreshold?: number;
  noResultsText?: string;
  required?: boolean;
  "aria-label"?: string;
}

/**
 * Searchable combobox (Popover + cmdk) with the same props as the old
 * Radix-Select-based SimpleSelect, so existing call sites are unchanged.
 * Clearing is done via a `value=""` option (e.g. "All projects"), which
 * renders and selects like any other option.
 */
export function SimpleSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  id,
  disabled,
  className,
  searchThreshold = 5,
  noResultsText = "No results found",
  required,
  "aria-label": ariaLabel,
}: SimpleSelectProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = options.find((opt) => opt.value === value);
  const showSearch = options.length > searchThreshold;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          id={id}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md",
            "border border-surface-700 bg-surface-950 px-3 text-sm text-text-primary",
            "transition-all duration-150 outline-none",
            "focus:border-accent-300 focus:ring-2 focus:ring-accent-300/20",
            "data-[placeholder]:text-surface-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "cursor-pointer",
            !selected && "text-surface-500",
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown size={16} className="shrink-0 text-surface-400" />
        </button>
      </PopoverPrimitive.Trigger>
      {required && (
        // Lets a wrapping <form> enforce required without a native <select>.
        <input
          aria-hidden
          tabIndex={-1}
          required
          value={value}
          onChange={() => {}}
          className="sr-only pointer-events-none absolute h-0 w-0 opacity-0"
        />
      )}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          className={cn(
            "z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-md",
            "border border-surface-800 bg-surface-900 p-1 shadow-elevation-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <Command>
            {showSearch && (
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none"
                />
                <Command.Input
                  placeholder="Search…"
                  className="h-8 w-full bg-transparent pl-8 pr-2 text-sm text-text-primary outline-none placeholder:text-surface-500"
                />
              </div>
            )}
            <Command.List id={listId} className="max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto">
              <Command.Empty className="px-3 py-2 text-sm text-surface-500">
                {noResultsText}
              </Command.Empty>
              {options.map((opt) => (
                // value carries label + value so cmdk filters on both;
                // uniqueness comes from opt.value.
                <Command.Item
                  key={`${opt.value}-${opt.label}`}
                  value={opt.value === "" ? `__clear__ ${opt.label}` : `${opt.value} ${opt.label}`}
                  keywords={[opt.value, opt.label]}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2",
                    "text-sm text-text-primary outline-none",
                    "data-[selected=true]:bg-surface-800 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
                  )}
                >
                  {opt.value === value && (
                    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                      <Check size={14} className="text-brand-400" />
                    </span>
                  )}
                  {opt.label}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
