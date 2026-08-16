"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError, apiErrorMessage } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { useConfigDirty } from "@/contexts/config-dirty";
import { useConfigReset } from "@/hooks/use-config-reset";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgConfigResponse {
  stored: Record<string, unknown>;
}

interface FormState {
  context_cache_ttl: number;
  audit_log_response_body: boolean;
}

const FIELDS: (keyof FormState)[] = [
  "context_cache_ttl",
  "audit_log_response_body",
];

// ─── Reset field titles ────────────────────────────────────────────────────────

const RESET_TITLES: Partial<Record<keyof FormState, string>> = {
  context_cache_ttl: "reset.cacheTtl",
  audit_log_response_body: "reset.auditLogging",
};

// ─── Default values for staged-reset UI ────────────────────────────────────────

const DEFAULTS: FormState = {
  context_cache_ttl: 1800,
  audit_log_response_body: true,
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BehaviourConfigPage() {
  const { setDirty } = useConfigDirty();
  const [form, setForm] = useState<FormState>({
    context_cache_ttl: 1800,
    audit_log_response_body: true,
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const t = useTranslations("settings.orgConfig.behaviour");

  // ── Staged resets ────────────────────────────────────────────────────────────

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

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<OrgConfigResponse>("/admin/org/config");

      const stored = data.stored as Record<string, unknown>;
      const hasAnyStored = FIELDS.some((f) => stored[f] != null);

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
        (stored[field] as unknown) ?? (defaults[field] as unknown) ?? fallback;

      setForm({
        context_cache_ttl: val("context_cache_ttl", 1800) as number,
        audit_log_response_body: val(
          "audit_log_response_body",
          true,
        ) as boolean,
      });
      setInitialForm({
        context_cache_ttl: val("context_cache_ttl", 1800) as number,
        audit_log_response_body: val(
          "audit_log_response_body",
          true,
        ) as boolean,
      });
      setStored(data.stored ?? {});
      setDirty(false);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [setDirty]);

  useEffect(() => {
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

  function isPendingReset(field: keyof FormState): boolean {
    return pendingResets.has(field);
  }

  function hasChanged(): boolean {
    return (
      FIELDS.some((f) => form[f] !== initialForm[f]) || hasPendingResets
    );
  }

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    // If the field was staged for reset, user is editing it — cancel the reset
    unstageReset(field);
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(
      value !== initialForm[field] ||
        FIELDS.some((f) => f !== field && form[f] !== initialForm[f]) ||
        hasPendingResets,
    );
  }

  // ── Stage field reset to default ──────────────────────────────────────────

  function handleStageReset(field: keyof FormState) {
    stageReset(field, DEFAULTS[field]);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!hasChanged()) return;
    setSaving(true);
    setError(null);

    try {
      const payload = getSavePayload(form as unknown as Record<string, unknown>);

      await patch("/admin/org/config", payload);

      toast.success(t("savedToast"));
      await fetchConfig();
      clearResets();
      setDirty(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("saveFailed");
      setError(message);
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
      {/* ── Behaviour Configuration Card ──────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <Settings2 size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{t("title")}</h2>
            <p className="text-xs text-surface-400">
              {t("description")}
            </p>
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
            <div className="space-y-4 max-w-md">
              {/* context_cache_ttl */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1">
                  {t("fields.cacheTtl")}
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    className="input-base flex-1"
                    type="number"
                    min="0"
                    value={form.context_cache_ttl}
                    onChange={(e) =>
                      updateField(
                        "context_cache_ttl",
                        parseInt(e.target.value) || 0,
                      )
                    }
                  />
                  {isFieldSet("context_cache_ttl") && (
                    <Button
                      onClick={() => handleStageReset("context_cache_ttl")}
                      variant="ghost"
                      size="sm"
                      className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title={t(RESET_TITLES.context_cache_ttl ?? "")}
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {isPendingReset("context_cache_ttl") && (
                  <p className="text-xs text-amber-400 mt-1">
                    {t("willResetOnSave")}
                  </p>
                )}
                <p className="text-xs text-surface-500 mt-1">
                  {t("fields.cacheTtlHint")}
                </p>
              </div>

              {/* audit_log_response_body — checkbox toggle */}
              <div className="pt-2">
                <div className="flex items-start justify-between">
                  <div>
                    <label className="block text-sm font-medium text-surface-300 mb-1">
                      {t("fields.auditLogResponseBody")}
                    </label>
                    <p className="text-xs text-surface-500">
                      {t("fields.auditLogHint")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ms-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-surface-600 bg-surface-800 text-brand-500"
                        checked={form.audit_log_response_body}
                        onChange={(e) =>
                          updateField(
                            "audit_log_response_body",
                            e.target.checked,
                          )
                        }
                      />
                      <span className="text-sm text-surface-300">
                        {form.audit_log_response_body ? t("enabled") : t("disabled")}
                      </span>
                    </label>
                    {isFieldSet("audit_log_response_body") && (
                      <Button
                        onClick={() =>
                          handleStageReset("audit_log_response_body")
                        }
                        variant="ghost"
                        size="sm"
                        className="rounded-md text-surface-400 hover:text-brand-300"
                        title={t(RESET_TITLES.audit_log_response_body ?? "")}
                      >
                        <RotateCcw size={14} />
                      </Button>
                    )}
                  </div>
                </div>
                {isPendingReset("audit_log_response_body") && (
                  <p className="text-xs text-amber-400 mt-1">
                    Will reset to default on save
                  </p>
                )}
              </div>
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
            clearResets();
          }}
        />
      )}
    </div>
  );
}
