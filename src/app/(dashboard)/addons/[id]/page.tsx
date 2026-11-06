"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Power } from "lucide-react";
import { toast } from "sonner";
import {
  apiErrorMessage,
  disableOrgAddon,
  enableOrgAddon,
  getAddonSettings,
  listAddonPanels,
  listOrgAddons,
  type OrgAddonEntry,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { RequirePermission } from "@/components/shared/require-permission";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/shared/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { AddonSettingsForm } from "../_components/settings-form";
import { PanelWidget } from "../_components/panel-widget";

function statusLine(addon: OrgAddonEntry): string {
  if (!addon.platform_enabled) {
    return "Unavailable — disabled platform-wide by the administrator";
  }
  if (addon.org_enabled) {
    return "Operational for this organization";
  }
  return "Installed but disabled for this organization";
}

function AddonDetailContent({ addonId }: { addonId: string }) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const addonsQuery = useApiQuery<OrgAddonEntry[]>((signal) => listOrgAddons({ signal }), {
    refreshKey,
  });
  const addon = useMemo(
    () => (addonsQuery.data ?? []).find((a) => a.id === addonId) ?? null,
    [addonsQuery.data, addonId],
  );

  const panelsQuery = useApiQuery(
    (signal) => listAddonPanels(addonId, { signal }),
    { enabled: addon !== null, refreshKey },
  );
  const panels = panelsQuery.data ?? [];

  const settingsQuery = useApiQuery(
    (signal) => getAddonSettings(addonId, { signal }),
    { enabled: addon !== null && addon.has_settings, refreshKey },
  );
  const [settingsNonce, setSettingsNonce] = useState(0);

  const [toggling, setToggling] = useState(false);
  const reload = () => setRefreshKey((k) => k + 1);

  const handleToggle = async () => {
    if (!addon) return;
    setToggling(true);
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
      setToggling(false);
    }
  };

  if (addonsQuery.isLoading && !addonsQuery.data) {
    return (
      <div className="space-y-4" aria-label="Loading add-on">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (addonsQuery.error) {
    return <ErrorState message={addonsQuery.error} onRetry={reload} />;
  }

  if (addonsQuery.data && !addon) {
    return (
      <ErrorState
        message={`Add-on “${addonId}” was not found for this organization`}
        onRetry={reload}
      />
    );
  }

  if (!addon) return null;

  const status = statusLine(addon);
  const showSettings = addon.has_settings;
  const defaultTab = panels[0]?.id;

  const toggleButton = (
    <Button
      variant="secondary"
      size="sm"
      icon={<Power size={14} />}
      disabled={toggling || !addon.platform_enabled}
      onClick={handleToggle}
      aria-label={addon.org_enabled ? `Disable ${addon.id} for this organization` : `Enable ${addon.id} for this organization`}
    >
      {addon.org_enabled ? "Disable" : "Enable"}
    </Button>
  );

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/addons")}
        className="-ml-2"
      >
        <ArrowLeft size={14} />
        Back to add-ons
      </Button>

      <PageHeader
        title={addon.id}
        description={`Version ${addon.version}`}
        actions={
          addon.platform_enabled ? (
            toggleButton
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-not-allowed">{toggleButton}</span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Disabled platform-wide by the administrator
              </TooltipContent>
            </Tooltip>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-1.5" aria-label="Add-on status">
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
              ? "Enabled for this organization — use the Disable button above to turn it off"
              : "Disabled for this organization — use the Enable button above to turn it on"}
          </TooltipContent>
        </Tooltip>
      </div>
      <p role="status" className="text-sm text-surface-400">
        {status}
      </p>

      {showSettings &&
        (settingsQuery.isLoading && !settingsQuery.data ? (
          <div className="card-base space-y-3 p-4" aria-label="Loading settings">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : settingsQuery.error || !settingsQuery.data ? (
          <ErrorState
            message={settingsQuery.error ?? "Settings unavailable"}
            onRetry={settingsQuery.refetch}
          />
        ) : (
          <AddonSettingsForm
            key={`${addon.id}-${settingsNonce}`}
            addonId={addon.id}
            schema={settingsQuery.data.schema}
            initialValues={settingsQuery.data.values}
            onSaved={() => {
              // Remount with the saved values, then refetch behind it.
              setSettingsNonce((n) => n + 1);
              settingsQuery.refetch();
            }}
          />
        ))}

      {panels.length > 0 ? (
        <Tabs defaultValue={defaultTab} variant="underline">
          <TabsList aria-label={`${addon.id} panels`}>
            {panels.map((panel) => (
              <Tooltip key={panel.id}>
                <TooltipTrigger asChild>
                  <TabsTrigger value={panel.id}>{panel.title}</TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Served from {panel.path}</TooltipContent>
              </Tooltip>
            ))}
          </TabsList>

          {panels.map((panel) => (
            <TabsContent key={panel.id} value={panel.id} className="pt-4">
              <PanelWidget addonId={addon.id} panel={panel} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        !showSettings && (
          <div className="card-base mt-4 p-4" role="status">
            {panelsQuery.isLoading ? (
              <div aria-label="Loading panels">
                <Skeleton className="h-4 w-48" />
              </div>
            ) : panelsQuery.error ? (
              <ErrorState message={panelsQuery.error} onRetry={panelsQuery.refetch} />
            ) : (
              <p className="text-sm text-surface-400">
                This add-on exposes no settings or panels for this organization.
              </p>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default function OrgAddonDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return (
    <RequirePermission permission="configuration:read">
      <AddonDetailContent addonId={id} />
    </RequirePermission>
  );
}
