import type React from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical data-table composition.
 *
 * ONE style for the app: `bg-surface-800` header row with uppercase labels,
 * `divide-y` body rows with hover highlight, consistent `px-4 py-3` cell
 * padding, and an internal `overflow-x-auto` wrapper for mobile scroll.
 *
 * No zebra striping — hairline row dividers only. `zebra` remains as an
 * opt-in escape hatch; pass `zebra` for the legacy striped look.
 */

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  zebra?: boolean;
}

export function Table({ zebra = false, className, children, ...props }: TableProps) {
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
        "px-4 py-3 text-[0.68rem] font-medium uppercase tracking-wider text-muted",
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
    <tr className={cn("transition-colors duration-150 hover:bg-surface-800/50", className)} {...props} />
  );
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export function TableCell({ align, className, ...props }: TableCellProps) {
  return <td className={cn("px-4 py-3", align && alignClass[align], className)} {...props} />;
}
