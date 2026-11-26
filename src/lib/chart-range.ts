// ═══════════════════════════════════════════════════════════════════════════════
// OpenZync — Shared date-range zero-fill for charts
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Zero-fill a sparse day series so bars keep stable day-slot widths.
 * Unit-agnostic: callers describe how to read the date and build a zero row.
 *
 * Modes:
 * - "window": custom from..to (inclusive) else the last `days` days
 *   including today (UTC) — matches backend `_resolve_window` (UTC,
 *   days ≤ 365; larger custom windows are capped at the end date).
 * - "minmax": min..max date found in the data — for paged slices where a
 *   full-window fill would invent out-of-slice zeros.
 *
 * Keys are `slice(0, 10)` day strings. Unparseable bounds/range → returns
 * a copy of the input untouched so callers fall back to raw sparse points.
 */

const DAY_MS = 86400000;
// Backend caps days at 365 (admin_stats/admin_llm_usage Query(le=365)).
const MAX_WINDOW_DAYS = 365;

export interface FillDateRangeOptions<T> {
  getDate: (point: T) => string;
  makeZero: (date: string) => T;
  days: number;
  from: string | null;
  to: string | null;
  isCustom: boolean;
  mode: "window" | "minmax";
}

function parseDay(value: string): number {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
}

function formatDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function fillDateRange<T>(points: T[], opts: FillDateRangeOptions<T>): T[] {
  const { getDate, makeZero, days, from, to, isCustom, mode } = opts;
  const byDate = new Map<string, T>();
  for (const p of points) byDate.set(getDate(p).slice(0, 10), p);

  let start: number;
  let end: number;
  if (mode === "minmax") {
    if (byDate.size === 0) return [...points];
    const keys = [...byDate.keys()].sort();
    start = parseDay(keys[0]);
    end = parseDay(keys[keys.length - 1]);
    if (Number.isNaN(start) || Number.isNaN(end)) return [...points];
  } else if (isCustom && from && to) {
    start = parseDay(from);
    end = parseDay(to);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end) return [...points];
    const maxEnd = start + (MAX_WINDOW_DAYS - 1) * DAY_MS;
    if (end > maxEnd) end = maxEnd;
  } else {
    const now = new Date();
    end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    start = end - (Math.max(1, Math.floor(days)) - 1) * DAY_MS;
  }

  const filled: T[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const date = formatDay(t);
    filled.push(byDate.get(date) ?? makeZero(date));
  }
  return filled;
}
