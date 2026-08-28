"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  FolderKanban,
  BarChart3,
  Shield,
  BrainCircuit,
  Upload,
  Network,
  type LucideIcon,
} from "lucide-react";
import { get } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ErrorState } from "@/components/shared/error-state";
import { BarChart, cssVar } from "@/components/shared/charts";
import { Button } from "@/components/ui/button";
import { PageGuide, GuideDashboard } from "@/components/guides";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgStats {
  total_episodes: number;
  total_sessions: number;
  total_facts: number;
  total_extractions: number;
  total_observations: number;
  total_classifications: number;
}

interface UsagePoint {
  date: string;
  episode_count: number;
  session_count: number;
  fact_count: number;
  extraction_count: number;
  observation_count: number;
  classification_count: number;
  node_count: number;
  edge_count: number;
}

interface QuickActionItem {
  label: string;
  href: string;
  icon: string;
  description?: string;
}

interface QuickActionsResponse {
  actions: QuickActionItem[];
}

interface ProjectOption {
  id: string;
  name: string;
}

// ─── Icon Map for Quick Actions ────────────────────────────────────────────────

const QUICK_ACTION_ICONS: Record<string, LucideIcon> = {
  "folder-kanban": FolderKanban,
  "bar-chart-3": BarChart3,
  shield: Shield,
  users: Users,
  "brain-circuit": BrainCircuit,
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [7, 30, 90] as const;
type DaysOption = (typeof DAYS_OPTIONS)[number];

const STAT_CARDS = [
  { label: "Episodes", key: "total_episodes" as const },
  { label: "Sessions", key: "total_sessions" as const },
  { label: "Facts", key: "total_facts" as const },
  { label: "Extractions", key: "total_extractions" as const },
  { label: "Observations", key: "total_observations" as const },
  { label: "Classifications", key: "total_classifications" as const },
];

const SMALL_CHARTS = [
  { dataKey: "episode_count" as const, color: "--color-accent-300", label: "Episodes" },
  { dataKey: "session_count" as const, color: "--color-success", label: "Sessions" },
  { dataKey: "fact_count" as const, color: "--color-brand-500", label: "Facts" },
  { dataKey: "extraction_count" as const, color: "--color-warning-500", label: "Extractions" },
  { dataKey: "observation_count" as const, color: "--color-info-500", label: "Observations" },
  { dataKey: "classification_count" as const, color: "--color-accent-500", label: "Classifications" },
] as const;

// Fresh-org quickstart — all destinations point at /projects (this page does not
// fetch project data, so there is no first-project link available without adding
// an API call).
const QUICKSTART_STEPS = [
  { title: "Create a project", description: "Organize your knowledge base and conversations.", href: "/projects", icon: FolderKanban },
  { title: "Ingest a conversation", description: "Import a chat log to embed entities and facts.", href: "/projects", icon: Upload },
  { title: "Explore the knowledge graph", description: "Watch connections light up as the graph grows.", href: "/projects", icon: Network },
] as const;

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <OverviewInner />
    </Suspense>
  );
}

function OverviewInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Global filter state — URL is the source of truth ──────────────────────

  const rawDays = Number(searchParams.get("days"));
  const rawFrom = searchParams.get("from");
  const rawTo = searchParams.get("to");
  const rawProject = searchParams.get("project");

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

  // Sync local inputs when URL changes via navigation (back/forward/filter buttons).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCustomFrom(from ?? ""); }, [from]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCustomTo(to ?? ""); }, [to]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPendingRange(isCustom ? "custom" : String(days)); }, [isCustom, days]);

  function setDays(d: DaysOption) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("days", String(d));
    p.delete("from");
    p.delete("to");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  function setProject(id: string | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (id) p.set("project", id);
    else p.delete("project");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  function applyCustom(f: string, t: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("from", f);
    p.set("to", t);
    p.delete("days");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  function clearCustom() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("from");
    p.delete("to");
    p.set("days", "30");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  // ── Projects dropdown ──────────────────────────────────────────────────────

  const projectsQuery = useApiQuery<ProjectOption[] | { data: ProjectOption[] }>(async () => {
    try {
      return await get<ProjectOption[] | { data: ProjectOption[] }>("/v1/projects?limit=100");
    } catch {
      // Fallback endpoint if the primary shape returns 404 in some deployments.
      return await get<ProjectOption[] | { data: ProjectOption[] }>("/v1/projects/list");
    }
  });

  const projects: ProjectOption[] = (() => {
    const d = projectsQuery.data;
    if (!d) return [];
    return Array.isArray(d) ? d : (d.data ?? []);
  })();

  // ── Windowed query string — shared by stats + usage ───────────────────────

  const qs = new URLSearchParams();
  if (isCustom && from && to) {
    qs.set("from", from);
    qs.set("to", to);
  } else {
    qs.set("days", String(days));
  }
  if (projectId) qs.set("project_id", projectId);
  const qsString = qs.toString();
  const windowKey = `${days}-${from}-${to}-${projectId}`;

  // Each section fails independently so one bad endpoint doesn't blank the
  // whole dashboard. Errors clear on success only, so a retry visibly keeps
  // the error until it actually resolves.
  const statsQuery = useApiQuery<OrgStats>(() => get<OrgStats>(`/v1/admin/stats/org?${qsString}`), {
    refreshKey: windowKey,
  });
  const quickActionsQuery = useApiQuery<QuickActionsResponse>(() =>
    get<QuickActionsResponse>("/v1/admin/quick-actions"),
  );
  const loading = statsQuery.isLoading || quickActionsQuery.isLoading;

  const quickActions = quickActionsQuery.data?.actions ?? [];

  // Chart state — windowed by the same qs.
  const usageQuery = useApiQuery<UsagePoint[] | { data?: UsagePoint[] }>(
    () => get<UsagePoint[] | { data?: UsagePoint[] }>(`/v1/admin/stats/usage?${qsString}`),
    { refreshKey: windowKey },
  );
  const usage: UsagePoint[] = Array.isArray(usageQuery.data)
    ? usageQuery.data
    : usageQuery.data?.data ?? [];
  const usageLoading = usageQuery.isLoading;

  // ── Big Graph render helpers ───────────────────────────────────────────────

  const SKELETON_HEIGHTS = [64, 48, 72, 40, 58, 80, 35, 66, 50, 74, 44, 62, 38, 70, 52, 46, 68, 42, 56, 60];
  const SKELETON_OPACITIES = [0.5, 0.8, 0.65, 0.9, 0.55, 0.75, 0.85, 0.6];

  function renderGraphSkeleton() {
    return (
      <div className="flex items-end gap-1 h-[260px] pt-5">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-surface-800 animate-pulse"
            style={{ height: `${SKELETON_HEIGHTS[i % SKELETON_HEIGHTS.length]}%`, opacity: SKELETON_OPACITIES[i % SKELETON_OPACITIES.length] }}
          />
        ))}
      </div>
    );
  }

  function renderGraphChart() {
    if (loading || (usageLoading && usage.length === 0)) return renderGraphSkeleton();
    const hasGraphData = usage.some((p) => (p.node_count ?? 0) > 0 || (p.edge_count ?? 0) > 0);
    if (!hasGraphData) {
      return (
        <div className="flex flex-col items-center justify-center h-[260px] text-surface-500">
          <BarChart3 size={40} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">No graph data for this period</p>
          <p className="text-xs mt-1 text-surface-600">Try selecting a different time range</p>
        </div>
      );
    }
    return (
      <BarChart
        data={usage}
        dates={usage.map((p) => p.date)}
        height={260}
        tooltipShowYear
        series={[
          { label: "Nodes", color: "--color-brand-500", value: (p) => p.node_count ?? 0 },
          { label: "Edges", color: "--color-accent-300", value: (p) => p.edge_count ?? 0, baseOpacity: 0.65 },
        ]}
      />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Your organization&rsquo;s activity pulse — live stats and daily usage trends"
      />

      <PageGuide title="Your organization at a glance" illustration={<GuideDashboard />}>
        <p>Monitor your organization&rsquo;s key metrics — messages, sessions, facts, users, episodes, and API keys. Track daily usage trends with the interactive chart.</p>
      </PageGuide>

      {/* Quickstart — only for a brand-new org (no episodes yet) */}
      {!loading && statsQuery.data?.total_episodes === 0 && (
        <div className="card-base p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Get started in 3 steps</h2>
              <p className="text-xs text-surface-300 mt-1">
                Your workspace is ready — create a project, ingest a conversation, and watch the knowledge graph light up.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push("/projects")}
              className="shrink-0 self-start sm:self-auto"
            >
              Create your first project
            </Button>
          </div>
          <ol className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {QUICKSTART_STEPS.map((s) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => router.push(s.href)}
                  className="group flex w-full items-start gap-3 rounded-md border border-surface-800 bg-surface-950/50 p-3 text-left transition-colors hover:border-brand-500/50 hover:bg-surface-900"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-300">
                    <s.icon size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-surface-100 group-hover:text-white">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-surface-300">{s.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Stat cards — all 6 in a single row */}
      {statsQuery.isError && !loading ? (
        <ErrorState
          message="Couldn't load organization stats."
          onRetry={statsQuery.refetch}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {STAT_CARDS.map((card) => (
            <StatCard
              key={card.key}
              label={card.label}
              value={statsQuery.data?.[card.key] ?? null}
              loading={loading}
            />
          ))}
        </div>
      )}

      {/* Filters toolbar — global window controls */}
      <div className="card-base p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Project</span>
            <select
              value={projectId ?? ""}
              onChange={(e) => setProject(e.target.value || null)}
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
                onClick={() => applyCustom(customFrom, customTo)}
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
      </div>

      {/* Small graphs — 6 charts, 2 rows of 3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SMALL_CHARTS.map((cfg) => {
          const hasData = usage.some((p) => ((p[cfg.dataKey] as number) ?? 0) > 0);
          return (
            <div key={cfg.dataKey} className="card-base p-5">
              <h3 className="text-sm font-medium mb-4">{cfg.label}</h3>
              {usageLoading && usage.length === 0 ? (
                <div className="h-[200px] rounded bg-surface-800 animate-pulse" />
              ) : !hasData ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-surface-500">
                  <BarChart3 size={28} className="mb-2 opacity-40" />
                  <p className="text-sm font-medium">No data for this period</p>
                  <p className="text-xs mt-1 text-surface-600">Try selecting a different time range.</p>
                </div>
              ) : (
                <BarChart
                  data={usage}
                  dates={usage.map((p) => p.date)}
                  height={200}
                  series={[{ label: cfg.label, color: cfg.color, value: (p) => (p[cfg.dataKey] as number) ?? 0 }]}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Big Graph — Nodes / Edges */}
      <div className="card-base p-5">
        <div className="mb-4">
          <h3 className="text-sm font-medium">Graph</h3>
        </div>
        <div>{renderGraphChart()}</div>
        {usage.length > 0 && !usageLoading && (
          <div className="flex gap-5 mt-3 pt-3 border-t border-surface-800">
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: cssVar("--color-brand-500") }} />
              Nodes
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: cssVar("--color-accent-300") }} />
              Edges
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions — footer */}
      <div className="card-base p-5">
        <h3 className="text-sm font-medium mb-4">Quick Actions</h3>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] rounded-md bg-surface-800 animate-pulse" />
            ))}
          </div>
        ) : quickActionsQuery.isError ? (
          <ErrorState message="Couldn't load quick actions." onRetry={quickActionsQuery.refetch} />
        ) : quickActions.length === 0 ? (
          <div className="text-sm text-surface-500 py-6 text-center">No actions available</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickActions.map((action) => {
              const Icon = QUICK_ACTION_ICONS[action.icon] ?? FolderKanban;
              return (
                <button
                  key={action.label + action.href}
                  onClick={() => router.push(action.href)}
                  title={action.description}
                  className="group flex w-full items-start gap-3 rounded-md border border-surface-800 bg-surface-950/50 p-3 text-left transition-colors hover:border-brand-500/50 hover:bg-surface-900"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-300">
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-surface-100 group-hover:text-white">
                      {action.label}
                    </span>
                    {action.description && (
                      <span className="mt-0.5 block text-xs text-surface-300 line-clamp-2">
                        {action.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
