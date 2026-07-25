"use client";

import { useEffect, useState, useCallback } from "react";
import { Save, X, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError } from "@/lib/api-client";
import { SecretInput } from "@/components/ui/secret-input";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrgConfigResponse {
  stored: Record<string, unknown>;
}

interface FormState {
  blob_storage_backend: string;
  s3_endpoint_url: string;
  s3_region: string;
  s3_access_key_id: string;
  s3_secret_access_key: string;
  s3_bucket_name: string;
  max_blob_size_mb: number;
  image_extraction: string;
}

const FIELDS: (keyof FormState)[] = [
  "blob_storage_backend",
  "s3_endpoint_url",
  "s3_region",
  "s3_access_key_id",
  "s3_secret_access_key",
  "s3_bucket_name",
  "max_blob_size_mb",
  "image_extraction",
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BlobStorageConfigPage() {
  const [form, setForm] = useState<FormState>({
    blob_storage_backend: "s3",
    s3_endpoint_url: "",
    s3_region: "auto",
    s3_access_key_id: "",
    s3_secret_access_key: "",
    s3_bucket_name: "openzync-blobs",
    max_blob_size_mb: 50,
    image_extraction: "none",
  });
  const [initialForm, setInitialForm] = useState<FormState>({ ...form });
  const [stored, setStored] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  // ── Fetch config ──────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<OrgConfigResponse>("/admin/org/config");
      const stored = data.stored as Record<string, unknown>;
      const hasAnyStored = FIELDS.some((f) => stored[f] != null);

      let defaults: Record<string, unknown> = {};
      if (!hasAnyStored) {
        try {
          defaults = await get<Record<string, unknown>>(
            "/admin/org/config/defaults",
          );
        } catch {
          // best-effort
        }
      }

      const val = (field: string, fallback: unknown) =>
        (stored[field] as unknown) ?? (defaults[field] as unknown) ?? fallback;

      setForm({
        blob_storage_backend: val("blob_storage_backend", "s3") as string,
        s3_endpoint_url: val("s3_endpoint_url", "") as string,
        s3_region: val("s3_region", "auto") as string,
        s3_access_key_id: val("s3_access_key_id", "") as string,
        s3_secret_access_key: val("s3_secret_access_key", "") as string,
        s3_bucket_name: val("s3_bucket_name", "openzync-blobs") as string,
        max_blob_size_mb: val("max_blob_size_mb", 50) as number,
        image_extraction: val("image_extraction", "none") as string,
      });
      setInitialForm({
        blob_storage_backend: val("blob_storage_backend", "s3") as string,
        s3_endpoint_url: val("s3_endpoint_url", "") as string,
        s3_region: val("s3_region", "auto") as string,
        s3_access_key_id: val("s3_access_key_id", "") as string,
        s3_secret_access_key: val("s3_secret_access_key", "") as string,
        s3_bucket_name: val("s3_bucket_name", "openzync-blobs") as string,
        max_blob_size_mb: val("max_blob_size_mb", 50) as number,
        image_extraction: val("image_extraction", "none") as string,
      });
      setStored(data.stored ?? {});
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load configuration",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ── Field helpers ─────────────────────────────────────────────────────────

  function isFieldSet(field: string): boolean {
    return field in stored;
  }

  function hasChanged(): boolean {
    return FIELDS.some((f) => form[f] !== initialForm[f]);
  }

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleSecret(field: string) {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  // ── Reset field to default ────────────────────────────────────────────────

  async function handleResetField(field: keyof FormState) {
    try {
      await patch("/admin/org/config", { [field]: null });
      toast.success(`"${field}" reset to default`);
      await fetchConfig();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to reset field",
      );
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!hasChanged()) return;
    setSaving(true);
    setError(null);

    try {
      const changed: Record<string, unknown> = {};
      for (const field of FIELDS) {
        if (form[field] !== initialForm[field]) {
          changed[field] = form[field];
        }
      }

      await patch("/admin/org/config", changed);
      toast.success("Blob storage configuration saved successfully");
      await fetchConfig();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save configuration";
      setError(message);
      toast.error(
        err instanceof ApiError ? err.message : "Failed to save configuration",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Blob Storage Configuration Card ─────────────────────────────────── */}
      <div className="card-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
            <HardDrive size={20} className="text-brand-300" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Blob Storage Settings</h2>
            <p className="text-xs text-surface-400">
              S3-compatible storage for file attachments and image extraction
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-9 rounded bg-surface-800 animate-pulse w-full" />
            ))}
          </div>
        ) : (
          <>
            {error && <ErrorState message={error} onRetry={fetchConfig} />}
            <div className="space-y-5 max-w-lg">
              {/* blob_storage_backend — select */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Storage Backend
                </label>
                <div className="flex gap-2 items-start">
                  <select
                    className="input-base flex-1"
                    value={form.blob_storage_backend}
                    onChange={(e) =>
                      updateField("blob_storage_backend", e.target.value)
                    }
                  >
                    <option value="s3">S3-compatible</option>
                    <option value="none">Disabled</option>
                  </select>
                  {isFieldSet("blob_storage_backend") && (
                    <Button
                      onClick={() => handleResetField("blob_storage_backend")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-surface-500 mt-1">
                  Backend used for storing file attachments. "none" disables file uploads.
                </p>
              </div>

              {/* s3_endpoint_url */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  S3 Endpoint URL
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    className="input-base flex-1"
                    type="text"
                    placeholder="http://minio:9000"
                    value={form.s3_endpoint_url}
                    onChange={(e) =>
                      updateField("s3_endpoint_url", e.target.value)
                    }
                  />
                  {isFieldSet("s3_endpoint_url") && (
                    <Button
                      onClick={() => handleResetField("s3_endpoint_url")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-surface-500 mt-1">
                  Endpoint URL for your S3-compatible object store (e.g. MinIO, AWS S3, GCS).
                </p>
              </div>

              {/* s3_region */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  S3 Region
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    className="input-base flex-1"
                    type="text"
                    placeholder="auto"
                    value={form.s3_region}
                    onChange={(e) =>
                      updateField("s3_region", e.target.value)
                    }
                  />
                  {isFieldSet("s3_region") && (
                    <Button
                      onClick={() => handleResetField("s3_region")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-surface-500 mt-1">
                  AWS region (use "auto" for MinIO).
                </p>
              </div>

              {/* s3_bucket_name */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Bucket Name
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    className="input-base flex-1"
                    type="text"
                    placeholder="openzync-blobs"
                    value={form.s3_bucket_name}
                    onChange={(e) =>
                      updateField("s3_bucket_name", e.target.value)
                    }
                  />
                  {isFieldSet("s3_bucket_name") && (
                    <Button
                      onClick={() => handleResetField("s3_bucket_name")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-surface-500 mt-1">
                  S3 bucket where blobs are stored.
                </p>
              </div>

              {/* s3_access_key_id — secret */}
              <SecretInput
                label="S3 Access Key ID"
                value={form.s3_access_key_id}
                onChange={(v) => updateField("s3_access_key_id", v)}
                placeholder="AKIAIOSFODNN7EXAMPLE"
                visible={visibleSecrets.has("s3_access_key_id")}
                onToggleVisibility={() => toggleSecret("s3_access_key_id")}
              />

              {/* s3_secret_access_key — secret */}
              <SecretInput
                label="S3 Secret Access Key"
                value={form.s3_secret_access_key}
                onChange={(v) => updateField("s3_secret_access_key", v)}
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                visible={visibleSecrets.has("s3_secret_access_key")}
                onToggleVisibility={() => toggleSecret("s3_secret_access_key")}
              />

              {/* max_blob_size_mb */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Max Blob Size (MB)
                </label>
                <div className="flex gap-2 items-start">
                  <input
                    className="input-base flex-1 max-w-[160px]"
                    type="number"
                    min={1}
                    max={500}
                    value={form.max_blob_size_mb}
                    onChange={(e) =>
                      updateField(
                        "max_blob_size_mb",
                        parseInt(e.target.value) || 50,
                      )
                    }
                  />
                  {isFieldSet("max_blob_size_mb") && (
                    <Button
                      onClick={() => handleResetField("max_blob_size_mb")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-surface-500 mt-1">
                  Maximum file size allowed per upload (1–500 MB).
                </p>
              </div>

              {/* image_extraction — select */}
              <div className="pt-2 border-t border-surface-700">
                <div className="flex items-center gap-3 mb-3">
                  <div>
                    <h3 className="text-sm font-medium text-surface-200">Image Text Extraction</h3>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Extract text from images using OCR or vision LLM
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 items-start">
                  <select
                    className="input-base flex-1 max-w-[240px]"
                    value={form.image_extraction}
                    onChange={(e) =>
                      updateField("image_extraction", e.target.value)
                    }
                  >
                    <option value="none">Disabled (store only)</option>
                    <option value="ocr">OCR (Tesseract)</option>
                    <option value="vision">Vision API (LLM)</option>
                  </select>
                  {isFieldSet("image_extraction") && (
                    <Button
                      onClick={() => handleResetField("image_extraction")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset to default"
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-surface-500 mt-2">
                  <strong>OCR</strong> uses Tesseract locally (free).{" "}
                  <strong>Vision API</strong> uses your configured LLM provider
                  for higher accuracy on complex images. Requires Tesseract to be
                  installed on workers.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Save / Discard Buttons ────────────────────────────────────────────── */}
      {!loading && (
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            loading={saving}
            disabled={saving || !hasChanged()}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          {!hasChanged() && (
            <span className="text-xs text-surface-500">
              No changes to save
            </span>
          )}
          {hasChanged() && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setForm({ ...initialForm })}
            >
              Discard Changes
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
