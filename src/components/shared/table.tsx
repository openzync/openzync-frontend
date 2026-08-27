import type React from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical data-table composition.
 *
 * ONE style for the app: `bg-surface-800` header row with uppercase labels,
 * `divide-y` body rows with hover highlight, consistent `px-4 py-3` cell
 * padding, and an internal `overflow-x-auto` wrapper for mobile scroll.
 *
 * Zebra striping (`bg-surface-950/50` on odd data rows) is the dominant
 * pattern and defaults ON; pass `zebra={false}` for plain tables. Striping is
 * CSS-driven (`nth-child`) so it needs no per-row index plumbing; rows whose
 * only cell is a `colSpan` (empty-state placeholders) are excluded.
 */

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  zebra?: boolean;
}

export function Table({ zebra = true, className, children, ...props }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          "w-full text-sm",
          zebra &&
            "[&>tbody>tr:nth-child(odd):not(:has(td[colspan]))]:bg-surface-950/50",
          className,
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <thead>
      <tr className={cn("bg-surface-800", className)}>{children}</tr>
    </thead>
  );
}

type Align = "left" | "center" | "right";

const alignClass: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export function TableHead({ align = "left", className, ...props }: TableHeadProps) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium uppercase tracking-wider text-surface-400",
        alignClass[align],
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-surface-800", className)} {...props} />;
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("transition-colors hover:bg-surface-800/50", className)} {...props} />
  );
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export function TableCell({ align, className, ...props }: TableCellProps) {
  return <td className={cn("px-4 py-3", align && alignClass[align], className)} {...props} />;
}
