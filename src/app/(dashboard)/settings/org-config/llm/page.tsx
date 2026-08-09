"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Brain, Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError, apiErrorMessage } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { SecretInput } from "@/components/ui/secret-input";
import { useConfigDirty } from "@/contexts/config-dirty";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { useConfigReset } from "@/hooks/use-config-reset";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgConfigResponse {
  stored: Record<string, unknown>;
}

type LlmBackend = "openai" | "anthropic" | "ollama" | "openai_like" | "openrouter" | "azure";

// `type` (not `interface`) so the form gets an implicit index signature and is
// assignable to the `Record<string, unknown>` the reset hook expects — this is
// what removes the old `as unknown as` casts.
type FormState = {
  llm_backend: LlmBackend;
  llm_model: string;
  llm_temperature: number;
  llm_max_tokens: number;
  openai_api_key: string;
  anthropic_api_key: string;
  openrouter_api_key: string;
  ollama_base_url: string;
  azure_openai_endpoint: string;
  azure_openai_key: string;
};

/** One provider-specific field (api key, endpoint, base url, …). */
interface ProviderField {
  /** Must match a backend `UpdateOrgConfigRequest` field name exactly. */
  field: keyof FormState;
  label: string;
  placeholder: string;
  kind: "secret" | "url";
}

