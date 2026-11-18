"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { apiErrorMessage, checkAddonUpdates, installAddon } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { toast } from "sonner";

type SourceKind = "github" | "local";

/**
 * Install header: source toggle (GitHub URL vs local path) + optional tag,
 * plus the check-updates button. Calls back so the page reloads the table.
 */
export function InstallForm({ onChanged }: { onChanged: () => Promise<void> }) {
  const [kind, setKind] = useState<SourceKind>("github");
  const [source, setSource] = useState("");
  const [tag, setTag] = useState("");
  const [installing, setInstalling] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleInstall = async () => {
    if (!source.trim()) {
      toast.error(kind === "github" ? "GitHub URL is required" : "Local path is required");
      return;
    }
    setInstalling(true);
    try {
      await installAddon(
        kind === "github"
          ? { github_url: source.trim(), ...(tag.trim() ? { tag: tag.trim() } : {}) }
          : { local_path: source.trim() },
      );
      toast.success("Add-on installed");
      setSource("");
      setTag("");
      await onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to install add-on"));
    } finally {
      setInstalling(false);
    }
  };

  const handleCheckUpdates = async () => {
    setChecking(true);
    try {
      await checkAddonUpdates();
      toast.success("Update check complete");
      await onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to check for updates"));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="card-base p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex shrink-0 gap-1 rounded-md bg-surface-800 p-1" role="tablist" aria-label="Install source">
          {(["github", "local"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-accent-300",
                kind === k ? "bg-surface-700 text-text-primary" : "text-surface-400 hover:text-white",
              )}
            >
              {k === "github" ? "GitHub URL" : "Local path"}
            </button>
          ))}
        </div>

        <div className="flex-1">
          <Field
            label={kind === "github" ? "GitHub URL" : "Local path"}
            htmlFor="addon-source"
          >
            <input
              id="addon-source"
              className="input-base"
              placeholder={kind === "github" ? "https://github.com/org/addon" : "/srv/addons/my-addon"}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleInstall();
              }}
            />
          </Field>
        </div>

        <div className="w-full lg:w-40">
          <Field label="Tag (optional)" htmlFor="addon-tag">
            <input
              id="addon-tag"
              className="input-base font-mono"
              placeholder="v1.2.0"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleInstall();
              }}
            />
          </Field>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant="primary"
            size="md"
            icon={<Download size={14} />}
            loading={installing}
            onClick={() => void handleInstall()}
          >
            Install
          </Button>
          <Button
            variant="secondary"
            size="md"
            icon={<RefreshCw size={14} />}
            loading={checking}
            onClick={() => void handleCheckUpdates()}
            title="Refresh update flags for all add-ons"
          >
            Check updates
          </Button>
        </div>
      </div>
    </div>
  );
}
