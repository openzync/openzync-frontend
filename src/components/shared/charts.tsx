"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

// ═══ Shared helpers ════════════════════════════════════════════════════════════

/** Round a raw max up to a friendly axis maximum (1/2/5 × 10ⁿ). */
export function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export function abbrevDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Resolve a CSS custom property (e.g. "--color-brand-500") to its value. */
export function cssVar(name: string): string {
  if (typeof window === "undefined") return "#14488C";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#14488C";
}

// ═══ Sizing ════════════════════════════════════════════════════════════════════

/**
 * Track container width via ResizeObserver. Falls back to a single
 * requestAnimationFrame measure when RO is unavailable (SSR, jsdom).
 */
function useContainerWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      const raf = requestAnimationFrame(() => setWidth(el.clientWidth));
      return () => cancelAnimationFrame(raf);
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}

// ═══ Pointer + keyboard navigation ═════════════════════════════════════════════

interface ChartNav {
  activeIndex: number | null;
  setActiveIndex: (index: number | null) => void;
  svgProps: {
    tabIndex: 0;
    role: "img";
    "aria-label": string;
    onKeyDown: (e: ReactKeyboardEvent<SVGSVGElement>) => void;
    onBlur: () => void;
  };
}

/**
 * Single source for a chart's "active point": hover/focus-driven tooltip
 * index. ArrowLeft/Right move the active point while the chart is focused,
 * Escape (or blur) hides it.
 */
function useChartNav(count: number, ariaLabel: string): ChartNav {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<SVGSVGElement>) => {
      if (count === 0) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex((prev) => (prev === null ? 0 : Math.min(prev + 1, count - 1)));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex((prev) => (prev === null ? count - 1 : Math.max(prev - 1, 0)));
      } else if (e.key === "Escape") {
        setActiveIndex(null);
      }
    },
    [count],
  );

  const onBlur = useCallback(() => setActiveIndex(null), []);

  return {
    activeIndex,
    setActiveIndex,
    svgProps: {
      tabIndex: 0,
      role: "img",
      "aria-label": ariaLabel,
      onKeyDown,
      onBlur,
    },
  };
}

// ═══ Geometry ══════════════════════════════════════════════════════════════════

const PAD = { top: 16, right: 12, bottom: 36, left: 44 };

function tickText(tick: number): string {
  return tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick.toLocaleString();
}

function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    // Catmull-Rom → cubic bezier control points (same curve as before).
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

// ═══ Tooltip ═══════════════════════════════════════════════════════════════════

interface TooltipRow {
  color: string;
  label: string;
  value: number;
  shape?: "circle" | "square";
}

