"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError, apiErrorMessage } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { ConfigFields, SYSTEM_DEFAULT_FIELDS } from "@/app/(dashboard)/superadmin/_components/config-fields";

/**
 * Cross-org configuration — same field names as the org-config pages, against
 * the superadmin per-org endpoints. GET prefills from the org-config `stored`
 * shape; PATCH sends flat changed fields (matching the org-config pages).
 */
export default function OrgConfigAdminPage() {
  const { id: orgId } = useParams<{ id: string }>();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [initialForm, setInitialForm] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ stored: Record<string, unknown> }>(
        `/admin/system/orgs/${orgId}/config`,
      );
      const stored = data.stored ?? {};
      const next: Record<string, unknown> = {};
      for (const field of SYSTEM_DEFAULT_FIELDS) {
        next[field.key] = stored[field.key] ?? "";
      }
      setForm(next);
      setInitialForm({ ...next });
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load organization configuration"));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    const run = async () => {
      await fetchConfig();
    };
    void run();
  }, [fetchConfig]);

  const hasChanged = () =>
    SYSTEM_DEFAULT_FIELDS.some((f) => form[f.key] !== initialForm[f.key]);

  const handleSave = async () => {
    if (!hasChanged()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of SYSTEM_DEFAULT_FIELDS) {
        if (form[field.key] !== initialForm[field.key]) {
          payload[field.key] = form[field.key];
        }
      }
      await patch(`/admin/system/orgs/${orgId}/config`, payload);
      toast.success("Organization configuration saved");
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href="/superadmin/orgs"
            className="rounded-md p-1.5 text-surface-400 hover:text-white hover:bg-surface-800"
            aria-label="Back to organizations"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h2 className="text-lg font-semibold">Organization Configuration</h2>
            <p className="text-sm text-surface-400 mt-0.5">
              Cross-org defaults for organization <span className="font-mono text-xs">{orgId}</span>
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={fetchConfig} />}

      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <Settings2 size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Non-secret Defaults</h2>
            <p className="text-xs text-surface-400">
              Same fields as the org-config pages, managed at the platform level
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
          <ConfigFields
            values={form}
            onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
          />
        )}
      </div>

      {!loading && (
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
      )}
    </div>
  );
}
