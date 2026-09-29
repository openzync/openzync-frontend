"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BarChart3,
  Database,
  Info,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { sortChronological } from "@/lib/chart-order";
import { get, ApiError } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { PageGuide, GuideDashboard } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { RequirePermission } from "@/components/shared/require-permission";
import { BarChart, ChartLegend, LineChart, StackedBarChart } from "@/components/shared/charts";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { SortableHead } from "@/components/shared/sortable-head";
import { useSortQuery } from "@/hooks/use-sort-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EpisodesMetrics {
  added_total: number; added_24h: number; in_progress: number; enrichment_pending: number;
  fully_enriched: number; with_embeddings: number; fully_enriched_pct: number;
  archived_episodes: number; enrichable_total: number;
}

interface GraphsMetrics {
  entities_total: number; entities_24h: number; relationships_total: number;
}

interface LatencyMetrics { p50: number; p95: number; p99: number; }
interface RequestRate { "2xx": number; "4xx": number; "5xx": number; }
interface QueueDepth { high: number; low: number; }

interface SummaryResponse {
  episodes: EpisodesMetrics;
  graphs: GraphsMetrics;
  users_total: number;
  request_rate: RequestRate;
  error_rate_pct: number;
  overall_latency_ms: LatencyMetrics;
  context_latency_ms: LatencyMetrics;
  graph_search_latency_ms: LatencyMetrics;
  queue_depth: QueueDepth | null;
  active_requests: number;
  status: string;
  retrieval_timeseries?: RetrievalTimeseries;
  error_timeseries?: ErrorTimeseriesPoint[];
  context_latency_timeseries?: LatencyTimeseriesPoint[];
  graph_latency_timeseries?: LatencyTimeseriesPoint[];
}

interface ScrapeTarget {
  job: string; instance: string; health: string; last_scrape: string; last_error: string;
}

interface TargetsResponse { targets: ScrapeTarget[]; }

interface ProjectOption {
  id: string;
  name: string;
}

// Shapes of GET /metrics/batch. BatchPanel-style consumers use the structural
// BatchResultLike/BatchErrorLike below, so extra fields here stay local.
type BatchCell = string | number | boolean | null;

interface BatchQueryResult {
  query: string;
  org_scoped: boolean;
  columns: string[];
  rows: BatchCell[][];
  total: number;
  parameters: Record<string, BatchCell>;
}

interface BatchQueryError {
  query: string;
  code: string;
  message: string;
}

interface BatchResponse {
  results: Record<string, BatchQueryResult>;
  errors: BatchQueryError[];
  meta: Record<string, unknown>;
}

interface BatchResultLike {
  query: string;
  columns: string[];
  rows: BatchCell[][];
}

interface BatchErrorLike {
  query: string;
  code: string;
  message: string;
}

interface RetrievalTimeseries {
  context_retrievals: Array<{ timestamp: string; value: number }>;
  graph_retrievals: Array<{ timestamp: string; value: number }>;
}

interface ErrorTimeseriesPoint {
  date: string;
  count_4xx: number;
  count_5xx: number;
}

interface LatencyTimeseriesPoint {
  date: string;
  p50: number;
  p95: number;
  p99: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [7, 30, 90] as const;
type DaysOption = (typeof DAYS_OPTIONS)[number];

// Fixed page size for every /metrics/batch toplist — no user control.
const BATCH_LIMIT = 20;

// Per-day ingestion charts: one single-series bar chart each.
const INGESTION_CARDS = [
  { query: "episodes_per_day", title: "Episodes per Day", color: "--color-signal" },
  { query: "messages_per_day", title: "Messages per Day", color: "--color-signal-dim" },
  { query: "facts_per_day", title: "Facts per Day", color: "--color-muted" },
  { query: "users_per_day", title: "Active Users per Day", color: "--color-amber" },
  { query: "entities_per_day", title: "Entities per Day", color: "--color-dim" },
] as const;

type IconType = LucideIcon;

const ENRICHMENT_PANELS: Array<{ query: string; title: string; icon: IconType }> = [
  { query: "enrichment_progress", title: "Enrichment Progress", icon: BarChart2 },
  { query: "queue_depth_over_time", title: "Queue Depth over Time", icon: Activity },
];

const PERF_PANELS: Array<{ query: string; title: string; icon: IconType }> = [
  { query: "latency_percentiles", title: "Latency Percentiles", icon: Timer },
  { query: "context_retrieval_rate", title: "Context Retrieval Rate", icon: TrendingUp },
  { query: "error_rate_by_day", title: "Error Rate by Day", icon: AlertTriangle },
];

const TOP_TABLES: Array<{ query: string; title: string; icon: IconType; storageKey: string; noun: string }> = [
  { query: "top_projects_by_episodes", title: "Top Projects by Episodes", icon: BarChart2, storageKey: "monitoring-top-projects", noun: "projects" },
  { query: "top_users_by_messages", title: "Top Users by Messages", icon: Users, storageKey: "monitoring-top-users", noun: "users" },
];

// /metrics/targets proxies Prometheus — there is no server-side list to
// sort, so target sorting is client-side over the fetched snapshot. Keys
// follow the backend MonitorTargetSortBy contract (name/created_at/status).
const TARGET_SORT_FIELDS = ["name", "created_at", "status"] as const;

const SERIES_COLORS = [
  "--color-brand-500",
  "--color-accent-300",
  "--color-success",
  "--color-warning",
  "--color-error",
] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 0.5) return "<1ms";
  if (ms < 1) return `${ms.toFixed(1)}ms`;
  return `${Math.round(ms)}ms`;
}

