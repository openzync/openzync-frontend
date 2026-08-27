"use client";

import { useState } from "react";
import { toast } from "sonner";
import { GitBranch, RotateCcw } from "lucide-react";
import { get, patch, ApiError } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { SecretInput } from "@/components/ui/secret-input";
import { SimpleSelect } from "@/components/ui/select";
import { useConfigDirty } from "@/contexts/config-dirty";
import { useConfigReset } from "@/hooks/use-config-reset";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgConfigResponse {
  stored: Record<string, unknown>;
  system_managed_fields?: string[];
}

/** What the config fetcher hands to the render-phase form seed. */
interface OrgConfigData {
  stored: Record<string, unknown>;
  defaults: Record<string, unknown>;
  systemManaged: string[];
}

type GraphBackend = "postgres" | "surrealdb" | "falkordb" | "none";
type GraphSearchType = "hybrid" | "bm25" | "vector";

interface FormState {
  graph_backend: GraphBackend;
  graph_search_type: GraphSearchType;
  graph_max_traversal_depth: number;
  surrealdb_url: string;
  surrealdb_user: string;
  surrealdb_pass: string;
  surrealdb_namespace: string;
  surrealdb_database: string;
  falkordb_url: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FIELDS: (keyof FormState)[] = [
  "graph_backend",
  "graph_search_type",
  "graph_max_traversal_depth",
  "surrealdb_url",
  "surrealdb_user",
  "surrealdb_pass",
  "surrealdb_namespace",
  "surrealdb_database",
  "falkordb_url",
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

// ─── Reset field titles ────────────────────────────────────────────────────────

const RESET_TITLES: Partial<Record<keyof FormState, string>> = {
  graph_backend: "Reset graph backend to default",
  graph_search_type: "Reset search type to default",
  graph_max_traversal_depth: "Reset max traversal depth to default",
  surrealdb_url: "Reset SurrealDB URL to default",
  surrealdb_user: "Reset SurrealDB username to default",
  surrealdb_pass: "Reset SurrealDB password to default",
  surrealdb_namespace: "Reset SurrealDB namespace to default",
  surrealdb_database: "Reset SurrealDB database to default",
  falkordb_url: "Reset FalkorDB URL to default",
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GraphConfigPage() {
  const { setDirty } = useConfigDirty();
  const [form, setForm] = useState<FormState>({
    graph_backend: "postgres",
    graph_search_type: "hybrid",
    graph_max_traversal_depth: 3,
    surrealdb_url: "",
    surrealdb_user: "",
    surrealdb_pass: "",
    surrealdb_namespace: "",
    surrealdb_database: "",
    falkordb_url: "",
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  // Save failures share the banner with load errors; cleared when a fetch
  // succeeds so a retry visibly resolves.
  const [actionError, setActionError] = useState<string | null>(null);
  const [systemManaged, setSystemManaged] = useState<string[]>([]);
  const [showSurrealDbPass, setShowSurrealDbPass] = useState(false);
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

  const configQuery = useApiQuery<OrgConfigData>(async () => {
    const data = await get<OrgConfigResponse>("/admin/org/config");
    const stored = (data.stored ?? {}) as Record<string, unknown>;
    const hasAnyStored = FIELDS.some((f) => stored[f] != null);

    // If no stored values exist for this tab, pull onboarding defaults from API
    const defaults = hasAnyStored
      ? {}
      : await get<Record<string, unknown>>("/admin/org/config/defaults").catch(
          () => ({}) as Record<string, unknown>,
        );

    return { stored, defaults, systemManaged: data.system_managed_fields ?? [] };
  });

  // Seed the editable form from server data — render-phase adjustment keyed on
  // response identity (same pattern as superadmin/config), so a refetch after
  // save re-seeds exactly once.
  const [seeded, setSeeded] = useState<OrgConfigData | null>(null);
  if (configQuery.data && configQuery.data !== seeded) {
    setSeeded(configQuery.data);
    const { stored, defaults, systemManaged } = configQuery.data;
    const val = (field: string, fallback: unknown) =>
      (stored[field] as unknown) ?? (defaults[field] as unknown) ?? fallback;
    const current: FormState = {
      graph_backend: val("graph_backend", "postgres") as GraphBackend,
      graph_search_type: val("graph_search_type", "hybrid") as GraphSearchType,
      graph_max_traversal_depth: val("graph_max_traversal_depth", 3) as number,
      surrealdb_url: val("surrealdb_url", "") as string,
      surrealdb_user: val("surrealdb_user", "") as string,
      surrealdb_pass: val("surrealdb_pass", "") as string,
      surrealdb_namespace: val("surrealdb_namespace", "") as string,
      surrealdb_database: val("surrealdb_database", "") as string,
      falkordb_url: val("falkordb_url", "") as string,
    };
    setForm(current);
    setInitialForm(current);
    setStored(stored);
    setSystemManaged(systemManaged);
    setActionError(null);
  }

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
    if (!hasChanged()) return;
    setSaving(true);

    try {
      const payload = getSavePayload(form as unknown as Record<string, unknown>);
      if (Object.keys(payload).length === 0) return;

      await patch("/admin/org/config", payload);
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Graph Configuration Card ──────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <GitBranch size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Graph Settings</h2>
            <p className="text-xs text-surface-400">Knowledge graph search and traversal</p>
          </div>
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
            <div className={error ? "space-y-4 max-w-md mt-4" : "space-y-4 max-w-md"}>
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

              {/* SurrealDB connection fields — conditionally shown */}
              {form.graph_backend === "surrealdb" && !systemManaged.includes("surrealdb_url") && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="surrealdb-url" className="block text-sm font-medium text-surface-300 mb-1">
                      SurrealDB URL
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="surrealdb-url"
                        className="input-base flex-1"
                        type="url"
                        placeholder="ws://surrealdb:8000/rpc"
                        value={form.surrealdb_url}
                        onChange={(e) => updateField("surrealdb_url", e.target.value)}
                      />
                      {isFieldSet("surrealdb_url") && (
                        <Button
                          onClick={() => handleStageReset("surrealdb_url")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-surface-500 mt-1">Required when using SurrealDB backend</p>
                  </div>
                  {pendingResets.has("surrealdb_url") && (
                    <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                  )}

                  {/* surrealdb_user */}
                  <div>
                    <label htmlFor="surrealdb-user" className="block text-sm font-medium text-surface-300 mb-1">
                      SurrealDB Username
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="surrealdb-user"
                        className="input-base flex-1"
                        type="text"
                        placeholder="SurrealDB username"
                        value={form.surrealdb_user}
                        onChange={(e) => updateField("surrealdb_user", e.target.value)}
                      />
                      {isFieldSet("surrealdb_user") && (
                        <Button
                          onClick={() => handleStageReset("surrealdb_user")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                  {pendingResets.has("surrealdb_user") && (
                    <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                  )}

                  {/* surrealdb_pass */}
                  <SecretInput
                    id="surrealdb-pass"
                    label="SurrealDB Password"
                    value={form.surrealdb_pass}
                    onChange={(v) => updateField("surrealdb_pass", v)}
                    placeholder="SurrealDB password"
                    visible={showSurrealDbPass}
                    onToggleVisibility={() => setShowSurrealDbPass((prev) => !prev)}
                  />

                  {/* surrealdb_namespace */}
                  <div>
                    <label htmlFor="surrealdb-namespace" className="block text-sm font-medium text-surface-300 mb-1">
                      SurrealDB Namespace
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="surrealdb-namespace"
                        className="input-base flex-1"
                        type="text"
                        placeholder="SurrealDB namespace"
                        value={form.surrealdb_namespace}
                        onChange={(e) => updateField("surrealdb_namespace", e.target.value)}
                      />
                      {isFieldSet("surrealdb_namespace") && (
                        <Button
                          onClick={() => handleStageReset("surrealdb_namespace")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                  {pendingResets.has("surrealdb_namespace") && (
                    <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                  )}

                  {/* surrealdb_database */}
                  <div>
                    <label htmlFor="surrealdb-database" className="block text-sm font-medium text-surface-300 mb-1">
                      SurrealDB Database
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="surrealdb-database"
                        className="input-base flex-1"
                        type="text"
                        placeholder="SurrealDB database"
                        value={form.surrealdb_database}
                        onChange={(e) => updateField("surrealdb_database", e.target.value)}
                      />
                      {isFieldSet("surrealdb_database") && (
                        <Button
                          onClick={() => handleStageReset("surrealdb_database")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                  {pendingResets.has("surrealdb_database") && (
                    <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                  )}
                </div>
              )}

              {/* SurrealDB system-managed badge */}
              {form.graph_backend === "surrealdb" && systemManaged.includes("surrealdb_url") && (
                <div className="rounded-lg border border-surface-700 bg-surface-800/50 px-4 py-3">
                  <p className="text-sm font-medium text-surface-300">SurrealDB</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    Configured at the system level. Connection details are managed by your administrator.
                  </p>
                </div>
              )}

              {/* FalkorDB connection field — conditionally shown */}
              {form.graph_backend === "falkordb" && !systemManaged.includes("falkordb_url") && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="falkordb-url" className="block text-sm font-medium text-surface-300 mb-1">
                      FalkorDB URL
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="falkordb-url"
                        className="input-base flex-1"
                        type="url"
                        placeholder="redis://falkordb:6379"
                        value={form.falkordb_url}
                        onChange={(e) => updateField("falkordb_url", e.target.value)}
                      />
                      {isFieldSet("falkordb_url") && (
                        <Button
                          onClick={() => handleStageReset("falkordb_url")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-surface-500 mt-1">Required when using FalkorDB backend and no system-level config exists</p>
                  </div>
                  {pendingResets.has("falkordb_url") && (
                    <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                  )}
                </div>
              )}

              {/* FalkorDB system-managed badge */}
              {form.graph_backend === "falkordb" && systemManaged.includes("falkordb_url") && (
                <div className="rounded-lg border border-surface-700 bg-surface-800/50 px-4 py-3">
                  <p className="text-sm font-medium text-surface-300">FalkorDB</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    Configured at the system level. Connection details are managed by your administrator.
                  </p>
                </div>
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
          onDiscard={() => { setForm({ ...initialForm }); clearResets(); setDirty(false); }}
        />
      )}
    </div>
  );
}
