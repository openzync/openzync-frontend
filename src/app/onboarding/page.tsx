"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Eye,
  Brain,
  AudioWaveform,
  GitBranch,
  Settings2,
  Save,
  CheckCircle,
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { get, put, getAccessToken } from "@/lib/api-client";
import { SecretInput } from "@/components/ui/secret-input";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UpdateOrgConfigRequest {
  llm_backend?: string | null;
  llm_model?: string | null;
  llm_temperature?: number | null;
  llm_max_tokens?: number | null;
  openai_api_key?: string | null;
  anthropic_api_key?: string | null;
  openrouter_api_key?: string | null;
  ollama_base_url?: string | null;
  azure_openai_endpoint?: string | null;
  azure_openai_key?: string | null;
  embedding_backend?: string | null;
  embedding_model?: string | null;
  embedding_dim?: number | null;
  embedding_api_key?: string | null;
  embedding_provider?: string | null;
  graph_backend?: string | null;
  graph_search_type?: string | null;
  graph_max_traversal_depth?: number | null;
  surrealdb_url?: string | null;
  surrealdb_user?: string | null;
  surrealdb_pass?: string | null;
  surrealdb_namespace?: string | null;
  surrealdb_database?: string | null;
  falkordb_url?: string | null;
  context_cache_ttl?: number | null;
  audit_log_response_body?: boolean | null;
}

type LlmBackend = "openai" | "anthropic" | "ollama" | "openai_like" | "openrouter" | "azure";
type EmbeddingBackend = "openai" | "ollama" | "huggingface" | "sentence_transformers";
type GraphBackend = "postgres" | "surrealdb" | "falkordb" | "none";
type GraphSearchType = "hybrid" | "bm25" | "vector";

// ─── Constants ─────────────────────────────────────────────────────────────────

const LLM_BACKEND_OPTIONS: { value: LlmBackend; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "azure", label: "Azure OpenAI" },
  { value: "ollama", label: "Ollama" },
  { value: "openai_like", label: "OpenAI-compatible" },
];

const EMBEDDING_BACKEND_OPTIONS: { value: EmbeddingBackend; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "ollama", label: "Ollama" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "sentence_transformers", label: "Sentence Transformers" },
];

const GRAPH_BACKEND_OPTIONS: { value: GraphBackend; label: string }[] = [
  { value: "postgres", label: "PostgreSQL (pgvector)" },
  { value: "surrealdb", label: "SurrealDB" },
  { value: "falkordb", label: "FalkorDB" },
  { value: "none", label: "No graph backend" },
];

const SEARCH_TYPE_OPTIONS: { value: GraphSearchType; label: string }[] = [
  { value: "hybrid", label: "Hybrid (vector + keyword)" },
  { value: "bm25", label: "BM25 (keyword)" },
  { value: "vector", label: "Vector" },
];

const STEPS = [
  { title: "LLM Provider", icon: <Brain size={16} /> },
  { title: "Embeddings & Graph", icon: <AudioWaveform size={16} /> },
  { title: "Review & Save", icon: <CheckCircle size={16} /> },
] as const;

const LAST_STEP = STEPS.length - 1;

/** Parse + clamp the ?step= param: non-numeric/negative → 0, too high → last. */
function parseStepParam(raw: string | null): number {
  const parsed = parseInt(raw ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, LAST_STEP);
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
        <div className="text-brand-300">{icon}</div>
      </div>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-surface-400">{description}</p>
      </div>
    </div>
  );
}

// ─── Review Row ────────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-surface-800 last:border-b-0">
      <span className="text-xs text-surface-300">{label}</span>
      <span className="text-sm font-medium text-surface-100 text-right">{value}</span>
    </div>
  );
}

// ─── Main Onboarding Page ──────────────────────────────────────────────────────

export default function OnboardingPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <OnboardingWizard />
    </Suspense>
  );
}

