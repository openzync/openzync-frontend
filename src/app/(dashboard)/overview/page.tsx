"use client";

import { Suspense } from "react";
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
import { cn } from "@/lib/utils";
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
  total_users: number;
  total_sessions: number;
  total_messages: number;
  total_api_keys: number;
  total_episodes: number;
  total_facts: number;
}

interface UsagePoint {
  date: string;
  message_count: number;
  session_count: number;
  episode_count: number;
  user_count: number;
  entity_count: number;
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
  { label: "Messages", key: "total_messages" as const },
  { label: "Sessions", key: "total_sessions" as const },
  { label: "Facts", key: "total_facts" as const },
  { label: "Users", key: "total_users" as const },
  { label: "Episodes", key: "total_episodes" as const },
  { label: "API Keys", key: "total_api_keys" as const },
];

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

  // Chart range lives in the URL (?days=7|30|90) so it survives reloads and
  // is shareable. Anything outside the supported set clamps to the default.
  const rawDays = Number(searchParams.get("days"));
  const days: DaysOption = DAYS_OPTIONS.includes(rawDays as DaysOption)
    ? (rawDays as DaysOption)
    : 7;

  function setDays(d: DaysOption) {
    router.replace(`${pathname}?days=${d}`, { scroll: false });
  }

  // Each section fails independently so one bad endpoint doesn't blank the
  // whole dashboard. Errors clear on success only, so a retry visibly keeps
  // the error until it actually resolves.
  const statsQuery = useApiQuery<OrgStats>(() => get<OrgStats>("/v1/admin/stats/org"));
  const quickActionsQuery = useApiQuery<QuickActionsResponse>(() =>
    get<QuickActionsResponse>("/v1/admin/quick-actions"),
  );
  const loading = statsQuery.isLoading || quickActionsQuery.isLoading;

  const quickActions = quickActionsQuery.data?.actions ?? [];

  // Chart state — days comes from the URL above.
  const usageQuery = useApiQuery<UsagePoint[] | { data?: UsagePoint[] }>(
    () => get<UsagePoint[] | { data?: UsagePoint[] }>(`/v1/admin/stats/usage?days=${days}`),
    { refreshKey: days },
  );
  const usage: UsagePoint[] = Array.isArray(usageQuery.data)
    ? usageQuery.data
    : usageQuery.data?.data ?? [];
  const usageLoading = usageQuery.isLoading;

  // ── Chart render states ────────────────────────────────────────────────────

  // Deterministic skeleton heights — Math.random() here re-randomised on every
  // render, making the skeleton flicker whenever any state changed.
  const SKELETON_HEIGHTS = [64, 48, 72, 40, 58, 80, 35, 66, 50, 74, 44, 62, 38, 70, 52, 46, 68, 42, 56, 60];
  const SKELETON_OPACITIES = [0.5, 0.8, 0.65, 0.9, 0.55, 0.75, 0.85, 0.6];

  function renderChartSkeleton() {
    return (
      <div className="flex items-end gap-1 h-[260px] pt-5">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="flex-1 rounded-t bg-surface-800 animate-pulse"
            style={{ height: `${SKELETON_HEIGHTS[i % SKELETON_HEIGHTS.length]}%`, opacity: SKELETON_OPACITIES[i % SKELETON_OPACITIES.length] }} />
        ))}
      </div>
    );
  }

  function renderEmptyChart() {
    return (
      <div className="flex flex-col items-center justify-center h-[260px] text-surface-500">
        <BarChart3 size={40} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">No usage data available for this period.</p>
        <p className="text-xs mt-1 text-surface-600">Try selecting a different time range.</p>
      </div>
    );
  }

  function renderChart() {
    if (loading || (usageLoading && usage.length === 0)) return renderChartSkeleton();
    if (usage.length === 0) return renderEmptyChart();

    // Series order = tooltip order; overlap mode paints Messages on top.
    return (
      <BarChart
        data={usage}
        dates={usage.map((p) => p.date)}
        height={260}
        tooltipShowYear
        series={[
          { label: "Messages", color: "--color-brand-500", value: (p) => p.message_count },
          { label: "Sessions", color: "--color-accent-300", value: (p) => p.session_count, baseOpacity: 0.65 },
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

      {/* Quickstart — only for a brand-new org (no messages yet) */}
      {!loading && statsQuery.data?.total_messages === 0 && (
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

      {/* Trend mini-charts — Episodes, Users, Graph Activity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {([
          { dataKey: "episode_count" as const, color: "--color-accent-300", label: "Episodes" },
          { dataKey: "user_count" as const, color: "--color-success", label: "Users" },
          { dataKey: "entity_count" as const, color: "--color-brand-500", label: "Graph Entities" },
        ]).map((cfg) => (
          <div key={cfg.dataKey} className="card-base p-5">
            <h3 className="text-sm font-medium mb-4">{cfg.label}</h3>
            {usageLoading && usage.length === 0 ? (
              <div className="h-[200px] rounded bg-surface-800 animate-pulse" />
            ) : usage.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[200px] text-surface-500">
                <BarChart3 size={28} className="mb-2 opacity-40" />
                <p className="text-sm font-medium">No data for this period</p>
                <p className="text-xs mt-1 text-surface-600">Try selecting a different time range.</p>
              </div>
            ) : (
              <BarChart data={usage} dates={usage.map((p) => p.date)} height={200} series={[{ label: cfg.label, color: cfg.color, value: (p) => (p[cfg.dataKey] as number) }]} />
            )}
          </div>
        ))}
      </div>

      {/* Daily Usage chart */}
      <div className="card-base p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Daily Usage</h3>
          <div className="flex gap-1 rounded-lg bg-surface-950 p-0.5 border border-surface-800">
            {DAYS_OPTIONS.map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  days === d
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-surface-400 hover:text-surface-100 hover:bg-surface-800",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div>{renderChart()}</div>
        {usage.length > 0 && !usageLoading && (
          <div className="flex items-center gap-5 mt-3 pt-3 border-t border-surface-800">
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: cssVar("--color-brand-500") }} />Messages
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-400">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: cssVar("--color-accent-300") }} />Sessions
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
