"use client";

import { useEffect, useState, useCallback } from "react";
import { Brain, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { useConfigDirty } from "@/contexts/config-dirty";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgConfigResponse {
  stored: Record<string, unknown>;
}

type LlmBackend = "openai" | "anthropic" | "ollama" | "openai_like" | "openrouter" | "azure";

interface FormState {
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
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LLM_FIELDS: (keyof FormState)[] = [
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

const BACKEND_OPTIONS: { value: LlmBackend; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "azure", label: "Azure OpenAI" },
  { value: "ollama", label: "Ollama" },
  { value: "openai_like", label: "OpenAI-compatible" },
];

const PROVIDER_META: Record<string, { title: string; subtitle: string }> = {
  openai: { title: "OpenAI Settings", subtitle: "API key for OpenAI models" },
  anthropic: { title: "Anthropic Settings", subtitle: "API key for Anthropic models" },
  openrouter: { title: "OpenRouter Settings", subtitle: "API key for OpenRouter" },
  ollama: { title: "Ollama Settings", subtitle: "Local LLM provider configuration" },
  azure: { title: "Azure OpenAI Settings", subtitle: "Azure OpenAI endpoint and credentials" },
  openai_like: { title: "Provider Settings", subtitle: "No additional provider-specific configuration needed" },
};

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

  const { setDirty } = useConfigDirty();

  // Password visibility toggles
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [showAzureKey, setShowAzureKey] = useState(false);

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
      const msg = err instanceof ApiError ? err.message : "Failed to load configuration";
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

  function isFieldSet(field: string): boolean {
    return field in stored;
  }

  function hasChanged(): boolean {
    return LLM_FIELDS.some((f) => form[f] !== initialForm[f]);
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    const newForm = { ...form, [field]: value };
    const dirty = LLM_FIELDS.some((f) => newForm[f] !== initialForm[f]);
    setDirty(dirty);
  }

  // ── Reset field to default ────────────────────────────────────────────────

  async function handleResetField(field: keyof FormState) {
    try {
      await patch("/admin/org/config", { [field]: null });
      toast.success(`"${field}" reset to default`);
      await fetchConfig();
      setDirty(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to reset field";
      toast.error(msg);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!hasChanged()) return;
    setSaving(true);
    setError(null);

    try {
      const changed: Record<string, unknown> = {};
      for (const field of LLM_FIELDS) {
        if (form[field] !== initialForm[field]) {
          changed[field] = form[field];
        }
      }

      await patch("/admin/org/config", changed);
      toast.success("LLM configuration saved successfully");
      await fetchConfig();
      setDirty(false);
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
    setDirty(false);
  }

  // ── Provider meta ──────────────────────────────────────────────────────────

  const provider = PROVIDER_META[form.llm_backend] ?? PROVIDER_META.openai_like;

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
                    {BACKEND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {isFieldSet("llm_backend") && (
                    <Button
                      onClick={() => handleResetField("llm_backend")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset backend provider to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
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
                      onClick={() => handleResetField("llm_model")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset model to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
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
                      onClick={() => handleResetField("llm_temperature")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset temperature to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
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
                      onClick={() => handleResetField("llm_max_tokens")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset max tokens to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
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
              <p className="text-xs text-surface-400">{provider.subtitle}</p>
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            {/* openai_api_key — only when backend is OpenAI */}
            {form.llm_backend === "openai" && (
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  OpenAI API Key
                </label>
                <div className="flex gap-2 items-start">
                  <div className="relative flex-1">
                    <input
                      className="input-base pr-10 w-full"
                      type={showOpenAiKey ? "text" : "password"}
                      placeholder="sk-..."
                      value={form.openai_api_key}
                      onChange={(e) => updateField("openai_api_key", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenAiKey((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                    >
                      {showOpenAiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {isFieldSet("openai_api_key") && (
                    <Button
                      onClick={() => handleResetField("openai_api_key")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset OpenAI API key to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* anthropic_api_key — only when backend is Anthropic */}
            {form.llm_backend === "anthropic" && (
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  Anthropic API Key
                </label>
                <div className="flex gap-2 items-start">
                  <div className="relative flex-1">
                    <input
                      className="input-base pr-10 w-full"
                      type={showAnthropicKey ? "text" : "password"}
                      placeholder="sk-ant-..."
                      value={form.anthropic_api_key}
                      onChange={(e) => updateField("anthropic_api_key", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAnthropicKey((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                    >
                      {showAnthropicKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {isFieldSet("anthropic_api_key") && (
                    <Button
                      onClick={() => handleResetField("anthropic_api_key")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset Anthropic API key to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* openrouter_api_key — only when backend is OpenRouter */}
            {form.llm_backend === "openrouter" && (
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  OpenRouter API Key
                </label>
                <div className="flex gap-2 items-start">
                  <div className="relative flex-1">
                    <input
                      className="input-base pr-10 w-full"
                      type={showOpenRouterKey ? "text" : "password"}
                      placeholder="sk-or-..."
                      value={form.openrouter_api_key}
                      onChange={(e) => updateField("openrouter_api_key", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenRouterKey((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                    >
                      {showOpenRouterKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {isFieldSet("openrouter_api_key") && (
                    <Button
                      onClick={() => handleResetField("openrouter_api_key")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset OpenRouter API key to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ollama_base_url — only when backend is Ollama */}
            {form.llm_backend === "ollama" && (
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  Base URL
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    className="input-base flex-1"
                    type="url"
                    placeholder="http://localhost:11434"
                    value={form.ollama_base_url}
                    onChange={(e) => updateField("ollama_base_url", e.target.value)}
                  />
                  {isFieldSet("ollama_base_url") && (
                    <Button
                      onClick={() => handleResetField("ollama_base_url")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset Ollama base URL to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* azure_openai_endpoint + azure_openai_key — only when backend is Azure */}
            {form.llm_backend === "azure" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1">
                    Endpoint URL
                  </label>
                  <div className="flex gap-2 items-start">
                    <input
                      className="input-base flex-1"
                      type="url"
                      placeholder="https://my-resource.openai.azure.com"
                      value={form.azure_openai_endpoint}
                      onChange={(e) => updateField("azure_openai_endpoint", e.target.value)}
                    />
                    {isFieldSet("azure_openai_endpoint") && (
                      <Button
                        onClick={() => handleResetField("azure_openai_endpoint")}
                        variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                        title="Reset Azure endpoint to default"
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1">
                    API Key
                  </label>
                  <div className="flex gap-2 items-start">
                    <div className="relative flex-1">
                      <input
                        className="input-base pr-10 w-full"
                        type={showAzureKey ? "text" : "password"}
                        placeholder="Azure API key"
                        value={form.azure_openai_key}
                        onChange={(e) => updateField("azure_openai_key", e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAzureKey((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                      >
                        {showAzureKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {isFieldSet("azure_openai_key") && (
                      <Button
                        onClick={() => handleResetField("azure_openai_key")}
                        variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                        title="Reset Azure API key to default"
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
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
