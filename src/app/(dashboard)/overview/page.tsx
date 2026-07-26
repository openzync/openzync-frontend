"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  MessageSquare,
  MessageCircle,
  Key,
  FolderKanban,
  BarChart3,
  Shield,
  BrainCircuit,
  Database,
  TrendingUp,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { get } from "@/lib/api-client";
import { timeAgo, actionLabel, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";

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
}

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  actor_type: string | null;
  created_at: string;
  status_code: number | null;
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
  { label: "Messages", key: "total_messages" as const, icon: MessageCircle, color: "text-brand-300" },
  { label: "Sessions", key: "total_sessions" as const, icon: MessageSquare, color: "text-accent-300" },
  { label: "Facts", key: "total_facts" as const, icon: Database, color: "text-success" },
  { label: "Users", key: "total_users" as const, icon: Users, color: "text-surface-300" },
  { label: "Episodes", key: "total_episodes" as const, icon: FileText, color: "text-accent-400" },
  { label: "API Keys", key: "total_api_keys" as const, icon: Key, color: "text-surface-300" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function actorLabel(entry: AuditEntry): string {
  if (entry.actor_type === "api_key") return "API";
  if (entry.actor_id) return entry.actor_id.slice(0, 8);
  return "System";
}

function abbrevDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function cssVar(name: string): string {
  if (typeof window === "undefined") return "#14488C";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#14488C";
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [activities, setActivities] = useState<AuditEntry[]>([]);
  const [quickActions, setQuickActions] = useState<QuickActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Chart state
  const [usage, setUsage] = useState<UsagePoint[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [days, setDays] = useState<DaysOption>(7);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [hoveredBar, setHoveredBar] = useState<{
    index: number; value: number; sessionValue: number; date: string; x: number;
  } | null>(null);

  // Chart container measurement
  useEffect(() => {
    function measure() { if (chartRef.current) setChartWidth(chartRef.current.clientWidth); }
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, []);

  // Fetch org stats, audit logs, and quick actions
  useEffect(() => {
    async function fetchData() {
      try {
        const statsRes = await get<OrgStats>("/v1/admin/stats/org");
        setStats(statsRes);
      } catch { /* non-critical */ }

      try {
        const auditRes = await get<{ items: AuditEntry[] }>("/v1/admin/audit-logs?limit=5");
        setActivities(auditRes.items ?? []);
      } catch { /* non-critical */ }

      try {
        const qaRes = await get<QuickActionsResponse>("/v1/admin/quick-actions");
        setQuickActions(qaRes.actions);
      } catch { /* non-critical */ }

      setLoading(false);
    }
    fetchData();
  }, []);

  // Fetch usage data for the chart
  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    async function fetchUsage() {
      try {
        const data = await get<UsagePoint[] | { data: UsagePoint[] }>(
          `/v1/admin/stats/usage?days=${days}`
        );
        if (!cancelled) setUsage(Array.isArray(data) ? data : (data as { data: UsagePoint[] }).data ?? []);
      } catch { /* non-critical */ }
      finally { if (!cancelled) setUsageLoading(false); }
    }
    fetchUsage();
    return () => { cancelled = true; };
  }, [days]);

  // ── Chart computation ──────────────────────────────────────────────────────

  const CHART_HEIGHT = 260;
  const PADDING = { top: 20, right: 16, bottom: 48, left: 52 };
  const drawWidth = Math.max(chartWidth - PADDING.left - PADDING.right, 60);
  const drawHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const rawMax = usage.length > 0
    ? Math.max(...usage.map((p) => Math.max(p.message_count, p.session_count)))
    : 0;
  const yMax = niceMax(rawMax);
  const yTicks = [0, Math.round(yMax / 2), yMax];
  const dataCount = usage.length;
  const barSlotWidth = dataCount > 0 ? drawWidth / dataCount : 0;
  const barWidth = Math.max(Math.min(barSlotWidth * 0.55, 36), 3);
  const barGap = (barSlotWidth - barWidth) / 2;
  const maxLabelSlots = Math.floor(drawWidth / 55);
  const labelStep = dataCount > 0 ? Math.max(1, Math.ceil(dataCount / Math.max(maxLabelSlots, 1))) : 1;

  function renderChartSkeleton() {
    return (
      <div className="flex items-end gap-1 h-[260px] pt-5">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="flex-1 rounded-t bg-surface-800 animate-pulse"
            style={{ height: `${30 + Math.random() * 70}%`, opacity: 0.3 + Math.random() * 0.7 }} />
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
    if (chartWidth === 0) return <div className="h-[260px]" />;
    if (loading || (usageLoading && usage.length === 0)) return renderChartSkeleton();
    if (usage.length === 0) return renderEmptyChart();

    return (
      <div className="relative w-full">
        <svg viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} className="w-full overflow-visible" preserveAspectRatio="xMidYMid meet">
          {yTicks.map((tick) => {
            const y = PADDING.top + drawHeight - (tick / yMax) * drawHeight;
            return (
              <g key={tick}>
                <line x1={PADDING.left} y1={y} x2={PADDING.left + drawWidth} y2={y} stroke={cssVar("--color-surface-800")} strokeWidth={1} />
                <text x={PADDING.left - 8} y={y + 4} textAnchor="end" fill={cssVar("--color-surface-500")} fontSize={11} fontFamily="var(--font-mono)">
                  {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick.toLocaleString()}
                </text>
              </g>
            );
          })}
          <line x1={PADDING.left} y1={PADDING.top + drawHeight} x2={PADDING.left + drawWidth} y2={PADDING.top + drawHeight} stroke={cssVar("--color-surface-600")} strokeWidth={1} />
          {usage.map((point, i) => {
            const barX = PADDING.left + i * barSlotWidth + barGap;
            const messageHeight = (point.message_count / yMax) * drawHeight;
            const sessionHeight = (point.session_count / yMax) * drawHeight;
            const isHovered = hoveredBar?.index === i;
            const dimmed = hoveredBar !== null && !isHovered;
            return (
              <g key={point.date}>
                <rect x={barX} y={PADDING.top + drawHeight - sessionHeight} width={barWidth} height={Math.max(sessionHeight, 0)}
                  fill={cssVar("--color-accent-300")} opacity={dimmed ? 0.2 : 0.65} rx={2} ry={2} className="transition-opacity duration-150" />
                <rect x={barX} y={PADDING.top + drawHeight - messageHeight} width={barWidth} height={Math.max(messageHeight, 0)}
                  fill={cssVar("--color-brand-500")} opacity={dimmed ? 0.3 : 1} rx={2} ry={2} className="transition-opacity duration-150 cursor-pointer"
                  onMouseEnter={() => setHoveredBar({ index: i, value: point.message_count, sessionValue: point.session_count, date: point.date, x: barX + barWidth / 2 })}
                  onMouseLeave={() => setHoveredBar(null)} />
                {i % labelStep === 0 && (
                  <text x={PADDING.left + i * barSlotWidth + barSlotWidth / 2} y={CHART_HEIGHT - 6} textAnchor="end"
                    transform={`rotate(-35, ${PADDING.left + i * barSlotWidth + barSlotWidth / 2}, ${CHART_HEIGHT - 6})`}
                    fill={cssVar("--color-surface-500")} fontSize={10} fontFamily="var(--font-sans)">{abbrevDate(point.date)}</text>
                )}
              </g>
            );
          })}
        </svg>
        {hoveredBar !== null && chartWidth > 0 && (
          <div className="absolute pointer-events-none z-10 animate-fade-in"
            style={{ left: Math.max(0, Math.min(hoveredBar.x - 64, chartWidth - 140)), top: PADDING.top - 4 }}>
            <div className="card-base p-2.5 shadow-lg shadow-black/40 text-xs space-y-1.5 min-w-[130px]">
              <p className="text-surface-400 font-medium border-b border-surface-800 pb-1.5 mb-1">
                {new Date(hoveredBar.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </p>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: cssVar("--color-brand-500") }} />
                <span className="text-surface-200">Messages: <span className="font-semibold font-mono">{hoveredBar.value.toLocaleString()}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: cssVar("--color-accent-300") }} />
                <span className="text-surface-200">Sessions: <span className="font-semibold font-mono">{hoveredBar.sessionValue.toLocaleString()}</span></span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Organization dashboard — stats, activity, and usage trends"
      />

      {/* Stat cards — all 6 in a single row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {STAT_CARDS.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={stats?.[card.key] ?? null}
            icon={card.icon}
            color={card.color}
            loading={loading}
          />
        ))}
      </div>

      {/* Quick actions + Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-base p-4">
          <h3 className="text-sm font-medium mb-2">Quick Actions</h3>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-9 rounded bg-surface-800 animate-pulse" />
              ))}
            </div>
          ) : quickActions.length === 0 ? (
            <div className="text-sm text-surface-500 py-4 text-center">
              No actions available
            </div>
          ) : (
            <div className="space-y-2">
              {quickActions.map((action) => {
                const Icon = QUICK_ACTION_ICONS[action.icon] ?? FolderKanban;
                return (
                  <Button
                    key={action.label + action.href}
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(action.href)}
                    className="w-full justify-start"
                    title={action.description}
                  >
                    <Icon size={14} className="mr-2" />
                    {action.label}
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-base p-4 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Recent Activity</h3>
            <button
              onClick={() => router.push("/audit")}
              className="text-xs text-accent-300 hover:text-accent-200"
            >
              View all &rarr;
            </button>
          </div>
          {activities.length === 0 ? (
            <div className="text-sm text-surface-500 py-4 text-center">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 rounded bg-surface-800 animate-pulse" />
                  ))}
                </div>
              ) : (
                "No recent activity found."
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 text-sm">
                  <div className="h-2 w-2 rounded-full bg-accent-300/50 shrink-0" />
                  <span className="text-surface-300 flex-1">{actionLabel(entry.action)}</span>
                  <span className="text-surface-500 text-xs">{actorLabel(entry)}</span>
                  <span className="text-surface-600 text-xs">{timeAgo(entry.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Daily Usage chart */}
      <div className="card-base p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <TrendingUp size={16} className="text-brand-300" />Daily Usage
          </h3>
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
        <div ref={chartRef}>{renderChart()}</div>
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
    </div>
  );
}
