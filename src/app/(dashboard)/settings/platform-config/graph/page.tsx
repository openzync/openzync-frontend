"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { ApiError, getMyConfig, updateMyConfig } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { SimpleSelect } from "@/components/ui/select";
import { useConfigDirty } from "@/contexts/config-dirty";
import { useConfigReset } from "@/hooks/use-config-reset";

// ─── Types ─────────────────────────────────────────────────────────────────────

/** What the config fetcher hands to the render-phase form seed. */
interface ConfigData {
  stored: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

type GraphBackend = "surrealdb" | "falkordb" | "none";
type GraphSearchType = "hybrid" | "bm25" | "vector";

interface FormState {
  graph_backend: GraphBackend;
  graph_search_type: GraphSearchType;
  graph_max_traversal_depth: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FIELDS: (keyof FormState)[] = [
  "graph_backend",
  "graph_search_type",
  "graph_max_traversal_depth",
];

const GRAPH_BACKEND_OPTIONS: { value: GraphBackend; label: string }[] = [
  { value: "falkordb", label: "FalkorDB" },
  { value: "surrealdb", label: "SurrealDB" },
  { value: "none", label: "No graph backend" },
];

const SEARCH_TYPE_OPTIONS: { value: GraphSearchType; label: string }[] = [
  { value: "hybrid", label: "Hybrid (vector + keyword)" },
  { value: "bm25", label: "BM25 (keyword)" },
  { value: "vector", label: "Vector" },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GraphConfigPage() {
  const { setDirty } = useConfigDirty();
  const [form, setForm] = useState<FormState>({
    graph_backend: "falkordb",
    graph_search_type: "hybrid",
    graph_max_traversal_depth: 3,
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  // Save failures share the banner with load errors; cleared when a fetch
  // succeeds so a retry visibly resolves.
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const {
    pendingResets,
    stageReset,
    hasPendingResets,
    getSavePayload,
    clearResets,
  } = useConfigReset(
    FIELDS as unknown as readonly string[],
    initialForm as unknown as Record<string, unknown>,
    setForm as unknown as React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
  );

  // ── Fetch config ──────────────────────────────────────────────────────────

  const configQuery = useApiQuery<ConfigData>(async () => {
    const mine = await getMyConfig();
    const stored = (mine.override ?? {}) as Record<string, unknown>;
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
    const current: FormState = {
      graph_backend: val("graph_backend", "falkordb") as GraphBackend,
      graph_search_type: val("graph_search_type", "hybrid") as GraphSearchType,
      graph_max_traversal_depth: val("graph_max_traversal_depth", 3) as number,
    };
    setForm(current);
    setInitialForm(current);
    setStored(stored);
    setActionError(null);
  }

  const isPostgresSelected = (form as unknown as { graph_backend: string }).graph_backend === "postgres";
  const isStoredPostgres = stored["graph_backend"] === "postgres";
  const showPostgresBanner = isPostgresSelected || isStoredPostgres;

  const loading = configQuery.isLoading;
  const error = configQuery.error ?? actionError;

  // ── Field helpers ─────────────────────────────────────────────────────────

  function isFieldSet(field: string): boolean {
    return field in stored;
  }

  function hasChanged(): boolean {
    return hasPendingResets || FIELDS.some((f) => form[f] !== initialForm[f]);
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(value !== initialForm[field] || FIELDS.some((f) => f !== field && form[f] !== initialForm[f]));
  }

  // ── Stage reset (applied on next save) ─────────────────────────────────────

  function handleStageReset(field: keyof FormState) {
    const defaultVal = typeof initialForm[field] === "number" ? (0 as FormState[keyof FormState]) : ("" as FormState[keyof FormState]);
    stageReset(field as string, defaultVal);
    setDirty(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if ((form as unknown as { graph_backend: string }).graph_backend === "postgres") {
      setActionError("PostgreSQL graph backend is deprecated and will be removed in v1.1.0. Migrate to falkordb. Saving with PostgreSQL is blocked.");
      toast.error("PostgreSQL graph backend is deprecated — saving blocked. Migrate to FalkorDB.");
      return;
    }
    if (!hasChanged()) return;
    setSaving(true);

    try {
      const payload = getSavePayload(form as unknown as Record<string, unknown>);
      if (Object.keys(payload).length === 0) return;

      await updateMyConfig(payload);
      toast.success("Graph configuration saved successfully");
      setDirty(false);
      clearResets();
      configQuery.refetch();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save configuration";
      setActionError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setForm({ ...initialForm });
    clearResets();
    setDirty(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Graph Configuration Card ──────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="mb-6">
          <h2 className="font-display text-base font-medium">Graph Settings</h2>
          <p className="text-xs text-surface-400">Knowledge graph search and traversal</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
          </div>
        ) : (
          <>
            {error && <ErrorState message={error} onRetry={configQuery.refetch} />}
            {showPostgresBanner && (
              <div
                role="alert"
                data-testid="postgres-deprecated-banner"
                className="rounded-lg border border-red-500/50 bg-red-950/40 px-4 py-3"
              >
                <p className="text-sm font-semibold text-red-300">
                  PostgreSQL graph backend is deprecated and will be removed in v1.1.0. Migrate to FalkorDB.
                  Saving with PostgreSQL is blocked.
                </p>
              </div>
            )}
            <div className={error || showPostgresBanner ? "space-y-4 max-w-md mt-4" : "space-y-4 max-w-md"}>
              {/* graph_backend */}
              <div>
                <label htmlFor="graph-backend" className="block text-sm font-medium text-surface-300 mb-1">
                  Graph Backend
                </label>
                <div className="flex gap-2 items-start">
                  <SimpleSelect
                    id="graph-backend"
                    className="flex-1"
                    options={GRAPH_BACKEND_OPTIONS}
                    value={form.graph_backend}
                    onValueChange={(value) => updateField("graph_backend", value as GraphBackend)}
                  />
                      {isFieldSet("graph_backend") && (
                        <Button
                          onClick={() => handleStageReset("graph_backend")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                </div>
              </div>
              {pendingResets.has("graph_backend") && (
                <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
              )}

              {/* search type + traversal depth — hidden when backend is "none" */}
              {form.graph_backend !== "none" && (
                <>
                  {/* graph_search_type */}
                  <div>
                    <label htmlFor="graph-search-type" className="block text-sm font-medium text-surface-300 mb-1">
                      Search Type
                    </label>
                    <div className="flex gap-2 items-start">
                      <SimpleSelect
                        id="graph-search-type"
                        className="flex-1"
                        options={SEARCH_TYPE_OPTIONS}
                        value={form.graph_search_type}
                        onValueChange={(value) => updateField("graph_search_type", value as GraphSearchType)}
                      />
                      {isFieldSet("graph_search_type") && (
                        <Button
                          onClick={() => handleStageReset("graph_search_type")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                  {pendingResets.has("graph_search_type") && (
                    <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                  )}

                  {/* graph_max_traversal_depth */}
                  <div>
                    <label htmlFor="graph-max-traversal-depth" className="block text-sm font-medium text-surface-300 mb-1">
                      Max Traversal Depth
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="graph-max-traversal-depth"
                        className="input-base flex-1"
                        type="number"
                        min="1"
                        max="10"
                        value={form.graph_max_traversal_depth}
                        onChange={(e) => updateField("graph_max_traversal_depth", parseInt(e.target.value) || 1)}
                      />
                      {isFieldSet("graph_max_traversal_depth") && (
                        <Button
                          onClick={() => handleStageReset("graph_max_traversal_depth")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-surface-500 mt-1">How many hops the graph traversal will follow (1&ndash;10)</p>
                  </div>
                  {pendingResets.has("graph_max_traversal_depth") && (
                    <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                  )}
                </>
              )}

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
          onDiscard={handleDiscard}
          saveDisabled={isPostgresSelected}
        />
      )}
    </div>
  );
}