function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(() => parseStepParam(searchParams.get("step")));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password visibility toggles
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [showAzureKey, setShowAzureKey] = useState(false);
  const [showEmbeddingKey, setShowEmbeddingKey] = useState(false);
  const [showSurrealDbPass, setShowSurrealDbPass] = useState(false);

  // ── Form state (lifted to top level — shared by all steps) ─────────────────

  const [form, setForm] = useState<UpdateOrgConfigRequest>({});

  const updateField = useCallback(<K extends keyof UpdateOrgConfigRequest>(
    field: K,
    value: UpdateOrgConfigRequest[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  /** Step changes land in the URL so refresh/deep-link restores position. */
  const goToStep = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(LAST_STEP, next));
      setStep(clamped);
      router.replace(`/onboarding?step=${clamped}`, { scroll: false });
    },
    [router],
  );

  // ── Fetch defaults + stored-config check (independent — run in parallel) ────

  useEffect(() => {
    async function loadDefaults() {
      setLoading(true);
      setError(null);
      try {
        // Redirect if no JWT (user came here directly without signing up)
        if (!getAccessToken()) {
          router.replace("/signup");
          return;
        }

        const [defaultsData, configData] = await Promise.all([
          get<UpdateOrgConfigRequest>("/admin/org/config/defaults"),
          get<{ stored: Record<string, unknown> }>("/admin/org/config"),
        ]);

        // Existing stored config means onboarding already completed
        const hasAnyStored = Object.values(configData.stored).some(
          (v) => v !== null && v !== undefined,
        );
        if (hasAnyStored) {
          router.replace("/overview");
          return;
        }

        setForm(defaultsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load configuration defaults");
      } finally {
        setLoading(false);
      }
    }
    loadDefaults();
  }, [router]);

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);

    try {
      // Surface the RFC 7807 detail (e.g. a missing permission on config save)
      // via ApiError.message.
      await put("/admin/org/config", form);

      toast.success("Configuration saved successfully");
      router.replace("/overview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  // ── Review summary ─────────────────────────────────────────────────────────

  const secretStatus = (value?: string | null) => (value ? "Set" : "Not set");

  const reviewRows: { label: string; value: string }[] = [
    { label: "LLM Backend", value: form.llm_backend ?? "openai" },
    { label: "LLM Model", value: form.llm_model || "Not set" },
    { label: "Temperature", value: String(form.llm_temperature ?? 0) },
    { label: "Max Tokens", value: String(form.llm_max_tokens ?? 4096) },
    { label: "OpenAI API Key", value: secretStatus(form.openai_api_key) },
    { label: "Anthropic API Key", value: secretStatus(form.anthropic_api_key) },
    { label: "OpenRouter API Key", value: secretStatus(form.openrouter_api_key) },
    { label: "Azure OpenAI API Key", value: secretStatus(form.azure_openai_key) },
    ...(form.azure_openai_endpoint ? [{ label: "Azure Endpoint", value: form.azure_openai_endpoint }] : []),
    ...(form.ollama_base_url ? [{ label: "Ollama Base URL", value: form.ollama_base_url }] : []),
    { label: "Embedding Backend", value: form.embedding_backend ?? "openai" },
    { label: "Embedding Model", value: form.embedding_model || "Not set" },
    { label: "Embedding Provider", value: form.embedding_provider || "Not set" },
    { label: "Graph Backend", value: form.graph_backend ?? "postgres" },
    { label: "Search Type", value: form.graph_search_type ?? "hybrid" },
    ...(form.graph_backend === "surrealdb" && form.surrealdb_url
      ? [{ label: "SurrealDB URL", value: form.surrealdb_url }]
      : []),
    ...(form.graph_backend === "falkordb" && form.falkordb_url
      ? [{ label: "FalkorDB URL", value: form.falkordb_url }]
      : []),
    { label: "Max Traversal Depth", value: String(form.graph_max_traversal_depth ?? 2) },
    { label: "Context Cache TTL", value: `${form.context_cache_ttl ?? 300}s` },
    { label: "Audit Log Response Body", value: form.audit_log_response_body ? "Enabled" : "Disabled" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-brand-500" />
          <p className="text-sm text-surface-400">Loading configuration defaults...</p>
        </div>
      </div>
    );
  }

  const anyApiKeyEmpty = !form.openai_api_key && !form.anthropic_api_key && !form.openrouter_api_key && !form.azure_openai_key;

  return (
    <div className="min-h-screen bg-surface-950">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-brand-500 font-bold text-3xl">O</span>
            <span className="text-2xl font-bold text-text-primary">OpenZync</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Complete Your Setup</h1>
          <p className="text-sm text-surface-400 mt-1 max-w-md mx-auto">
            Configure your organization&apos;s LLM, embeddings, graph, and behaviour settings.
            Secrets like API keys must be filled in before you can use the platform.
          </p>
        </div>

        {/* ── Stepper header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <ol className="flex items-center gap-2 sm:gap-3">
            {STEPS.map((s, i) => {
              const isActive = step === i;
              const isDone = i < step;
              return (
                <li key={s.title} className="flex items-center gap-2 sm:gap-3">
                  {i > 0 && <div className="h-px w-6 sm:w-12 bg-surface-700" aria-hidden="true" />}
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold shrink-0",
                      isActive && "bg-brand-500/10 border-brand-500 text-brand-300",
                      isDone && "bg-brand-500/10 border-brand-500/40 text-brand-300",
                      !isActive && !isDone && "bg-surface-900 border-surface-700 text-surface-300",
                    )}
                  >
                    {isDone ? <Check size={14} /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "hidden sm:block text-xs font-medium",
                      isActive ? "text-brand-300" : isDone ? "text-surface-200" : "text-surface-300",
                    )}
                  >
                    {s.title}
                  </span>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={() => router.replace("/overview")}
            className="shrink-0 text-xs text-surface-300 hover:text-surface-100 underline-offset-4 hover:underline transition-colors"
          >
            Skip for now
          </button>
        </div>

        {/* ── Global error (load failures only — save failures surface as toasts) ── */}
        {error && (
          <div className="mb-6 rounded-md bg-error/10 border border-error/30 px-4 py-3 text-sm text-error flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* ── Step 1: LLM Provider ─────────────────────────────────────────────── */}
        {step === 0 && (
          <>
            {anyApiKeyEmpty && (
              <div className="mb-6 rounded-md bg-warning/10 border border-warning/30 px-4 py-3 text-sm text-warning flex items-center gap-2">
                <AlertCircle size={14} />
                At least one LLM API key is required to use the platform. Fill in the key for your chosen provider below.
              </div>
            )}

            <div className="card-base p-6 mb-6">
              <SectionHeader icon={<Brain size={20} />} title="LLM Configuration" description="Primary language model provider" />

              <div className="space-y-4 max-w-md">
                {/* llm_backend */}
                <Field label="Backend Provider" htmlFor="onb-llm-backend">
                  <select
                    id="onb-llm-backend"
                    className="input-base w-full"
                    value={form.llm_backend ?? "openai"}
                    onChange={(e) => updateField("llm_backend", e.target.value)}
                  >
                    {LLM_BACKEND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Field>

                {/* llm_model */}
                <Field label="Model" htmlFor="onb-llm-model">
                  <input
                    id="onb-llm-model"
                    className="input-base w-full"
                    placeholder="gpt-4o-mini, claude-sonnet-4, ..."
                    value={form.llm_model ?? ""}
                    onChange={(e) => updateField("llm_model", e.target.value)}
                  />
                </Field>

                <div className="flex gap-4">
                  {/* llm_temperature */}
                  <Field label="Temperature" htmlFor="onb-llm-temperature" className="flex-1">
                    <input
                      id="onb-llm-temperature"
                      className="input-base w-full"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={form.llm_temperature ?? 0}
                      onChange={(e) => updateField("llm_temperature", parseFloat(e.target.value) || 0)}
                    />
                  </Field>

                  {/* llm_max_tokens */}
                  <Field label="Max Tokens" htmlFor="onb-llm-max-tokens" className="flex-1">
                    <input
                      id="onb-llm-max-tokens"
                      className="input-base w-full"
                      type="number"
                      min="1"
                      value={form.llm_max_tokens ?? 4096}
                      onChange={(e) => updateField("llm_max_tokens", parseInt(e.target.value) || 0)}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="card-base p-6 mb-6">
              <SectionHeader
                icon={<Eye size={20} />}
                title="API Keys"
                description="Credentials for LLM providers — fill in the key for your chosen provider"
              />

              <div className="space-y-4 max-w-md">
                <SecretInput
                  id="onb-openai-key"
                  label="OpenAI API Key"
                  value={form.openai_api_key ?? ""}
                  onChange={(v) => updateField("openai_api_key", v)}
                  placeholder="sk-..."
                  visible={showOpenAiKey}
                  onToggleVisibility={() => setShowOpenAiKey((prev) => !prev)}
                />
                <SecretInput
                  id="onb-anthropic-key"
                  label="Anthropic API Key"
                  value={form.anthropic_api_key ?? ""}
                  onChange={(v) => updateField("anthropic_api_key", v)}
                  placeholder="sk-ant-..."
                  visible={showAnthropicKey}
                  onToggleVisibility={() => setShowAnthropicKey((prev) => !prev)}
                />
                <SecretInput
                  id="onb-openrouter-key"
                  label="OpenRouter API Key"
                  value={form.openrouter_api_key ?? ""}
                  onChange={(v) => updateField("openrouter_api_key", v)}
                  placeholder="sk-or-..."
                  visible={showOpenRouterKey}
                  onToggleVisibility={() => setShowOpenRouterKey((prev) => !prev)}
                />
                <SecretInput
                  id="onb-azure-key"
                  label="Azure OpenAI API Key"
                  value={form.azure_openai_key ?? ""}
                  onChange={(v) => updateField("azure_openai_key", v)}
                  placeholder="Azure API key"
                  visible={showAzureKey}
                  onToggleVisibility={() => setShowAzureKey((prev) => !prev)}
                />
                <Field label="Azure OpenAI Endpoint" htmlFor="onb-azure-endpoint">
                  <input
                    id="onb-azure-endpoint"
                    className="input-base w-full"
                    type="url"
                    placeholder="https://my-resource.openai.azure.com"
                    value={form.azure_openai_endpoint ?? ""}
                    onChange={(e) => updateField("azure_openai_endpoint", e.target.value)}
                  />
                </Field>
                <Field label="Ollama Base URL" htmlFor="onb-ollama-url">
                  <input
                    id="onb-ollama-url"
                    className="input-base w-full"
                    type="url"
                    placeholder="http://localhost:11434"
                    value={form.ollama_base_url ?? ""}
                    onChange={(e) => updateField("ollama_base_url", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Embeddings & Graph ───────────────────────────────────────── */}
        {step === 1 && (
          <>
            <div className="card-base p-6 mb-6">
              <SectionHeader icon={<AudioWaveform size={20} />} title="Embeddings" description="Vector embedding model configuration" />

              <div className="space-y-4 max-w-md">
                {/* embedding_backend */}
                <Field label="Backend Provider" htmlFor="onb-embedding-backend">
                  <select
                    id="onb-embedding-backend"
                    className="input-base w-full"
                    value={form.embedding_backend ?? "openai"}
                    onChange={(e) => updateField("embedding_backend", e.target.value)}
                  >
                    {EMBEDDING_BACKEND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Field>

                {/* embedding_model */}
                <Field label="Model" htmlFor="onb-embedding-model">
                  <input
                    id="onb-embedding-model"
                    className="input-base w-full"
                    placeholder="text-embedding-3-small, ..."
                    value={form.embedding_model ?? ""}
                    onChange={(e) => updateField("embedding_model", e.target.value)}
                  />
                </Field>

                <div className="flex gap-4">
                  {/* embedding_dim */}
                  <Field label="Embedding Dimensions" htmlFor="onb-embedding-dim" className="flex-1">
                    <input
                      id="onb-embedding-dim"
                      className="input-base w-full"
                      type="number"
                      min="64"
                      max="4096"
                      value={form.embedding_dim ?? 1536}
                      onChange={(e) => updateField("embedding_dim", parseInt(e.target.value) || 0)}
                    />
                  </Field>

                  {/* embedding_provider */}
                  <Field label="Provider Name" htmlFor="onb-embedding-provider" className="flex-1">
                    <input
                      id="onb-embedding-provider"
                      className="input-base w-full"
                      placeholder="openai, azure, ..."
                      value={form.embedding_provider ?? ""}
                      onChange={(e) => updateField("embedding_provider", e.target.value)}
                    />
                  </Field>
                </div>

                {/* embedding_api_key */}
                <SecretInput
                  id="onb-embedding-key"
                  label="Embedding API Key"
                  value={form.embedding_api_key ?? ""}
                  onChange={(v) => updateField("embedding_api_key", v)}
                  placeholder="Embedding provider API key"
                  visible={showEmbeddingKey}
                  onToggleVisibility={() => setShowEmbeddingKey((prev) => !prev)}
                />
              </div>
            </div>

            <div className="card-base p-6 mb-6">
              <SectionHeader icon={<GitBranch size={20} />} title="Knowledge Graph" description="Graph backend, search, and traversal settings" />

              <div className="space-y-4 max-w-md">
                {/* graph_backend */}
                <Field label="Graph Backend" htmlFor="onb-graph-backend">
                  <select
                    id="onb-graph-backend"
                    className="input-base w-full"
                    value={form.graph_backend ?? "postgres"}
                    onChange={(e) => updateField("graph_backend", e.target.value)}
                  >
                    {GRAPH_BACKEND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Field>

                {/* graph_search_type */}
                <Field label="Search Type" htmlFor="onb-graph-search-type">
                  <select
                    id="onb-graph-search-type"
                    className="input-base w-full"
                    value={form.graph_search_type ?? "hybrid"}
                    onChange={(e) => updateField("graph_search_type", e.target.value)}
                  >
                    {SEARCH_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Field>

                {/* SurrealDB connection fields — conditionally shown */}
                {(form.graph_backend === "surrealdb") && (
                  <div className="space-y-4">
                    <Field
                      label="SurrealDB URL"
                      htmlFor="onb-surrealdb-url"
                      hint="Required when using SurrealDB backend"
                    >
                      <input
                        id="onb-surrealdb-url"
                        className="input-base w-full"
                        type="url"
                        placeholder="ws://surrealdb:8000/rpc"
                        value={form.surrealdb_url ?? ""}
                        onChange={(e) => updateField("surrealdb_url", e.target.value)}
                      />
                    </Field>
                    <Field label="SurrealDB Username" htmlFor="onb-surrealdb-user">
                      <input
                        id="onb-surrealdb-user"
                        className="input-base w-full"
                        type="text"
                        placeholder="SurrealDB username"
                        value={form.surrealdb_user ?? ""}
                        onChange={(e) => updateField("surrealdb_user", e.target.value)}
                      />
                    </Field>
                    <SecretInput
                      id="onb-surrealdb-pass"
                      label="SurrealDB Password"
                      value={form.surrealdb_pass ?? ""}
                      onChange={(v) => updateField("surrealdb_pass", v)}
                      placeholder="SurrealDB password"
                      visible={showSurrealDbPass}
                      onToggleVisibility={() => setShowSurrealDbPass((prev) => !prev)}
                    />
                    <Field label="SurrealDB Namespace" htmlFor="onb-surrealdb-namespace">
                      <input
                        id="onb-surrealdb-namespace"
                        className="input-base w-full"
                        type="text"
                        placeholder="SurrealDB namespace"
                        value={form.surrealdb_namespace ?? ""}
                        onChange={(e) => updateField("surrealdb_namespace", e.target.value)}
                      />
                    </Field>
                    <Field label="SurrealDB Database" htmlFor="onb-surrealdb-database">
                      <input
                        id="onb-surrealdb-database"
                        className="input-base w-full"
                        type="text"
                        placeholder="SurrealDB database"
                        value={form.surrealdb_database ?? ""}
                        onChange={(e) => updateField("surrealdb_database", e.target.value)}
                      />
                    </Field>
                  </div>
                )}

                {/* FalkorDB URL — shown only when FalkorDB is selected */}
                {form.graph_backend === "falkordb" && (
                  <Field
                    label="FalkorDB URL"
                    htmlFor="onb-falkordb-url"
                    hint="Required when using FalkorDB backend and no system-level config exists. If FalkorDB is configured at the system level, this field is ignored."
                  >
                    <input
                      id="onb-falkordb-url"
                      className="input-base w-full"
                      type="url"
                      placeholder="redis://falkordb:6379"
                      value={form.falkordb_url ?? ""}
                      onChange={(e) => updateField("falkordb_url", e.target.value)}
                    />
                  </Field>
                )}

                {/* graph_max_traversal_depth */}
                <Field
                  label="Max Traversal Depth"
                  htmlFor="onb-graph-depth"
                  hint="How many hops the graph traversal will follow (1–10)"
                >
                  <input
                    id="onb-graph-depth"
                    className="input-base w-full"
                    type="number"
                    min="1"
                    max="10"
                    value={form.graph_max_traversal_depth ?? 2}
                    onChange={(e) => updateField("graph_max_traversal_depth", parseInt(e.target.value) || 1)}
                  />
                </Field>
              </div>
            </div>

            <div className="card-base p-6 mb-6">
              <SectionHeader icon={<Settings2 size={20} />} title="Behaviour" description="Caching and audit behaviour" />

              <div className="space-y-4 max-w-md">
                {/* context_cache_ttl */}
                <Field
                  label="Context Cache TTL (seconds)"
                  htmlFor="onb-cache-ttl"
                  hint="How long context data is cached in Redis before being re-fetched (0 = no caching)"
                >
                  <input
                    id="onb-cache-ttl"
                    className="input-base w-full"
                    type="number"
                    min="0"
                    value={form.context_cache_ttl ?? 300}
                    onChange={(e) => updateField("context_cache_ttl", parseInt(e.target.value) || 0)}
                  />
                </Field>

                {/* audit_log_response_body */}
                <div className="pt-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <Label htmlFor="onb-audit-log-body" className="mb-1">
                        Audit Log Response Body
                      </Label>
                      <p className="text-xs text-surface-500">Include response body content in audit logs</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Checkbox
                        id="onb-audit-log-body"
                        checked={form.audit_log_response_body ?? false}
                        onCheckedChange={(checked) =>
                          updateField("audit_log_response_body", checked === true)
                        }
                      />
                      <span className="text-sm text-surface-300">
                        {form.audit_log_response_body ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Review & Save ────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="card-base p-6 mb-6">
            <SectionHeader icon={<CheckCircle size={20} />} title="Review & Save" description="Confirm your configuration before saving" />
            <div>
              {reviewRows.map((row) => (
                <ReviewRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>
        )}

        {/* ── Footer actions ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 pb-10">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => goToStep(step - 1)}
            disabled={step === 0 || saving}
          >
            <ChevronLeft size={16} />
            Back
          </Button>
          {step < LAST_STEP ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => goToStep(step + 1)}
              disabled={saving || (step === 0 && anyApiKeyEmpty)}
            >
              Next
              <ChevronRight size={16} />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {saving ? "Saving..." : "Save & Continue"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
