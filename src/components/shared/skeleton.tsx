import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

interface TableSkeletonProps {
  /** How many skeleton rows to render */
  rows?: number;
  /** How many columns per row */
  cols?: number;
  /** Width variants per column */
  colWidths?: string[];
}

/**
 * Shared skeleton loader for tables and cards.
 * Replaces per-page `animate-pulse` divs.
 */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div style={style} className={cn("h-4 rounded bg-surface-800 animate-pulse", className)} />
  );
}

/**
 * Table row skeleton with configurable columns.
 */
export function TableSkeleton({
  rows = 5,
  cols = 4,
  colWidths,
}: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={`skel-${i}`}>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton
                className={colWidths?.[j] ?? "h-4 w-20"}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
