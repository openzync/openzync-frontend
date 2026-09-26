"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart2, CheckCircle2 } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { get } from "@/lib/api-client";
import { useUser } from "@/contexts/user-context";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface EpisodesMetrics {
  added_total: number;
  in_progress: number;
  enrichment_pending: number;
  fully_enriched: number;
  with_embeddings: number;
  fully_enriched_pct: number;
}

interface SummaryResponse {
  episodes: EpisodesMetrics;
}

const REFRESH_INTERVAL_MS = 30000;

function useEnrichmentProgress() {
  const [data, setData] = useState<EpisodesMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchSummary = () => {
      get<SummaryResponse>("/metrics/summary")
        .then((res) => {
          if (!cancelled) {
            setData(res.episodes);
            setError(false);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError(true);
            setLoading(false);
          }
        });
    };
    fetchSummary();
    const id = setInterval(fetchSummary, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { data, loading, error };
}

const ROW_CLASSES =
  "relative flex w-full items-center gap-3 rounded-md py-2 pr-2 pl-[11px] text-sm transition-colors duration-150 hover:text-text-primary";

const POPOVER_CONTENT_CLASSES =
  "z-50 w-60 rounded-md border border-surface-800 bg-surface-900 p-3 shadow-elevation-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

function EnrichmentDetails({
  data,
  done,
}: {
  data: EpisodesMetrics;
  done: boolean;
}) {
  const rawPct = data.fully_enriched_pct;
  const pct = Number.isFinite(rawPct) ? rawPct : 0;
  const rows: Array<{ label: string; value: number }> = [
    { label: "Enriched", value: data.fully_enriched },
    { label: "Embedded", value: data.with_embeddings ?? 0 },
    { label: "In progress", value: data.in_progress },
    { label: "Pending", value: data.enrichment_pending },
  ];
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-surface-400">Complete</span>
        <span
          className={`font-mono text-sm tabular-nums ${done ? "text-success" : "text-signal"}`}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <dl className="mt-2 space-y-1">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-baseline justify-between">
            <dt className="text-sm text-surface-400">{label}</dt>
            <dd className="font-mono text-sm tabular-nums text-text-primary">
              {value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        href="/monitoring"
        className="mt-3 block text-sm text-signal hover:underline"
      >
        View full monitoring →
      </Link>
    </div>
  );
}

export function SidebarEnrichment({ collapsed }: { collapsed: boolean }) {
  const { can } = useUser();
  const { data, loading, error } = useEnrichmentProgress();

  if (!can("members:read")) return null;
  if (error) return null;

  if (loading && !data) {
    if (collapsed) {
      return (
        <div className="flex justify-center py-2" aria-hidden>
          <div className="h-4 w-4 rounded bg-surface-800 animate-pulse" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 rounded-md py-2 pr-2 pl-[11px]" aria-hidden>
        <div className="h-4 flex-1 rounded bg-surface-800 animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const rawPct = data.fully_enriched_pct;
  const pct = Number.isFinite(rawPct) ? rawPct : 0;
  const enriched = data.fully_enriched.toLocaleString();
  const total = data.added_total.toLocaleString();
  const inProgress = data.in_progress.toLocaleString();
  const detail = `${enriched} / ${total} · ${pct.toFixed(1)}% · ${inProgress} in progress`;

  if (pct >= 100 && data.enrichment_pending === 0 && data.in_progress === 0) {
    if (collapsed) {
      return (
        <div className="flex justify-center">
          <PopoverPrimitive.Root>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverPrimitive.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Enrichment progress: all enriched"
                    className="flex cursor-pointer justify-center rounded-md py-2 text-success bg-success/10 hover:bg-success/15 transition-colors duration-150"
                  >
                    <CheckCircle2 size={18} />
                  </button>
                </PopoverPrimitive.Trigger>
              </TooltipTrigger>
              <TooltipContent side="right">All enriched</TooltipContent>
            </Tooltip>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                side="right"
                align="start"
                sideOffset={8}
                className={POPOVER_CONTENT_CLASSES}
              >
                <EnrichmentDetails data={data} done />
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
        </div>
      );
    }
    return (
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            role="status"
            title="Enrichment progress: all enriched"
            aria-label="Enrichment progress: all enriched"
            className={`${ROW_CLASSES} cursor-pointer bg-success/10 hover:bg-success/15`}
          >
            <CheckCircle2 size={18} className="shrink-0 text-success" />
            <span className="truncate text-sm">Enriched</span>
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="right"
            align="start"
            sideOffset={8}
            className={POPOVER_CONTENT_CLASSES}
          >
            <EnrichmentDetails data={data} done />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  }

  if (collapsed) {
    const tip = `Enrichment · ${Math.round(pct)}% · ${enriched}/${total}`;
    return (
      <div className="flex justify-center">
        <PopoverPrimitive.Root>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverPrimitive.Trigger asChild>
                <button
                  type="button"
                  role="status"
                  aria-label={`Enrichment progress: ${detail}`}
                  className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-2 py-2 transition-colors duration-150 bg-signal/10 hover:bg-signal/15"
                >
                  <BarChart2 size={18} className="text-signal" />
                  <span className="sr-only">{tip}</span>
                </button>
              </PopoverPrimitive.Trigger>
            </TooltipTrigger>
            <TooltipContent side="right">{tip}</TooltipContent>
          </Tooltip>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              side="right"
              align="start"
              sideOffset={8}
              className={POPOVER_CONTENT_CLASSES}
            >
              <EnrichmentDetails data={data} done={false} />
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      </div>
    );
  }

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          role="status"
          title={`Enrichment progress: ${detail}`}
          aria-label={`Enrichment progress: ${detail}`}
          className={`${ROW_CLASSES} cursor-pointer bg-signal/10 hover:bg-signal/15`}
        >
          <BarChart2 size={18} className="shrink-0 text-signal" />
          <span className="truncate">Enrichment</span>
          <span className="ml-auto font-mono tabular-nums text-xs text-signal">
            {Math.round(pct)}%
          </span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="right"
          align="start"
          sideOffset={8}
          className={POPOVER_CONTENT_CLASSES}
        >
          <EnrichmentDetails data={data} done={false} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
