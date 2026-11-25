"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ApiError, getMyConfig, updateMyConfig } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { useConfigDirty } from "@/contexts/config-dirty";

// ─── Types ─────────────────────────────────────────────────────────────────────

/** What the config fetcher hands to the render-phase form seed. */
interface ConfigData {
  stored: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

interface FormState {
  entities: boolean;
  embedding: boolean;
  facts: boolean;
  entity_links: boolean;
  classification: boolean;
  structured: boolean;
  observations: boolean;
  blob_text: boolean;
  llm_invalidation: boolean;
}

const FIELDS: (keyof FormState)[] = [
  "entities",
  "embedding",
  "facts",
  "entity_links",
  "classification",
  "structured",
  "observations",
  "blob_text",
  "llm_invalidation",
];

// ─── Fallback values (mirrors backend all-ON) ─────────────────────────────────
// Backend resolves any key missing from every layer to True
// (core/enrichment_config._ALL_ON + org_config.yaml) — these double as the
// last-resort display fallback when neither the override nor the effective
// view carries a key.

const DEFAULTS: FormState = {
  entities: true,
  embedding: true,
  facts: true,
  entity_links: true,
  classification: true,
  structured: true,
  observations: true,
  blob_text: true,
  llm_invalidation: true,
};

// ─── Field metadata (label + hint) ─────────────────────────────────────────────

interface FieldMeta {
  label: string;
  hint: string;
}

const FIELD_META: Record<keyof FormState, FieldMeta> = {
  entities: {
    label: "Entity extraction",
    hint: "Extract named entities (people, places, orgs) from each episode. Required by facts and entity links.",
  },
  embedding: {
    label: "Embeddings",
    hint: "Generate vector embeddings for semantic search. Disabling removes the episode from vector recall.",
  },
  facts: {
    label: "Fact extraction",
    hint: "Extract durable facts linked to entities. Requires entity extraction.",
  },
  entity_links: {
    label: "Entity linking",
    hint: "Link mentions to canonical graph nodes. Requires entity extraction.",
  },
  classification: {
    label: "Classification",
    hint: "Classify intent, emotion and dialogue acts per episode.",
  },
  structured: {
    label: "Structured extraction",
    hint: "Run configured JSON schemas against episode text.",
  },
  observations: {
    label: "Observations",
    hint: "Record temporal and contextual observations per episode.",
  },
  blob_text: {
    label: "Blob text extraction",
    hint: "Extract text from attached files (PDF, images) for enrichment.",
  },
  llm_invalidation: {
    label: "LLM invalidation",
    hint: "Let the LLM invalidate stale facts when contradicted. Requires fact extraction.",
  },
};

// ─── Hard validation (mirrors backend validate_enrichment_combo: ─────────────
// ─── facts → entities, entity_links → entities, llm_invalidation → facts, ───
// ─── embedding incompatible with vector/hybrid search) ───────────────────────

function validateEnrichment(form: FormState, searchType: string): string | null {
  if (form.facts && !form.entities)
    return "Fact extraction requires entity extraction — enable entities first.";
  if (form.entity_links && !form.entities)
    return "Entity linking requires entity extraction — enable entities first.";
  if (form.llm_invalidation && !form.facts)
    return "LLM invalidation requires fact extraction — enable facts first.";
  if (!form.embedding && (searchType === "vector" || searchType === "hybrid"))
    return `Embeddings cannot be disabled when search type is '${searchType}' — retrieval would lose its vector leg. Switch to BM25 first.`;
  return null;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function EnrichmentConfigPage() {
  const { setDirty } = useConfigDirty();
  const [form, setForm] = useState<FormState>({ ...DEFAULTS });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [saving, setSaving] = useState(false);
  // Effective search type (same config query) — embeddings-off is blocked
  // while this is vector/hybrid. Defaults to hybrid, matching the backend
  // onboarding default (org_config.yaml).
  const [searchType, setSearchType] = useState<string>("hybrid");
  // Save failures share the banner with load errors; cleared when a fetch
  // succeeds so a retry visibly resolves.
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // ── Fetch config ──────────────────────────────────────────────────────────

  const configQuery = useApiQuery<ConfigData>(async () => {
    const data = await getMyConfig();
    const stored = (data.override ?? {}) as Record<string, unknown>;
    // `effective` is the merged user ⊕ system view — for keys without an
    // override it carries the system default, so it doubles as the defaults
    // layer (same stored ?? defaults ?? fallback pattern as graph/page.tsx).
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
    // Backend nests toggles under `enrichment:{...}` on OrgConfig /
    // SystemConfig — read that dict, not flat top-level keys.
    const storedEnrichment = (stored.enrichment ?? {}) as Record<string, unknown>;
    const defaultsEnrichment = (defaults.enrichment ?? {}) as Record<string, unknown>;
    const val = (field: string, fallback: unknown) =>
      (storedEnrichment[field] as unknown) ?? (defaultsEnrichment[field] as unknown) ?? fallback;
    const current: FormState = {
      entities: val("entities", true) as boolean,
      embedding: val("embedding", true) as boolean,
      facts: val("facts", true) as boolean,
      entity_links: val("entity_links", true) as boolean,
      classification: val("classification", true) as boolean,
      structured: val("structured", true) as boolean,
      observations: val("observations", true) as boolean,
      blob_text: val("blob_text", true) as boolean,
      llm_invalidation: val("llm_invalidation", true) as boolean,
    };
    setForm(current);
    setInitialForm(current);
    setSearchType(
      ((defaults.graph_search_type ?? stored.graph_search_type ?? "hybrid") as string).toLowerCase(),
    );
    setActionError(null);
  }

  const loading = configQuery.isLoading;
  const error = configQuery.error ?? actionError;

  // ── Field helpers ─────────────────────────────────────────────────────────

  function hasChanged(): boolean {
    return FIELDS.some((f) => form[f] !== initialForm[f]);
  }

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(
      value !== initialForm[field] ||
        FIELDS.some((f) => f !== field && form[f] !== initialForm[f]),
    );
  }

  // ── Dependency disables ───────────────────────────────────────────────────

  const factsDisabled = !form.entities;
  const entityLinksDisabled = !form.entities;
  const llmInvalidationDisabled = !form.facts;
  // Embeddings feed the vector leg — switching them off while retrieval
  // needs vectors would silently degrade search (backend 422s this combo).
  const embeddingBlocked = searchType === "vector" || searchType === "hybrid";

  function isDisabled(field: keyof FormState): boolean {
    if (field === "facts") return factsDisabled;
    if (field === "entity_links") return entityLinksDisabled;
    if (field === "llm_invalidation") return llmInvalidationDisabled;
    // Block switching off only — a violating off-state stays editable so
    // the user can switch it back on.
    if (field === "embedding") return embeddingBlocked && form.embedding;
    return false;
  }

  function dependencyHint(field: keyof FormState): string | null {
    if (field === "facts" && factsDisabled)
      return "Disabled — enable entity extraction first (facts requires entities).";
    if (field === "entity_links" && entityLinksDisabled)
      return "Disabled — enable entity extraction first (entity links requires entities).";
    if (field === "llm_invalidation" && llmInvalidationDisabled)
      return "Disabled — enable fact extraction first (LLM invalidation requires facts).";
    if (field === "embedding" && embeddingBlocked)
      return form.embedding
        ? `Disabled — embeddings are required while search type is '${searchType}'. Switch to BM25 on the Graph page to turn them off.`
        : `Embeddings are off but search type is '${searchType}' — saving is blocked until embeddings are re-enabled or the search type changes.`;
    return null;
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!hasChanged()) {
      toast.info("No changes to save");
      return;
    }
    const violation = validateEnrichment(form, searchType);
    if (violation) {
      toast.error(violation);
      return;
    }
    setSaving(true);

    try {
      const changed: Record<string, boolean> = {};
      for (const f of FIELDS) {
        if (form[f] !== initialForm[f]) changed[f] = form[f];
      }
      // Backend expects the nested `enrichment:{...}` dict (OrgConfig /
      // SystemConfig shape). Skip an empty dict so we don't write a noisy
      // `enrichment: {}` override (missing keys already resolve to the
      // all-ON default).
      await updateMyConfig({
        ...(Object.keys(changed).length > 0 ? { enrichment: changed } : {}),
      });

      toast.success("Enrichment configuration saved successfully");
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
      {/* ── Enrichment Configuration Card ─────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="mb-6">
          <h2 className="font-display text-base font-medium">Enrichment Settings</h2>
          <p className="text-xs text-surface-400">
            Per-episode enrichment pipeline toggles
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {FIELDS.map((f) => (
              <div key={f} className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            ))}
          </div>
        ) : (
          <>
            {error && <ErrorState message={error} onRetry={configQuery.refetch} />}
            <div className="space-y-4 max-w-md">
              {FIELDS.map((field) => {
                const meta = FIELD_META[field];
                const disabled = isDisabled(field);
                const depHint = dependencyHint(field);
                const fieldId = `enrichment-${field.replace(/_/g, "-")}`;
                return (
                  <div key={field} className="pt-2 first:pt-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <label htmlFor={fieldId} className="block text-sm font-medium text-surface-300 mb-1">
                          {meta.label}
                        </label>
                        <p className="text-xs text-surface-500">{meta.hint}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <label htmlFor={fieldId} className={`flex items-center gap-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                          <input
                            id={fieldId}
                            type="checkbox"
                            className="rounded border-surface-600 bg-surface-800 text-brand-500"
                            checked={form[field]}
                            disabled={disabled}
                            onChange={(e) =>
                              updateField(field, e.target.checked)
                            }
                          />
                          <span className="text-sm text-surface-300">
                            {form[field] ? "Enabled" : "Disabled"}
                          </span>
                        </label>
                      </div>
                    </div>
                    {depHint && (
                      <p className="text-xs text-amber-400 mt-1">{depHint}</p>
                    )}
                  </div>
                );
              })}
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
            setForm({ ...initialForm });
            setDirty(false);
          }}
        />
      )}
    </div>
  );
}
