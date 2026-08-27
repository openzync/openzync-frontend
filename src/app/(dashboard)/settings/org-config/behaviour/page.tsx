"use client";

import { useState } from "react";
import { RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { StickySaveBar } from "@/components/shared/sticky-save-bar";
import { useConfigDirty } from "@/contexts/config-dirty";
import { useConfigReset } from "@/hooks/use-config-reset";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgConfigResponse {
  stored: Record<string, unknown>;
}

/** What the config fetcher hands to the render-phase form seed. */
interface OrgConfigData {
  stored: Record<string, unknown>;
  defaults: Record<string, unknown>;
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
  context_cache_ttl: "Reset cache TTL to default",
  audit_log_response_body: "Reset audit logging to default",
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
  const [saving, setSaving] = useState(false);
  // Save failures share the banner with load errors; cleared when a fetch
  // succeeds so a retry visibly resolves.
  const [actionError, setActionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

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

    return { stored, defaults };
  });

  // Seed the editable form from server data — render-phase adjustment keyed on
  // response identity (same pattern as superadmin/config), so a refetch after
  // save re-seeds exactly once.
  const [seeded, setSeeded] = useState<OrgConfigData | null>(null);
  if (configQuery.data && configQuery.data !== seeded) {
    setSeeded(configQuery.data);
    const { stored, defaults } = configQuery.data;
    const val = (field: string, fallback: unknown) =>
      (stored[field] as unknown) ?? (defaults[field] as unknown) ?? fallback;
    const current: FormState = {
      context_cache_ttl: val("context_cache_ttl", 1800) as number,
      audit_log_response_body: val("audit_log_response_body", true) as boolean,
    };
    setForm(current);
    setInitialForm(current);
    setStored(stored);
    setActionError(null);
  }

  const loading = configQuery.isLoading;
  const error = configQuery.error ?? actionError;

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

    try {
      const payload = getSavePayload(form as unknown as Record<string, unknown>);

      await patch("/admin/org/config", payload);

      toast.success("Behaviour configuration saved successfully");
      clearResets();
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
      {/* ── Behaviour Configuration Card ──────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <Settings2 size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Behaviour Settings</h2>
            <p className="text-xs text-surface-400">
              Caching and audit behaviour
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
            {error && <ErrorState message={error} onRetry={configQuery.refetch} />}
            <div className="space-y-4 max-w-md">
              {/* context_cache_ttl */}
              <div>
                <label htmlFor="context-cache-ttl" className="block text-sm font-medium text-surface-300 mb-1">
                  Context Cache TTL (seconds)
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    id="context-cache-ttl"
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
                      title={RESET_TITLES.context_cache_ttl}
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {isPendingReset("context_cache_ttl") && (
                  <p className="text-xs text-amber-400 mt-1">
                    Will reset to default on save
                  </p>
                )}
                <p className="text-xs text-surface-500 mt-1">
                  How long context data is cached in Redis before being
                  re-fetched (0 = no caching)
                </p>
              </div>

              {/* audit_log_response_body — checkbox toggle */}
              <div className="pt-2">
                <div className="flex items-start justify-between">
                  <div>
                    <label htmlFor="audit-log-response-body" className="block text-sm font-medium text-surface-300 mb-1">
                      Audit Log Response Body
                    </label>
                    <p className="text-xs text-surface-500">
                      Include response body content in audit logs
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <label htmlFor="audit-log-response-body" className="flex items-center gap-3 cursor-pointer">
                      <input
                        id="audit-log-response-body"
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
                        {form.audit_log_response_body ? "Enabled" : "Disabled"}
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
                        title={RESET_TITLES.audit_log_response_body}
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
