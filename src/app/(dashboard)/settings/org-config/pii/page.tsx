"use client";

import { useState } from "react";
import { RotateCcw, Shield } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { useConfigDirty } from "@/contexts/config-dirty";
import { useConfigReset } from "@/hooks/use-config-reset";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgConfigResponse {
  stored: Record<string, unknown>;
}

/** What the config fetcher hands to the render-phase form seed. */
interface OrgConfigData {
  stored: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

type PiiMode = "off" | "mask" | "block";
type PiiSensitivity = "low" | "medium" | "high";

type FormState = {
  pii_mode: PiiMode;
  pii_sensitivity: PiiSensitivity;
  pii_enabled_types: string[];
  pii_min_confidence: number;
};

const FIELDS: (keyof FormState)[] = [
  "pii_mode",
  "pii_sensitivity",
  "pii_enabled_types",
  "pii_min_confidence",
];

// ─── Reset field titles ────────────────────────────────────────────────────────

const RESET_TITLES: Partial<Record<keyof FormState, string>> = {
  pii_mode: "Reset PII mode to default",
  pii_sensitivity: "Reset PII sensitivity to default",
  pii_enabled_types: "Reset PII enabled types to default",
  pii_min_confidence: "Reset PII min confidence to default",
};

// ─── Default PII types (7 regex types) — must match services/pii_service.py DEFAULT_PII_TYPES
const DEFAULT_PII_ENABLED: string[] = [
  "email",
  "phone",
  "ssn",
  "credit_card",
  "ip_address",
  "api_key",
  "crypto_wallet",
];

// ─── Default values for staged-reset UI ────────────────────────────────────────

const DEFAULTS: FormState = {
  pii_mode: "mask",
  pii_sensitivity: "low",
  pii_enabled_types: [...DEFAULT_PII_ENABLED],
  pii_min_confidence: 0.7,
};

// ─── Options ───────────────────────────────────────────────────────────────────

const MODE_OPTIONS: { value: PiiMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "mask", label: "Mask" },
  { value: "block", label: "Block" },
];