interface ProviderConfig {
  /** Matches the backend `llm_backend` enum. */
  id: LlmBackend;
  label: string;
  title: string;
  description: string;
  fields: readonly ProviderField[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LLM_FIELDS: readonly (keyof FormState)[] = [
  "llm_backend",
  "llm_model",
  "llm_temperature",
  "llm_max_tokens",
  "openai_api_key",
  "anthropic_api_key",
  "openrouter_api_key",
  "ollama_base_url",
  "azure_openai_endpoint",
  "azure_openai_key",
];

/**
 * Single source of truth for provider selection (order = select order) and the
 * provider settings card. Secret fields render through `SecretInput`.
 */
const PROVIDERS: readonly ProviderConfig[] = [
  {
    id: "openai",
    label: "OpenAI",
    title: "OpenAI Settings",
    description: "API key for OpenAI models",
    fields: [
      { field: "openai_api_key", label: "OpenAI API Key", placeholder: "sk-...", kind: "secret" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    title: "Anthropic Settings",
    description: "API key for Anthropic models",
    fields: [
      { field: "anthropic_api_key", label: "Anthropic API Key", placeholder: "sk-ant-...", kind: "secret" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    title: "OpenRouter Settings",
    description: "API key for OpenRouter",
    fields: [
      { field: "openrouter_api_key", label: "OpenRouter API Key", placeholder: "sk-or-...", kind: "secret" },
    ],
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    title: "Azure OpenAI Settings",
    description: "Azure OpenAI endpoint and credentials",
    fields: [
      { field: "azure_openai_endpoint", label: "Endpoint URL", placeholder: "https://my-resource.openai.azure.com", kind: "url" },
      { field: "azure_openai_key", label: "API Key", placeholder: "Azure API key", kind: "secret" },
    ],
  },
  {
    id: "ollama",
    label: "Ollama",
    title: "Ollama Settings",
    description: "Local LLM provider configuration",
    fields: [
      { field: "ollama_base_url", label: "Base URL", placeholder: "http://localhost:11434", kind: "url" },
    ],
  },
  {
    id: "openai_like",
    label: "OpenAI-compatible",
    title: "Provider Settings",
    description: "No additional provider-specific configuration needed",
    fields: [],
  },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LlmConfigPage() {
  const [form, setForm] = useState<FormState>({
    llm_backend: "openai",
    llm_model: "",
    llm_temperature: 0.7,
    llm_max_tokens: 4096,
    openai_api_key: "",
    anthropic_api_key: "",
    openrouter_api_key: "",
    ollama_base_url: "",
    azure_openai_endpoint: "",
    azure_openai_key: "",
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Partial<Record<keyof FormState, boolean>>>({});

  const { setDirty } = useConfigDirty();

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
    hasPendingResets,
    getSavePayload,
    clearResets,
  } = useConfigReset(LLM_FIELDS, initialForm, setFormForReset);

  // ── beforeunload protection ──────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanged()) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // ── Fetch config ──────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<OrgConfigResponse>("/admin/org/config");
      const stored = data.stored as Record<string, unknown>;
      const hasAnyStored = LLM_FIELDS.some((f) => stored[f] != null);

      // If no stored values exist for this tab, pull onboarding defaults from API
      let defaults: Record<string, unknown> = {};
      if (!hasAnyStored) {
        try {
          defaults = await get<Record<string, unknown>>("/admin/org/config/defaults");
        } catch {
          // defaults fetch is best-effort; fall through to inline fallbacks
        }
      }

      const val = (field: string, fallback: unknown) =>
        (stored[field] as unknown) ?? (defaults[field] as unknown) ?? fallback;

      setForm({
        llm_backend: val("llm_backend", "openai") as LlmBackend,
        llm_model: val("llm_model", "") as string,
        llm_temperature: val("llm_temperature", 0.7) as number,
        llm_max_tokens: val("llm_max_tokens", 4096) as number,
        openai_api_key: val("openai_api_key", "") as string,
        anthropic_api_key: val("anthropic_api_key", "") as string,
        openrouter_api_key: val("openrouter_api_key", "") as string,
        ollama_base_url: val("ollama_base_url", "") as string,
        azure_openai_endpoint: val("azure_openai_endpoint", "") as string,
        azure_openai_key: val("azure_openai_key", "") as string,
      });
      setInitialForm({
        llm_backend: val("llm_backend", "openai") as LlmBackend,
        llm_model: val("llm_model", "") as string,
        llm_temperature: val("llm_temperature", 0.7) as number,
        llm_max_tokens: val("llm_max_tokens", 4096) as number,
        openai_api_key: val("openai_api_key", "") as string,
        anthropic_api_key: val("anthropic_api_key", "") as string,
        openrouter_api_key: val("openrouter_api_key", "") as string,
        ollama_base_url: val("ollama_base_url", "") as string,
        azure_openai_endpoint: val("azure_openai_endpoint", "") as string,
        azure_openai_key: val("azure_openai_key", "") as string,
      });
      setStored(data.stored ?? {});
      setError(null);
    } catch (err) {
      const msg = apiErrorMessage(err, "Failed to load configuration");
      setError(msg);
      // initialForm keeps current values so the form remains interactive
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ── Field helpers ─────────────────────────────────────────────────────────

  function isFieldSet(field: keyof FormState): boolean {
    return field in stored;
  }

  function hasChanged(): boolean {
    return hasPendingResets || LLM_FIELDS.some((f) => form[f] !== initialForm[f]);
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    const newForm = { ...form, [field]: value };
    const dirty = LLM_FIELDS.some((f) => newForm[f] !== initialForm[f]);
    setDirty(dirty);
  }

  function toggleFieldVisibility(field: keyof FormState) {
    setVisibleFields((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  // ── Stage reset field (applied on save) ────────────────────────────────────

  function handleStageReset(field: keyof FormState) {
    stageReset(field, typeof initialForm[field] === "number" ? 0 : "");
    setDirty(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const payload = getSavePayload(form);
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    setError(null);

    try {
      await patch("/admin/org/config", payload);
      toast.success("LLM configuration saved successfully");
      await fetchConfig();
      setDirty(false);
      clearResets();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to save configuration";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Discard ────────────────────────────────────────────────────────────────

  function handleDiscard() {
    setForm({ ...initialForm });
    clearResets();
    setDirty(false);
  }

  // ── Provider meta ──────────────────────────────────────────────────────────

  // openai_like (last entry) is the no-fields fallback provider
  const provider =
    PROVIDERS.find((p) => p.id === form.llm_backend) ??
    PROVIDERS[PROVIDERS.length - 1];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── LLM Backend Card ─────────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <Brain size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold">LLM Backend</h2>
            <p className="text-xs text-surface-400">Primary language model provider</p>
          </div>
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
            {error && <ErrorState message={error} onRetry={fetchConfig} />}
            <div className="space-y-4 max-w-md">
              {/* llm_backend */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  Backend Provider
                </label>
                <div className="flex gap-2 items-start">
                  <select
                    className="input-base flex-1"
                    value={form.llm_backend}
                    onChange={(e) => updateField("llm_backend", e.target.value as LlmBackend)}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
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
              </div>

              {/* llm_model */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  Model
                </label>
                <div className="flex gap-2 items-start">
                  <input
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

              {/* llm_temperature */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  Temperature
                </label>
                <div className="flex gap-2 items-start">
                  <input
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
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  Max Tokens
                </label>
                <div className="flex gap-2 items-start">
                  <input
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
            </div>
          </>
        )}
      </div>

      {/* ── Provider Settings Card ────────────────────────────────────────────── */}
      {!loading && (
        <div className="card-base p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
              <Eye size={20} className="text-warning" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{provider.title}</h2>
              <p className="text-xs text-surface-400">{provider.description}</p>
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            {provider.fields.map((f) => (
              <Fragment key={f.field}>
                {/* url fields keep the label above the input row, as before */}
                {f.kind === "url" && (
                  <label className="block text-sm font-medium text-surface-300 mb-1">
                    {f.label}
                  </label>
                )}
                <div className="flex gap-2 items-start">
                  {f.kind === "secret" ? (
                    <div className="flex-1">
                      <SecretInput
                        label={f.label}
                        value={String(form[f.field] ?? "")}
                        onChange={(v) => updateField(f.field, v)}
                        placeholder={f.placeholder}
                        visible={Boolean(visibleFields[f.field])}
                        onToggleVisibility={() => toggleFieldVisibility(f.field)}
                      />
                    </div>
                  ) : (
                    <input
                      className="input-base flex-1"
                      type="url"
                      placeholder={f.placeholder}
                      value={String(form[f.field] ?? "")}
                      onChange={(e) => updateField(f.field, e.target.value)}
                    />
                  )}
                  {isFieldSet(f.field) && (
                    <Button
                      onClick={() => handleStageReset(f.field)}
                      variant="ghost" size="sm"
                      // secret fields: SecretInput renders its own label above the
                      // input, so push the reset button down to the input row
                      className={`rounded-md text-surface-400 hover:text-brand-300 shrink-0 ${f.kind === "secret" ? "mt-7" : "mt-0.5"}`}
                      title="Remove stored value — default will apply on save"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {pendingResets.has(f.field) && (
                  <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                )}
              </Fragment>
            ))}
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
        />
      )}
    </div>
  );
}
