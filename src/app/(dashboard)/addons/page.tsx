"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Power, Puzzle, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  apiErrorMessage,
  disableOrgAddon,
  enableOrgAddon,
  listOrgAddons,
  type OrgAddonEntry,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { RequirePermission } from "@/components/shared/require-permission";
import { PageGuide, GuideSettings } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/shared/skeleton";

function OrgAddonRow({
  addon,
  busy,
  onToggle,
}: {
  addon: OrgAddonEntry;
  busy: boolean;
  onToggle: (addon: OrgAddonEntry) => void;
}) {
  const router = useRouter();
  const toggleButton = (
    <Button
      variant="secondary"
      size="sm"
      icon={<Power size={14} />}
      disabled={busy || !addon.platform_enabled}
      onClick={() => onToggle(addon)}
      aria-label={addon.org_enabled ? `Disable ${addon.id} for this organization` : `Enable ${addon.id} for this organization`}
    >
      {addon.org_enabled ? "Disable" : "Enable"}
    </Button>
  );
  const manageButton = (
    <Button
      variant="secondary"
      size="sm"
      icon={<Settings2 size={14} />}
      disabled={busy || !addon.platform_enabled}
      onClick={() => router.push(`/addons/${encodeURIComponent(addon.id)}`)}
      aria-label={`Manage ${addon.id} settings`}
    >
      Manage
    </Button>
  );
  const actionButtons = (
    <>
      {toggleButton}
      {manageButton}
    </>
  );

  return (
    <li className="card-base p-4" aria-label={`Add-on ${addon.id}`}>
      <div className="min-w-0">
        <Link
          href={`/addons/${encodeURIComponent(addon.id)}`}
          className="truncate text-sm font-medium text-text-primary hover:text-signal hover:underline"
        >
          {addon.id}
        </Link>
        <p className="mt-0.5 font-mono text-xs text-surface-400">v{addon.version}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex rounded-full">
              <Badge variant={addon.platform_enabled ? "success" : "default"} size="sm">
                {addon.platform_enabled ? "Platform on" : "Platform off"}
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {addon.platform_enabled
              ? "Installed and enabled platform-wide by the administrator"
              : "Disabled platform-wide by the administrator — the org toggle is unavailable"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex rounded-full">
              <Badge variant={addon.org_enabled ? "success" : "default"} size="sm">
                {addon.org_enabled ? "Org enabled" : "Org disabled"}
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {addon.org_enabled
              ? "Enabled for this organization — use Disable to turn it off"
              : "Disabled for this organization — use Enable to turn it on"}
          </TooltipContent>
        </Tooltip>
      </div>
      {addon.platform_enabled ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">{actionButtons}</div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Disabled buttons emit no hover events — the span carries the tip. */}
            <span className="mt-4 inline-flex cursor-not-allowed flex-wrap items-center gap-2">
              {actionButtons}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Disabled platform-wide by the administrator
          </TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}

function AddonsContent() {
  const [refreshKey, setRefreshKey] = useState(0);
  const query = useApiQuery<OrgAddonEntry[]>((signal) => listOrgAddons({ signal }), {
    refreshKey,
  });
  const addons = query.data ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => setRefreshKey((k) => k + 1);

  const handleToggle = async (addon: OrgAddonEntry) => {
    setBusyId(addon.id);
    try {
      if (addon.org_enabled) {
        await disableOrgAddon(addon.id);
        toast.success(`“${addon.id}” disabled for this organization`);
      } else {
        await enableOrgAddon(addon.id);
        toast.success(`“${addon.id}” enabled for this organization`);
      }
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to update “${addon.id}”`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Add-ons"
        description="Optional integrations enabled for this organization."
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={reload}
            disabled={query.isLoading}
            aria-label="Refresh add-on list"
          >
            Refresh
          </Button>
        }
      />

      <PageGuide title="Organization add-ons" illustration={<GuideSettings />}>
        <p>These are the integrations the platform administrator has published for this organization. Enabling one here turns it on for your organization only.</p>
        <p>Availability is gated platform-wide: when the administrator disables an add-on, its toggle is unavailable until it is re-enabled.</p>
      </PageGuide>

      {query.error && <ErrorState message={query.error} onRetry={reload} />}

      {query.isLoading && addons.length === 0 ? (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Loading add-ons">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="card-base space-y-3 p-4" aria-label="Loading add-on">
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
              </div>
            </li>
          ))}
        </ul>
      ) : !query.error && addons.length === 0 ? (
        <div className="card-base">
          <EmptyState
            icon={Puzzle}
            title="No add-ons available"
            description="The platform administrator hasn’t published any add-ons for this organization yet."
          />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {addons.map((addon) => (
            <OrgAddonRow
              key={addon.id}
              addon={addon}
              busy={busyId === addon.id}
              onToggle={handleToggle}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OrgAddonsPage() {
  return (
    <RequirePermission permission="configuration:read">
      <AddonsContent />
    </RequirePermission>
  );
}
