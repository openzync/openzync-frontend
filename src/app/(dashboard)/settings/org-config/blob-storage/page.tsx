"use client";

import { useState } from "react";
import { RotateCcw, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { get, patch, ApiError } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { SecretInput } from "@/components/ui/secret-input";
import { SimpleSelect } from "@/components/ui/select";
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

// ─── Field defaults for staged resets ──────────────────────────────────────────

const FIELD_DEFAULTS: Record<string, unknown> = {
  blob_storage_backend: "s3",
  s3_endpoint_url: "",
  s3_region: "auto",
  s3_access_key_id: "",
  s3_secret_access_key: "",
  s3_bucket_name: "",
  max_blob_size_mb: 50,
  image_extraction: "none",
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BlobStorageConfigPage() {
  const { setDirty } = useConfigDirty();
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
  const [saving, setSaving] = useState(false);
  // Save failures share the banner with load errors; cleared when a fetch
  // succeeds so a retry visibly resolves.
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [justSaved, setJustSaved] = useState(false);

  const reset = useConfigReset(
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
    reset.clearResets();
    setStored(stored);
    setActionError(null);
  }

  const loading = configQuery.isLoading;
  const error = configQuery.error ?? actionError;

  // ── Field helpers ─────────────────────────────────────────────────────────

  function isFieldSet(field: string): boolean {
    return field in stored;
  }

  function hasChanged(): boolean {
    return (
      FIELDS.some((f) => form[f] !== initialForm[f]) || reset.hasPendingResets
    );
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
    if (reset.pendingResets.has(field)) {
      reset.unstageReset(field);
    }
  }

  function toggleSecret(field: string) {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  // ── Stage reset (queued, not sent until save) ─────────────────────────────

  function handleStageReset(field: keyof FormState) {
    reset.stageReset(field, FIELD_DEFAULTS[field] ?? "");
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!hasChanged()) return;
    setSaving(true);

    try {
      const payload = reset.getSavePayload(
        form as unknown as Record<string, unknown>,
      );
      await patch("/admin/org/config", payload);
      toast.success("Blob storage configuration saved successfully");
      reset.clearResets();
      setDirty(false);
      configQuery.refetch();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save configuration";
      setActionError(message);
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
            {error && <ErrorState message={error} onRetry={configQuery.refetch} />}
            <div className="space-y-5 max-w-lg">
              {/* blob_storage_backend — select */}
              <div>
                <label htmlFor="blob-storage-backend" className="block text-sm font-medium text-surface-300 mb-1.5">
                  Storage Backend
                </label>
                <div className="flex gap-2 items-start">
                  <SimpleSelect
                    id="blob-storage-backend"
                    className="flex-1"
                    options={[
                      { value: "s3", label: "S3-compatible" },
                      { value: "none", label: "Disabled" },
                    ]}
                    value={form.blob_storage_backend}
                    onValueChange={(value) => updateField("blob_storage_backend", value)}
                  />
                  {isFieldSet("blob_storage_backend") && (
                    <Button
                      onClick={() => handleStageReset("blob_storage_backend")}
                      variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                      title="Reset storage backend to default"
                    >
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
                {reset.pendingResets.has("blob_storage_backend") && (
                  <p className="text-xs text-amber-400 mt-1">
                    Reset queued — will be applied on save
                  </p>
                )}
                <p className="text-xs text-surface-500 mt-1">
                  Backend used for storing file attachments. "none" disables file uploads.
                </p>
              </div>

              {/* S3 configuration fields — only when a backend is configured */}
              {form.blob_storage_backend && form.blob_storage_backend !== "none" && (
                <>
                  {/* s3_endpoint_url */}
                  <div>
                    <label htmlFor="s3-endpoint-url" className="block text-sm font-medium text-surface-300 mb-1.5">
                      S3 Endpoint URL
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="s3-endpoint-url"
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
                          onClick={() => handleStageReset("s3_endpoint_url")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Reset S3 endpoint URL to default"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    {reset.pendingResets.has("s3_endpoint_url") && (
                      <p className="text-xs text-amber-400 mt-1">
                        Reset queued — will be applied on save
                      </p>
                    )}
                    <p className="text-xs text-surface-500 mt-1">
                      Endpoint URL for your S3-compatible object store (e.g. MinIO, AWS S3, GCS).
                    </p>
                  </div>

                  {/* s3_region */}
                  <div>
                    <label htmlFor="s3-region" className="block text-sm font-medium text-surface-300 mb-1.5">
                      S3 Region
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="s3-region"
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
                          onClick={() => handleStageReset("s3_region")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Reset S3 region to default"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    {reset.pendingResets.has("s3_region") && (
                      <p className="text-xs text-amber-400 mt-1">
                        Reset queued — will be applied on save
                      </p>
                    )}
                    <p className="text-xs text-surface-500 mt-1">
                      AWS region (use "auto" for MinIO).
                    </p>
                  </div>

                  {/* s3_bucket_name */}
                  <div>
                    <label htmlFor="s3-bucket-name" className="block text-sm font-medium text-surface-300 mb-1.5">
                      Bucket Name
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="s3-bucket-name"
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
                          onClick={() => handleStageReset("s3_bucket_name")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Reset S3 bucket name to default"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    {reset.pendingResets.has("s3_bucket_name") && (
                      <p className="text-xs text-amber-400 mt-1">
                        Reset queued — will be applied on save
                      </p>
                    )}
                    <p className="text-xs text-surface-500 mt-1">
                      S3 bucket where blobs are stored.
                    </p>
                  </div>

                  {/* s3_access_key_id — secret */}
                  <div>
                    <SecretInput
                      id="s3-access-key-id"
                      label="S3 Access Key ID"
                      value={form.s3_access_key_id}
                      onChange={(v) => updateField("s3_access_key_id", v)}
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                      visible={visibleSecrets.has("s3_access_key_id")}
                      onToggleVisibility={() => toggleSecret("s3_access_key_id")}
                    />
                    {reset.pendingResets.has("s3_access_key_id") && (
                      <p className="text-xs text-amber-400 mt-1">
                        Reset queued — will be applied on save
                      </p>
                    )}
                  </div>

                  {/* s3_secret_access_key — secret */}
                  <div>
                    <SecretInput
                      id="s3-secret-access-key"
                      label="S3 Secret Access Key"
                      value={form.s3_secret_access_key}
                      onChange={(v) => updateField("s3_secret_access_key", v)}
                      placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                      visible={visibleSecrets.has("s3_secret_access_key")}
                      onToggleVisibility={() => toggleSecret("s3_secret_access_key")}
                    />
                    {reset.pendingResets.has("s3_secret_access_key") && (
                      <p className="text-xs text-amber-400 mt-1">
                        Reset queued — will be applied on save
                      </p>
                    )}
                  </div>

                  {/* max_blob_size_mb */}
                  <div>
                    <label htmlFor="max-blob-size-mb" className="block text-sm font-medium text-surface-300 mb-1.5">
                      Max Blob Size (MB)
                    </label>
                    <div className="flex gap-2 items-start">
                      <input
                        id="max-blob-size-mb"
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
                          onClick={() => handleStageReset("max_blob_size_mb")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Reset max blob size to default"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    {reset.pendingResets.has("max_blob_size_mb") && (
                      <p className="text-xs text-amber-400 mt-1">
                        Reset queued — will be applied on save
                      </p>
                    )}
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
                      <SimpleSelect
                        aria-label="Image text extraction"
                        className="flex-1 max-w-[240px]"
                        options={[
                          { value: "none", label: "Disabled (store only)" },
                          { value: "ocr", label: "OCR (Tesseract)" },
                          { value: "vision", label: "Vision API (LLM)" },
                        ]}
                        value={form.image_extraction}
                        onValueChange={(value) => updateField("image_extraction", value)}
                      />
                      {isFieldSet("image_extraction") && (
                        <Button
                          onClick={() => handleStageReset("image_extraction")}
                          variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-brand-300 shrink-0 mt-0.5"
                          title="Reset image extraction to default"
                        >
                          <RotateCcw size={14} />
                        </Button>
                      )}
                    </div>
                    {reset.pendingResets.has("image_extraction") && (
                      <p className="text-xs text-amber-400 mt-1">
                        Reset queued — will be applied on save
                      </p>
                    )}
                    <p className="text-xs text-surface-500 mt-2">
                      <strong>OCR</strong> uses Tesseract locally (free).{" "}
                      <strong>Vision API</strong> uses your configured LLM provider
                      for higher accuracy on complex images. Requires Tesseract to be
                      installed on workers.
                    </p>
                  </div>
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
          onDiscard={() => { setForm({ ...initialForm }); reset.clearResets(); setDirty(false); }}
        />
      )}
    </div>
  );
}
