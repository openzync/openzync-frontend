"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowUpDown, RotateCcw } from "lucide-react";
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
  defaults?: Record<string, unknown>;
  system_managed_fields?: string[];
}

/** What the config fetcher hands to the render-phase form seed. */
interface OrgConfigData {
  stored: Record<string, unknown>;
  defaults: Record<string, unknown>;
  systemManaged: string[];
}

interface FormState {
  reranker_backend: "" | "sentence_transformers" | "cohere";
  reranker_model: string;
  reranker_top_k: number;
  reranker_top_n: number;
  cohere_api_key: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FIELDS: (keyof FormState)[] = [
  "reranker_backend",
  "reranker_model",
  "reranker_top_k",
  "reranker_top_n",
  "cohere_api_key",
];

const RERANKER_BACKEND_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "None (disabled)" },
  { value: "sentence_transformers", label: "Sentence Transformers (local)" },
  { value: "cohere", label: "Cohere" },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function RerankerConfigPage() {
  const { setDirty } = useConfigDirty();
  const [form, setForm] = useState<FormState>({
    reranker_backend: "",
    reranker_model: "",
    reranker_top_k: 50,
    reranker_top_n: 10,
    cohere_api_key: "",
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [systemManaged, setSystemManaged] = useState<string[]>([]);
  const [showCohereApiKey, setShowCohereApiKey] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

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

    let defaults: Record<string, unknown> = data.defaults ?? {};
    if (!data.defaults && !hasAnyStored) {
      defaults = await get<Record<string, unknown>>("/admin/org/config/defaults").catch(
        () => ({}) as Record<string, unknown>,
      );
    }

    return { stored, defaults, systemManaged: data.system_managed_fields ?? [] };
  });

  const [seeded, setSeeded] = useState<OrgConfigData | null>(null);
  if (configQuery.data && configQuery.data !== seeded) {
    setSeeded(configQuery.data);
    const { stored, defaults, systemManaged } = configQuery.data;
    const val = (field: string, fallback: unknown) =>
      (stored[field] as unknown) ?? (defaults[field] as unknown) ?? fallback;
    const current: FormState = {
      reranker_backend: val("reranker_backend", "") as FormState["reranker_backend"],
      reranker_model: val("reranker_model", "") as string,
      reranker_top_k: val("reranker_top_k", 50) as number,
      reranker_top_n: val("reranker_top_n", 10) as number,
      cohere_api_key: val("cohere_api_key", "") as string,
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
    // Editing a field cancels its staged reset (matches sibling pages) —
    // otherwise getSavePayload's null would silently win over the edit
    unstageReset(field as string);
    setForm((prev) => ({ ...prev, [field]: value }));
    const newForm = { ...form, [field]: value };
    const dirty =
      FIELDS.some((f) => newForm[f] !== initialForm[f]) || hasPendingResets;
    setDirty(dirty);
  }

  // ── Stage reset ───────────────────────────────────────────────────────────

  function handleStageReset(field: keyof FormState) {
    const defaultVal =
      typeof initialForm[field] === "number"
        ? (0 as FormState[keyof FormState])
        : ("" as FormState[keyof FormState]);
    stageReset(field as string, defaultVal);
    setDirty(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!hasChanged()) return;
    setSaving(true);

    try {
      const payload = getSavePayload(form as unknown as Record<string, unknown>);
      if (payload.reranker_backend === "") {
        payload.reranker_backend = null;
      }
      if (Object.keys(payload).length === 0) return;

      await patch("/admin/org/config", payload);
      toast.success("Reranker configuration saved successfully");
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

  const backendNonEmpty = form.reranker_backend !== "";

  return (
    <div className="space-y-6">
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <ArrowUpDown size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="font-display text-base font-medium">Reranker Settings</h2>
            <p className="text-xs text-surface-400">Result re-ranking for improved relevance</p>
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
              {/* reranker_backend */}
              <div>
                <label htmlFor="reranker-backend" className="block text-sm font-medium text-surface-300 mb-1">
                  Reranker Backend
                </label>
                {systemManaged.includes("reranker_backend") ? (
                  <div className="rounded-lg border border-surface-700 bg-surface-800/50 px-4 py-3">
                    <p className="text-sm font-medium text-surface-300">Reranker</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Configured at the system level. Connection details are managed by your administrator.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 items-start">
                      <SimpleSelect
                        id="reranker-backend"
                        className="flex-1"
                        options={RERANKER_BACKEND_OPTIONS.map((opt) => ({
                          ...opt,
                          value: opt.value === "" ? "__none__" : opt.value,
                        }))}
                        value={form.reranker_backend === "" ? "__none__" : form.reranker_backend}
                        onValueChange={(value) =>
                          updateField(
                            "reranker_backend",
                            (value === "__none__" ? "" : value) as FormState["reranker_backend"],
                          )
                        }
                      />
                      {isFieldSet("reranker_backend") && (
                        <Button
                          onClick={() => handleStageReset("reranker_backend")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    {pendingResets.has("reranker_backend") && (
                      <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                    )}
                  </>
                )}
              </div>

              {/* reranker_model */}
              <div>
                <label htmlFor="reranker-model" className="block text-sm font-medium text-surface-300 mb-1">
                  Reranker Model
                </label>
                {systemManaged.includes("reranker_model") ? (
                  <div className="rounded-lg border border-surface-700 bg-surface-800/50 px-4 py-3">
                    <p className="text-sm font-medium text-surface-300">Reranker Model</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Configured at the system level. Connection details are managed by your administrator.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 items-start">
                      <input
                        id="reranker-model"
                        className="input-base flex-1"
                        type="text"
                        placeholder="cross-encoder/ms-marco-MiniLM-L-6-v2"
                        value={form.reranker_model}
                        onChange={(e) => updateField("reranker_model", e.target.value)}
                      />
                      {isFieldSet("reranker_model") && (
                        <Button
                          onClick={() => handleStageReset("reranker_model")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Remove stored value — default will apply on save"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    {pendingResets.has("reranker_model") && (
                      <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                    )}
                  </>
                )}
              </div>

              {/* top_k, top_n, cohere_api_key — only when backend non-empty */}
              {backendNonEmpty && (
                <>
                  {/* reranker_top_k */}
                  <div>
                    <label htmlFor="reranker-top-k" className="block text-sm font-medium text-surface-300 mb-1">
                      Reranker Top-K
                    </label>
                    {systemManaged.includes("reranker_top_k") ? (
                      <div className="rounded-lg border border-surface-700 bg-surface-800/50 px-4 py-3">
                        <p className="text-sm font-medium text-surface-300">Reranker Top-K</p>
                        <p className="text-xs text-surface-500 mt-0.5">
                          Configured at the system level. Connection details are managed by your administrator.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2 items-start">
                          <input
                            id="reranker-top-k"
                            className="input-base flex-1"
                            type="number"
                            min="10"
                            max="200"
                            value={form.reranker_top_k}
                            onChange={(e) => updateField("reranker_top_k", parseInt(e.target.value) || 10)}
                          />
                          {isFieldSet("reranker_top_k") && (
                            <Button
                              onClick={() => handleStageReset("reranker_top_k")}
                              variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                              title="Remove stored value — default will apply on save"
                            >
                              <RotateCcw size={14} />
                            </Button>
                          )}
                        </div>
                        {pendingResets.has("reranker_top_k") && (
                          <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                        )}
                      </>
                    )}
                  </div>

                  {/* reranker_top_n */}
                  <div>
                    <label htmlFor="reranker-top-n" className="block text-sm font-medium text-surface-300 mb-1">
                      Reranker Top-N
                    </label>
                    {systemManaged.includes("reranker_top_n") ? (
                      <div className="rounded-lg border border-surface-700 bg-surface-800/50 px-4 py-3">
                        <p className="text-sm font-medium text-surface-300">Reranker Top-N</p>
                        <p className="text-xs text-surface-500 mt-0.5">
                          Configured at the system level. Connection details are managed by your administrator.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2 items-start">
                          <input
                            id="reranker-top-n"
                            className="input-base flex-1"
                            type="number"
                            min="1"
                            max="100"
                            value={form.reranker_top_n}
                            onChange={(e) => updateField("reranker_top_n", parseInt(e.target.value) || 1)}
                          />
                          {isFieldSet("reranker_top_n") && (
                            <Button
                              onClick={() => handleStageReset("reranker_top_n")}
                              variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                              title="Remove stored value — default will apply on save"
                            >
                              <RotateCcw size={14} />
                            </Button>
                          )}
                        </div>
                        {pendingResets.has("reranker_top_n") && (
                          <p className="text-xs text-amber-400 mt-1">Will be reset on save</p>
                        )}
                      </>
                    )}
                  </div>

                  {/* cohere_api_key — only when backend === cohere */}
                  {form.reranker_backend === "cohere" && (
                    <div>
                      {systemManaged.includes("cohere_api_key") ? (
                        <div className="rounded-lg border border-surface-700 bg-surface-800/50 px-4 py-3">
                          <p className="text-sm font-medium text-surface-300">Cohere API Key</p>
                          <p className="text-xs text-surface-500 mt-0.5">
                            Configured at the system level. Connection details are managed by your administrator.
                          </p>
                        </div>
                      ) : (
                        <>
                          <SecretInput
                            id="cohere-api-key"
                            label="Cohere API Key"
                            value={form.cohere_api_key}
                            onChange={(v) => updateField("cohere_api_key", v)}
                            placeholder="Cohere API key"
                            visible={showCohereApiKey}
                            onToggleVisibility={() => setShowCohereApiKey((prev) => !prev)}
                          />
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {!loading && (
        <StickySaveBar
          saving={saving}
          hasChanges={hasChanged()}
          hasSaved={justSaved}
          onSave={handleSave}
          onDiscard={handleDiscard}
          saveDisabled={false}
        />
      )}
    </div>
  );
}