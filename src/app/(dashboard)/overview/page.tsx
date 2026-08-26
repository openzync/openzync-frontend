"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  Upload,
  Network,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { get } from "@/lib/api-client";
import { timeAgo, actionLabel, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ErrorState } from "@/components/shared/error-state";
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

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  actor_type: string | null;
  created_at: string;
  status_code: number | null;
  display_name: string | null;
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

// Fresh-org quickstart — all destinations point at /projects (this page does not
// fetch project data, so there is no first-project link available without adding
// an API call).
const QUICKSTART_STEPS = [
  { title: "Create a project", description: "Organize your knowledge base and conversations.", href: "/projects", icon: FolderKanban },
  { title: "Ingest a conversation", description: "Import a chat log to embed entities and facts.", href: "/projects", icon: Upload },
  { title: "Explore the knowledge graph", description: "Watch connections light up as the graph grows.", href: "/projects", icon: Network },
] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function actorLabel(entry: AuditEntry): string {
  switch (entry.actor_type) {
    case "api_key":
      return "API";
    case "system":
      return "System";
    case "user":
      if (entry.actor_id) return entry.actor_id.slice(0, 8);
      return "User";
    default:
      return "Anonymous";
  }
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

// ─── Area Chart (reusable, inline) ─────────────────────────────────────────────

interface AreaChartProps {
  data: UsagePoint[];
  dataKey: keyof UsagePoint;
  color: string;
  label: string;
}

function AreaChart({ data, dataKey, color, label }: AreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ index: number; value: number; date: string; x: number } | null>(null);

  useEffect(() => {
    function measure() { if (containerRef.current) setWidth(containerRef.current.clientWidth); }
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, []);

  const HEIGHT = 200;
  const PAD = { top: 16, right: 12, bottom: 36, left: 44 };
  const dw = Math.max(width - PAD.left - PAD.right, 60);
  const dh = HEIGHT - PAD.top - PAD.bottom;

  const values = data.map((p) => (p[dataKey] as number) ?? 0);
  const rawMax = values.length > 0 ? Math.max(...values) : 0;
  const yMax = niceMax(rawMax);
  const yTicks = [0, Math.round(yMax / 2), yMax];
  const n = data.length;
  const slotW = n > 0 ? dw / n : 0;
  const maxLabels = Math.floor(dw / 55);
  const labelStep = n > 0 ? Math.max(1, Math.ceil(n / Math.max(maxLabels, 1))) : 1;

  const resolveColor = cssVar(color);

  // Build SVG path strings for line + area
  function buildPaths() {
    if (n === 0 || dw <= 0) return { line: "", area: "" };
    const pts = values.map((v, i) => ({
      x: PAD.left + i * slotW + slotW / 2,
      y: PAD.top + dh - (v / yMax) * dh,
    }));
    // Smooth curve via cardinal spline approximation (simple catmull-rom)
    let line = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      line += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    const area = line + ` L ${pts[pts.length - 1].x},${PAD.top + dh} L ${pts[0].x},${PAD.top + dh} Z`;
    return { line, area };
  }

  const { line: linePath, area: areaPath } = buildPaths();
  const gradId = `area-grad-${dataKey}`;

  if (width === 0) return <div ref={containerRef} className="h-[200px]" />;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="w-full overflow-visible" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={resolveColor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={resolveColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = PAD.top + dh - (tick / yMax) * dh;
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={PAD.left + dw} y2={y} stroke={cssVar("--color-surface-800")} strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fill={cssVar("--color-surface-500")} fontSize={10} fontFamily="var(--font-mono)">
                {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick.toLocaleString()}
              </text>
            </g>
          );
        })}
        <line x1={PAD.left} y1={PAD.top + dh} x2={PAD.left + dw} y2={PAD.top + dh} stroke={cssVar("--color-surface-600")} strokeWidth={1} />
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        {linePath && <path d={linePath} fill="none" stroke={resolveColor} strokeWidth={2} strokeLinecap="round" />}
        {/* Hover dots + invisible hit areas */}
        {values.map((v, i) => {
          const cx = PAD.left + i * slotW + slotW / 2;
          const cy = PAD.top + dh - (v / yMax) * dh;
          const isHovered = hover?.index === i;
          return (
            <g key={data[i].date}>
              <rect x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={dh}
                fill="transparent" className="cursor-pointer"
                onMouseEnter={() => setHover({ index: i, value: v, date: data[i].date, x: cx })}
                onMouseLeave={() => setHover(null)} />
              {(isHovered || hover === null) && v > 0 && (
                <circle cx={cx} cy={cy} r={isHovered ? 4 : 2.5} fill={resolveColor}
                  stroke={cssVar("--color-surface-950")} strokeWidth={isHovered ? 2 : 1.5}
                  className="transition-all duration-150" />
              )}
            </g>
          );
        })}
        {data.map((point, i) => {
          if (i % labelStep !== 0) return null;
          const x = PAD.left + i * slotW + slotW / 2;
          return (
            <text key={point.date} x={x} y={HEIGHT - 6} textAnchor="end"
              transform={`rotate(-35, ${x}, ${HEIGHT - 6})`}
              fill={cssVar("--color-surface-500")} fontSize={9} fontFamily="var(--font-sans)">
              {abbrevDate(point.date)}
            </text>
          );
        })}
      </svg>
      {hover !== null && width > 0 && (
        <div className="absolute pointer-events-none z-10 animate-fade-in"
          style={{ left: Math.max(0, Math.min(hover.x - 56, width - 120)), top: PAD.top - 4 }}>
          <div className="card-base p-2 shadow-lg shadow-black/40 text-xs min-w-[112px]">
            <p className="text-surface-400 font-medium border-b border-surface-800 pb-1 mb-1">
              {new Date(hover.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: resolveColor }} />
              <span className="text-surface-200">{label}: <span className="font-semibold font-mono">{hover.value.toLocaleString()}</span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [activities, setActivities] = useState<AuditEntry[]>([]);
  const [quickActions, setQuickActions] = useState<QuickActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-section error flags — a failed fetch must never masquerade as
  // "no data" (the old bare catch{} blocks rendered misleading empty states).
  const [statsError, setStatsError] = useState(false);
  const [activitiesError, setActivitiesError] = useState(false);
  const [quickActionsError, setQuickActionsError] = useState(false);

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

  // Fetch org stats, audit logs, and quick actions — each section fails
  // independently so one bad endpoint doesn't blank the whole dashboard.
  const fetchStats = useCallback(async () => {
    setStatsError(false);
    try {
      const statsRes = await get<OrgStats>("/v1/admin/stats/org");
      setStats(statsRes);
    } catch {
      setStatsError(true);
    }
  }, []);

  const fetchActivities = useCallback(async () => {
    setActivitiesError(false);
    try {
      const auditRes = await get<{ items: AuditEntry[] }>("/v1/admin/audit-logs?limit=5");
      setActivities(auditRes.items ?? []);
    } catch {
      setActivitiesError(true);
    }
  }, []);

  const fetchQuickActions = useCallback(async () => {
    setQuickActionsError(false);
    try {
      const qaRes = await get<QuickActionsResponse>("/v1/admin/quick-actions");
      setQuickActions(qaRes.actions);
    } catch {
      setQuickActionsError(true);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchStats(), fetchActivities(), fetchQuickActions()]).finally(() =>
      setLoading(false),
    );
  }, [fetchStats, fetchActivities, fetchQuickActions]);

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

      <PageGuide title="Your organization at a glance" illustration={<GuideDashboard />}>
        <p>Monitor your organization&rsquo;s key metrics — messages, sessions, facts, users, episodes, and API keys. View recent activity and track daily usage trends with the interactive chart.</p>
      </PageGuide>

      {/* Quickstart — only for a brand-new org (no messages yet) */}
      {!loading && stats && stats.total_messages === 0 && (
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
      {statsError && !loading ? (
        <ErrorState
          message="Couldn't load organization stats."
          onRetry={fetchStats}
        />
      ) : (
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
      )}

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
          ) : quickActionsError ? (
            <ErrorState
              message="Couldn't load quick actions."
              onRetry={fetchQuickActions}
            />
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
          {loading ? (
            <div className="text-sm text-surface-500 py-4 text-center">
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 rounded bg-surface-800 animate-pulse" />
                ))}
              </div>
            </div>
          ) : activitiesError ? (
            <ErrorState
              message="Couldn't load recent activity."
              onRetry={fetchActivities}
            />
          ) : activities.length === 0 ? (
            <div className="text-sm text-surface-500 py-4 text-center">
              No recent activity found.
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 text-sm">
                  <div className="h-2 w-2 rounded-full bg-accent-300/50 shrink-0" />
                  <span className="text-surface-300 flex-1">{entry.display_name || actionLabel(entry.action)}</span>
                  <span className="text-surface-500 text-xs">{actorLabel(entry)}</span>
                  <span className="text-surface-600 text-xs">{timeAgo(entry.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trend mini-charts — Episodes, Users, Graph Activity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {([
          { dataKey: "episode_count" as const, color: "--color-accent-300", label: "Episodes" },
          { dataKey: "user_count" as const, color: "--color-success", label: "Users" },
          { dataKey: "entity_count" as const, color: "--color-brand-500", label: "Graph Entities" },
        ]).map((cfg) => (
          <div key={cfg.dataKey} className="card-base p-4">
            <h3 className="text-xs font-medium text-surface-400 mb-2">{cfg.label}</h3>
            {usageLoading && usage.length === 0 ? (
              <div className="h-[200px] rounded bg-surface-800 animate-pulse" />
            ) : usage.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-surface-500 text-xs">No data</div>
            ) : (
              <AreaChart data={usage} dataKey={cfg.dataKey} color={cfg.color} label={cfg.label} />
            )}
          </div>
        ))}
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
