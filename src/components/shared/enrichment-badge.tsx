"use client";

import { cn } from "@/lib/utils";

// ─── Bit mapping (mirrors core/enrichment_bits.py) ───────────────────────────
// Bit 6 (observations) is reserved — excluded from the required set.

export const ENRICHMENT_BIT_KEYS: Record<string, number> = {
  entities: 1 << 0,
  embedding: 1 << 1,
  facts: 1 << 2,
  entity_links: 1 << 3,
  classification: 1 << 4,
  structured: 1 << 5,
  blob_text: 1 << 7,
};

const STEP_ORDER = [
  "entities",
  "embedding",
  "facts",
  "entity_links",
  "classification",
  "structured",
  "blob_text",
] as const;

export type EnrichmentOverall = "enriched" | "enriching" | "pending" | "skipped";

export interface EnrichmentStep {
  key: string;
  bit: number;
  state: "done" | "skipped" | "pending";
  reason?: "toggle off" | "no attachments" | "gate-skipped";
}

export function resolveEnrichment(
  statusBits: number,
  effectiveToggles: Record<string, boolean>,
  hasBlobs: boolean,
  isSkipped = false,
): { overall: EnrichmentOverall; steps: EnrichmentStep[] } {
  const bits = statusBits ?? 0;
  const steps: EnrichmentStep[] = STEP_ORDER.map((key) => {
    // Missing keys fall back to ON — mirrors the backend all-ON default.
    const enabled = effectiveToggles[key] ?? true;
    const bit = ENRICHMENT_BIT_KEYS[key];
    if (!enabled) return { key, bit, state: "skipped", reason: "toggle off" };
    if (key === "blob_text" && !hasBlobs)
      return { key, bit, state: "skipped", reason: "no attachments" };
    if (isSkipped) return { key, bit, state: "skipped", reason: "gate-skipped" };
    return {
      key,
      bit,
      state: bits & bit ? "done" : "pending",
    };
  });
  if (isSkipped) return { overall: "skipped", steps };
  const required = steps.filter((s) => s.state !== "skipped");
  if (required.length === 0) return { overall: "skipped", steps };
  const done = required.filter((s) => s.state === "done").length;
  // Gate-skipped episodes land here too (toggles on, zero bits set) — grey
  // either way, and the tooltip notes the gate possibility.
  if (done === required.length) return { overall: "enriched", steps };
  if (done === 0) return { overall: "pending", steps };
  return { overall: "enriching", steps };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface EnrichmentBadgeProps {
  statusBits: number;
  effectiveToggles: Record<string, boolean>;
  hasBlobs: boolean;
  /** Backend gate-skip flag — forces overall to skipped regardless of bits. */
  isSkipped?: boolean;
  /** Controlled expand state (owns the detail panel in the parent). */
  expanded: boolean;
  onToggle: () => void;
}

const OVERALL_STYLES: Record<EnrichmentOverall, string> = {
  enriched: "border-success/30 bg-success/10 text-success",
  enriching: "border-signal/30 bg-signal/10 text-signal",
  pending: "border-surface-700 bg-surface-800 text-surface-400",
  skipped: "border-surface-700 bg-surface-800 text-surface-500",
};

const OVERALL_LABELS: Record<EnrichmentOverall, string> = {
  enriched: "Enriched",
  enriching: "Enriching",
  pending: "Pending",
  skipped: "Skipped",
};

export function EnrichmentBadge({
  statusBits,
  effectiveToggles,
  hasBlobs,
  isSkipped = false,
  expanded,
  onToggle,
}: EnrichmentBadgeProps) {
  const { overall, steps } = resolveEnrichment(
    statusBits,
    effectiveToggles,
    hasBlobs,
    isSkipped,
  );
  const tooltip = [
    `Enrichment: ${OVERALL_LABELS[overall]}`,
    ...steps.map((s) =>
      s.state === "skipped"
        ? `• ${s.key}: skipped (${s.reason === "gate-skipped" ? "gate-skipped — no LLM analysis ran" : (s.reason ?? "toggle off")})`
        : `• ${s.key}: ${s.state}`,
    ),
    ...(overall === "pending"
      ? ["No steps complete yet — still queued or gate-skipped."]
      : []),
  ].join("\n");

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`Enrichment details: ${OVERALL_LABELS[overall]}`}
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
        OVERALL_STYLES[overall],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          overall === "enriched" && "bg-success",
          overall === "enriching" && "bg-signal animate-pulse-dot",
          (overall === "pending" || overall === "skipped") && "bg-surface-500",
        )}
      />
      {OVERALL_LABELS[overall]}
    </button>
  );
}
