"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Settings2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError, apiErrorMessage, type OrgCreationPolicy, type ApprovalScope, type SystemConfigResponse } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { ConfigFields, SYSTEM_DEFAULT_FIELDS } from "@/app/(dashboard)/superadmin/_components/config-fields";

const POLICIES: { value: OrgCreationPolicy; label: string; description: string }[] = [
  {
    value: "allow_all",
    label: "Open registration",
    description: "Anyone can create an organization or join with a code.",
  },
  {
    value: "reject_all",
    label: "Registration closed",
    description: "Signup and org-code join are disabled platform-wide.",
  },
  {
    value: "approvals",
    label: "Approval required",
    description: "New organizations are created as pending requests you review here.",
  },
];

const SCOPES: { value: ApprovalScope; label: string }[] = [
  { value: "in_app", label: "In-app requests only" },
  { value: "public_signup", label: "Public signup only" },
  { value: "both", label: "Both in-app requests and public signup" },
];

interface FormState {
  policy: OrgCreationPolicy;
  scope: ApprovalScope;
  defaults: Record<string, unknown>;
}

/** Build the defaults half of the form from a flat SystemConfigResponse. */
function pickDefaults(data: SystemConfigResponse): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of SYSTEM_DEFAULT_FIELDS) {
    defaults[field.key] = data[field.key] ?? "";
  }
  return defaults;
}

export default function SuperadminConfigPage() {
  const [form, setForm] = useState<FormState>({
    policy: "allow_all",
    scope: "both",
    defaults: {},
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<SystemConfigResponse>("/admin/system/config");
      const defaults = pickDefaults(data);
      setForm({ policy: data.org_creation_policy, scope: data.approval_scope, defaults });
      setInitialForm({ policy: data.org_creation_policy, scope: data.approval_scope, defaults: { ...defaults } });
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load system configuration"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await fetchConfig();
    };
    void run();
  }, [fetchConfig]);

  const hasChanged = () =>
    form.policy !== initialForm.policy ||
    form.scope !== initialForm.scope ||
    SYSTEM_DEFAULT_FIELDS.some((f) => form.defaults[f.key] !== initialForm.defaults[f.key]);

  const handleSave = async () => {
    if (!hasChanged()) return;
    setSaving(true);
    setError(null);
    try {
      // Partial PATCH — only what actually changed.
      const payload: Record<string, unknown> = {};
      if (form.policy !== initialForm.policy) payload.org_creation_policy = form.policy;
      if (form.scope !== initialForm.scope) payload.approval_scope = form.scope;
      for (const field of SYSTEM_DEFAULT_FIELDS) {
        if (form.defaults[field.key] !== initialForm.defaults[field.key]) {
          payload[field.key] = form.defaults[field.key];
        }
      }
      await patch("/admin/system/config", payload);
      toast.success("System configuration saved");
      await fetchConfig();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save configuration";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} onRetry={fetchConfig} />}

      {/* ── Registration policy ─────────────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <ShieldCheck size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Registration Policy</h2>
            <p className="text-xs text-surface-400">Controls who can create or join organizations</p>
          </div>
        </div>

        <fieldset>
          <legend className="sr-only">Organization creation policy</legend>
          <div className="space-y-2 max-w-lg">
            {POLICIES.map((policy) => (
              <label
                key={policy.value}
                className="flex items-start gap-3 rounded-lg border border-surface-800 bg-surface-900/50 px-4 py-3 cursor-pointer has-[:checked]:border-brand-500/50 has-[:checked]:bg-brand-500/5"
              >
                <input
                  type="radio"
                  name="org_creation_policy"
                  className="mt-1 accent-brand-500"
                  checked={form.policy === policy.value}
                  onChange={() => setForm((prev) => ({ ...prev, policy: policy.value }))}
                />
                <span>
                  <span className="block text-sm font-medium text-surface-200">{policy.label}</span>
                  <span className="block text-xs text-surface-500 mt-0.5">{policy.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 max-w-xs">
          <label htmlFor="approval-scope" className="block text-sm font-medium text-surface-300 mb-1">
            Approval Scope
          </label>
          <select
            id="approval-scope"
            className="input-base w-full"
            value={form.scope}
            disabled={form.policy !== "approvals"}
            onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value as ApprovalScope }))}
          >
            {SCOPES.map((scope) => (
              <option key={scope.value} value={scope.value}>
                {scope.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-surface-500 mt-1">
            {form.policy === "approvals"
              ? "Where organization requests are accepted for review."
              : "Only applies when approval is required — ignored under the current policy."}
          </p>
        </div>
      </div>

      {/* ── Non-secret system defaults ──────────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
            <Settings2 size={20} className="text-warning" />
          </div>
          <div>
            <h2 className="text-base font-semibold">System Defaults</h2>
            <p className="text-xs text-surface-400">
              Non-secret defaults applied to newly created organizations
            </p>
          </div>
        </div>

        <ConfigFields
          values={form.defaults}
          onChange={(key, value) =>
            setForm((prev) => ({ ...prev, defaults: { ...prev.defaults, [key]: value } }))
          }
        />
      </div>

      {/* ── Save bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!hasChanged()}>
          Save Changes
        </Button>
        {justSaved && (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <Check size={14} />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
