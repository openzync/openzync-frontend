"use client";

import { useCallback, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ApiError, getMyConfig, updateMyConfig } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { SecretInput } from "@/components/ui/secret-input";
import { SimpleSelect } from "@/components/ui/select";
import { useConfigDirty } from "@/contexts/config-dirty";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { ConnectionTestButton } from "@/components/shared/connection-test-button";
import { useConnectionTest, type ConnectionTestResult } from "@/hooks/use-connection-test";
import { useConfigReset } from "@/hooks/use-config-reset";

// ─── Types ─────────────────────────────────────────────────────────────────────

/** What the config fetcher hands to the render-phase form seed. */
interface ConfigData {
  stored: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

type LlmBackend = "openai" | "anthropic" | "ollama" | "openai_like" | "azure";

// `type` (not `interface`) so the form gets an implicit index signature and is
// assignable to the `Record<string, unknown>` the reset hook expects — this is
// what removes the old `as unknown as` casts.
type FormState = {
  llm_backend: LlmBackend;
  llm_model: string;
  llm_temperature: number;
  llm_max_tokens: number;
  llm_api_key: string;
  llm_base_url: string;
  azure_endpoint: string;
  azure_deployment: string;
  prompt_caching_enabled: boolean;
  prompt_caching_anthropic_min_tokens: number;
  prompt_caching_anthropic_cache_ttl: "5m" | "1h";
};

interface ProviderCaps {
  /** Unified `llm_api_key`: required / optional / unused by this backend. */
  apiKey: "required" | "optional" | "unused";
  /** Unified `llm_base_url` (ollama + openai_like). */
  baseUrl: boolean;
  /** `azure_endpoint` (azure only). */
  azureEndpoint: boolean;
  /**
   * `azure_deployment` (azure only). When true the shared `llm_model` row is
   * hidden — azure uses the deployment name instead.
   */
  deployment: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LLM_FIELDS: readonly (keyof FormState)[] = [
  "llm_backend",
  "llm_model",
  "llm_temperature",
  "llm_max_tokens",
  "llm_api_key",
  "llm_base_url",
  "azure_endpoint",
  "azure_deployment",
  "prompt_caching_enabled",
  "prompt_caching_anthropic_min_tokens",
  "prompt_caching_anthropic_cache_ttl",
];

/**
 * The three flat form fields that map to the backend's nested
 * `prompt_caching` object. Kept separate from `LLM_FIELDS` so the save
 * transform can collapse them into the nested payload shape.
 */
const PROMPT_CACHING_FIELDS = [
  "prompt_caching_enabled",
  "prompt_caching_anthropic_min_tokens",
  "prompt_caching_anthropic_cache_ttl",
] as const;

/**
 * True when the nested prompt_caching object holds at least one non-null
 * value. The backend stores an empty object / all-null keys after a
 * "clear to defaults" save, so that state counts as NOT stored — it must
 * trigger the onboarding-defaults fetch instead of inline guesses.
 */
function hasStoredPromptCaching(pc: unknown): boolean {
  if (pc == null || typeof pc !== "object") return false;
  const obj = pc as Record<string, unknown>;
  return Object.keys(obj).length > 0 && Object.values(obj).some((v) => v != null);
}

/**
 * Backend select order (id + label only) and the per-provider capability map.
 * All provider rows live inside the single LLM Backend card below Max Tokens
 * in fixed order — API Key, Base URL, Endpoint URL, Deployment — each enabled
 * or disabled by the selected backend. Disabled rows keep their form value
 * (switching back re-enables intact) but are stripped from the save payload.
 */
const PROVIDERS: readonly { id: LlmBackend; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "azure", label: "Azure OpenAI" },
  { id: "ollama", label: "Ollama" },
  { id: "openai_like", label: "OpenAI-compatible" },
];

const PROVIDER_CAPS: Record<LlmBackend, ProviderCaps> = {
  openai: { apiKey: "required", baseUrl: false, azureEndpoint: false, deployment: false },
  anthropic: { apiKey: "required", baseUrl: false, azureEndpoint: false, deployment: false },
  azure: { apiKey: "required", baseUrl: false, azureEndpoint: true, deployment: true },
  ollama: { apiKey: "unused", baseUrl: true, azureEndpoint: false, deployment: false },
  openai_like: { apiKey: "optional", baseUrl: true, azureEndpoint: false, deployment: false },
};

/** Form field → unified backend name for the server-shaped requires message. */
const FORM_TO_UNIFIED: Record<string, string> = {
  llm_api_key: "api_key",
  llm_base_url: "base_url",
  azure_endpoint: "endpoint",
  azure_deployment: "deployment",
};

/** Human labels for the switch-provider hint. */
const REQUIRED_LABELS: Record<string, string> = {
  llm_api_key: "API key",
  llm_base_url: "base URL",
  azure_endpoint: "endpoint URL",
  azure_deployment: "deployment",
};

/** Required form fields for a backend, derived from PROVIDER_CAPS. */
function requiredFormFields(backend: LlmBackend): (keyof FormState)[] {
  const caps = PROVIDER_CAPS[backend] ?? PROVIDER_CAPS.openai_like;
  const fields: (keyof FormState)[] = [];
  if (caps.apiKey === "required") fields.push("llm_api_key");
  if (caps.baseUrl) fields.push("llm_base_url");
  if (caps.azureEndpoint) fields.push("azure_endpoint");
  if (caps.deployment) fields.push("azure_deployment");
  return fields;
}

/**
 * Drop rows disabled by the selected backend (azure uses the deployment
 * instead of the shared model). A staged reset is honored so a stale stored
 * value can still be cleared. Shared by save and probe so they agree.
 */
function stripDisabledProviderFields(
  payload: Record<string, unknown>,
  backend: LlmBackend,
  pendingResets: Set<keyof FormState>,
): void {
  const caps = PROVIDER_CAPS[backend] ?? PROVIDER_CAPS.openai_like;
  if (caps.apiKey === "unused" && !pendingResets.has("llm_api_key")) {
    delete payload["llm_api_key"];
  }
  if (!caps.baseUrl && !pendingResets.has("llm_base_url")) {
    delete payload["llm_base_url"];
  }
  if (!caps.azureEndpoint && !pendingResets.has("azure_endpoint")) {
    delete payload["azure_endpoint"];
  }
  if (!caps.deployment && !pendingResets.has("azure_deployment")) {
    delete payload["azure_deployment"];
  }
  if (caps.deployment && !pendingResets.has("llm_model")) {
    delete payload["llm_model"];
  }
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LlmConfigPage() {
  const [form, setForm] = useState<FormState>({
    llm_backend: "openai",
    llm_model: "",
    llm_temperature: 0.7,
    llm_max_tokens: 4096,
    llm_api_key: "",
    llm_base_url: "",
    azure_endpoint: "",
    azure_deployment: "",
    prompt_caching_enabled: true,
    prompt_caching_anthropic_min_tokens: 1024,
    prompt_caching_anthropic_cache_ttl: "5m",
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  // Save failures share the banner with load errors; cleared when a fetch
  // succeeds so a retry visibly resolves.
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Partial<Record<keyof FormState, boolean>>>({});

  const { setDirty } = useConfigDirty();
  const conn = useConnectionTest();

  // The reset hook writes into a `Record<string, unknown>` form, but this page
  // keeps a fully typed `FormState`. The hook only ever touches keys listed in
  // `LLM_FIELDS` (all `FormState` keys), so a single bounded cast at this
  // boundary is sound — it replaces the old triple `as unknown as` bridge.
  const setFormForReset = useCallback(
    (action: React.SetStateAction<Record<string, unknown>>) => {
      setForm((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        return next as FormState;
      });
    },
    [setForm],
  );

  const {
    pendingResets,
    stageReset,
    unstageReset,
    hasPendingResets,
    getSavePayload,
    clearResets,
  } = useConfigReset(LLM_FIELDS, initialForm, setFormForReset);

  // ── Fetch config ──────────────────────────────────────────────────────────

  const configQuery = useApiQuery<ConfigData>(async () => {
    const data = await getMyConfig();
    const stored = (data.override ?? {}) as Record<string, unknown>;
        // System defaults apply for anything not overridden.
    const defaults: Record<string, unknown> = {};

    return { stored, defaults };
  });

  // Seed the editable form from server data — render-phase adjustment keyed on
  // response identity (same pattern as platform-config/registration), so a refetch after
  // save re-seeds exactly once.
  const [seeded, setSeeded] = useState<ConfigData | null>(null);
  if (configQuery.data && configQuery.data !== seeded) {
    setSeeded(configQuery.data);
    const { stored, defaults } = configQuery.data;
    const val = (field: string, fallback: unknown) =>
      (stored[field] as unknown) ?? (defaults[field] as unknown) ?? fallback;

    // prompt_caching is nested on the backend — read the three flat form
    // fields from stored.prompt_caching, falling back to the system
    // default per key when the object or a key is null/absent
    const pc = stored.prompt_caching as Record<string, unknown> | null | undefined;
    const pcVal = (key: string, fallback: unknown) => (pc?.[key] as unknown) ?? fallback;

    const current: FormState = {
      llm_backend: val("llm_backend", "openai") as LlmBackend,
      llm_model: val("llm_model", "") as string,
      llm_temperature: val("llm_temperature", 0.7) as number,
      llm_max_tokens: val("llm_max_tokens", 4096) as number,
      llm_api_key: val("llm_api_key", "") as string,
      llm_base_url: val("llm_base_url", "") as string,
      azure_endpoint: val("azure_endpoint", "") as string,
      azure_deployment: val("azure_deployment", "") as string,
      prompt_caching_enabled: pcVal("enabled", true) as boolean,
      prompt_caching_anthropic_min_tokens: pcVal("anthropic_min_tokens", 1024) as number,
      prompt_caching_anthropic_cache_ttl: pcVal("anthropic_cache_ttl", "5m") as "5m" | "1h",
    };
    setForm(current);
    setInitialForm(current);
    setStored(stored);
    setActionError(null);
  }

  const loading = configQuery.isLoading;
  const error = configQuery.error ?? actionError;

  // ── Field helpers ─────────────────────────────────────────────────────────

  function isFieldSet(field: keyof FormState): boolean {
    // prompt_caching is stored nested on the backend — the three flat form
    // fields count as set only when the nested object holds a real value
    // (empty / all-null after a clear-to-defaults save is NOT set)
    if ((PROMPT_CACHING_FIELDS as readonly string[]).includes(field)) {
      return hasStoredPromptCaching(stored.prompt_caching);
    }
    return field in stored;
  }

  function hasChanged(): boolean {
    return hasPendingResets || LLM_FIELDS.some((f) => form[f] !== initialForm[f]);
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    // Editing a field cancels its staged reset (matches sibling pages) —
    // otherwise getSavePayload's null would silently win over the edit
    unstageReset(field);
    setForm((prev) => ({ ...prev, [field]: value }));
    const newForm = { ...form, [field]: value };
    const dirty =
      LLM_FIELDS.some((f) => newForm[f] !== initialForm[f]) || hasPendingResets;
    setDirty(dirty);
  }

  function toggleFieldVisibility(field: keyof FormState) {
    setVisibleFields((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  // ── Stage reset field (applied on save) ────────────────────────────────────

  function handleStageReset(field: keyof FormState) {
    stageReset(
      field,
      typeof initialForm[field] === "number"
        ? 0
        : typeof initialForm[field] === "boolean"
          ? false
          : "",
    );
    setDirty(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const payload = getSavePayload(form);
    if (Object.keys(payload).length === 0) return;

    // Rows disabled by the selected backend are never sent — the form value
    // is kept so switching back re-enables intact. An explicitly staged
    // reset is still honored so a stale stored value can be cleared.
    stripDisabledProviderFields(payload, form.llm_backend, pendingResets);
    if (Object.keys(payload).length === 0) return;

    // Same-PATCH switch must stay self-contained: a required field the
    // payload omits is resent from stored (switch-back without retyping);
    // one empty in both form and stored blocks here with the same message
    // the server validator would return.
    const nextBackend = payload.llm_backend as string | null | undefined;
    if ("llm_backend" in payload && nextBackend && nextBackend in PROVIDER_CAPS) {
      const missing: string[] = [];
      for (const field of requiredFormFields(form.llm_backend)) {
        if (field in payload && payload[field] != null && String(payload[field]).trim() !== "") {
          continue;
        }
        const formVal = form[field] as unknown;
        const formEmpty = formVal == null || String(formVal).trim() === "";
        const storedVal = stored[field];
        if (!formEmpty && !(field in payload) && typeof storedVal === "string" && storedVal.trim() !== "") {
          payload[field] = storedVal;
        } else {
          missing.push(FORM_TO_UNIFIED[field] ?? field);
        }
      }
      if (missing.length > 0) {
        const msg =
          `${form.llm_backend} backend requires ${missing.join(", ")} in per-user ` +
          "configuration.  Set it via PATCH /admin/platform-config.";
        setActionError(msg);
        toast.error(msg);
        return;
      }
    }
    if (Object.keys(payload).length === 0) return;

    // prompt_caching is a nested backend object — collapse the three flat form
    // fields into it. A staged reset (flat null from getSavePayload) becomes a
    // null inside the object so the backend falls back to that field's system
    // default; resetting all three sends {} so the backend clears every field.
    // Never send prompt_caching: null — the backend treats null as "don't
    // touch", which would silently keep the old values.
    const pcTouched =
      PROMPT_CACHING_FIELDS.some((f) => f in payload) ||
      PROMPT_CACHING_FIELDS.some((f) => pendingResets.has(f));
    if (pcTouched) {
      if (PROMPT_CACHING_FIELDS.every((f) => pendingResets.has(f))) {
        payload["prompt_caching"] = {};
      } else {
        payload["prompt_caching"] = {
          enabled: pendingResets.has("prompt_caching_enabled")
            ? null
            : form.prompt_caching_enabled,
          anthropic_min_tokens: pendingResets.has("prompt_caching_anthropic_min_tokens")
            ? null
            : form.prompt_caching_anthropic_min_tokens,
          anthropic_cache_ttl: pendingResets.has("prompt_caching_anthropic_cache_ttl")
            ? null
            : form.prompt_caching_anthropic_cache_ttl,
        };
      }
      for (const f of PROMPT_CACHING_FIELDS) delete payload[f];
    }

    setSaving(true);

    try {
      await updateMyConfig(payload);
      toast.success("LLM configuration saved successfully");
      setDirty(false);
      clearResets();
      conn.reset();
      configQuery.refetch();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to save configuration";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Discard ────────────────────────────────────────────────────────────────

  function handleDiscard() {
    setForm({ ...initialForm });
    clearResets();
    conn.reset();
    setDirty(false);
  }

  // ── Test connection (unsaved form as candidate; never marks dirty) ─────────

  function handleTestConnection(): Promise<ConnectionTestResult | null> {
    // Same strip rules as save (shared helper) so the probe tests exactly
    // what a save would send for the selected backend.
    const candidate: Record<string, unknown> = {
      llm_backend: form.llm_backend,
      llm_model: form.llm_model,
      llm_api_key: form.llm_api_key,
      llm_base_url: form.llm_base_url,
      azure_endpoint: form.azure_endpoint,
      azure_deployment: form.azure_deployment,
    };
    stripDisabledProviderFields(candidate, form.llm_backend, pendingResets);
    return conn.test("llm", candidate);
  }

  // ── Provider meta ──────────────────────────────────────────────────────────

  // openai_like (last entry) is the no-fields fallback provider
  const providerLabel =
    PROVIDERS.find((p) => p.id === form.llm_backend)?.label ?? "OpenAI-compatible";
  const caps = PROVIDER_CAPS[form.llm_backend] ?? PROVIDER_CAPS.openai_like;
  const unusedHint = `Not used by ${providerLabel} — value kept, not sent on save.`;

  // Switch-provider nudge: the target backend changed and at least one of
  // its required fields is still empty in the form.
  const backendChanged = form.llm_backend !== initialForm.llm_backend;
  const emptyRequiredFields = backendChanged
    ? requiredFormFields(form.llm_backend).filter(
        (f) => String(form[f] ?? "").trim() === "",
      )
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── LLM Backend Card ─────────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="mb-6">
          <h2 className="font-display text-base font-medium">LLM Backend</h2>
          <p className="text-xs text-surface-400">Primary language model provider</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
          </div>
        ) : (
          <>
            {error && <ErrorState message={error} onRetry={configQuery.refetch} />}
            <div className="space-y-4 max-w-md">
              {/* llm_backend */}
              <div>
                <label htmlFor="llm-backend" className="block text-sm font-medium text-surface-300 mb-1">
                  Backend Provider
                </label>
                <div className="flex gap-2 items-start">
                  <SimpleSelect
                    id="llm-backend"
                    className="flex-1"
                    options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
                    value={form.llm_backend}
                    onValueChange={(value) => updateField("llm_backend", value as LlmBackend)}
                  />
                  {isFieldSet("llm_backend") && (
                    <Button
                      onClick={() => handleStageReset("llm_backend")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {pendingResets.has("llm_backend") && (
                  <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                )}
                {emptyRequiredFields.length > 0 && (
                  <p className="text-xs text-amber-400 mt-1">
                    Switching to {providerLabel} — enter its{" "}
                    {emptyRequiredFields.map((f) => REQUIRED_LABELS[f]).join(", ")} before saving.
                  </p>
                )}
              </div>

              {/* llm_model — hidden for azure, which uses azure_deployment instead */}
              {!caps.deployment && (
              <div>
                <label htmlFor="llm-model" className="block text-sm font-medium text-surface-300 mb-1">
                  Model
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    id="llm-model"
                    className="input-base flex-1"
                    placeholder="gpt-4o, claude-sonnet-4, ..."
                    value={form.llm_model}
                    onChange={(e) => updateField("llm_model", e.target.value)}
                  />
                  {isFieldSet("llm_model") && (
                    <Button
                      onClick={() => handleStageReset("llm_model")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {pendingResets.has("llm_model") && (
                  <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                )}
              </div>
              )}

              {/* llm_temperature */}
              <div>
                <label htmlFor="llm-temperature" className="block text-sm font-medium text-surface-300 mb-1">
                  Temperature
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    id="llm-temperature"
                    className="input-base flex-1"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={form.llm_temperature}
                    onChange={(e) => updateField("llm_temperature", parseFloat(e.target.value) || 0)}
                  />
                  {isFieldSet("llm_temperature") && (
                    <Button
                      onClick={() => handleStageReset("llm_temperature")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {pendingResets.has("llm_temperature") && (
                  <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                )}
              </div>

              {/* llm_max_tokens */}
              <div>
                <label htmlFor="llm-max-tokens" className="block text-sm font-medium text-surface-300 mb-1">
                  Max Tokens
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    id="llm-max-tokens"
                    className="input-base flex-1"
                    type="number"
                    min="1"
                    value={form.llm_max_tokens}
                    onChange={(e) => updateField("llm_max_tokens", parseInt(e.target.value) || 0)}
                  />
                  {isFieldSet("llm_max_tokens") && (
                    <Button
                      onClick={() => handleStageReset("llm_max_tokens")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {pendingResets.has("llm_max_tokens") && (
                  <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                )}
              </div>

              {/* ── Provider rows: always rendered in fixed order, enabled or
                  disabled by the selected backend. Disabled rows keep their
                  form value but are stripped from the save payload. ── */}

              {/* unified llm_api_key — required openai/anthropic/azure, optional openai_like, unused ollama */}
              <div className={caps.apiKey === "unused" ? "opacity-60" : undefined}>
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    <SecretInput
                      id="llm_api_key"
                      label="API Key"
                      value={form.llm_api_key}
                      onChange={(v) => updateField("llm_api_key", v)}
                      placeholder={form.llm_backend === "openai_like" ? "sk-... (leave empty if endpoint needs no auth)" : "sk-..."}
                      visible={Boolean(visibleFields.llm_api_key)}
                      onToggleVisibility={() => toggleFieldVisibility("llm_api_key")}
                      optional={caps.apiKey !== "required"}
                      disabled={caps.apiKey === "unused"}
                    />
                  </div>
                  {isFieldSet("llm_api_key") && (
                    <Button
                      onClick={() => handleStageReset("llm_api_key")}
                      variant="ghost" size="sm"
                      // SecretInput renders its own label above the
                      // input, so push the reset button down to the input row
                      className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-7"
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {pendingResets.has("llm_api_key") && (
                  <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                )}
                {caps.apiKey === "unused" && (
                  <p className="text-xs text-surface-500 mt-1">{unusedHint}</p>
                )}
              </div>

              {/* unified llm_base_url — ollama + openai_like only */}
              <div className={caps.baseUrl ? undefined : "opacity-60"}>
                <label htmlFor="llm_base_url" className="block text-sm font-medium text-surface-300 mb-1">
                  Base URL
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    id="llm_base_url"
                    className="input-base flex-1"
                    type="url"
                    placeholder={form.llm_backend === "ollama" ? "http://localhost:11434" : "https://api.together.xyz/v1"}
                    value={form.llm_base_url}
                    onChange={(e) => updateField("llm_base_url", e.target.value)}
                    disabled={!caps.baseUrl}
                  />
                  {isFieldSet("llm_base_url") && (
                    <Button
                      onClick={() => handleStageReset("llm_base_url")}
                      variant="ghost" size="sm"
                      className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {pendingResets.has("llm_base_url") && (
                  <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                )}
                {!caps.baseUrl && (
                  <p className="text-xs text-surface-500 mt-1">{unusedHint}</p>
                )}
              </div>

              {/* azure_endpoint — azure only */}
              <div className={caps.azureEndpoint ? undefined : "opacity-60"}>
                <label htmlFor="azure_endpoint" className="block text-sm font-medium text-surface-300 mb-1">
                  Endpoint URL
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    id="azure_endpoint"
                    className="input-base flex-1"
                    type="url"
                    placeholder="https://my-resource.openai.azure.com"
                    value={form.azure_endpoint}
                    onChange={(e) => updateField("azure_endpoint", e.target.value)}
                    disabled={!caps.azureEndpoint}
                  />
                  {isFieldSet("azure_endpoint") && (
                    <Button
                      onClick={() => handleStageReset("azure_endpoint")}
                      variant="ghost" size="sm"
                      className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {pendingResets.has("azure_endpoint") && (
                  <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                )}
                {!caps.azureEndpoint && (
                  <p className="text-xs text-surface-500 mt-1">{unusedHint}</p>
                )}
              </div>

              {/* azure_deployment — azure only (replaces Model row for azure) */}
              <div className={caps.deployment ? undefined : "opacity-60"}>
                <label htmlFor="azure-deployment" className="block text-sm font-medium text-surface-300 mb-1">
                  Deployment
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    id="azure-deployment"
                    className="input-base flex-1"
                    placeholder="my-deployment-name"
                    value={form.azure_deployment}
                    onChange={(e) => updateField("azure_deployment", e.target.value)}
                    disabled={!caps.deployment}
                  />
                  {isFieldSet("azure_deployment") && (
                    <Button
                      onClick={() => handleStageReset("azure_deployment")}
                      variant="ghost" size="sm"
                      className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {pendingResets.has("azure_deployment") && (
                  <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                )}
                {!caps.deployment && (
                  <p className="text-xs text-surface-500 mt-1">{unusedHint}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Prompt Caching Card ──────────────────────────────────────────────── */}
      {!loading && (
        <div className="card-base p-6">
          <div className="mb-6">
            <h2 className="font-display text-base font-medium">Prompt Caching</h2>
            <p className="text-xs text-surface-400">Anthropic prompt caching</p>
          </div>

          <div className="space-y-4 max-w-md">
            {/* prompt_caching_enabled — checkbox toggle */}
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <label htmlFor="prompt-caching-enabled" className="block text-sm font-medium text-surface-300 mb-1">
                    Enable prompt caching
                  </label>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <label htmlFor="prompt-caching-enabled" className="flex items-center gap-3 cursor-pointer">
                    <input
                      id="prompt-caching-enabled"
                      type="checkbox"
                      className="rounded border-surface-600 bg-surface-800 text-brand-500"
                      checked={form.prompt_caching_enabled}
                      onChange={(e) => updateField("prompt_caching_enabled", e.target.checked)}
                    />
                    <span className="text-sm text-surface-300">
                      {form.prompt_caching_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </label>
                  {isFieldSet("prompt_caching_enabled") && (
                    <Button
                      onClick={() => handleStageReset("prompt_caching_enabled")}
                      variant="ghost" size="sm"
                      className="rounded-md text-surface-400 hover:text-brand-300"
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
              </div>
              {pendingResets.has("prompt_caching_enabled") && (
                <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
              )}
            </div>

            {/* prompt_caching_anthropic_min_tokens */}
            <div>
              <label htmlFor="prompt-caching-min-tokens" className="block text-sm font-medium text-surface-300 mb-1">
                Minimum input tokens
              </label>
              <div className="flex gap-2 items-start">
                <input
                  id="prompt-caching-min-tokens"
                  className="input-base flex-1"
                  type="number"
                  min="512"
                  value={form.prompt_caching_anthropic_min_tokens}
                  onChange={(e) =>
                    updateField(
                      "prompt_caching_anthropic_min_tokens",
                      Math.max(512, parseInt(e.target.value) || 0),
                    )
                  }
                />
                {isFieldSet("prompt_caching_anthropic_min_tokens") && (
                  <Button
                    onClick={() => handleStageReset("prompt_caching_anthropic_min_tokens")}
                    variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                    title="Remove stored value — default will apply on save"
                  >
                    <RotateCcw size={14} />
                  </Button>
                )}
              </div>
              {pendingResets.has("prompt_caching_anthropic_min_tokens") && (
                <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
              )}
              <p className="text-xs text-surface-500 mt-1">
                Only cache prompts with at least this many input tokens (min 512)
              </p>
            </div>

            {/* prompt_caching_anthropic_cache_ttl */}
            <div>
              <label htmlFor="prompt-caching-ttl" className="block text-sm font-medium text-surface-300 mb-1">
                Cache TTL
              </label>
              <div className="flex gap-2 items-start">
                <SimpleSelect
                  id="prompt-caching-ttl"
                  className="flex-1"
                  options={[
                    { value: "5m", label: "5m — 1.25× write cost" },
                    { value: "1h", label: "1h — 2× write cost" },
                  ]}
                  value={form.prompt_caching_anthropic_cache_ttl}
                  onValueChange={(value) =>
                    updateField("prompt_caching_anthropic_cache_ttl", value as "5m" | "1h")
                  }
                />
                {isFieldSet("prompt_caching_anthropic_cache_ttl") && (
                  <Button
                    onClick={() => handleStageReset("prompt_caching_anthropic_cache_ttl")}
                    variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                    title="Remove stored value — default will apply on save"
                  >
                    <RotateCcw size={14} />
                  </Button>
                )}
              </div>
              {pendingResets.has("prompt_caching_anthropic_cache_ttl") && (
                <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
              )}
              <p className="text-xs text-surface-500 mt-1">
                Cached reads are 0.1× of the output token price
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Save Bar ────────────────────────────────────────────────────── */}
      {!loading && (
        <StickySaveBar
          saving={saving}
          hasChanges={hasChanged()}
          hasSaved={justSaved}
          onSave={handleSave}
          onDiscard={handleDiscard}
          saveDisabled={conn.testing}
          testAction={<ConnectionTestButton testing={conn.testing} result={conn.result} error={conn.error} onTest={handleTestConnection} disabled={saving || loading} />}
        />
      )}
    </div>
  );
}
