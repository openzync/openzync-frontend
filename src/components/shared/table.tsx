"use client";

import type React from "react";
import { Children, createContext, isValidElement, useContext, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useColumnWidths } from "@/hooks/use-column-widths";

/**
 * Canonical data-table composition.
 *
 * ONE style for the app: `bg-surface-800` header row with uppercase labels,
 * `divide-y` body rows with hover highlight, consistent `px-4 py-3` cell
 * padding, and an internal `overflow-x-auto` wrapper for mobile scroll.
 *
 * No zebra striping — hairline row dividers only. `zebra` remains as an
 * opt-in escape hatch; pass `zebra` for the legacy striped look.
 *
 * Pass `storageKey` to opt into user-resizable columns: widths persist in
 * localStorage under `oz:table-widths:<storageKey>`. Omit it and the
 * rendered output is exactly the legacy static table.
 */

interface TableWidthsContextValue {
  widths: (number | null)[];
  startResize: (index: number, e: React.PointerEvent<Element>) => void;
  resetColumn: (index: number) => void;
  activeIndex: number | null;
}

const TableWidthsContext = createContext<TableWidthsContextValue | null>(null);
const TableHeadIndexContext = createContext<number>(-1);

function countHeaderColumns(children: React.ReactNode): number {
  let count = 0;
  Children.forEach(children, (child) => {
    if (isValidElement<{ children?: React.ReactNode }>(child) && child.type === TableHeader) {
      count = Math.max(count, Children.count(child.props.children));
    }
  });
  return count;
}

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  zebra?: boolean;
  storageKey?: string;
}

export function Table({ zebra = false, storageKey, className, children, ...props }: TableProps) {
  if (!storageKey) {
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
  return (
    <ResizableTable zebra={zebra} storageKey={storageKey} className={className} {...props}>
      {children}
    </ResizableTable>
  );
}

function ResizableTable({
  zebra,
  storageKey,
  className,
  children,
  ...props
}: Omit<TableProps, "storageKey"> & { storageKey: string }) {
  const columnCount = countHeaderColumns(children);
  const { widths, startResize, resetColumn, activeIndex } = useColumnWidths(storageKey, columnCount);
  const hasFixedWidths = widths.some((w) => w !== null);
  const contextValue = useMemo<TableWidthsContextValue>(
    () => ({ widths, startResize, resetColumn, activeIndex }),
    [widths, startResize, resetColumn, activeIndex],
  );

  return (
    <TableWidthsContext.Provider value={contextValue}>
      <div className="overflow-x-auto">
        <table
          className={cn(
            "w-full text-sm",
            hasFixedWidths && "table-fixed",
            zebra &&
              "[&>tbody>tr:nth-child(odd):not(:has(td[colspan]))]:bg-surface-950/50",
            className,
          )}
          {...props}
        >
          {hasFixedWidths && (
            <colgroup>
              {widths.map((w, i) => (
                <col key={i} style={w !== null ? { width: w } : undefined} />
              ))}
            </colgroup>
          )}
          {children}
        </table>
      </div>
    </TableWidthsContext.Provider>
  );
}

export function TableHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const widthsContext = useContext(TableWidthsContext);
  if (!widthsContext) {
    return (
      <thead>
        <tr className={cn("bg-surface-800 divide-x divide-surface-800", className)}>{children}</tr>
      </thead>
    );
  }
  return (
    <thead>
      <tr className={cn("bg-surface-800 divide-x divide-surface-800", className)}>
        {Children.map(children, (child, index) => (
          <TableHeadIndexContext.Provider value={index}>{child}</TableHeadIndexContext.Provider>
        ))}
      </tr>
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

export function TableHead({ align = "left", className, children, ...props }: TableHeadProps) {
  const widthsContext = useContext(TableWidthsContext);
  const index = useContext(TableHeadIndexContext);
  if (!widthsContext || index < 0) {
    return (
      <th
        className={cn(
          "px-4 py-3 text-[0.68rem] font-medium uppercase tracking-wider text-muted",
          alignClass[align],
          className,
        )}
        {...props}
      >
        {children}
      </th>
    );
  }
  const isActive = widthsContext.activeIndex === index;
  return (
    <th
      className={cn(
        "px-4 py-3 text-[0.68rem] font-medium uppercase tracking-wider text-muted",
        alignClass[align],
        "group relative",
        className,
      )}
      {...props}
    >
      {children}
      <span
        onPointerDown={(e) => widthsContext.startResize(index, e)}
        onDoubleClick={() => widthsContext.resetColumn(index)}
        title="Drag to resize · double-click to reset"
        className="absolute right-0 top-0 flex h-full w-2 cursor-col-resize touch-none select-none items-center justify-center"
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-px top-0 h-full w-px bg-surface-800 transition-colors duration-150",
            isActive && "bg-accent-300",
          )}
        />
      </span>
    </th>
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
    <tr className={cn("transition-colors duration-150 hover:bg-surface-800/50 divide-x divide-surface-800", className)} {...props} />
  );
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export function TableCell({ align, className, ...props }: TableCellProps) {
  return <td className={cn("px-4 py-3", align && alignClass[align], className)} {...props} />;
}
