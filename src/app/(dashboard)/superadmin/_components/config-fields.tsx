"use client";

import { useTranslations } from "next-intl";

/**
 * Non-secret system defaults rendered as label + input, shared by the
 * superadmin System Config page and the per-org config page.
 *
 * Field names mirror the org-config `stored` map so the values round-trip
 * through PATCH unchanged. Secrets (API keys) are deliberately NOT listed.
 */

export interface ConfigFieldMeta {
  key: string;
  label: string;
  kind: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  hint?: string;
}

export const SYSTEM_DEFAULT_FIELDS: ConfigFieldMeta[] = [
  {
    key: "llm_backend",
    label: "fields.llmBackend",
    kind: "select",
    options: [
      { value: "openai", label: "OpenAI" },
      { value: "anthropic", label: "Anthropic" },
      { value: "ollama", label: "Ollama" },
      { value: "openai_like", label: "OpenAI-compatible" },
      { value: "openrouter", label: "OpenRouter" },
      { value: "azure", label: "Azure OpenAI" },
    ],
  },
  { key: "llm_model", label: "fields.llmModel", kind: "text" },
  {
    key: "llm_temperature",
    label: "fields.llmTemperature",
    kind: "number",
    hint: "hints.llmTemperature",
  },
  { key: "llm_max_tokens", label: "fields.llmMaxTokens", kind: "number" },
  {
    key: "embedding_backend",
    label: "fields.embeddingBackend",
    kind: "select",
    options: [
      { value: "openai", label: "OpenAI" },
      { value: "ollama", label: "Ollama" },
      { value: "openrouter", label: "OpenRouter" },
      { value: "huggingface", label: "Hugging Face" },
      { value: "sentence_transformers", label: "Sentence Transformers" },
    ],
  },
  { key: "embedding_model", label: "fields.embeddingModel", kind: "text" },
  { key: "embedding_dim", label: "fields.embeddingDimensions", kind: "number" },
  {
    key: "graph_backend",
    label: "fields.graphBackend",
    kind: "select",
    options: [
      { value: "postgres", label: "PostgreSQL (pgvector)" },
      { value: "surrealdb", label: "SurrealDB" },
      { value: "falkordb", label: "FalkorDB" },
      { value: "none", label: "options.noGraphBackend" },
    ],
  },
  {
    key: "graph_search_type",
    label: "fields.graphSearchType",
    kind: "select",
    options: [
      { value: "hybrid", label: "Hybrid (vector + keyword)" },
      { value: "bm25", label: "BM25 (keyword)" },
      { value: "vector", label: "Vector" },
    ],
  },
  { key: "graph_max_traversal_depth", label: "fields.graphMaxTraversalDepth", kind: "number" },
  {
    key: "reranker_backend",
    label: "fields.rerankerBackend",
    kind: "select",
    options: [
      { value: "none", label: "options.noneDisabled" },
      { value: "cohere", label: "Cohere" },
      { value: "voyage", label: "Voyage" },
      { value: "openai", label: "OpenAI" },
    ],
  },
  { key: "reranker_model", label: "fields.rerankerModel", kind: "text" },
  {
    key: "context_cache_ttl",
    label: "fields.contextCacheTtl",
    kind: "number",
    hint: "hints.contextCacheTtl",
  },
];

export function ConfigFields({
  values,
  onChange,
  disabled = false,
}: {
  values: Record<string, unknown>;
  onChange: (key: string, value: string | number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("superadmin.configFields");
  return (
    <div className="space-y-4 max-w-md">
      {SYSTEM_DEFAULT_FIELDS.map((field) => (
        <div key={field.key}>
          <label className="block">
            <span className="block text-sm font-medium text-surface-300 mb-1">
              {t(field.label)}
            </span>
            {field.kind === "select" ? (
              <select
                className="input-base w-full"
                value={String(values[field.key] ?? "")}
                disabled={disabled}
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.label)}
                  </option>
                ))}
              </select>
            ) : field.kind === "number" ? (
              <input
                className="input-base w-full"
                type="number"
                value={String(values[field.key] ?? "")}
                disabled={disabled}
                onChange={(e) => onChange(field.key, parseFloat(e.target.value) || 0)}
              />
            ) : (
              <input
                className="input-base w-full"
                type="text"
                value={String(values[field.key] ?? "")}
                disabled={disabled}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            )}
          </label>
          {field.hint && (
            <p className="text-xs text-surface-500 mt-1">{t(field.hint)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
