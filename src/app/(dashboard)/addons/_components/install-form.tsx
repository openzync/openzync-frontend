"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { apiErrorMessage, installAddon } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { toast } from "sonner";

type SourceKind = "github" | "local";

/**
 * Install dialog: source toggle (GitHub URL vs local path) + optional tag.
 * Calls back so the page reloads the table.
 */
export function InstallForm({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [kind, setKind] = useState<SourceKind>("github");
  const [source, setSource] = useState("");
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    if (!source.trim()) {
      setError(kind === "github" ? "GitHub URL is required" : "Local path is required");
      return;
    }
    setInstalling(true);
    setError(null);
    try {
      await installAddon(
        kind === "github"
          ? { github_url: source.trim(), ...(tag.trim() ? { tag: tag.trim() } : {}) }
          : { local_path: source.trim() },
      );
      onClose();
      toast.success("Add-on installed");
      await onChanged();
    } catch (err) {
      const message = apiErrorMessage(err, "Failed to install add-on");
      setError(message);
      toast.error(message);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !installing) onClose();
      }}
      title="Install Add-on"
      description="Install from a GitHub repository URL or a local path on the server."
      persistent={installing}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={installing}>Cancel</Button>
          <Button variant="primary" size="sm" type="button" onClick={() => void handleInstall()} loading={installing}>
            Install
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleInstall(); }} className="space-y-4">
        <div className="flex gap-1 rounded-md bg-surface-800 p-1" role="tablist" aria-label="Install source">
          {(["github", "local"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => { setKind(k); if (error) setError(null); }}
              disabled={installing}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-accent-300",
                "disabled:pointer-events-none disabled:opacity-50",
                kind === k ? "bg-surface-700 text-text-primary" : "text-surface-400 hover:text-white",
              )}
            >
              {k === "github" ? "GitHub URL" : "Local path"}
            </button>
          ))}
        </div>

        <Field
          label={kind === "github" ? "GitHub URL" : "Local path"}
          htmlFor="addon-source"
        >
          <input
            id="addon-source"
            className="input-base"
            placeholder={kind === "github" ? "https://github.com/org/addon" : "/srv/addons/my-addon"}
            value={source}
            onChange={(e) => { setSource(e.target.value); if (error) setError(null); }}
            disabled={installing}
          />
        </Field>

        <Field label="Tag (optional)" htmlFor="addon-tag">
            <input
              id="addon-tag"
              className="input-base font-mono"
              placeholder="v1.2.0"
              value={tag}
              onChange={(e) => { setTag(e.target.value); if (error) setError(null); }}
              disabled={installing}
            />
        </Field>

        {error && (
          <div className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error flex items-center gap-2">
            <AlertCircle size={14} />{error}
          </div>
        )}
      </form>
    </Dialog>
  );
}
