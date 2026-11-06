"use client";

import { AlertCircle, ExternalLink, List, Table2 } from "lucide-react";
import { getPanelData, type OrgAddonPanelDescriptor } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/shared/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shared/table";
import { AddonSettingsForm } from "./settings-form";

interface PanelWidgetProps {
  addonId: string;
  panel: OrgAddonPanelDescriptor;
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

/** stat: {value, label} — tolerates {stat,title} and bare-scalar shapes. */
function StatWidget({ data }: { data: unknown }) {
  const r = asRecord(data);
  const value = r.value ?? r.stat ?? (typeof data !== "object" ? data : "—");
  const label = typeof (r.label ?? r.title) === "string" ? (r.label ?? r.title) as string : "";
  return (
    <div className="card-base p-4">
      <p className="font-display text-2xl font-medium text-text-primary">{String(value)}</p>
      {label && <p className="mt-1 text-sm text-surface-400">{label}</p>}
    </div>
  );
}

/** table: {columns|headers, rows} — cells render as strings. */
function TableWidget({ data }: { data: unknown }) {
  const r = asRecord(data);
  const rawCols = r.columns ?? r.headers ?? [];
  const columns = Array.isArray(rawCols) ? rawCols.map(String) : [];
  const rawRows = r.rows ?? (Array.isArray(data) ? data : []);
  const rows: unknown[][] = Array.isArray(rawRows)
    ? rawRows.map((row) =>
        Array.isArray(row) ? row : columns.map((c) => asRecord(row)[c]),
      )
    : [];
  if (columns.length === 0 && rows.length === 0) {
    return (
      <div className="card-base">
        <EmptyState icon={Table2} title="No rows to show" />
      </div>
    );
  }
  return (
    <div className="card-base">
      <Table>
        {columns.length > 0 && (
          <TableHeader>
            {columns.map((col) => (
              <TableHead key={col}>{col}</TableHead>
            ))}
          </TableHeader>
        )}
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j}>
                  {typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "—")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** list: {items} or a bare array. */
function ListWidget({ data }: { data: unknown }) {
  const r = asRecord(data);
  const raw = r.items ?? (Array.isArray(data) ? data : []);
  const items = Array.isArray(raw) ? raw : [];
  if (items.length === 0) {
    return (
      <div className="card-base">
        <EmptyState icon={List} title="No items to show" />
      </div>
    );
  }
  return (
    <ul className="card-base divide-y divide-surface-800">
      {items.map((item, i) => (
        <li key={i} className="px-4 py-2 text-sm text-text-secondary">
          {typeof item === "object" ? JSON.stringify(item) : String(item)}
        </li>
      ))}
    </ul>
  );
}

/** link: {url|href, label}. */
function LinkWidget({ data }: { data: unknown }) {
  const r = asRecord(data);
  const url = r.url ?? r.href;
  const label = typeof (r.label ?? r.title) === "string" ? (r.label ?? r.title) as string : "Open link";
  if (typeof url !== "string" || !url) {
    return (
      <p role="alert" className="flex items-center gap-1.5 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
        <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
        <span>Link widget is missing its URL.</span>
      </p>
    );
  }
  return (
    <div className="card-base p-4">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} (opens in a new tab)`}
        className="inline-flex items-center gap-1.5 text-sm text-signal hover:underline"
      >
        {label}
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  );
}

/** form: {schema, values} — reuses the settings form against the inline schema. */
function FormWidget({ addonId, data, onSaved }: { addonId: string; data: unknown; onSaved: () => void }) {
  const r = asRecord(data);
  const schema = r.schema;
  if (!schema || typeof schema !== "object") {
    return (
      <p role="alert" className="flex items-center gap-1.5 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
        <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
        <span>Form widget is missing its schema.</span>
      </p>
    );
  }
  const values = asRecord(r.values);
  return (
    <AddonSettingsForm
      addonId={addonId}
      schema={schema as Parameters<typeof AddonSettingsForm>[0]["schema"]}
      initialValues={values}
      onSaved={onSaved}
    />
  );
}

export function PanelWidget({ addonId, panel }: PanelWidgetProps) {
  const query = useApiQuery(
    (signal) => getPanelData(addonId, panel.path, { signal }),
    { refreshKey: `${addonId}:${panel.path}` },
  );

  if (query.isLoading && !query.data) {
    return (
      <div className="card-base space-y-2 p-4" aria-label={`Loading ${panel.title}`}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return <ErrorState message={query.error ?? "Panel data unavailable"} onRetry={query.refetch} />;
  }

  const { widget, data } = query.data;
  switch (widget) {
    case "stat":
      return <StatWidget data={data} />;
    case "table":
      return <TableWidget data={data} />;
    case "list":
      return <ListWidget data={data} />;
    case "form":
      return <FormWidget addonId={addonId} data={data} onSaved={query.refetch} />;
    case "link":
      return <LinkWidget data={data} />;
    default:
      return (
        <p role="alert" className="flex items-center gap-1.5 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>Unsupported widget type “{String(widget)}” — contact the add-on author.</span>
        </p>
      );
  }
}
