"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError, apiErrorMessage } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { SecretInput } from "@/components/ui/secret-input";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { useConfigDirty } from "@/contexts/config-dirty";
import { useConfigReset } from "@/hooks/use-config-reset";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgConfigResponse {
  stored: Record<string, unknown>;
  system_managed_fields?: string[];
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
  graph_backend: "reset.backend",
  graph_search_type: "reset.searchType",
  graph_max_traversal_depth: "reset.maxTraversalDepth",
  surrealdb_url: "reset.surrealdbUrl",
  surrealdb_user: "reset.surrealdbUsername",
  surrealdb_pass: "reset.surrealdbPassword",
  surrealdb_namespace: "reset.surrealdbNamespace",
  surrealdb_database: "reset.surrealdbDatabase",
  falkordb_url: "reset.falkordbUrl",
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemManaged, setSystemManaged] = useState<string[]>([]);
  const [showSurrealDbPass, setShowSurrealDbPass] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const t = useTranslations("settings.orgConfig.graph");

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

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<OrgConfigResponse>("/admin/org/config");
      const stored_: Record<string, unknown> = data.stored as Record<string, unknown>;
      const hasAnyStored = FIELDS.some((f) => stored_[f] != null);

      // If no stored values exist for this tab, pull onboarding defaults from API
      let defaults: Record<string, unknown> = {};
      if (!hasAnyStored) {
        try {
          defaults = await get<Record<string, unknown>>(
            "/admin/org/config/defaults",
          );
        } catch {
          // best-effort; fall through to inline fallbacks
        }
      }

      const val = (field: string, fallback: unknown) =>
        (stored_[field] as unknown) ?? (defaults[field] as unknown) ?? fallback;

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
      setStored(data.stored ?? {});
      setSystemManaged(data.system_managed_fields ?? []);
      setDirty(false);
    } catch (err) {
      setError(apiErrorMessage(err, t("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [setDirty]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConfig();
  }, [fetchConfig]);

  // ── beforeunload protection ───────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanged()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  });

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
    setError(null);

    try {
      const payload = getSavePayload(form as unknown as Record<string, unknown>);
      if (Object.keys(payload).length === 0) return;

      await patch("/admin/org/config", payload);
      toast.success(t("savedToast"));
      await fetchConfig();
      setDirty(false);
      clearResets();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("saveFailed");
      setError(message);
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
            <h2 className="text-base font-semibold">{t("title")}</h2>
            <p className="text-xs text-surface-400">{t("description")}</p>
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
            {error && <ErrorState message={error} onRetry={fetchConfig} />}
            <div className={error ? "space-y-4 max-w-md mt-4" : "space-y-4 max-w-md"}>
              {/* graph_backend */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  {t("fields.graphBackend")}
                </label>
                <div className="flex gap-2 items-start">
                  <select
                    className="input-base flex-1"
                    value={form.graph_backend}
                    onChange={(e) => updateField("graph_backend", e.target.value as GraphBackend)}
                  >
                    {GRAPH_BACKEND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.value === "none" ? t("graphBackendNone") : opt.label}</option>
                    ))}
                  </select>
                      {isFieldSet("graph_backend") && (
                        <Button
                          onClick={() => handleStageReset("graph_backend")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title={t("resetFieldTitle")}
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                </div>
              </div>
              {pendingResets.has("graph_backend") && (
                <p className="text-xs text-amber-400 mt-1">{t("willResetOnSave")}</p>
              )}

              {/* search type + traversal depth — hidden when backend is "none" */}
              {form.graph_backend !== "none" && (
                <>
                  {/* graph_search_type */}
                  <div>
                    <label className="block text-sm font-medium text-surface-300 mb-1">
                      {t("fields.searchType")}
                    </label>
                    <div className="flex gap-2 items-start">
                      <select
                        className="input-base flex-1"
                        value={form.graph_search_type}
                        onChange={(e) => updateField("graph_search_type", e.target.value as GraphSearchType)}
                      >
                        {SEARCH_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
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
                    <label className="block text-sm font-medium text-surface-300 mb-1">
                      {t("fields.maxTraversalDepth")}
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
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
                    <p className="text-xs text-surface-500 mt-1">{t("fields.maxTraversalDepthHint")}
                    </p>
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
                    <label className="block text-sm font-medium text-surface-300 mb-1">
                      {t("fields.surrealdbUrl")}
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        className="input-base flex-1"
                        type="url"
                        placeholder={t("fields.surrealdbUrlPlaceholder")}
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
                    <p className="text-xs text-surface-500 mt-1">{t("fields.surrealdbUrlHint")}
                    </p>
                  </div>
                  {pendingResets.has("surrealdb_url") && (
                    <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                  )}

                  {/* surrealdb_user */}
                  <div>
                    <label className="block text-sm font-medium text-surface-300 mb-1">
                      {t("fields.surrealdbUsername")}
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        className="input-base flex-1"
                        type="text"
                        placeholder={t("fields.surrealdbUsernamePlaceholder")}
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
                    label={t("fields.surrealdbPassword")}
                    value={form.surrealdb_pass}
                    onChange={(v) => updateField("surrealdb_pass", v)}
                    placeholder={t("fields.surrealdbPasswordPlaceholder")}
                    visible={showSurrealDbPass}
                    onToggleVisibility={() => setShowSurrealDbPass((prev) => !prev)}
                  />

                  {/* surrealdb_namespace */}
                  <div>
                    <label className="block text-sm font-medium text-surface-300 mb-1">
                      {t("fields.surrealdbNamespace")}
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        className="input-base flex-1"
                        type="text"
                        placeholder={t("fields.surrealdbNamespacePlaceholder")}
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
                    <label className="block text-sm font-medium text-surface-300 mb-1">
                      {t("fields.surrealdbDatabase")}
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        className="input-base flex-1"
                        type="text"
                        placeholder={t("fields.surrealdbDatabasePlaceholder")}
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
                    {t("systemManagedHint")}
                  </p>
                </div>
              )}

              {/* FalkorDB connection field — conditionally shown */}
              {form.graph_backend === "falkordb" && !systemManaged.includes("falkordb_url") && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-300 mb-1">
                      {t("fields.falkordbUrl")}
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        className="input-base flex-1"
                        type="url"
                        placeholder={t("fields.falkordbUrlPlaceholder")}
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
                    <p className="text-xs text-surface-500 mt-1">{t("fields.falkordbUrlHint")}
                    </p>
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
