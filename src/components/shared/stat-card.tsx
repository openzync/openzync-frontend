import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: number | string | null | undefined;
  icon?: LucideIcon;
  color?: string;
  loading?: boolean;
  onClick?: () => void;
  trend?: "up" | "down" | null;
  /** Exact value shown as a hover tooltip on the value (e.g. full count beside a compact display). */
  title?: string;
}

/**
 * Standard KPI stat card.
 * Replaces duplicated stat-card markup across overview, analytics, monitoring, etc.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  loading = false,
  onClick,
  trend,
  title,
}: StatCardProps) {
  // Numbers render compact with the exact value as hover title (explicit
  // title wins); strings pass through untouched; null renders as em-dash.
  const display = typeof value === "number" ? formatCompact(value) : (value ?? "—");
  const resolvedTitle = title ?? (typeof value === "number" ? value.toLocaleString() : undefined);
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      className={cn("stat-card", onClick && "cursor-pointer")}
    >
      {Icon ? (
        <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-signal/10">
              <Icon size={22} className={color ?? "text-signal"} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[0.68rem] text-muted truncate">{label}</div>
            {loading ? (
              <div className="h-6 w-16 mt-1 rounded bg-surface-800 animate-pulse" />
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-display text-[1.6rem] font-normal tabular-nums leading-tight" title={resolvedTitle}>
                  {display}
                </span>
                {trend === "up" && <TrendingUp size={14} className="text-success shrink-0" />}
                {trend === "down" && <TrendingDown size={14} className="text-error shrink-0" />}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[0.68rem] text-muted truncate">{label}</div>
          {loading ? (
            <div className="h-6 w-16 mt-1 rounded bg-surface-800 animate-pulse" />
          ) : (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-display text-[1.6rem] font-normal tabular-nums leading-tight" title={resolvedTitle}>
                {display}
              </span>
              {trend === "up" && <TrendingUp size={14} className="text-success shrink-0" />}
              {trend === "down" && <TrendingDown size={14} className="text-error shrink-0" />}
            </div>
          )}
        </div>
      )}
    </Component>
  );
}
