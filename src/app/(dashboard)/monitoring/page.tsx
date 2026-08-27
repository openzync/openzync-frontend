"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  Timer,
  AlertTriangle,
  RefreshCw,
  Info,
  TrendingUp,
  Database,
  BarChart2,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { get, ApiError, apiErrorMessage } from "@/lib/api-client";
import { timeAgo } from "@/lib/utils";
import { PageGuide, GuideDashboard } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { RequirePermission } from "@/components/shared/require-permission";
import { LineChart, StackedBarChart, cssVar } from "@/components/shared/charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EpisodesMetrics {
  added_total: number; added_24h: number; in_progress: number; enrichment_pending: number;
  fully_enriched: number; with_embeddings: number; fully_enriched_pct: number;
}

interface GraphsMetrics {
  entities_total: number; entities_24h: number; relationships_total: number;
}

interface LatencyMetrics { p50: number; p95: number; p99: number; }
interface RequestRate { "2xx": number; "5xx": number; }
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
  queue_depth: QueueDepth;
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

// ─── Time-series types ────────────────────────────────────────────────────────

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

interface SummaryTimeseries {
  retrieval_timeseries?: RetrievalTimeseries;
  error_timeseries?: ErrorTimeseriesPoint[];
  context_latency_timeseries?: LatencyTimeseriesPoint[];
  graph_latency_timeseries?: LatencyTimeseriesPoint[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30000;

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

// ─── KPI Card — replaced by shared StatCard ─────────────────────────────────────

// ─── Latency Card ──────────────────────────────────────────────────────────────

function LatencyCard({ title, icon: Icon, data }: {
  title: string; icon: React.ComponentType<{ size?: number }>; data: LatencyMetrics;
}) {
  const percentiles = [
    { key: "p50" as const, label: "p50" },
    { key: "p95" as const, label: "p95" },
    { key: "p99" as const, label: "p99" },
  ];
  return (
    <div className="rounded-lg border border-surface-800 p-4 space-y-3 hover:border-surface-700 transition-colors">
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [targets, setTargets] = useState<ScrapeTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const [summaryData, targetsData] = await Promise.all([
        get<SummaryResponse>("/metrics/summary"),
        get<TargetsResponse>("/metrics/targets"),
      ]);
      setSummary(summaryData);
      if (targetsData?.targets) {
        setTargets(Array.isArray(targetsData.targets) ? targetsData.targets : []);
      }
      setLastRefreshed(new Date());
      setLoadError(null);
    } catch (err) {
      // Metrics endpoints are admin-gated — members see a clear message, not a blank page.
      setLoadError(err instanceof ApiError && err.isForbidden
        ? "Admin access required"
        : apiErrorMessage(err, "Unable to fetch monitoring data"));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const queueTotal = summary ? summary.queue_depth.high + summary.queue_depth.low : null;

  return (
    <RequirePermission permission="members:read">
      <div className="space-y-6">
      <PageHeader
        title="Monitoring"
        description="Platform health and ingestion pipeline — queue depth, scrape targets, enrichment, and query performance"
        actions={
          <div className="flex items-center gap-3">
            <Link href="/monitoring/query">
              <Button variant="ghost" size="sm"
                className="rounded-md text-surface-400 hover:text-white" title="Open Query Playground">
                <Terminal size={14} className="mr-1.5" />Query
              </Button>
            </Link>
            <span className="flex items-center gap-1.5 text-xs text-success font-medium">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse-dot" />Live
            </span>
            {lastRefreshed && (
              <span className="text-[11px] text-surface-500 hidden sm:block">Updated {timeAgo(lastRefreshed.toISOString())}</span>
            )}
            <Button variant="ghost" size="sm" onClick={() => fetchData(false)} disabled={refreshing}
              className="rounded-md text-surface-400 hover:text-white disabled:opacity-50" title="Refresh now">
              {refreshing ? <Spinner /> : <RefreshCw size={16} />}
            </Button>
          </div>
        }
      />

      <PageGuide title="Platform monitoring" illustration={<GuideDashboard />}>
        <p>Monitor your platform health and performance in real time. Track enrichment progress, error rates, API latency percentiles, queue depth, and Prometheus scrape targets.</p>
      </PageGuide>

      {loadError && (
        <ErrorState message={loadError} onRetry={() => { setLoadError(null); void fetchData(true); }} />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Episodes Added (24h)" value={summary?.episodes.added_24h?.toLocaleString() ?? null} icon={TrendingUp} color="text-brand-300" loading={loading} trend={summary && summary.episodes.added_24h > 0 ? "up" : null} />
        <div className="rounded-lg border border-surface-800 p-4 space-y-3 hover:border-surface-700 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-surface-400">
              <BarChart2 size={14} />Enrichment Progress
            </div>
            {summary && (
              <span className="text-xs text-surface-500">
                {summary.episodes.fully_enriched.toLocaleString()} / {summary.episodes.added_total.toLocaleString()}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {loading ? (
            <div className="h-5 rounded-full bg-surface-800 animate-pulse" />
          ) : summary ? (
            <div className="space-y-1.5">
              <div className="h-5 w-full rounded-full bg-surface-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(summary.episodes.fully_enriched_pct, 100)}%`,
                    backgroundColor: summary.episodes.fully_enriched_pct >= 80
                      ? "var(--color-success-500)"
                      : summary.episodes.fully_enriched_pct >= 50
                        ? "var(--color-warning-500)"
                        : "var(--color-error-500)",
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-surface-400">
                  {summary.episodes.fully_enriched_pct.toFixed(1)}% complete
                </span>
                <span className="text-surface-500">
                  {summary.episodes.in_progress.toLocaleString()} in progress
                </span>
              </div>
            </div>
          ) : (
            <div className="h-5 rounded-full bg-surface-800" />
          )}

          {/* Mini stat row */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="text-center">
              <div className="text-lg font-semibold text-surface-200 font-mono">
                {loading ? '—' : summary?.episodes.fully_enriched.toLocaleString() ?? '—'}
              </div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider">Enriched</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-surface-200 font-mono">
                {loading ? '—' : summary?.episodes.with_embeddings.toLocaleString() ?? '—'}
              </div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider">Embedded</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-surface-200 font-mono">
                {loading ? '—' : summary?.episodes.enrichment_pending.toLocaleString() ?? '—'}
              </div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider">Pending</div>
            </div>
          </div>
        </div>
        <StatCard label="Error Rate" value={summary != null ? `${summary.error_rate_pct.toFixed(2)}%` : null} icon={AlertTriangle}
          color={summary && summary.error_rate_pct > 5 ? "text-error" : summary && summary.error_rate_pct > 1 ? "text-warning" : "text-success"}
          loading={loading} trend={summary && summary.error_rate_pct > 1 ? "up" : "down"} />
        <StatCard label="Queue Depth" value={queueTotal?.toLocaleString() ?? null} icon={Activity}
          color={queueTotal != null && queueTotal > 500 ? "text-error" : queueTotal != null && queueTotal > 100 ? "text-warning" : "text-surface-300"}
          loading={loading} trend={summary && summary.queue_depth.high > 0 ? "up" : null} />
      </div>

      {/* Retrieval Activity + Error by Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3"><TrendingUp size={16} className="text-brand-300" />Retrieval Activity</h3>
          {loading ? (
            <div className="h-[220px] rounded bg-surface-800 animate-pulse" />
          ) : summary?.retrieval_timeseries ? (
            <>
              <LineChart
                lines={[
                  { label: "Context", color: "--color-brand-500", data: summary.retrieval_timeseries.context_retrievals.map((d) => ({ x: d.timestamp, y: d.value })) },
                  { label: "Graph", color: "--color-accent-300", data: summary.retrieval_timeseries.graph_retrievals.map((d) => ({ x: d.timestamp, y: d.value })) },
                ]}
              />
              <div className="flex items-center gap-5 mt-2 pt-2 border-t border-surface-800">
                <div className="flex items-center gap-1.5 text-xs text-surface-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cssVar("--color-brand-500") }} />Context
                </div>
                <div className="flex items-center gap-1.5 text-xs text-surface-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cssVar("--color-accent-300") }} />Graph
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-surface-500 text-xs">No retrieval data</div>
          )}
        </div>

        <div className="card-base p-5">
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3"><AlertTriangle size={16} className="text-warning" />Error by Type</h3>
          {loading ? (
            <div className="h-[220px] rounded bg-surface-800 animate-pulse" />
          ) : summary?.error_timeseries && summary.error_timeseries.length > 0 ? (
            <>
              <StackedBarChart data={summary.error_timeseries} />
              <div className="flex items-center gap-5 mt-2 pt-2 border-t border-surface-800">
                <div className="flex items-center gap-1.5 text-xs text-surface-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cssVar("--color-warning") }} />4xx
                </div>
                <div className="flex items-center gap-1.5 text-xs text-surface-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cssVar("--color-error") }} />5xx
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-surface-500 text-xs">No error data</div>
          )}
        </div>
      </div>

      {/* Latency panel */}
      <div className="card-base p-5">
        <h3 className="text-sm font-medium flex items-center gap-1.5 mb-4"><Timer size={16} className="text-brand-300" />Latency</h3>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (<div key={i} className="h-28 rounded-lg bg-surface-800 animate-pulse" />))}
          </div>
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

      {/* Latency time-series */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3"><Timer size={16} className="text-brand-300" />Context Search Latency</h3>
          {loading ? (
            <div className="h-[220px] rounded bg-surface-800 animate-pulse" />
          ) : summary?.context_latency_timeseries && summary.context_latency_timeseries.length > 0 ? (
            <>
              <LineChart
                lines={[
                  { label: "p50", color: "--color-success", data: summary.context_latency_timeseries.map((d) => ({ x: d.date, y: d.p50 })) },
                  { label: "p95", color: "--color-warning", data: summary.context_latency_timeseries.map((d) => ({ x: d.date, y: d.p95 })) },
                  { label: "p99", color: "--color-error", data: summary.context_latency_timeseries.map((d) => ({ x: d.date, y: d.p99 })) },
                ]}
              />
              <div className="flex items-center gap-5 mt-2 pt-2 border-t border-surface-800">
                {[
                  { label: "p50", color: "--color-success" },
                  { label: "p95", color: "--color-warning" },
                  { label: "p99", color: "--color-error" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5 text-xs text-surface-400">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cssVar(l.color) }} />{l.label}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-surface-500 text-xs">No latency data</div>
          )}
        </div>

        <div className="card-base p-5">
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3"><Database size={16} className="text-accent-300" />Graph Search Latency</h3>
          {loading ? (
            <div className="h-[220px] rounded bg-surface-800 animate-pulse" />
          ) : summary?.graph_latency_timeseries && summary.graph_latency_timeseries.length > 0 ? (
            <>
              <LineChart
                lines={[
                  { label: "p50", color: "--color-success", data: summary.graph_latency_timeseries.map((d) => ({ x: d.date, y: d.p50 })) },
                  { label: "p95", color: "--color-warning", data: summary.graph_latency_timeseries.map((d) => ({ x: d.date, y: d.p95 })) },
                  { label: "p99", color: "--color-error", data: summary.graph_latency_timeseries.map((d) => ({ x: d.date, y: d.p99 })) },
                ]}
              />
              <div className="flex items-center gap-5 mt-2 pt-2 border-t border-surface-800">
                {[
                  { label: "p50", color: "--color-success" },
                  { label: "p95", color: "--color-warning" },
                  { label: "p99", color: "--color-error" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5 text-xs text-surface-400">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cssVar(l.color) }} />{l.label}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-surface-500 text-xs">No latency data</div>
          )}
        </div>
      </div>

      {/* Scrape Targets table */}
      <div className="card-base overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-800 flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-1.5"><Info size={16} className="text-brand-300" />Scrape Targets</h3>
          {!loading && <span className="text-[11px] text-surface-500">{targets.length} target{targets.length !== 1 ? "s" : ""}</span>}
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4">
                {[0, 1, 2, 3, 4].map((j) => (<div key={j} className="h-5 rounded bg-surface-800 animate-pulse" style={{ width: [128, 192, 64, 80, 160][j] }} />))}
              </div>
            ))}
          </div>
        ) : targets.length === 0 ? (
          <EmptyState
            icon={Info}
            title="No scrape targets found"
            description="Targets will appear once Prometheus scrape jobs are configured."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableHead>Job</TableHead>
              <TableHead>Instance</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Last Scrape</TableHead>
              <TableHead>Last Error</TableHead>
            </TableHeader>
            <TableBody>
              {targets.map((t, i) => {
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
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Status bar */}
      <div className={cn("card-base px-5 py-3 flex items-center justify-between flex-wrap gap-2", !summary && "opacity-50")}>
        {summary ? (
          <>
            <div className="flex items-center gap-4 text-xs text-surface-400">
              <span>Status: <span className={cn("font-medium capitalize", summary.status === "healthy" || summary.status === "up" ? "text-success" : "text-warning")}>{summary.status}</span></span>
              <span className="hidden sm:inline">Active Requests: <span className="text-surface-200 font-medium">{summary.active_requests.toLocaleString()}</span></span>
              <span className="hidden sm:inline">Users: <span className="text-surface-200 font-medium">{summary.users_total?.toLocaleString() ?? "—"}</span></span>
              <span>Request Rate: <span className="text-surface-200 font-medium">{summary.request_rate["2xx"].toLocaleString()} 2xx</span> / <span className={cn("font-medium", summary.request_rate["5xx"] > 0 ? "text-error" : "text-surface-200")}>{summary.request_rate["5xx"].toLocaleString()} 5xx</span></span>
            </div>
            <div className="text-[11px] text-surface-500">
              {refreshing ? <span className="flex items-center gap-1.5"><Spinner />Refreshing...</span> : `Auto-refreshes every ${REFRESH_INTERVAL_MS / 1000}s`}
            </div>
          </>
        ) : loading ? (
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (<div key={i} className="h-4 w-20 rounded bg-surface-800 animate-pulse" />))}
          </div>
        ) : loadError ? null : (
          <ErrorState message="Unable to fetch monitoring data" onRetry={() => fetchData(true)} />
        )}
      </div>
      </div>
    </RequirePermission>
  );
}
