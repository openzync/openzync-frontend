"use client";

import { Activity, AlertCircle, ArrowUpCircle, Power, Trash2 } from "lucide-react";
import type { AddonEntry } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function healthVariant(health: string | null | undefined): "success" | "warning" | "error" | "default" {
  if (!health) return "warning";
  switch (health.toLowerCase()) {
    case "healthy":
    case "ok":
      return "success";
    case "degraded":
    case "unknown":
      return "warning";
    case "error":
    case "unhealthy":
    case "failed":
      return "error";
    default:
      return "default";
  }
}

interface AddonCardProps {
  addon: AddonEntry;
  /** Id of the addon with an in-flight action — null when idle. */
  busyId: string | null;
  onToggle: (addon: AddonEntry) => void;
  onUpgrade: (addon: AddonEntry) => void;
  onCheckHealth: (addon: AddonEntry) => void;
  onUninstall: (addon: AddonEntry) => void;
}

export function AddonCard({
  addon,
  busyId,
  onToggle,
  onUpgrade,
  onCheckHealth,
  onUninstall,
}: AddonCardProps) {
  const busy = busyId === addon.id;
  return (
    <article aria-label={`Add-on ${addon.id}`} className="card-base p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-text-primary">
            {addon.id}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-surface-400">
            v{addon.version} · {addon.status}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex rounded-full">
                <Badge variant={addon.enabled ? "success" : "default"} size="sm">
                  {addon.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {addon.enabled
                ? "Enabled platform-wide — use Disable to turn it off for all organizations"
                : "Disabled platform-wide — use Enable to turn it on for all organizations"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex rounded-full">
                <Badge variant={addon.health ? healthVariant(addon.health) : "warning"} size="sm">
                  {addon.health ?? "Not checked"}
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {addon.health
                ? `Last check reported “${addon.health}” — use Health to re-check`
                : "Not checked yet — use the Health button to run a check"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {typeof addon.error === "string" && addon.error ? (
        <p role="alert" className="mt-3 flex items-center gap-1.5 rounded-md bg-error/10 border border-error/30 px-3 py-2 text-xs text-error">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>{addon.error}</span>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Power size={14} />}
          disabled={busy}
          onClick={() => onToggle(addon)}
          aria-label={addon.enabled ? `Disable ${addon.id}` : `Enable ${addon.id}`}
        >
          {addon.enabled ? "Disable" : "Enable"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowUpCircle size={14} />}
          disabled={busy}
          onClick={() => onUpgrade(addon)}
          aria-label={`Upgrade ${addon.id}`}
        >
          Upgrade
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Activity size={14} />}
          disabled={busy}
          onClick={() => onCheckHealth(addon)}
          aria-label={`Check health of ${addon.id}`}
        >
          Health
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 size={14} />}
          disabled={busy}
          onClick={() => onUninstall(addon)}
          aria-label={`Uninstall ${addon.id}`}
          className="ml-auto"
        >
          Uninstall
        </Button>
      </div>
    </article>
  );
}

interface AddonListProps {
  addons: AddonEntry[];
  busyId: string | null;
  onToggle: (addon: AddonEntry) => void;
  onUpgrade: (addon: AddonEntry) => void;
  onCheckHealth: (addon: AddonEntry) => void;
  onUninstall: (addon: AddonEntry) => void;
}

export function AddonList({
  addons,
  busyId,
  onToggle,
  onUpgrade,
  onCheckHealth,
  onUninstall,
}: AddonListProps) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {addons.map((addon) => (
        <li key={addon.id}>
          <AddonCard
            addon={addon}
            busyId={busyId}
            onToggle={onToggle}
            onUpgrade={onUpgrade}
            onCheckHealth={onCheckHealth}
            onUninstall={onUninstall}
          />
        </li>
      ))}
    </ul>
  );
}
