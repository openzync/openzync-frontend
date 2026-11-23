"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  get,
  patch,
  ApiError,
  type EnrichmentGateBlock,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { useConfigDirty } from "@/contexts/config-dirty";
import { ErrorState } from "@/components/shared/error-state";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ConfigFields, SYSTEM_DEFAULT_FIELDS } from "@/app/(dashboard)/superadmin/_components/config-fields";

interface FormState {
  defaults: Record<string, unknown>;
}

// Hub default prefill for the gate model input (mirrors the backend default;
// free text — local-dir model paths are allowed).
const GATE_MODEL_DEFAULT = "OpenZync/enrichment-gating-v1";

const GATE_DEFAULTS: EnrichmentGateBlock = {
  enabled: false,
  threshold: 0.5,
  model: GATE_MODEL_DEFAULT,
};

/** Seed the gate block — the server may omit the block or individual keys. */
function pickGate(data: Record<string, unknown>): EnrichmentGateBlock {
  const raw = (data.enrichment_gate ?? {}) as Partial<EnrichmentGateBlock>;
  return {
    enabled: raw.enabled ?? GATE_DEFAULTS.enabled,
    threshold:
      typeof raw.threshold === "number" ? raw.threshold : GATE_DEFAULTS.threshold,
    model: raw.model ?? GATE_DEFAULTS.model,
  };
}

/** Build the defaults half of the form from a flat SystemConfigResponse. */
function pickDefaults(data: Record<string, unknown>): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of SYSTEM_DEFAULT_FIELDS) {
    defaults[field.key] = data[field.key] ?? "";
  }
  return defaults;
}

// ─── System enrichment toggles (mirrors SystemConfigResponse.enrichment) ─────
// Unset keys default to True — same contract as the backend all-True default.
const ENRICHMENT_FIELDS: { key: string; label: string }[] = [
  { key: "entities", label: "Entity extraction" },
  { key: "embedding", label: "Embeddings" },
  { key: "facts", label: "Fact extraction" },
  { key: "entity_links", label: "Entity linking" },
  { key: "classification", label: "Classification" },
  { key: "structured", label: "Structured extraction" },
  { key: "observations", label: "Observations" },
  { key: "blob_text", label: "Blob text extraction" },
  { key: "llm_invalidation", label: "LLM invalidation" },
];

/** Seed the enrichment toggles — unset keys default to True. */
function pickEnrichment(data: Record<string, unknown>): Record<string, boolean> {
  const raw = (data.enrichment ?? {}) as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const field of ENRICHMENT_FIELDS) {
    const value = raw[field.key];
    out[field.key] = typeof value === "boolean" ? value : true;
  }
  return out;
}

function defaultsChanged(
  next: Record<string, unknown>,
  initial: Record<string, unknown>,
): boolean {
  return SYSTEM_DEFAULT_FIELDS.some((f) => next[f.key] !== initial[f.key]);
}

function gateChanged(next: EnrichmentGateBlock, initial: EnrichmentGateBlock): boolean {
  return (
    next.enabled !== initial.enabled ||
    next.threshold !== initial.threshold ||
    next.model !== initial.model
  );
}

function enrichmentChanged(
  next: Record<string, boolean>,
  initial: Record<string, boolean>,
): boolean {
  return ENRICHMENT_FIELDS.some((f) => next[f.key] !== initial[f.key]);
}

