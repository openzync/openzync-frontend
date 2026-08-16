"use client";

import { useEffect, useState, useCallback } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Activity,
  Timer,
  AlertTriangle,
  RefreshCw,
  Info,
  TrendingUp,
  Database,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { get, ApiError, apiErrorMessage } from "@/lib/api-client";
import { useTimeAgo } from "@/hooks/use-time-ago";
import { PageGuide, GuideDashboard } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
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
}

interface ScrapeTarget {
  job: string; instance: string; health: string; last_scrape: string; last_error: string;
}

interface TargetsResponse { targets: ScrapeTarget[]; }

// ─── Constants ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30000;

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

// ─── Latency Card ──────────────────────────────────────────────────────────────

function LatencyCard({ title, icon: Icon, data }: {
  title: string; icon: React.ComponentType<{ size?: number }>; data: LatencyMetrics;
}) {
  const t = useTranslations("monitoring");
  const fmt = useFormatter();

  const formatMs = (ms: number): string => {
    if (ms < 0.5) return t("latency.subMs");
    return t("latency.ms", {
      value: fmt.number(ms, { maximumFractionDigits: ms < 1 ? 1 : 0 }),
    });
  };

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
  const t = useTranslations("monitoring");
  const fmt = useFormatter();
  const timeAgo = useTimeAgo();
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
        ? t("errorAdmin")
        : apiErrorMessage(err, t("errorLoad")));
    } finally { setLoading(false); setRefreshing(false); }
  }, [t]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const queueTotal = summary ? summary.queue_depth.high + summary.queue_depth.low : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-success font-medium">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse-dot" />{t("live")}
            </span>
            {lastRefreshed && (
              <span className="text-[11px] text-surface-500 hidden sm:block">{t("updated", { time: timeAgo(lastRefreshed.toISOString()) })}</span>
            )}
            <Button variant="ghost" size="sm" onClick={() => fetchData(false)} disabled={refreshing}
              className="rounded-md text-surface-400 hover:text-white disabled:opacity-50" title={t("refreshNow")}>
              {refreshing ? <Spinner /> : <RefreshCw size={16} />}
            </Button>
          </div>
        }
      />

      <PageGuide title={t("guideTitle")} illustration={<GuideDashboard />}>
        <p>{t("guideBody")}</p>
      </PageGuide>

      {loadError && (
        <ErrorState message={loadError} onRetry={() => { setLoadError(null); void fetchData(true); }} />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("kpi.episodesAdded24h")} value={summary != null ? fmt.number(summary.episodes.added_24h) : null} icon={TrendingUp} color="text-brand-300" loading={loading} trend={summary && summary.episodes.added_24h > 0 ? "up" : null} />
        <div className="rounded-lg border border-surface-800 p-4 space-y-3 hover:border-surface-700 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-surface-400">
              <BarChart2 size={14} />{t("enrichment.title")}
            </div>
            {summary && (
              <span className="text-xs text-surface-500">
                {fmt.number(summary.episodes.fully_enriched)} / {fmt.number(summary.episodes.added_total)}
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
                    backgroundColor: summary.episodes.fully_enriched_pct >= 80 ? '#22c55e'
                      : summary.episodes.fully_enriched_pct >= 50 ? '#eab308'
                      : '#ef4444',
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-surface-400">
                  {t("enrichment.complete", { pct: fmt.number(summary.episodes.fully_enriched_pct, { maximumFractionDigits: 1 }) })}
                </span>
                <span className="text-surface-500">
                  {t("enrichment.inProgress", { count: fmt.number(summary.episodes.in_progress) })}
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
                {loading ? '—' : summary != null ? fmt.number(summary.episodes.fully_enriched) : '—'}
              </div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider">{t("enrichment.enriched")}</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-surface-200 font-mono">
                {loading ? '—' : summary != null ? fmt.number(summary.episodes.with_embeddings) : '—'}
              </div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider">{t("enrichment.embedded")}</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-surface-200 font-mono">
                {loading ? '—' : summary != null ? fmt.number(summary.episodes.enrichment_pending) : '—'}
              </div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider">{t("enrichment.pending")}</div>
            </div>
          </div>
        </div>
        <StatCard label={t("kpi.errorRate")} value={summary != null ? `${fmt.number(summary.error_rate_pct, { maximumFractionDigits: 2 })}%` : null} icon={AlertTriangle}
          color={summary && summary.error_rate_pct > 5 ? "text-error" : summary && summary.error_rate_pct > 1 ? "text-warning" : "text-success"}
          loading={loading} trend={summary && summary.error_rate_pct > 1 ? "up" : "down"} />
        <StatCard label={t("kpi.queueDepth")} value={queueTotal != null ? fmt.number(queueTotal) : null} icon={Activity}
          color={queueTotal != null && queueTotal > 500 ? "text-error" : queueTotal != null && queueTotal > 100 ? "text-warning" : "text-surface-300"}
          loading={loading} trend={summary && summary.queue_depth.high > 0 ? "up" : null} />
      </div>

      {/* Latency panel */}
      <div className="card-base p-5">
        <h3 className="text-sm font-medium flex items-center gap-1.5 mb-4"><Timer size={16} className="text-brand-300" />{t("latency.title")}</h3>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (<div key={i} className="h-28 rounded-lg bg-surface-800 animate-pulse" />))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <LatencyCard title={t("latency.overall")} icon={Activity} data={summary.overall_latency_ms} />
            <LatencyCard title={t("latency.context")} icon={Timer} data={summary.context_latency_ms} />
            <LatencyCard title={t("latency.graphSearch")} icon={Database} data={summary.graph_search_latency_ms} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-28 text-surface-500"><Timer size={28} className="mb-2 opacity-40" /><p className="text-sm">{t("latency.empty")}</p></div>
        )}
      </div>

      {/* Scrape Targets table */}
      <div className="card-base overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-800 flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-1.5"><Info size={16} className="text-brand-300" />{t("targets.title")}</h3>
          {!loading && <span className="text-[11px] text-surface-500">{t("targets.count", { count: targets.length })}</span>}
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
            title={t("targets.emptyTitle")}
            description={t("targets.emptyDescription")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-800">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">{t("targets.table.job")}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">{t("targets.table.instance")}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">{t("targets.table.health")}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">{t("targets.table.lastScrape")}</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">{t("targets.table.lastError")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {targets.map((tgt, i) => {
                  const isUp = tgt.health?.toLowerCase() === "up";
                  return (
                    <tr key={`${tgt.job}-${tgt.instance}-${i}`} className={cn("transition-colors hover:bg-surface-800/50", i % 2 === 0 ? "bg-surface-950/50" : "")}>
                      <td className="px-5 py-3"><span className="font-mono text-xs text-surface-200">{tgt.job}</span></td>
                      <td className="px-5 py-3"><span className="font-mono text-xs text-surface-300">{tgt.instance}</span></td>
                      <td className="px-5 py-3">
                        <Badge variant={isUp ? "success" : "error"} size="sm">{isUp ? t("targets.up") : t("targets.down")}</Badge>
                      </td>
                      <td className="px-5 py-3"><span className="text-xs text-surface-400">{tgt.last_scrape ? timeAgo(tgt.last_scrape) : "—"}</span></td>
                      <td className="px-5 py-3">
                        {tgt.last_error ? (
                          <span className="text-xs text-surface-500 max-w-[220px] block truncate" title={tgt.last_error}>{tgt.last_error}</span>
                        ) : (<span className="text-xs text-surface-600">—</span>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className={cn("card-base px-5 py-3 flex items-center justify-between flex-wrap gap-2", !summary && "opacity-50")}>
        {summary ? (
          <>
            <div className="flex items-center gap-4 text-xs text-surface-400">
              <span>
                {t.rich("status.status", {
                  status: (chunks) => (
                    <span className={cn("font-medium capitalize", summary.status === "healthy" || summary.status === "up" ? "text-success" : "text-warning")}>{chunks}</span>
                  ),
                })}
              </span>
              <span className="hidden sm:inline">{t("status.activeRequests", { count: fmt.number(summary.active_requests) })}</span>
              <span className="hidden sm:inline">{t("status.users", { count: summary.users_total != null ? fmt.number(summary.users_total) : "—" })}</span>
              <span>{t("status.requestRate", { twoxx: fmt.number(summary.request_rate["2xx"]), fivexx: fmt.number(summary.request_rate["5xx"]) })}</span>
            </div>
            <div className="text-[11px] text-surface-500">
              {refreshing ? <span className="flex items-center gap-1.5"><Spinner />{t("refreshing")}</span> : t("autoRefreshes", { seconds: REFRESH_INTERVAL_MS / 1000 })}
            </div>
          </>
        ) : loading ? (
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => (<div key={i} className="h-4 w-20 rounded bg-surface-800 animate-pulse" />))}
          </div>
        ) : loadError ? null : (
          <ErrorState message={t("errorLoad")} onRetry={() => fetchData(true)} />
        )}
      </div>
    </div>
  );
}