function latencyColor(ms: number): string {
  if (ms < 100) return "text-success";
  if (ms < 500) return "text-warning";
  return "text-error";
}

function latencyDot(ms: number): string {
  if (ms < 100) return "bg-success";
  if (ms < 500) return "bg-warning";
  return "bg-error";
}

function humanize(column: string): string {
  return column
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toNumber(value: BatchCell): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function formatCell(value: BatchCell): string {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function dateColumnIndex(columns: string[]): number {
  return columns.findIndex((c) => /date|day|time|bucket|period|week|month/i.test(c));
}

function isNumericColumn(rows: BatchCell[][], index: number): boolean {
  let seen = false;
  for (const row of rows) {
    const value = row[index];
    if (value == null || value === "") continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      seen = true;
      continue;
    }
    if (typeof value === "boolean") {
      seen = true;
      continue;
    }
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      seen = true;
      continue;
    }
    return false;
  }
  return seen;
}

/** Sum the first numeric (non-date) column — the window total for per-day queries. */
function sumFirstNumeric(result: BatchResultLike | null): number | null {
  if (!result || result.rows.length === 0) return null;
  const dateIdx = dateColumnIndex(result.columns);
  const valueIdx = result.columns.findIndex((_, i) => i !== dateIdx && isNumericColumn(result.rows, i));
  if (valueIdx < 0) return null;
  return result.rows.reduce((sum, row) => sum + toNumber(row[valueIdx]), 0);
}

// ─── Latency Card ──────────────────────────────────────────────────────────────