function ChartTooltip({
  x,
  containerWidth,
  top,
  date,
  rows,
  showYear = false,
}: {
  x: number;
  containerWidth: number;
  top: number;
  date: string;
  rows: TooltipRow[];
  showYear?: boolean;
}) {
  const multi = rows.length > 1;
  const left = Math.max(0, Math.min(x - (multi ? 64 : 56), containerWidth - (multi ? 140 : 120)));
  const dateFormat = showYear
    ? { weekday: "short", month: "short", day: "numeric", year: "numeric" } as const
    : { weekday: "short", month: "short", day: "numeric" } as const;

  return (
    <div
      className="absolute pointer-events-none z-10 animate-fade-in"
      style={{ left, top }}
    >
      <div className={`card-base shadow-lg shadow-black/40 text-xs ${multi ? "p-2.5 space-y-1.5 min-w-[130px]" : "p-2 min-w-[112px]"}`}>
        <p className={`text-surface-400 font-medium border-b border-surface-800 ${multi ? "pb-1.5 mb-1" : "pb-1 mb-1"}`}>
          {date ? new Date(date).toLocaleDateString("en-US", dateFormat) : ""}
        </p>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span
              className={`${row.shape === "square" ? "h-2.5 w-2.5 rounded-sm" : "h-2 w-2 rounded-full"} shrink-0`}
              style={{ backgroundColor: cssVar(row.color) }}
            />
            <span className="text-surface-200">
              {row.label}:{" "}
              <span className="font-semibold font-mono">{row.value.toLocaleString()}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shared axis: y gridlines + labels + baseline. */
function Axis({
  dw,
  dh,
  yMax,
}: {
  dw: number;
  dh: number;
  yMax: number;
}) {
  const yTicks = [0, Math.round(yMax / 2), yMax];
  return (
    <>
      {yTicks.map((tick) => {
        const y = PAD.top + dh - (tick / yMax) * dh;
        return (
          <g key={tick}>
            <line x1={PAD.left} y1={y} x2={PAD.left + dw} y2={y} stroke={cssVar("--color-surface-800")} strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fill={cssVar("--color-surface-500")} fontSize={10} fontFamily="var(--font-mono)">
              {tickText(tick)}
            </text>
          </g>
        );
      })}
      <line x1={PAD.left} y1={PAD.top + dh} x2={PAD.left + dw} y2={PAD.top + dh} stroke={cssVar("--color-surface-600")} strokeWidth={1} />
    </>
  );
}

/** Rotated x-axis date labels, thinned to fit. */
function XLabels({ dates, dw, height }: { dates: string[]; dw: number; height: number }) {
  const n = dates.length;
  const slotW = n > 0 ? dw / n : 0;
  const maxLabels = Math.floor(dw / 55);
  const labelStep = n > 0 ? Math.max(1, Math.ceil(n / Math.max(maxLabels, 1))) : 1;
  return (
    <>
      {dates.map((date, i) => {
        if (i % labelStep !== 0) return null;
        const x = PAD.left + i * slotW + slotW / 2;
        return (
          <text key={date} x={x} y={height - 6} textAnchor="end"
            transform={`rotate(-35, ${x}, ${height - 6})`}
            fill={cssVar("--color-surface-500")} fontSize={9} fontFamily="var(--font-sans)">
            {abbrevDate(date)}
          </text>
        );
      })}
    </>
  );
}

// ═══ AreaChart ═════════════════════════════════════════════════════════════════

export interface AreaChartProps<T extends { date: string }> {
  /** Points share a `date` field; `dataKey` selects the numeric series value. */
  data: T[];
  dataKey: keyof T;
  /** CSS var name, e.g. "--color-brand-500". */
  color: string;
  label: string;
}

export function AreaChart<T extends { date: string }>({ data, dataKey, color, label }: AreaChartProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const gradId = useId();
  const nav = useChartNav(data.length, `${label} trend, ${data.length} points`);
  const active = nav.activeIndex;

  const HEIGHT = 200;
  const dw = Math.max(width - PAD.left - PAD.right, 60);
  const dh = HEIGHT - PAD.top - PAD.bottom;

  const values = data.map((p) => {
    const v = p[dataKey];
    return typeof v === "number" ? v : 0;
  });
  const rawMax = values.length > 0 ? Math.max(...values) : 0;
  const yMax = niceMax(rawMax);
  const n = data.length;
  const slotW = n > 0 ? dw / n : 0;

  const resolveColor = cssVar(color);

  const pts = values.map((v, i) => ({
    x: PAD.left + i * slotW + slotW / 2,
    y: PAD.top + dh - (v / yMax) * dh,
  }));
  const linePath = smoothPath(pts);
  const areaPath =
    pts.length > 1
      ? `${linePath} L ${pts[pts.length - 1].x},${PAD.top + dh} L ${pts[0].x},${PAD.top + dh} Z`
      : "";

  if (width === 0) return <div ref={containerRef} className="h-[200px]" />;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="w-full overflow-visible focus-visible:outline-2 focus-visible:outline-accent-300 focus-visible:outline-offset-2" preserveAspectRatio="xMidYMid meet" {...nav.svgProps}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={resolveColor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={resolveColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Axis dw={dw} dh={dh} yMax={yMax} />
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        {linePath && <path d={linePath} fill="none" stroke={resolveColor} strokeWidth={2} strokeLinecap="round" />}
        {/* Hover dots + invisible pointer hit areas */}
        {values.map((v, i) => {
          const cx = PAD.left + i * slotW + slotW / 2;
          const cy = PAD.top + dh - (v / yMax) * dh;
          const isActive = active === i;
          return (
            <g key={data[i].date}>
              <rect x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={dh}
                fill="transparent" className="cursor-pointer"
                onPointerEnter={() => nav.setActiveIndex(i)}
                onPointerLeave={() => nav.setActiveIndex(null)} />
              {(isActive || active === null) && v > 0 && (
                <circle cx={cx} cy={cy} r={isActive ? 4 : 2.5} fill={resolveColor}
                  stroke={cssVar("--color-surface-950")} strokeWidth={isActive ? 2 : 1.5}
                  className="transition-all duration-150" />
              )}
            </g>
          );
        })}
        <XLabels dates={data.map((d) => d.date)} dw={dw} height={HEIGHT} />
      </svg>
      {active !== null && data[active] && (
        <ChartTooltip
          x={PAD.left + active * slotW + slotW / 2}
          containerWidth={width}
          top={PAD.top - 4}
          date={data[active].date}
          rows={[{ color, label, value: values[active] }]}
        />
      )}
    </div>
  );
}

// ═══ BarChart (overlapping or stacked series) ══════════════════════════════════

export interface BarSeries<T> {
  label: string;
  /** CSS var name, e.g. "--color-brand-500". */
  color: string;
  value: (point: T) => number;
  /** Resting opacity (default 1). Active slots always render at full opacity. */
  baseOpacity?: number;
}

export interface BarChartProps<T> {
  data: T[];
  series: Array<BarSeries<T>>;
  /** Dates shown on the x-axis, one per point. */
  dates: string[];
  height?: number;
  /** Stack series vertically instead of overlapping them at the baseline. */
  stacked?: boolean;
  ariaLabel?: string;
  /** Include the year in the tooltip date. */
  tooltipShowYear?: boolean;
}

export function BarChart<T>({ data, series, dates, height = 220, stacked = false, ariaLabel, tooltipShowYear = false }: BarChartProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const nav = useChartNav(
    data.length,
    ariaLabel ?? `${series.map((s) => s.label).join(" and ")} chart, ${data.length} points`,
  );
  const active = nav.activeIndex;

  const dw = Math.max(width - PAD.left - PAD.right, 60);
  const dh = height - PAD.top - PAD.bottom;
  const n = data.length;
  const slotW = n > 0 ? dw / n : 0;
  // Overlap mode keeps the wider overview bars; stacked keeps the slimmer ones.
  const barW = stacked
    ? Math.max(Math.min(slotW * 0.6, 28), 3)
    : Math.max(Math.min(slotW * 0.55, 36), 3);
  const barGap = (slotW - barW) / 2;

  const totals = data.map((point) =>
    stacked
      ? series.reduce((sum, s) => sum + s.value(point), 0)
      : Math.max(...series.map((s) => s.value(point))),
  );
  const rawMax = totals.length > 0 ? Math.max(...totals) : 0;
  const yMax = niceMax(rawMax);

  if (width === 0) return <div ref={containerRef} style={{ height }} />;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible focus-visible:outline-2 focus-visible:outline-accent-300 focus-visible:outline-offset-2" preserveAspectRatio="xMidYMid meet" {...nav.svgProps}>
        <Axis dw={dw} dh={dh} yMax={yMax} />
        {data.map((point, i) => {
          const x = PAD.left + i * slotW + barGap;
          const isActiveSlot = active === i;
          const dimmed = active !== null && !isActiveSlot;
          // Overlap mode paints the LAST series first so the FIRST series
          // (primary metric) sits on top; stacked paints bottom-up in order.
          const drawSeries = stacked ? series : [...series].reverse();
          let stackOffset = 0;
          return (
            <g key={dates[i] ?? i}>
              {drawSeries.map((s) => {
                const h = (s.value(point) / yMax) * dh;
                const y = stacked
                  ? PAD.top + dh - stackOffset - h
                  : PAD.top + dh - h;
                stackOffset += h;
                const base = s.baseOpacity ?? 1;
                const opacity = dimmed ? base * 0.3 : isActiveSlot ? 1 : base;
                return (
                  <rect key={s.label} x={x} y={y} width={barW} height={Math.max(h, 0)}
                    fill={cssVar(s.color)} opacity={opacity} rx={2} ry={2}
                    className="transition-opacity duration-150" />
                );
              })}
              <rect x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={dh}
                fill="transparent" className="cursor-pointer"
                onPointerEnter={() => nav.setActiveIndex(i)}
                onPointerLeave={() => nav.setActiveIndex(null)} />
            </g>
          );
        })}
        <XLabels dates={dates} dw={dw} height={height} />
      </svg>
      {active !== null && data[active] && (
        <ChartTooltip
          x={PAD.left + active * slotW + slotW / 2}
          containerWidth={width}
          top={PAD.top - 4}
          date={dates[active] ?? ""}
          showYear={tooltipShowYear}
          rows={series.map((s) => ({
            color: s.color,
            label: s.label,
            value: s.value(data[active]),
            shape: "square" as const,
          }))}
        />
      )}
    </div>
  );
}

// ═══ LineChart (multi-line) ════════════════════════════════════════════════════

export interface LineSeries {
  label: string;
  /** CSS var name, e.g. "--color-success". */
  color: string;
  data: Array<{ x: string; y: number }>;
}

export interface LineChartProps {
  lines: LineSeries[];
  height?: number;
  ariaLabel?: string;
}

export function LineChart({ lines, height = 220, ariaLabel }: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  // First line's x labels are the shared axis.
  const xLabels = lines[0]?.data.map((d) => d.x) ?? [];
  const nav = useChartNav(
    xLabels.length,
    ariaLabel ?? `${lines.map((l) => l.label).join(", ")} chart, ${xLabels.length} points`,
  );
  const active = nav.activeIndex;

  const dw = Math.max(width - PAD.left - PAD.right, 60);
  const dh = height - PAD.top - PAD.bottom;
  const n = xLabels.length;
  const slotW = n > 0 ? dw / n : 0;

  const allY = lines.flatMap((l) => l.data.map((d) => d.y));
  const rawMax = allY.length > 0 ? Math.max(...allY) : 0;
  const yMax = niceMax(rawMax);

  if (width === 0) return <div ref={containerRef} style={{ height }} />;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible focus-visible:outline-2 focus-visible:outline-accent-300 focus-visible:outline-offset-2" preserveAspectRatio="xMidYMid meet" {...nav.svgProps}>
        <Axis dw={dw} dh={dh} yMax={yMax} />
        {lines.map((line) => {
          const pts = line.data.map((d, i) => ({
            x: PAD.left + i * slotW + slotW / 2,
            y: PAD.top + dh - (d.y / yMax) * dh,
          }));
          const path = smoothPath(pts);
          const color = cssVar(line.color);
          return (
            <g key={line.label}>
              {path && <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />}
              {pts.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r={active === i ? 4 : 2}
                  fill={color} stroke={cssVar("--color-surface-950")} strokeWidth={1.5}
                  className="transition-all duration-150" />
              ))}
            </g>
          );
        })}
        {/* Invisible pointer hit areas */}
        {xLabels.map((_, i) => (
          <rect key={i} x={PAD.left + i * slotW} y={PAD.top} width={slotW} height={dh}
            fill="transparent" className="cursor-pointer"
            onPointerEnter={() => nav.setActiveIndex(i)}
            onPointerLeave={() => nav.setActiveIndex(null)} />
        ))}
        <XLabels dates={xLabels} dw={dw} height={height} />
      </svg>
      {active !== null && (
        <ChartTooltip
          x={PAD.left + active * slotW + slotW / 2}
          containerWidth={width}
          top={PAD.top - 4}
          date={xLabels[active] ?? ""}
          rows={lines.map((line) => ({
            color: line.color,
            label: line.label,
            value: line.data[active]?.y ?? 0,
          }))}
        />
      )}
    </div>
  );
}

// ═══ StackedBarChart (error timeseries convenience wrapper) ════════════════════

export interface ErrorTimeseriesPoint {
  date: string;
  count_4xx: number;
  count_5xx: number;
}

export function StackedBarChart({ data, height = 220 }: { data: ErrorTimeseriesPoint[]; height?: number }) {
  return (
    <BarChart
      data={data}
      dates={data.map((d) => d.date)}
      height={height}
      stacked
      ariaLabel={`4xx and 5xx errors chart, ${data.length} points`}
      series={[
        { label: "4xx", color: "--color-warning", value: (d) => d.count_4xx, baseOpacity: 0.75 },
        { label: "5xx", color: "--color-error", value: (d) => d.count_5xx, baseOpacity: 0.75 },
      ]}
    />
  );
}
