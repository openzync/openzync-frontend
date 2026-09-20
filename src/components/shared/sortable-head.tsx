"use client";

import type React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableHead } from "./table";
import type { SortDir } from "@/hooks/use-sort-query";

interface SortableHeadProps {
  /** Backend `sort_by` key for this column (must be in the endpoint whitelist). */
  field: string;
  /** Active sort field from `useSortQuery`. */
  sortBy: string;
  /** Active sort direction from `useSortQuery`. */
  sortDir: SortDir;
  /** Header click handler from `useSortQuery`. */
  onSort: (field: string) => void;
  align?: "left" | "center" | "right";
  className?: string;
  children: React.ReactNode;
}

const justifyClass = {
  left: "justify-start text-left",
  center: "justify-center text-center",
  right: "justify-end text-right",
} as const;

/**
 * Sortable column header — wraps the shared `TableHead`, never forks it.
 *
 * The whole header cell is a button (negative margins cover `TableHead`'s
 * padding). Inactive columns reveal a faint arrow on hover; the active
 * column always shows its direction indicator. `aria-sort` on the `th`
 * keeps screen readers in sync.
 */
export function SortableHead({
  field,
  sortBy,
  sortDir,
  onSort,
  align = "left",
  className,
  children,
}: SortableHeadProps) {
  const active = sortBy === field;
  const label = typeof children === "string" ? children : field;
  return (
    <TableHead
      align={align}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}${active ? `, currently ${sortDir === "asc" ? "ascending" : "descending"}` : ""}`}
        className={cn(
          "group/sort inline-flex w-full items-center gap-1.5",
          "-mx-4 -my-3 px-4 py-3",
          "transition-colors hover:text-surface-100 focus-visible:outline-2 focus-visible:outline-accent-300",
          active ? "text-surface-100" : "text-muted",
          justifyClass[align],
        )}
      >
        <span className="truncate">{children}</span>
        <span aria-hidden="true" className="inline-flex shrink-0 items-center">
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp size={12} className="text-brand-300" />
            ) : (
              <ArrowDown size={12} className="text-brand-300" />
            )
          ) : (
            <ArrowUpDown
              size={12}
              className="opacity-0 transition-opacity duration-150 group-hover/sort:opacity-60"
            />
          )}
        </span>
      </button>
    </TableHead>
  );
}