const SENSITIVITY_OPTIONS: { value: PiiSensitivity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const PII_TYPES: readonly string[] = [
  "email",
  "phone",
  "ssn",
  "credit_card",
  "ip_address",
  "api_key",
  "crypto_wallet",
  "name",
  "address",
  "organization",
  "date",
] as const;

const MODE_HELP: Record<PiiMode, string> = {
  off: "No detection",
  mask: "Replace with [REDACTED:TYPE]",
  block: "Reject with 422",
};

const SENSITIVITY_HELP: Record<PiiSensitivity, string> = {
  low: "Regex only",
  medium: "Regex + NER (names/addresses)",
  high: "Regex + NER + LLM",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function arraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PiiConfigPage() {
  const { setDirty } = useConfigDirty();
  const [form, setForm] = useState<FormState>({ ...DEFAULTS });
  const [initialForm, setInitialForm] = useState<FormState>({ ...DEFAULTS });
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // ── Staged resets ────────────────────────────────────────────────────────────

  const {
    pendingResets,
    stageReset,
    unstageReset,
    hasPendingResets,
    getSavePayload,
    clearResets,
  } = useConfigReset(
    FIELDS as unknown as readonly string[],
    initialForm as unknown as Record<string, unknown>,
    setForm as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
  );

  // ── Fetch config ──────────────────────────────────────────────────────────

  const configQuery = useApiQuery<OrgConfigData>(async () => {
    const data = await get<OrgConfigResponse>("/admin/org/config");
    const stored = (data.stored ?? {}) as Record<string, unknown>;
    const hasAnyStored = FIELDS.some((f) => stored[f] != null);

    const defaults = hasAnyStored
      ? {}
      : await get<Record<string, unknown>>("/admin/org/config/defaults").catch(
          () => ({}) as Record<string, unknown>,
        );

    return { stored, defaults };
  });

  // Seed the editable form from server data
  const [seeded, setSeeded] = useState<OrgConfigData | null>(null);
  if (configQuery.data && configQuery.data !== seeded) {
    setSeeded(configQuery.data);
    const { stored, defaults } = configQuery.data;
    const val = (field: string, fallback: unknown) =>
      (stored[field] as unknown) ?? (defaults[field] as unknown) ?? fallback;
    const current: FormState = {
      pii_mode: val("pii_mode", "mask") as PiiMode,
      pii_sensitivity: val("pii_sensitivity", "low") as PiiSensitivity,
      pii_enabled_types: (val("pii_enabled_types", DEFAULT_PII_ENABLED) as unknown as string[]) ?? [...DEFAULT_PII_ENABLED],
      pii_min_confidence: val("pii_min_confidence", 0.7) as number,
    };
    // Ensure pii_enabled_types is always an array
    if (!Array.isArray(current.pii_enabled_types)) current.pii_enabled_types = [];
    setForm(current);
    setInitialForm(current);
    setStored(stored);
    setActionError(null);
  }

  const loading = configQuery.isLoading;
  const error = configQuery.error ?? actionError;

  // ── Field helpers ─────────────────────────────────────────────────────────

  function isFieldSet(field: string): boolean {
    return field in stored;
  }

  function isPendingReset(field: keyof FormState): boolean {
    return pendingResets.has(field);
  }

  function hasChanged(): boolean {
    return (
      form.pii_mode !== initialForm.pii_mode ||
      form.pii_sensitivity !== initialForm.pii_sensitivity ||
      !arraysEqual(form.pii_enabled_types, initialForm.pii_enabled_types) ||
      form.pii_min_confidence !== initialForm.pii_min_confidence ||
      hasPendingResets
    );
  }

  function isFieldChanged(f: keyof FormState, a: FormState, b: FormState): boolean {
    if (f === "pii_enabled_types") return !arraysEqual(a.pii_enabled_types, b.pii_enabled_types);
    return a[f] !== b[f];
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    unstageReset(field);
    setForm((prev) => ({ ...prev, [field]: value }));
    const nextForm = { ...form, [field]: value } as FormState;
    const thisFieldChanged = isFieldChanged(field, nextForm, initialForm);
    const otherChanged = FIELDS.some(
      (f) => f !== field && isFieldChanged(f, form as FormState, initialForm),
    );
    // pendingResets still holds the old set this render — exclude this field if it was staged
    const pendingAfter = pendingResets.has(field) ? pendingResets.size > 1 : hasPendingResets;
    setDirty(thisFieldChanged || otherChanged || pendingAfter);
  }

  function togglePiiType(type: string) {
    const exists = form.pii_enabled_types.includes(type);
    const next = exists
      ? form.pii_enabled_types.filter((t) => t !== type)
      : [...form.pii_enabled_types, type];
    updateField("pii_enabled_types", next);
  }

  // ── Stage field reset to default ──────────────────────────────────────────

  function handleStageReset(field: keyof FormState) {
    stageReset(field, DEFAULTS[field]);
    setDirty(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!hasChanged()) return;
    setSaving(true);

    try {
      const payload = getSavePayload(form as unknown as Record<string, unknown>);

      await patch("/admin/org/config", payload);

      toast.success("PII configuration saved successfully");
      clearResets();
      setDirty(false);
      configQuery.refetch();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save configuration";
      setActionError(message);
      toast.error(err instanceof ApiError ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── PII Protection Card ───────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <Shield size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold">PII Protection</h2>
            <p className="text-xs text-surface-400">Redact sensitive data before storage</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-24 rounded bg-surface-800 animate-pulse w-full" />
          </div>
        ) : (
          <>
            {error && <ErrorState message={error} onRetry={configQuery.refetch} />}
            <div className="space-y-6 max-w-xl">
              {/* pii_mode */}
              <div>
                <label htmlFor="pii-mode" className="block text-sm font-medium text-surface-300 mb-1">
                  PII Mode
                </label>
                <div className="flex gap-2 items-start">
                  <SimpleSelect
                    id="pii-mode"
                    className="flex-1"
                    options={MODE_OPTIONS}
                    value={form.pii_mode}
                    onValueChange={(value) => updateField("pii_mode", value as PiiMode)}
                  />
                  {isFieldSet("pii_mode") && (
                    <Button
                      onClick={() => handleStageReset("pii_mode")}
                      variant="ghost"
                      size="sm"
                      className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title={RESET_TITLES.pii_mode}
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {isPendingReset("pii_mode") && (
                  <p className="text-xs text-amber-400 mt-1">Will reset to default on save</p>
                )}
                <p className="text-xs text-surface-500 mt-1">{MODE_HELP[form.pii_mode]}</p>
              </div>

              {/* pii_sensitivity */}
              <div>
                <label htmlFor="pii-sensitivity" className="block text-sm font-medium text-surface-300 mb-1">
                  Sensitivity
                </label>
                <div className="flex gap-2 items-start">
                  <SimpleSelect
                    id="pii-sensitivity"
                    className="flex-1"
                    options={SENSITIVITY_OPTIONS}
                    value={form.pii_sensitivity}
                    onValueChange={(value) => updateField("pii_sensitivity", value as PiiSensitivity)}
                  />
                  {isFieldSet("pii_sensitivity") && (
                    <Button
                      onClick={() => handleStageReset("pii_sensitivity")}
                      variant="ghost"
                      size="sm"
                      className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title={RESET_TITLES.pii_sensitivity}
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {isPendingReset("pii_sensitivity") && (
                  <p className="text-xs text-amber-400 mt-1">Will reset to default on save</p>
                )}
                <p className="text-xs text-surface-500 mt-1">{SENSITIVITY_HELP[form.pii_sensitivity]}</p>
              </div>

              {/* pii_min_confidence */}
              <div>
                <label htmlFor="pii-min-confidence" className="block text-sm font-medium text-surface-300 mb-1">
                  Minimum Confidence
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    id="pii-min-confidence"
                    className="input-base flex-1"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={form.pii_min_confidence}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      const clamped = Number.isNaN(raw) ? 0 : Math.min(1, Math.max(0, raw));
                      updateField("pii_min_confidence", clamped);
                    }}
                  />
                  {isFieldSet("pii_min_confidence") && (
                    <Button
                      onClick={() => handleStageReset("pii_min_confidence")}
                      variant="ghost"
                      size="sm"
                      className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title={RESET_TITLES.pii_min_confidence}
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {isPendingReset("pii_min_confidence") && (
                  <p className="text-xs text-amber-400 mt-1">Will reset to default on save</p>
                )}
                <p className="text-xs text-surface-500 mt-1">Threshold 0.0–1.0 (step 0.05)</p>
              </div>

              {/* pii_enabled_types */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-surface-300">Enabled Types</label>
                  {isFieldSet("pii_enabled_types") && (
                    <Button
                      onClick={() => handleStageReset("pii_enabled_types")}
                      variant="ghost"
                      size="sm"
                      className="rounded-md text-surface-400 hover:text-brand-300 shrink-0"
                      title={RESET_TITLES.pii_enabled_types}
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {isPendingReset("pii_enabled_types") && (
                  <p className="text-xs text-amber-400 mb-2">Will reset to default on save</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {PII_TYPES.map((type) => (
                    <label
                      key={type}
                      htmlFor={`pii-type-${type}`}
                      className="flex items-center gap-2 cursor-pointer rounded-md border border-surface-800 bg-surface-900/50 px-3 py-2 hover:bg-surface-800/60 transition-colors"
                    >
                      <input
                        id={`pii-type-${type}`}
                        type="checkbox"
                        className="rounded border-surface-600 bg-surface-800 text-brand-500"
                        checked={form.pii_enabled_types.includes(type)}
                        onChange={() => togglePiiType(type)}
                      />
                      <span className="text-sm text-surface-300">{type}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-surface-500 mt-2">7 regex types enabled by default; uncheck to disable</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Sticky Save Bar ──────────────────────────────────────────────────── */}
      {!loading && (
        <StickySaveBar
          saving={saving}
          hasChanges={hasChanged()}
          hasSaved={justSaved}
          onSave={handleSave}
          onDiscard={() => {
            setForm({ ...initialForm, pii_enabled_types: [...initialForm.pii_enabled_types] });
            setDirty(false);
            clearResets();
          }}
        />
      )}
    </div>
  );
}