export default function SuperadminConfigPage() {
  const [form, setForm] = useState<FormState>({
    defaults: {},
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [gate, setGate] = useState<EnrichmentGateBlock>({ ...GATE_DEFAULTS });
  const [initialGate, setInitialGate] = useState<EnrichmentGateBlock>({ ...gate });
  const [enrichment, setEnrichment] = useState<Record<string, boolean>>({});
  const [initialEnrichment, setInitialEnrichment] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const { setDirty } = useConfigDirty();

  const configQuery = useApiQuery<Record<string, unknown>>(() =>
    get<Record<string, unknown>>("/admin/system/config"),
  );
  const loading = configQuery.isLoading;
  // Save failures share the banner with load errors; retry re-runs the GET.
  const error = configQuery.error ?? actionError;

  // Seed the editable form from server data — render-phase adjustment keyed on
  // response identity (same pattern as settings/page.tsx), so a refetch after
  // save re-seeds exactly once.
  const [seededConfig, setSeededConfig] = useState<Record<string, unknown> | null>(null);
  if (configQuery.data && configQuery.data !== seededConfig) {
    setSeededConfig(configQuery.data);
    const defaults = pickDefaults(configQuery.data);
    setForm({
      defaults,
    });
    setInitialForm({
      defaults: { ...defaults },
    });
    const seededGate = pickGate(configQuery.data);
    setGate(seededGate);
    setInitialGate({ ...seededGate });
    const seededEnrichment = pickEnrichment(configQuery.data);
    setEnrichment(seededEnrichment);
    setInitialEnrichment({ ...seededEnrichment });
  }

  const hasChanged = () =>
    defaultsChanged(form.defaults, initialForm.defaults) ||
    gateChanged(gate, initialGate) ||
    enrichmentChanged(enrichment, initialEnrichment);

  function updateDefault(key: string, value: string | number) {
    const next = { ...form.defaults, [key]: value };
    setForm({ defaults: next });
    setDirty(
      defaultsChanged(next, initialForm.defaults) ||
        gateChanged(gate, initialGate) ||
        enrichmentChanged(enrichment, initialEnrichment),
    );
  }

  function updateGate(next: EnrichmentGateBlock) {
    setGate(next);
    setDirty(
      defaultsChanged(form.defaults, initialForm.defaults) ||
        gateChanged(next, initialGate) ||
        enrichmentChanged(enrichment, initialEnrichment),
    );
  }

  function updateEnrichment(key: string, checked: boolean) {
    const next = { ...enrichment, [key]: checked };
    setEnrichment(next);
    setDirty(
      defaultsChanged(form.defaults, initialForm.defaults) ||
        gateChanged(gate, initialGate) ||
        enrichmentChanged(next, initialEnrichment),
    );
  }

  const handleSave = async () => {
    if (!hasChanged()) return;
    setSaving(true);
    setActionError(null);
    try {
      // Partial PATCH — only what actually changed.
      const payload: Record<string, unknown> = {};
      for (const field of SYSTEM_DEFAULT_FIELDS) {
        if (form.defaults[field.key] !== initialForm.defaults[field.key]) {
          payload[field.key] = form.defaults[field.key];
        }
      }
      // Gate is a nested block: send it whole or not at all, so an
      // untouched gate never appears in the payload. Backend 422s (bad
      // model id with enabled=true) surface via the shared error path below.
      if (gateChanged(gate, initialGate)) {
        payload.enrichment_gate = { ...gate };
      }
      // Enrichment toggles are one nested block: send whole or not at all.
      if (enrichmentChanged(enrichment, initialEnrichment)) {
        payload.enrichment = { ...enrichment };
      }
      await patch("/admin/system/config", payload);
      toast.success("System configuration saved");
      setDirty(false);
      configQuery.refetch();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save configuration";
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  function handleDiscard() {
    setForm({ defaults: { ...initialForm.defaults } });
    setGate({ ...initialGate });
    setEnrichment({ ...initialEnrichment });
    setDirty(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} onRetry={configQuery.refetch} />}

      {/* ── Non-secret system defaults (hidden while empty) ─────────────────── */}
      {SYSTEM_DEFAULT_FIELDS.length > 0 && (
        <div className="card-base p-6">
          <div className="mb-6">
            <h2 className="font-display text-base font-medium">System Defaults</h2>
            <p className="text-xs text-surface-400">
              Non-secret platform defaults
            </p>
          </div>

          <ConfigFields values={form.defaults} onChange={updateDefault} />
        </div>
      )}

      {/* ── Enrichment gate ─────────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="mb-6">
          <h2 className="font-display text-base font-medium">Enrichment gate</h2>
          <p className="text-xs text-surface-400">
            Skip the LLM call for low-signal episodes
          </p>
        </div>

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

          <Field
            label="Model"
            htmlFor="enrichment-gate-model"
            hint="Hub id or local directory path for the gating classifier"
          >
            <input
              id="enrichment-gate-model"
              className="input-base w-full"
              type="text"
              value={gate.model}
              onChange={(e) => updateGate({ ...gate, model: e.target.value })}
            />
          </Field>
        </div>
      </div>

      {/* ── System enrichment toggles ───────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="mb-6">
          <h2 className="font-display text-base font-medium">System enrichment</h2>
          <p className="text-xs text-surface-400">
            Platform default enrichment stages — org and per-ingest overrides win
          </p>
        </div>

        <div className="space-y-4 max-w-md">
          {ENRICHMENT_FIELDS.map((field) => (
            <label
              key={field.key}
              htmlFor={`system-enrichment-${field.key}`}
              className="flex items-center gap-3 cursor-pointer"
            >
              <Switch
                id={`system-enrichment-${field.key}`}
                checked={enrichment[field.key] ?? true}
                onCheckedChange={(checked) => updateEnrichment(field.key, checked)}
              />
              <span className="text-sm font-medium text-surface-300">{field.label}</span>
            </label>
          ))}
        </div>
      </div>

      {!loading && (
        <StickySaveBar
          saving={saving}
          hasChanges={hasChanged()}
          hasSaved={justSaved}
          onSave={() => void handleSave()}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  );
}