function LatencyCard({ title, icon: Icon, data }: {
  title: string; icon: IconType; data: LatencyMetrics;
}) {
  const percentiles = [
    { key: "p50" as const, label: "p50" },
    { key: "p95" as const, label: "p95" },
    { key: "p99" as const, label: "p99" },
  ];
  return (
    <div className="card-base p-4 space-y-3 hover:border-surface-700 transition-colors">
      <div className="flex items-center gap-2 text-xs font-medium text-surface-400"><Icon size={14} />{title}</div>
      <div className="space-y-1.5">
        {percentiles.map(({ key, label }) => {
          const val = data[key];
          return (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-surface-500 uppercase text-[11px] font-mono tracking-wider">{label}</span>
              <div className="flex items-center gap-2">
                <span className={cn("font-mono font-medium", latencyColor(val))}>{formatMs(val)}</span>
                <span className={cn("h-2 w-2 rounded-full", latencyDot(val))} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Degraded note — a failed batch query never blanks its section ─────────────

function QueryErrorNote({ error }: { error: BatchErrorLike }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 flex items-start gap-2.5"
    >
      <AlertTriangle size={15} className="text-warning shrink-0 mt-px" aria-hidden />
      <div className="text-xs min-w-0">
        <p className="font-mono font-medium text-warning truncate" title={error.query}>
          {error.query}
        </p>
        <p className="text-surface-300 mt-0.5">{error.message}</p>
      </div>
    </div>
  );
}

// ─── Batch section props — every batch-driven section renders the same states ──

interface BatchSectionProps {
  result: BatchResultLike | null;
  queryError: BatchErrorLike | null;
  fetchError: string | null;
  loading: boolean;
  onRetry: () => void;
}

// ─── Per-day ingestion chart — single-series bar, usage-style empty state ──────

function IngestionChartCard({ title, color, result, queryError, fetchError, loading, onRetry }: BatchSectionProps & {
  title: string;
  color: string;
}) {
  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];
  const dateIdx = dateColumnIndex(columns);
  const valueIdx = columns.findIndex((_, i) => i !== dateIdx && isNumericColumn(rows, i));
  const points = dateIdx >= 0 && valueIdx >= 0
    ? sortChronological(
        rows.map((row) => ({ date: String(row[dateIdx] ?? ""), value: toNumber(row[valueIdx]) })),
        (p) => p.date,
      )
    : [];
  const hasData = points.some((p) => p.value > 0);

  return (
    <div className="card-base p-5">
      <h3 className="text-sm font-medium mb-4">{title}</h3>
      {loading && points.length === 0 ? (
        <div className="h-[200px] rounded bg-surface-800 animate-pulse" />
      ) : fetchError && points.length === 0 ? (
        <ErrorState message="Couldn’t load batch metrics." onRetry={onRetry} />
      ) : queryError && points.length === 0 ? (
        <QueryErrorNote error={queryError} />
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center h-[200px] text-surface-500">
          <BarChart3 size={28} className="mb-2 opacity-40" />
          <p className="text-sm font-medium">No data for this period</p>
          <p className="text-xs mt-1 text-surface-600">Try selecting a different time range.</p>
        </div>
      ) : (
        <BarChart
          data={points}
          dates={points.map((p) => p.date)}
          height={200}
          tooltipShowYear
          series={[{ label: title, color, value: (p) => p.value }]}
        />
      )}
      {queryError && !loading && points.length > 0 && (
        <div className="mt-3">
          <QueryErrorNote error={queryError} />
        </div>
      )}
    </div>
  );
}

// ─── Auto panel — schema-agnostic view over one batch result ───────────────────

function BatchAutoPanel({ title, icon: Icon, result, queryError, fetchError, loading, onRetry }: BatchSectionProps & {
  title: string;
  icon?: IconType;
}) {
  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];
  const dateIdx = dateColumnIndex(columns);
  const valueIdxs = columns
    .map((_, i) => i)
    .filter((i) => i !== dateIdx && isNumericColumn(rows, i));
  const isSeries = dateIdx >= 0 && valueIdxs.length > 0;
  const isSnapshot = !isSeries && rows.length <= 1 && columns.length > 0;

  const sorted = isSeries
    ? [...rows].sort((a, b) => String(a[dateIdx] ?? "").localeCompare(String(b[dateIdx] ?? "")))
    : rows;

  const lines = isSeries
    ? valueIdxs.map((idx, i) => ({
        label: humanize(columns[idx] ?? `Series ${i + 1}`),
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        data: sorted.map((row) => ({ x: String(row[dateIdx] ?? ""), y: toNumber(row[idx]) })),
      }))
    : [];

  return (
    <div className="card-base p-5">
      <h3 className="text-sm font-medium flex items-center gap-1.5 mb-4">
        {Icon && <Icon size={16} className="text-brand-300" aria-hidden />}
        {title}
      </h3>
      {loading && rows.length === 0 ? (
        <div className="h-[220px] rounded bg-surface-800 animate-pulse" aria-hidden />
      ) : fetchError && rows.length === 0 ? (
        <ErrorState message="Couldn’t load batch metrics." onRetry={onRetry} />
      ) : queryError && rows.length === 0 ? (
        <QueryErrorNote error={queryError} />
      ) : isSeries ? (
        <>
          <LineChart lines={lines} ariaLabel={`${title} chart, ${sorted.length} points`} />
          {lines.length > 1 && (
            <ChartLegend items={lines.map((l) => ({ label: l.label, color: l.color }))} />
          )}
        </>
      ) : isSnapshot ? (
        rows.length === 0 ? (
          <div className="flex items-center justify-center h-[120px] text-surface-500 text-xs">
            No data for this window
          </div>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {columns.map((col, i) => (
              <div key={col} className="rounded-lg bg-surface-900 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wider text-surface-500">
                  {humanize(col)}
                </dt>
                <dd
                  className="text-sm font-mono font-medium text-surface-100 mt-0.5 truncate"
                  title={String(rows[0]?.[i] ?? "")}
                >
                  {formatCell(rows[0]?.[i] ?? null)}
                </dd>
              </div>
            ))}
          </dl>
        )
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center h-[220px] text-surface-500 text-xs">
          No data for this window
        </div>
      ) : (
        <Table>
          <TableHeader>
            {columns.map((col) => (
              <TableHead key={col}>{humanize(col)}</TableHead>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row, ri) => (
              // Batch rows carry no stable id — position is the only key.
              <TableRow key={ri}>
                {columns.map((col, ci) => (
                  <TableCell key={col}>
                    <span
                      className={
                        typeof row[ci] === "number" ? "font-mono text-xs" : "text-xs text-surface-300"
                      }
                    >
                      {formatCell(row[ci] ?? null)}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {queryError && !loading && rows.length > 0 && (
        <div className="mt-3">
          <QueryErrorNote error={queryError} />
        </div>
      )}
    </div>
  );
}

// ─── Toplist table — batch toplists with header count and resizable columns ────

function TopTableCard({ title, icon: Icon, storageKey, noun, result, queryError, fetchError, loading, onRetry }: BatchSectionProps & {
  title: string;
  icon: IconType;
  storageKey: string;
  noun: string;
}) {
  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];
  return (
    <div className="card-base overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-800 flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Icon size={16} className="text-brand-300" aria-hidden />
          {title}
        </h3>
        {!loading && rows.length > 0 && (
          <span className="text-[11px] text-surface-500">
            {rows.length.toLocaleString()} {noun}
          </span>
        )}
      </div>
      <Table storageKey={storageKey}>
        <TableHeader>
          {columns.map((col) => (
            <TableHead key={col}>{humanize(col)}</TableHead>
          ))}
        </TableHeader>
        <TableBody>
          {loading && rows.length === 0 ? (
            <TableSkeleton rows={5} cols={Math.max(columns.length, 2)} />
          ) : fetchError && rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)}>
                <div className="px-4 py-3">
                  <ErrorState message="Couldn’t load batch metrics." onRetry={onRetry} />
                </div>
              </td>
            </tr>
          ) : queryError && rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)}>
                <div className="px-4 py-3">
                  <QueryErrorNote error={queryError} />
                </div>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)}>
                <EmptyState
                  icon={Icon}
                  title="No data for this window"
                  description="Try selecting a different time range."
                />
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              // Batch rows carry no stable id — position is the only key.
              <TableRow key={ri}>
                {columns.map((col, ci) => (
                  <TableCell key={col}>
                    <span
                      className={
                        typeof row[ci] === "number" ? "font-mono text-xs tabular-nums" : "text-xs text-surface-300"
                      }
                    >
                      {formatCell(row[ci] ?? null)}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {queryError && !loading && rows.length > 0 && (
        <div className="px-4 py-3 border-t border-surface-800">
          <QueryErrorNote error={queryError} />
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <MonitoringInner />
    </Suspense>
  );
}

function MonitoringInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Filter state — URL is the source of truth ─────────────────────────────

  const rawDays = Number(searchParams.get("days"));
  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");
  const rawProject = searchParams.get("project_id") ?? "";

  const isCustom = !!rawFrom && !!rawTo;
  const days: DaysOption = isCustom
    ? 30
    : DAYS_OPTIONS.includes(rawDays as DaysOption)
      ? (rawDays as DaysOption)
      : 30;
  const from = isCustom ? rawFrom : null;
  const to = isCustom ? rawTo : null;
  const projectId = rawProject || null;

  // Local date input state — decoupled from URL so typing doesn't push history.
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");
  const [pendingRange, setPendingRange] = useState<string>(isCustom ? "custom" : String(days));

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCustomFrom(from ?? ""); }, [from]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCustomTo(to ?? ""); }, [to]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPendingRange(isCustom ? "custom" : String(days)); }, [isCustom, days]);

  /** Merge param updates into the URL; empty values are removed. */
  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setDays(d: DaysOption) {
    setParams({ days: String(d), from: null, to: null });
  }

  function clearCustom() {
    setParams({ days: "30", from: null, to: null });
  }

  // ── Projects dropdown (same convention as the usage page) ─────────────────

  const projectsQuery = useApiQuery<ProjectOption[] | { data: ProjectOption[] }>(async () => {
    try {
      return await get<ProjectOption[] | { data: ProjectOption[] }>("/v1/projects?limit=100");
    } catch {
      // Fallback endpoint if the primary shape returns 404 in some deployments.
      return await get<ProjectOption[] | { data: ProjectOption[] }>("/v1/projects/list");
    }
  });

  const projects: ProjectOption[] = useMemo(() => {
    const d = projectsQuery.data;
    if (!d) return [];
    return Array.isArray(d) ? d : (d.data ?? []);
  }, [projectsQuery.data]);

  // ── Windowed batch query string — shared by every batch section ────────────

  const batchQs = new URLSearchParams({ limit: String(BATCH_LIMIT) });
  if (isCustom && from && to) {
    batchQs.set("from", from);
    batchQs.set("to", to);
  } else {
    batchQs.set("days", String(days));
  }
  if (projectId) batchQs.set("project_id", projectId);
  const batchQsString = batchQs.toString();
  const windowKey = `${days}-${from}-${to}-${projectId}`;

  // Each section fails independently so one bad endpoint never blanks the
  // whole page. Errors clear on success only, so a retry visibly keeps the
  // error until it actually resolves.
  const summaryQuery = useApiQuery<SummaryResponse>(async () => {
    try {
      return await get<SummaryResponse>("/metrics/summary");
    } catch (err) {
      // Metrics endpoints are admin-gated — members see a clear message, not a blank page.
      if (err instanceof ApiError && err.isForbidden) throw new Error("Admin access required");
      throw err;
    }
  });
  const targetsQuery = useApiQuery<TargetsResponse>(() => get<TargetsResponse>("/metrics/targets"));
  const batchQuery = useApiQuery<BatchResponse>(
    () => get<BatchResponse>(`/metrics/batch?${batchQsString}`),
    { refreshKey: windowKey },
  );

  const summary = summaryQuery.data;
  const summaryLoading = summaryQuery.isLoading && !summary;

  const batchErrorFor = (query: string): BatchErrorLike | null =>
    batchQuery.data?.errors.find((e) => e.query === query) ?? null;

  // Errors for queries this page does not render must still surface —
  // they collect under the toplists instead of vanishing.
  const orphanBatchErrors = useMemo(() => {
    const known: Set<string> = new Set([
      ...INGESTION_CARDS.map((c) => c.query),
      ...ENRICHMENT_PANELS.map((c) => c.query),
      ...PERF_PANELS.map((c) => c.query),
      ...TOP_TABLES.map((c) => c.query),
    ]);
    return (batchQuery.data?.errors ?? []).filter((e) => !known.has(e.query));
  }, [batchQuery.data]);

  const batchSectionProps = (query: string): BatchSectionProps => ({
    result: batchQuery.data?.results[query] ?? null,
    queryError: batchErrorFor(query),
    fetchError: batchQuery.error,
    loading: batchQuery.isLoading,
    onRetry: batchQuery.refetch,
  });

  // ── Targets table — client-side sort over the Prometheus snapshot ──────────

  const { sortBy, sortDir, onSort } = useSortQuery({
    defaultSort: { sortBy: "name", sortDir: "asc" },
    allowedFields: TARGET_SORT_FIELDS,
    timestampFields: ["created_at"],
  });

  const targets = useMemo(
    () => (Array.isArray(targetsQuery.data?.targets) ? targetsQuery.data.targets : []),
    [targetsQuery.data],
  );
  const targetsLoading = targetsQuery.isLoading && targets.length === 0;

  const sortedTargets = useMemo(() => {
    const rows = [...targets];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortBy === "status") return dir * a.health.localeCompare(b.health);
      if (sortBy === "created_at") {
        const at = a.last_scrape ? Date.parse(a.last_scrape) : NaN;
        const bt = b.last_scrape ? Date.parse(b.last_scrape) : NaN;
        if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
        if (Number.isNaN(at)) return 1;
        if (Number.isNaN(bt)) return -1;
        return dir * (at - bt);
      }
      return dir * a.job.localeCompare(b.job);
    });
    return rows;
  }, [targets, sortBy, sortDir]);

  // ── Stat values ────────────────────────────────────────────────────────────

  const queueTotal = summary?.queue_depth ? summary.queue_depth.high + summary.queue_depth.low : null;
  const episodesInWindow = sumFirstNumeric(batchQuery.data?.results["episodes_per_day"] ?? null);
  const hasActiveFilters = !!projectId || isCustom;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <RequirePermission permission="members:read">
      <div className="space-y-6">
        <PageHeader
          title="Monitoring"
          description="Platform health and ingestion pipeline — queue depth, scrape targets, enrichment, and query performance"
        />

        <PageGuide title="Platform monitoring" illustration={<GuideDashboard />}>
          <p>Monitor your platform health and performance in real time. Track enrichment progress, error rates, API latency percentiles, queue depth, and Prometheus scrape targets.</p>
        </PageGuide>

        {/* Stat cards — summary + batch window totals */}
        {summaryQuery.isError && !summary && !summaryLoading ? (
          <ErrorState message="Couldn’t load monitoring summary." onRetry={summaryQuery.refetch} />
        ) : (
          <div className="stat-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Episodes in window"
              value={episodesInWindow != null ? episodesInWindow.toLocaleString() : null}
              loading={batchQuery.isLoading && episodesInWindow == null}
            />
            <StatCard
              label="Enriched"
              value={summary != null ? `${summary.episodes.fully_enriched_pct.toFixed(1)}%` : null}
              loading={summaryLoading}
            />
            <StatCard
              label="Error rate"
              value={summary != null ? `${summary.error_rate_pct.toFixed(2)}%` : null}
              loading={summaryLoading}
            />
            <StatCard
              label="Queue depth"
              value={queueTotal != null ? queueTotal.toLocaleString() : null}
              loading={summaryLoading}
            />
            <StatCard
              label="Users"
              value={summary != null ? summary.users_total.toLocaleString() : null}
              loading={summaryLoading}
            />
            <StatCard
              label="Entities"
              value={summary != null ? summary.graphs.entities_total.toLocaleString() : null}
              loading={summaryLoading}
            />
          </div>
        )}

        {/* Filter bar — project + time range, URL is the source of truth */}
        <div className="card-base p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Project</span>
              <select
                value={rawProject}
                onChange={(e) => setParams({ project_id: e.target.value || null })}
                className="input-base h-8 text-xs flex-1 min-w-0 truncate border-surface-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-300 focus-visible:border-accent-300"
                aria-label="Filter by project"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Time range</span>
              <select
                value={pendingRange}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") {
                    setPendingRange("custom");
                  } else {
                    setPendingRange(v);
                    setDays(Number(v) as DaysOption);
                  }
                }}
                className="input-base h-8 text-xs flex-1 min-w-0 border-surface-800"
                aria-label="Filter by time range"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
          </div>
          {(pendingRange === "custom" || isCustom) && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-3 border-t border-surface-800">
              <div className="grid grid-cols-2 gap-2 flex-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="input-base h-8 text-xs border-surface-800"
                  aria-label="From date"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="input-base h-8 text-xs border-surface-800"
                  aria-label="To date"
                />
              </div>
              <div className="flex gap-2 shrink-0 sm:ml-auto">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setParams({ from: customFrom, to: customTo, days: null })}
                  disabled={!customFrom || !customTo}
                  className="h-8 flex-1 sm:flex-none"
                >
                  Apply
                </Button>
                {isCustom && (
                  <Button size="sm" variant="ghost" onClick={clearCustom} className="h-8">
                    Clear
                  </Button>
                )}
              </div>
            </div>
          )}
          {hasActiveFilters && pendingRange !== "custom" && !isCustom && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setParams({ project_id: null })}
                className="h-8 text-surface-400"
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* Per-day ingestion charts */}
        <div className="grid md:grid-cols-3 gap-4">
          {INGESTION_CARDS.map((card) => (
            <IngestionChartCard
              key={card.query}
              title={card.title}
              color={card.color}
              {...batchSectionProps(card.query)}
            />
          ))}
        </div>

        {/* Enrichment + queue */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ENRICHMENT_PANELS.map((panel) => (
            <BatchAutoPanel
              key={panel.query}
              title={panel.title}
              icon={panel.icon}
              {...batchSectionProps(panel.query)}
            />
          ))}
        </div>

        {/* Latency */}
        <div className="card-base p-5">
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-4"><Timer size={16} className="text-brand-300" />Latency</h3>
          {summaryLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (<div key={i} className="h-28 rounded-lg bg-surface-800 animate-pulse" />))}
            </div>
          ) : summaryQuery.isError && !summary ? (
            <ErrorState message="Couldn’t load latency data." onRetry={summaryQuery.refetch} />
          ) : summary ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <LatencyCard title="Overall API" icon={Activity} data={summary.overall_latency_ms} />
              <LatencyCard title="Context Assembly" icon={Timer} data={summary.context_latency_ms} />
              <LatencyCard title="Graph Search" icon={Database} data={summary.graph_search_latency_ms} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-28 text-surface-500"><Timer size={28} className="mb-2 opacity-40" /><p className="text-sm">No latency data available</p></div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card-base p-5">
            <h3 className="text-sm font-medium flex items-center gap-1.5 mb-4"><Timer size={16} className="text-brand-300" />Context Search Latency</h3>
            {summaryLoading ? (
              <div className="h-[220px] rounded bg-surface-800 animate-pulse" />
            ) : summaryQuery.isError && !summary ? (
              <ErrorState message="Couldn’t load latency data." onRetry={summaryQuery.refetch} />
            ) : summary?.context_latency_timeseries && summary.context_latency_timeseries.length > 0 ? (
              <>
                <LineChart
                  lines={[
                    { label: "p50", color: "--color-success", data: sortChronological(summary.context_latency_timeseries, (d) => d.date).map((d) => ({ x: d.date, y: d.p50 })) },
                    { label: "p95", color: "--color-warning", data: sortChronological(summary.context_latency_timeseries, (d) => d.date).map((d) => ({ x: d.date, y: d.p95 })) },
                    { label: "p99", color: "--color-error", data: sortChronological(summary.context_latency_timeseries, (d) => d.date).map((d) => ({ x: d.date, y: d.p99 })) },
                  ]}
                />
                <ChartLegend items={[
                  { label: "p50", color: "--color-success" },
                  { label: "p95", color: "--color-warning" },
                  { label: "p99", color: "--color-error" },
                ]} />
              </>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-surface-500 text-xs">No latency data</div>
            )}
          </div>

          <div className="card-base p-5">
            <h3 className="text-sm font-medium flex items-center gap-1.5 mb-4"><Database size={16} className="text-accent-300" />Graph Search Latency</h3>
            {summaryLoading ? (
              <div className="h-[220px] rounded bg-surface-800 animate-pulse" />
            ) : summaryQuery.isError && !summary ? (
              <ErrorState message="Couldn’t load latency data." onRetry={summaryQuery.refetch} />
            ) : summary?.graph_latency_timeseries && summary.graph_latency_timeseries.length > 0 ? (
              <>
                <LineChart
                  lines={[
                    { label: "p50", color: "--color-success", data: sortChronological(summary.graph_latency_timeseries, (d) => d.date).map((d) => ({ x: d.date, y: d.p50 })) },
                    { label: "p95", color: "--color-warning", data: sortChronological(summary.graph_latency_timeseries, (d) => d.date).map((d) => ({ x: d.date, y: d.p95 })) },
                    { label: "p99", color: "--color-error", data: sortChronological(summary.graph_latency_timeseries, (d) => d.date).map((d) => ({ x: d.date, y: d.p99 })) },
                  ]}
                />
                <ChartLegend items={[
                  { label: "p50", color: "--color-success" },
                  { label: "p95", color: "--color-warning" },
                  { label: "p99", color: "--color-error" },
                ]} />
              </>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-surface-500 text-xs">No latency data</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PERF_PANELS.filter((p) => p.query !== "error_rate_by_day").map((panel) => (
            <BatchAutoPanel
              key={panel.query}
              title={panel.title}
              icon={panel.icon}
              {...batchSectionProps(panel.query)}
            />
          ))}
        </div>

        {/* Retrieval activity */}
        <div className="card-base p-5">
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-4"><TrendingUp size={16} className="text-brand-300" />Retrieval Activity</h3>
          {summaryLoading ? (
            <div className="h-[220px] rounded bg-surface-800 animate-pulse" />
          ) : summaryQuery.isError && !summary ? (
            <ErrorState message="Couldn’t load retrieval data." onRetry={summaryQuery.refetch} />
          ) : summary?.retrieval_timeseries ? (
            <>
              <LineChart
                lines={[
                  { label: "Context", color: "--color-brand-500", data: sortChronological(summary.retrieval_timeseries.context_retrievals, (d) => d.timestamp).map((d) => ({ x: d.timestamp, y: d.value })) },
                  { label: "Graph", color: "--color-accent-300", data: sortChronological(summary.retrieval_timeseries.graph_retrievals, (d) => d.timestamp).map((d) => ({ x: d.timestamp, y: d.value })) },
                ]}
              />
              <ChartLegend items={[
                { label: "Context", color: "--color-brand-500" },
                { label: "Graph", color: "--color-accent-300" },
              ]} />
            </>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-surface-500 text-xs">No retrieval data</div>
          )}
        </div>

        {/* Errors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card-base p-5">
            <h3 className="text-sm font-medium flex items-center gap-1.5 mb-4"><AlertTriangle size={16} className="text-warning" />Error by Type</h3>
            {summaryLoading ? (
              <div className="h-[220px] rounded bg-surface-800 animate-pulse" />
            ) : summaryQuery.isError && !summary ? (
              <ErrorState message="Couldn’t load error data." onRetry={summaryQuery.refetch} />
            ) : summary?.error_timeseries && summary.error_timeseries.length > 0 ? (
              <>
                <StackedBarChart data={sortChronological(summary.error_timeseries, (d) => d.date)} />
                <ChartLegend items={[
                  { label: "4xx", color: "--color-warning" },
                  { label: "5xx", color: "--color-error" },
                ]} />
              </>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-surface-500 text-xs">No error data</div>
            )}
          </div>
          <BatchAutoPanel
            title="Error Rate by Day"
            icon={AlertTriangle}
            {...batchSectionProps("error_rate_by_day")}
          />
        </div>

        {/* Toplists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TOP_TABLES.map((table) => (
            <TopTableCard
              key={table.query}
              title={table.title}
              icon={table.icon}
              storageKey={table.storageKey}
              noun={table.noun}
              {...batchSectionProps(table.query)}
            />
          ))}
        </div>
        {orphanBatchErrors.length > 0 && (
          <div className="space-y-3">
            {orphanBatchErrors.map((e) => (
              <QueryErrorNote key={e.query} error={e} />
            ))}
          </div>
        )}

        {/* Scrape Targets table */}
        <div className="card-base overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-800 flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-1.5"><Info size={16} className="text-brand-300" />Scrape Targets</h3>
            {!targetsLoading && <span className="text-[11px] text-surface-500">{targets.length} target{targets.length !== 1 ? "s" : ""}</span>}
          </div>
          {targetsQuery.error && !targetsLoading && targets.length === 0 ? (
            <div className="px-4 py-3">
              <ErrorState message="Couldn’t load scrape targets." onRetry={targetsQuery.refetch} />
            </div>
          ) : (
            <Table storageKey="monitoring">
              <TableHeader>
                <SortableHead field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Job</SortableHead>
                <TableHead>Instance</TableHead>
                <SortableHead field="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Health</SortableHead>
                <SortableHead field="created_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Last Scrape</SortableHead>
                <TableHead>Last Error</TableHead>
              </TableHeader>
              <TableBody>
                {targetsLoading ? (
                  <TableSkeleton rows={4} cols={5} />
                ) : targets.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={Info}
                        title="No scrape targets found"
                        description="Targets will appear once Prometheus scrape jobs are configured."
                      />
                    </td>
                  </tr>
                ) : (
                  sortedTargets.map((t, i) => {
                    const isUp = t.health?.toLowerCase() === "up";
                    return (
                      <TableRow key={`${t.job}-${t.instance}-${i}`}>
                        <TableCell><span className="font-mono text-xs text-surface-200">{t.job}</span></TableCell>
                        <TableCell><span className="font-mono text-xs text-surface-300">{t.instance}</span></TableCell>
                        <TableCell>
                          <Badge variant={isUp ? "success" : "error"} size="sm">{isUp ? "UP" : "DOWN"}</Badge>
                        </TableCell>
                        <TableCell><span className="text-xs text-surface-400">{t.last_scrape ? timeAgo(t.last_scrape) : "—"}</span></TableCell>
                        <TableCell>
                          {t.last_error ? (
                            <span className="text-xs text-surface-500 max-w-[220px] block truncate" title={t.last_error}>{t.last_error}</span>
                          ) : (<span className="text-xs text-surface-600">—</span>)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
          {targetsQuery.error && !targetsLoading && targets.length > 0 && (
            <div className="px-4 py-3 border-t border-surface-800">
              <ErrorState message="Couldn’t refresh scrape targets." onRetry={targetsQuery.refetch} />
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className={cn("card-base px-5 py-3 flex items-center justify-between flex-wrap gap-2", !summary && "opacity-50")}>
          {summary ? (
            <div className="flex items-center gap-4 text-xs text-surface-400">
              <span>Status: <span className={cn("font-medium capitalize", summary.status === "healthy" || summary.status === "up" ? "text-success" : "text-warning")}>{summary.status}</span></span>
              <span className="hidden sm:inline">Active Requests: <span className="text-surface-200 font-medium">{summary.active_requests.toLocaleString()}</span></span>
              <span className="hidden sm:inline">Users: <span className="text-surface-200 font-medium">{summary.users_total?.toLocaleString() ?? "—"}</span></span>
              <span>Request Rate: <span className="text-surface-200 font-medium">{summary.request_rate["2xx"].toLocaleString()} 2xx</span> / <span className={cn("font-medium", summary.request_rate["5xx"] > 0 ? "text-error" : "text-surface-200")}>{summary.request_rate["5xx"].toLocaleString()} 5xx</span></span>
            </div>
          ) : summaryLoading ? (
            <div className="flex gap-4">
              {[1, 2, 3].map((i) => (<div key={i} className="h-4 w-20 rounded bg-surface-800 animate-pulse" />))}
            </div>
          ) : (
            <ErrorState message="Unable to fetch monitoring data" onRetry={summaryQuery.refetch} />
          )}
        </div>
      </div>
    </RequirePermission>
  );
}
