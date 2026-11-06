"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { ApiError, MAX_ADDON_BUNDLE_BYTES, MAX_ADDON_BUNDLE_LABEL } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";

interface InstallDialogProps {
  onClose: () => void;
  onInstallBundle: (file: File, name: string, version: string) => Promise<void>;
}

/**
 * Add-on install dialog: bundle file + the expected name/version (must match
 * addon.toml — the backend fail-closes on mismatch). The parent closes on
 * success; errors stay inline so inputs are preserved for retry.
 */
export function InstallDialog({ onClose, onInstallBundle }: InstallDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ file?: string; name?: string; version?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const clearFieldError = (field: "file" | "name" | "version") =>
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const handleUpload = () => {
    const next: typeof fieldErrors = {};
    if (!file) {
      next.file = "Choose a bundle file to upload";
    } else if (file.size > MAX_ADDON_BUNDLE_BYTES) {
      next.file = `Bundle too large — max ${MAX_ADDON_BUNDLE_LABEL}`;
    }
    if (!name.trim()) {
      next.name = "Add-on name is required";
    }
    if (!version.trim()) {
      next.version = "Add-on version is required";
    }
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;
    const bundle = file as File;
    setSubmitting(true);
    setError(null);
    void onInstallBundle(bundle, name.trim(), version.trim())
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Install failed");
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const canSubmit =
    file !== null &&
    file.size <= MAX_ADDON_BUNDLE_BYTES &&
    name.trim() !== "" &&
    version.trim() !== "";

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      title="Install Add-on"
      description="Upload a bundle file with the name and version declared in its addon.toml."
      persistent={submitting}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleUpload}
            loading={submitting}
            disabled={!canSubmit}
          >
            Upload and Install
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Bundle File"
          htmlFor="addon-bundle"
          required
          hint={`Accepted: .zip, .tar.gz, .tgz · Max ${MAX_ADDON_BUNDLE_LABEL}`}
          error={fieldErrors.file}
        >
          <input
            id="addon-bundle"
            type="file"
            accept=".zip,.tar.gz,.tgz"
            className="input-base"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              setFile(picked);
              setFieldErrors((prev) => ({
                ...prev,
                file:
                  picked && picked.size > MAX_ADDON_BUNDLE_BYTES
                    ? `Bundle too large — max ${MAX_ADDON_BUNDLE_LABEL}`
                    : undefined,
              }));
            }}
          />
        </Field>
        {file && (
          <p className="text-xs text-surface-500">
            {file.name} · {(file.size / 1024).toFixed(1)} KB — uploading shows
            an indeterminate state until the server responds.
          </p>
        )}
        <Field
          label="Add-on Name"
          htmlFor="addon-name"
          required
          hint="Must match the name in addon.toml exactly"
          error={fieldErrors.name}
        >
          <input
            id="addon-name"
            className="input-base"
            placeholder="e.g. acme-vector-search"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
              clearFieldError("name");
            }}
          />
        </Field>
        <Field
          label="Version"
          htmlFor="addon-version"
          required
          hint="Must match the version in addon.toml exactly"
          error={fieldErrors.version}
        >
          <input
            id="addon-version"
            className="input-base font-mono"
            placeholder="e.g. 1.2.0"
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              if (error) setError(null);
              clearFieldError("version");
            }}
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-4 flex items-center gap-1.5 rounded-md bg-error/10 border border-error/30 px-3 py-2 text-xs text-error">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </Dialog>
  );
}
