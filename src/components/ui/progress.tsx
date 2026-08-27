"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

interface ProgressProps {
  /** 0–100, or null/undefined for an indeterminate bar. */
  value?: number | null;
  /** Applied to the indicator (filled part) — tint it here, e.g. "bg-success". */
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * Progress bar. Track is fixed; color comes via `className` on the indicator:
 * `<Progress value={40} className="bg-warning" />`.
 */
export function Progress({ value, className, ...props }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      value={value ?? null}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-800"
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full rounded-full bg-brand-500 transition-transform duration-300",
          className,
        )}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
