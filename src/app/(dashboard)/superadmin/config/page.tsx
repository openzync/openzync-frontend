"use client";

import { useState } from "react";
import { Check, ServerCog, Settings2, UserPlus, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  get,
  patch,
  ApiError,
  apiErrorMessage,
  getSystemSettings,
  revealSystemSetting,
  type EnrichmentGateBlock,
  type SystemSettingItem,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/select";
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

// ─── Registration (GET/PATCH /admin/system/registration; falls back to ──────
// ─── GET /v1/auth/registration-status on backends without the admin endpoint) ─
const REGISTRATION_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "invite_only", label: "Invite only" },
  { value: "approval", label: "Approval" },
];

export default function SuperadminConfigPage() {
  const [form, setForm] = useState<FormState>({
    defaults: {},
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [gate, setGate] = useState<EnrichmentGateBlock>({ ...GATE_DEFAULTS });
  const [initialGate, setInitialGate] = useState<EnrichmentGateBlock>({ ...gate });
  const [enrichment, setEnrichment] = useState<Record<string, boolean>>({});
  const [initialEnrichment, setInitialEnrichment] = useState<Record<string, boolean>>({});
  const [registration, setRegistration] = useState<string>("invite_only");
  const [initialRegistration, setInitialRegistration] = useState<string>("invite_only");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  // key → raw value; presence in this map means the row is revealed.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  // key currently being fetched by the reveal endpoint.
  const [revealing, setRevealing] = useState<string | null>(null);

  const configQuery = useApiQuery<Record<string, unknown>>(() =>
    get<Record<string, unknown>>("/admin/system/config"),
  );
  const settingsQuery = useApiQuery<{ data: SystemSettingItem[] }>(() =>
    getSystemSettings(),
  );
  // Admin endpoint first; old backends 404 → fall back to the public status
  // endpoint. Missing mode defaults to invite_only.
  const registrationQuery = useApiQuery<{ registration_mode: string }>(async () => {
    try {
      return await get<{ registration_mode: string }>("/admin/system/registration");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return await get<{ registration_mode: string }>("/v1/auth/registration-status");
      }
      throw err;
    }
  });
  const loading = configQuery.isLoading;
  // Save failures share the banner with load errors; retry re-runs the GET.
  const error = configQuery.error ?? actionError;
  const settings = settingsQuery.data?.data ?? [];
  const settingsLoading = settingsQuery.isLoading;
  const settingsError = settingsQuery.error;

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
  const [seededRegistration, setSeededRegistration] =
    useState<{ registration_mode: string } | null>(null);
  if (registrationQuery.data && registrationQuery.data !== seededRegistration) {
    setSeededRegistration(registrationQuery.data);
    const mode = registrationQuery.data.registration_mode ?? "invite_only";
    setRegistration(mode);
    setInitialRegistration(mode);
  }

  /** Reveal raw value once; Hide only clears local state — never refetches. */
  const handleToggleReveal = async (item: SystemSettingItem) => {
    if (revealed[item.key]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[item.key];
        return next;
      });
      return;
    }
    setRevealing(item.key);
    try {
      const res = await revealSystemSetting(item.key);
      setRevealed((prev) => ({ ...prev, [item.key]: res.value }));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to reveal setting"));
    } finally {
      setRevealing(null);
    }
  };

  // Group by category, preserving the server's category order.
  const groupedSettings = settings.reduce<Map<string, SystemSettingItem[]>>(
    (acc, item) => {
      const list = acc.get(item.category) ?? [];
      list.push(item);
      acc.set(item.category, list);
      return acc;
    },
    new Map(),
  );

  const hasChanged = () => {
    const gateChanged =
      gate.enabled !== initialGate.enabled ||
      gate.threshold !== initialGate.threshold ||
      gate.model !== initialGate.model;
    const enrichmentChanged = ENRICHMENT_FIELDS.some(
      (f) => enrichment[f.key] !== initialEnrichment[f.key],
    );
    const registrationChanged = registration !== initialRegistration;
    return (
      SYSTEM_DEFAULT_FIELDS.some((f) => form.defaults[f.key] !== initialForm.defaults[f.key]) ||
      gateChanged ||
      enrichmentChanged ||
      registrationChanged
    );
  };

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
      if (
        gate.enabled !== initialGate.enabled ||
        gate.threshold !== initialGate.threshold ||
        gate.model !== initialGate.model
      ) {
        payload.enrichment_gate = { ...gate };
      }
      // Enrichment toggles are one nested block: send whole or not at all.
      if (ENRICHMENT_FIELDS.some((f) => enrichment[f.key] !== initialEnrichment[f.key])) {
        payload.enrichment = { ...enrichment };
      }
      // Registration lives on its own endpoint: PATCH whole or not at all.
      const registrationChanged = registration !== initialRegistration;
      if (Object.keys(payload).length > 0) {
        await patch("/admin/system/config", payload);
      }
      if (registrationChanged) {
        await patch("/admin/system/registration", { registration_mode: registration });
        setInitialRegistration(registration);
      }
      toast.success("System configuration saved");
      configQuery.refetch();
      registrationQuery.refetch();
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

      {/* ── Non-secret system defaults ──────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
            <Settings2 size={20} className="text-warning" />
          </div>
          <div>
            <h2 className="font-display text-base font-medium">System Defaults</h2>
            <p className="text-xs text-surface-400">
              Non-secret platform defaults
            </p>
          </div>
        </div>

        <ConfigFields
          values={form.defaults}
          onChange={(key, value) =>
            setForm((prev) => ({ ...prev, defaults: { ...prev.defaults, [key]: value } }))
          }
        />
      </div>

      {/* ── Enrichment gate ─────────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <Zap size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="font-display text-base font-medium">Enrichment gate</h2>
            <p className="text-xs text-surface-400">
              Skip the LLM call for low-signal episodes
            </p>
          </div>
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
                setGate((prev) => ({ ...prev, enabled: checked }))
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
                setGate((prev) => ({
                  ...prev,
                  threshold: Math.round(e.target.valueAsNumber * 100) / 100,
                }))
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
              onChange={(e) => setGate((prev) => ({ ...prev, model: e.target.value }))}
            />
          </Field>
        </div>
      </div>

      {/* ── System enrichment toggles ───────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <Zap size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="font-display text-base font-medium">System enrichment</h2>
            <p className="text-xs text-surface-400">
              Platform default enrichment stages — org and per-ingest overrides win
            </p>
          </div>
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
                onCheckedChange={(checked) =>
                  setEnrichment((prev) => ({ ...prev, [field.key]: checked }))
                }
              />
              <span className="text-sm font-medium text-surface-300">{field.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Registration ──────────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500/10">
            <UserPlus size={20} className="text-accent-300" />
          </div>
          <div>
            <h2 className="font-display text-base font-medium">Registration</h2>
            <p className="text-xs text-surface-400">
              Who can create an account on this platform
            </p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          {registrationQuery.error ? (
            <ErrorState
              message={registrationQuery.error}
              onRetry={registrationQuery.refetch}
            />
          ) : (
            <Field
              label="Registration mode"
              htmlFor="registration-mode"
              hint="Open lets anyone sign up; invite only needs an invite; approval needs admin sign-off."
            >
              <SimpleSelect
                id="registration-mode"
                className="w-full"
                options={REGISTRATION_OPTIONS}
                value={registration}
                onValueChange={setRegistration}
              />
            </Field>
          )}
        </div>
      </div>

      {/* ── Save bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!hasChanged()}>
          Save Changes
        </Button>
        {justSaved && (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <Check size={14} />
            Saved
          </span>
        )}
      </div>

      {/* ── Runtime settings (read-only, masked) ───────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500/10">
            <ServerCog size={20} className="text-accent-300" />
          </div>
          <div>
            <h2 className="font-display text-base font-medium">System Settings (runtime)</h2>
            <p className="text-xs text-surface-400">
              Platform runtime configuration from the secrets backend — read-only
            </p>
          </div>
        </div>

        {settingsError && <ErrorState message={settingsError} onRetry={settingsQuery.refetch} />}

        {settingsLoading ? (
          <div className="space-y-2">
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
          </div>
        ) : (
          <div className="divide-y divide-surface-800">
            {[...groupedSettings.entries()].map(([category, items]) => (
              <div key={category} className="py-4 first:pt-0 last:pb-0">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-2">
                  {category}
                </h3>
                <div className="space-y-1">
                  {items.map((item) => {
                    const raw = revealed[item.key];
                    const isRevealed = raw !== undefined;
                    return (
                      <div
                        key={item.key}
                        className="flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-surface-800/40"
                      >
                        <div className="min-w-0 flex-1">
                          <code className="block font-mono text-xs text-surface-300 truncate" title={item.key}>
                            {item.key}
                          </code>
                          {!item.is_set ? (
                            <span className="block mt-1 text-sm italic text-surface-600">Not set</span>
                          ) : isRevealed ? (
                            <code className="block mt-1 font-mono text-xs text-warning break-all" title={item.key}>
                              {raw}
                            </code>
                          ) : (
                            <span className="block mt-1 font-mono text-sm text-surface-400 break-all">
                              {item.masked_value ?? ""}
                            </span>
                          )}
                        </div>
                        {item.is_set && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="shrink-0"
                            loading={revealing === item.key}
                            disabled={revealing !== null && revealing !== item.key}
                            onClick={() => void handleToggleReveal(item)}
                          >
                            {isRevealed ? "Hide" : "Reveal"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
