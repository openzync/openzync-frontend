"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Minimal toggle switch — pure CSS, no extra dependencies.
 *
 * Visual:
 *   Track 32×17 — off: raised fill + line border; on: signal 15% fill +
 *   signal-dim border. Knob slides via left offset; signal when on.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[17px] w-8 shrink-0 cursor-pointer items-center rounded-full border",
        "transition-colors duration-150 ease-in-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300",
        checked ? "border-signal-dim bg-signal/15" : "border-line bg-panel-raised",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 h-[13px] w-[13px] -translate-y-1/2 rounded-full",
          "transition-all duration-150 ease-in-out",
          checked ? "left-[17px] bg-signal" : "left-[2px] bg-muted",
        )}
      />
    </button>
  );
}
