"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ApiError, getMyConfig, updateMyConfig } from "@/lib/api-client";
import type { EnrichmentGateBlock, EnrichmentGateOverride } from "@/lib/api-client";
import { ENRICHMENT_GATE_DEFAULTS } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { Switch } from "@/components/ui/switch";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { useConfigDirty } from "@/contexts/config-dirty";

// ─── Types ─────────────────────────────────────────────────────────────────────

/** What the config fetcher hands to the render-phase form seed. */
interface ConfigData {
  stored: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

// ─── Enrichment gate block (moved from enrichment/page.tsx) ───────────────────

type GateState = EnrichmentGateBlock;

/** Read one layer's gate block; tolerates a legacy boolean override. */
function pickGateBlock(
  value: unknown,
  fallback: GateState,
): GateState | null {
  if (typeof value === "boolean") return { ...fallback, enabled: value };
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<EnrichmentGateBlock>;
  if (typeof raw.enabled !== "boolean" || typeof raw.threshold !== "number")
    return null;
  return { enabled: raw.enabled, threshold: raw.threshold };
}

/** Override wins, then the defaults (effective) layer, then the fallback. */
function pickGate(
  stored: Record<string, unknown>,
  defaults: Record<string, unknown>,
): GateState {
  const fallback = { ...ENRICHMENT_GATE_DEFAULTS };
  return (
    pickGateBlock(stored.enrichment_gate, fallback) ??
    pickGateBlock(defaults.enrichment_gate, fallback) ??
    fallback
  );
}

function gateChanged(next: GateState, initial: GateState): boolean {
  return next.enabled !== initial.enabled || next.threshold !== initial.threshold;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LabsConfigPage() {
  const { setDirty } = useConfigDirty();
  const [gate, setGate] = useState<GateState>({ ...ENRICHMENT_GATE_DEFAULTS });
  const [initialGate, setInitialGate] = useState<GateState>({ ...gate });
  const [saving, setSaving] = useState(false);
  // Save failures share the banner with load errors; cleared when a fetch
  // succeeds so a retry visibly resolves.
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // ── Fetch config ──────────────────────────────────────────────────────────

  const configQuery = useApiQuery<ConfigData>(async () => {
    const data = await getMyConfig();
    const stored = (data.override ?? {}) as Record<string, unknown>;
    const defaults = (data.effective ?? {}) as Record<string, unknown>;
    return { stored, defaults };
  });

  // Seed the editable form from server data — render-phase adjustment keyed on
  // response identity (same pattern as superadmin/config/registration), so a refetch after
  // save re-seeds exactly once.
  const [seeded, setSeeded] = useState<ConfigData | null>(null);
  if (configQuery.data && configQuery.data !== seeded) {
    setSeeded(configQuery.data);
    const { stored, defaults } = configQuery.data;
    const currentGate = pickGate(stored, defaults);
    setGate(currentGate);
    setInitialGate({ ...currentGate });
    setActionError(null);
  }

  const loading = configQuery.isLoading;
  const error = configQuery.error ?? actionError;

  function hasChanged(): boolean {
    return gateChanged(gate, initialGate);
  }

  // ── Enrichment gate (block, independent of the toggle validation) ─────────

  function updateGate(value: GateState) {
    setGate(value);
    setDirty(gateChanged(value, initialGate));
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!hasChanged()) {
      toast.info("No changes to save");
      return;
    }
    setSaving(true);

    const gatePayload: { enrichment_gate?: EnrichmentGateOverride } =
      gateChanged(gate, initialGate) ? { enrichment_gate: { ...gate } } : {};

    try {
      await updateMyConfig({ ...gatePayload });

      toast.success("Labs configuration saved successfully");
      setDirty(false);
      configQuery.refetch();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save configuration";
      setActionError(message);
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Failed to save configuration",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Enrichment Gate Card ────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="mb-6">
          <h2 className="font-display text-base font-medium">Enrichment Gate</h2>
          <p className="text-xs text-surface-400">
            Skip the LLM call for low-signal episodes
          </p>
        </div>

        {loading ? (
          <div className="h-9 rounded bg-surface-800 animate-pulse w-full max-w-md" />
        ) : (
          <>
            {error && <ErrorState message={error} onRetry={configQuery.refetch} />}
            <div className="space-y-4 max-w-md">
            <label
              htmlFor="enrichment-gate-enabled"
              className="flex items-center gap-3 cursor-pointer"
            >
              <Switch
                id="enrichment-gate-enabled"
                checked={gate.enabled}
                onCheckedChange={(checked) =>
                  updateGate({ ...gate, enabled: checked })
                }
              />
              <span className="text-sm font-medium text-surface-300">Enabled</span>
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="enrichment-gate-threshold"
                  className="text-sm font-medium text-surface-300"
                >
                  Threshold
                </label>
                <span className="font-mono text-xs text-surface-400">
                  {gate.threshold.toFixed(2)}
                </span>
              </div>
              <input
                id="enrichment-gate-threshold"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={gate.threshold}
                aria-describedby="enrichment-gate-threshold-hint"
                onChange={(e) =>
                  // Round off float artifacts (e.g. 0.6500000000000001).
                  updateGate({
                    ...gate,
                    threshold: Math.round(e.target.valueAsNumber * 100) / 100,
                  })
                }
                className="w-full accent-brand-500"
              />
              <p id="enrichment-gate-threshold-hint" className="text-xs text-surface-500">
                Minimum should_enrich score to run the LLM (0–1)
              </p>
              {gate.threshold >= 1 && (
                <p className="text-xs text-amber-400" role="alert">
                  sigmoid never reaches 1.0 — everything scorable will skip
                </p>
              )}
            </div>
          </div>
          </>
        )}
      </div>

      <p className="text-xs text-surface-500">
        Upcoming feature switches will appear here.
      </p>

      {/* ── Sticky Save Bar ──────────────────────────────────────────────────── */}
      {!loading && (
        <StickySaveBar
          saving={saving}
          hasChanges={hasChanged()}
          hasSaved={justSaved}
          onSave={handleSave}
          onDiscard={() => {
            setGate({ ...initialGate });
            setDirty(false);
          }}
        />
      )}
    </div>
  );
}
