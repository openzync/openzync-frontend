"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
} from "lucide-react";
import {
  get,
  getLlmUsage,
  type LlmUsageResponse,
  type LlmUsageRow,
} from "@/lib/api-client";
import { sortChronological } from "@/lib/chart-order";
import { smartTimestamp } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { useSortQuery } from "@/hooks/use-sort-query";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideDashboard } from "@/components/guides";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { StatCard } from "@/components/shared/stat-card";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { RequirePermission } from "@/components/shared/require-permission";
import { BarChart, cssVar } from "@/components/shared/charts";
import { TableSkeleton } from "@/components/shared/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shared/table";
import { SortableHead } from "@/components/shared/sortable-head";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ProjectOption {
  id: string;
  name: string;
}

interface DayBucket {
  date: string;
  total_tokens: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;
const DAYS_OPTIONS = [7, 30, 90] as const;
type DaysOption = (typeof DAYS_OPTIONS)[number];

// Server-side sort whitelist for GET /v1/admin/llm-usage (default created_at/desc).
const USAGE_SORT_FIELDS = ["created_at", "total_tokens", "duration_ms"] as const;

function workerOf(row: LlmUsageRow): string {
  return row.worker || row.task_type || "—";
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function UsagePage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <UsageInner />
    </Suspense>
  );
}

function UsageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Filter state — URL is the source of truth ─────────────────────────────

  const rawDays = Number(searchParams.get("days"));
  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");
  const rawProject = searchParams.get("project_id") ?? "";
  const rawWorker = searchParams.get("worker") ?? "";
  const rawModel = searchParams.get("model") ?? "";
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const isCustom = !!rawFrom && !!rawTo;
  const days: DaysOption = isCustom
    ? 30
    : DAYS_OPTIONS.includes(rawDays as DaysOption)
      ? (rawDays as DaysOption)
      : 30;
  const from = isCustom ? rawFrom : null;
  const to = isCustom ? rawTo : null;

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

  // Server-side sort, URL-synced. Sort changes drop `page` via the hook.
  const { sortBy, sortDir, onSort, withSort } = useSortQuery({
    defaultSort: { sortBy: "created_at", sortDir: "desc" },
    allowedFields: USAGE_SORT_FIELDS,
    timestampFields: ["created_at"],
  });

  /** Merge param updates into the URL; empty values are removed. */
  function setParams(updates: Record<string, string | null>) {
    const current: Record<string, string | null> = {
      days: isCustom ? null : String(days),
      from,
      to,
      project_id: rawProject || null,
      worker: rawWorker || null,
      model: rawModel || null,
      page: page > 1 ? String(page) : null,
      sort_by: sortBy,
      sort_dir: sortDir,
    };
    const merged = { ...current, ...updates };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setDays(d: DaysOption) {
    setParams({ days: String(d), from: null, to: null, page: null });
  }

  function clearCustom() {
    setParams({ days: "30", from: null, to: null, page: null });
  }

  const offset = (page - 1) * PAGE_SIZE;

  // ── Projects dropdown (same convention as the overview page) ──────────────

  const projectsQuery = useApiQuery<ProjectOption[] | { data: ProjectOption[] }>(async () => {
    try {
      return await get<ProjectOption[] | { data: ProjectOption[] }>("/v1/projects?limit=100");
    } catch {
      return await get<ProjectOption[] | { data: ProjectOption[] }>("/v1/projects/list");
    }
  });

  const projects: ProjectOption[] = useMemo(() => {
    const d = projectsQuery.data;
    if (!d) return [];
    return Array.isArray(d) ? d : (d.data ?? []);
  }, [projectsQuery.data]);

  // ── Usage query ───────────────────────────────────────────────────────────

  const refreshKey = `${days}-${from}-${to}-${rawProject}-${rawWorker}-${rawModel}-${offset}-${sortBy}-${sortDir}`;

  const usageQuery = useApiQuery<LlmUsageResponse>(() => {
    const params = withSort(
      new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) }),
    );
    if (isCustom && from && to) {
      params.set("from", from);
      params.set("to", to);
    } else {
      params.set("days", String(days));
    }
    if (rawProject) params.set("project_id", rawProject);
    if (rawWorker) params.set("worker", rawWorker);
    if (rawModel) params.set("model", rawModel);
    // Route through the typed fetcher so the contract lives in one place.
    return getLlmUsage({
      days: isCustom ? undefined : days,
      from: isCustom && from ? from : undefined,
      to: isCustom && to ? to : undefined,
      project_id: rawProject || undefined,
      worker: rawWorker || undefined,
      model: rawModel || undefined,
      limit: PAGE_SIZE,
      offset,
      sort_by: params.get("sort_by") ?? sortBy,
      sort_dir: (params.get("sort_dir") as "asc" | "desc") ?? sortDir,
    });
  }, { refreshKey });

  const rows = useMemo(() => usageQuery.data?.data ?? [], [usageQuery.data]);
  const total = usageQuery.data?.total ?? 0;
  const summary = usageQuery.data?.summary ?? null;
  const loading = usageQuery.isLoading;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Worker/model select options come from the current result set; the active
  // URL value is always kept so a filtered view stays selectable.
  const workerOptions = useMemo(() => {
    const values = new Set(rows.map(workerOf).filter((w) => w !== "—"));
    if (rawWorker) values.add(rawWorker);
    return [...values].sort();
  }, [rows, rawWorker]);
  const modelOptions = useMemo(() => {
    const values = new Set(rows.map((r) => r.model).filter(Boolean));
    if (rawModel) values.add(rawModel);
    return [...values].sort();
  }, [rows, rawModel]);

  // Timeseries: bucket the fetched rows by day, summing total tokens.
  const buckets: DayBucket[] = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const day = row.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + row.total_tokens);
    }
    return sortChronological(
      [...byDay.entries()].map(([date, total_tokens]) => ({ date, total_tokens })),
      (b) => b.date,
    );
  }, [rows]);
  const hasChartData = buckets.some((b) => b.total_tokens > 0);

  const hasActiveFilters = !!rawProject || !!rawWorker || !!rawModel || isCustom;

  const goToPrevious = () => setParams({ page: page > 2 ? String(page - 1) : null });
  const goToNext = () => {
    if (offset + PAGE_SIZE >= total) return;
    setParams({ page: String(page + 1) });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <RequirePermission permission="members:read">
      <div className="space-y-6">
        <PageHeader
          title="Usage"
          description="LLM call volume — token counts and latency per worker and model"
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center rounded p-1 text-surface-400 hover:text-surface-200 transition-colors cursor-help"
                  aria-label="About this page"
                >
                  <Info size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                Tracks per-call LLM token usage — prompt, completion, reasoning, and total tokens — plus worker, model, and duration. Tracking only; no costing.
              </TooltipContent>
            </Tooltip>
          }
        />

        <PageGuide title="LLM usage tracking" illustration={<GuideDashboard />}>
          <p>Every LLM call is logged with prompt, completion, reasoning, and total token counts, plus the worker, model, and duration. Filter by project, worker, model, or time range. This page is tracking-only — no cost data is computed here.</p>
        </PageGuide>

        {/* Summary — tracking-only, no cost fields */}
        {usageQuery.isError && !loading ? (
          <ErrorState
            message="Couldn’t load usage data."
            onRetry={usageQuery.refetch}
          />
        ) : (
          <div className="stat-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Calls" value={summary ? summary.calls.toLocaleString() : null} loading={loading} />
            <StatCard label="Prompt tokens" value={summary ? summary.prompt_tokens.toLocaleString() : null} loading={loading} />
            <StatCard label="Completion tokens" value={summary ? summary.completion_tokens.toLocaleString() : null} loading={loading} />
            <StatCard label="Reasoning tokens" value={summary ? summary.reasoning_tokens.toLocaleString() : null} loading={loading} />
            <StatCard label="Total tokens" value={summary ? summary.total_tokens.toLocaleString() : null} loading={loading} />
            <StatCard
              label="Avg duration"
              value={summary ? `${Math.round(summary.avg_duration_ms).toLocaleString()}ms` : null}
              loading={loading}
            />
          </div>
        )}

        {/* Filter bar */}
        <div className="card-base p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Project</span>
              <select
                value={rawProject}
                onChange={(e) => setParams({ project_id: e.target.value || null, page: null })}
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
              <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Worker</span>
              <select
                value={rawWorker}
                onChange={(e) => setParams({ worker: e.target.value || null, page: null })}
                className="input-base h-8 text-xs flex-1 min-w-0 truncate border-surface-800"
                aria-label="Filter by worker"
              >
                <option value="">All workers</option>
                {workerOptions.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Model</span>
              <select
                value={rawModel}
                onChange={(e) => setParams({ model: e.target.value || null, page: null })}
                className="input-base h-8 text-xs flex-1 min-w-0 truncate border-surface-800"
                aria-label="Filter by model"
              >
                <option value="">All models</option>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
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
                  onClick={() => setParams({ from: customFrom, to: customTo, days: null, page: null })}
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
                onClick={() => setParams({ project_id: null, worker: null, model: null, page: null })}
                className="h-8 text-surface-400"
              >
                <X size={14} />
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* Timeseries — total tokens per day */}
        <div className="card-base p-5">
          <h3 className="text-sm font-medium mb-4">Total tokens per day</h3>
          {loading && buckets.length === 0 ? (
            <div className="h-[220px] rounded bg-surface-800 animate-pulse" />
          ) : !hasChartData ? (
            <div className="flex flex-col items-center justify-center h-[220px] text-surface-500">
              <BarChart3 size={28} className="mb-2 opacity-40" />
              <p className="text-sm font-medium">No usage for this period</p>
              <p className="text-xs mt-1 text-surface-600">Try selecting a different time range.</p>
            </div>
          ) : (
            <>
              <BarChart
                data={buckets}
                dates={buckets.map((b) => b.date)}
                height={220}
                tooltipShowYear
                series={[
                  { label: "Total tokens", color: "--color-signal", value: (b) => b.total_tokens },
                ]}
              />
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-surface-800 text-xs text-surface-400">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: cssVar("--color-signal") }} />
                Total tokens
              </div>
            </>
          )}
        </div>

        {/* Table */}
        <div className="card-base overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-800 flex items-center justify-between">
            <h3 className="text-sm font-medium">
              LLM calls
            </h3>
            {!loading && (
              <span className="text-[11px] text-surface-500">
                {total.toLocaleString()} call{total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <Table storageKey="usage">
            <TableHeader>
              <SortableHead field="created_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Time</SortableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead align="right">Prompt</TableHead>
              <TableHead align="right">Completion</TableHead>
              <TableHead align="right">Reasoning</TableHead>
              <SortableHead field="total_tokens" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right">Total</SortableHead>
              <SortableHead field="duration_ms" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right">Duration</SortableHead>
              <TableHead>Episode</TableHead>
              <TableHead>Session</TableHead>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeleton rows={6} cols={11} />
              ) : usageQuery.isError ? (
                <tr>
                  <td colSpan={11}>
                    <div className="px-4 py-3">
                      <ErrorState message="Couldn’t load usage rows." onRetry={usageQuery.refetch} />
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyState
                      icon={BarChart3}
                      title="No LLM calls found"
                      description={hasActiveFilters ? "Try adjusting your filters" : "LLM calls will appear here once workers run"}
                    />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-surface-300 text-xs">{smartTimestamp(row.created_at)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-surface-200">{workerOf(row)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-surface-300">{row.provider}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-surface-300 max-w-[160px] block truncate" title={row.model}>
                        {row.model}
                      </span>
                    </TableCell>
                    <TableCell align="right">
                      <span className="font-mono text-xs text-surface-200 tabular-nums">{row.prompt_tokens.toLocaleString()}</span>
                    </TableCell>
                    <TableCell align="right">
                      <span className="font-mono text-xs text-surface-200 tabular-nums">{row.completion_tokens.toLocaleString()}</span>
                    </TableCell>
                    <TableCell align="right">
                      <span className="font-mono text-xs text-surface-200 tabular-nums">{row.reasoning_tokens.toLocaleString()}</span>
                    </TableCell>
                    <TableCell align="right">
                      <span className="font-mono text-xs font-medium text-surface-100 tabular-nums">{row.total_tokens.toLocaleString()}</span>
                    </TableCell>
                    <TableCell align="right">
                      <span className="font-mono text-xs text-surface-300 tabular-nums">{Math.round(row.duration_ms).toLocaleString()}ms</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-surface-400 max-w-[80px] block truncate" title={row.episode_id ?? undefined}>
                        {shortId(row.episode_id)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.session_id && row.project_id ? (
                        <Link
                          href={`/projects/${row.project_id}/sessions/${row.session_id}`}
                          className="font-mono text-xs text-brand-300 hover:underline max-w-[80px] block truncate"
                          title={row.session_id}
                        >
                          {shortId(row.session_id)}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-surface-400 max-w-[80px] block truncate" title={row.session_id ?? undefined}>
                          {shortId(row.session_id)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination footer */}
          {!loading && !usageQuery.isError && total > 0 && (
            <div className="border-t border-surface-800 px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-surface-500">
                {total.toLocaleString()} total call{total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-surface-400">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goToPrevious}
                    disabled={offset === 0}
                    className="rounded-md text-surface-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous page"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goToNext}
                    disabled={offset + PAGE_SIZE >= total}
                    className="rounded-md text-surface-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next page"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </RequirePermission>
  );
}
