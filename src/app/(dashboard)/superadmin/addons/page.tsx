"use client";

import { useState } from "react";
import { PackagePlus, Puzzle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  apiErrorMessage,
  disableAddon,
  enableAddon,
  getAddonHealth,
  installAddonBundle,
  listAddons,
  MAX_ADDON_BUNDLE_BYTES,
  MAX_ADDON_BUNDLE_LABEL,
  uninstallAddon,
  upgradeAddon,
  type AddonEntry,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { AddonList } from "./_components/addon-card";
import { InstallDialog } from "./_components/install-dialog";

export default function SuperadminAddonsPage() {
  // refreshKey (not an interval): mutations bump it, the manual Refresh
  // button bumps it — each bump re-runs the GET via useApiQuery.
  const [refreshKey, setRefreshKey] = useState(0);
  const query = useApiQuery<AddonEntry[]>(
    (signal) => listAddons({ signal }),
    { refreshKey },
  );
  const addons = query.data ?? [];

  const [busyId, setBusyId] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<AddonEntry | null>(null);
  const [purgeData, setPurgeData] = useState(false);

  const reload = () => setRefreshKey((k) => k + 1);

  /** Single-card action wrapper: per-card busy state, toast, then refetch. */
  const runAction = async (
    id: string,
    fn: () => Promise<unknown>,
    okMessage: string,
    failMessage: string,
  ) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(okMessage);
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err, failMessage));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = (addon: AddonEntry) =>
    addon.enabled
      ? runAction(addon.id, () => disableAddon(addon.id), `"${addon.id}" disabled`, `Failed to disable "${addon.id}"`)
      : runAction(addon.id, () => enableAddon(addon.id), `"${addon.id}" enabled`, `Failed to enable "${addon.id}"`);

  /** Upgrade from a replacement bundle — picked via a file prompt on the card action. */
  const handleUpgrade = (addon: AddonEntry) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,.tar.gz,.tgz";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_ADDON_BUNDLE_BYTES) {
        toast.error(`Bundle too large — max ${MAX_ADDON_BUNDLE_LABEL}`);
        return;
      }
      void runAction(
        addon.id,
        () => upgradeAddon(addon.id, file),
        `"${addon.id}" upgraded`,
        `Failed to upgrade "${addon.id}"`,
      );
    };
    input.click();
  };

  const handleCheckHealth = async (addon: AddonEntry) => {
    setBusyId(addon.id);
    try {
      const health = await getAddonHealth(addon.id);
      const checks = health.checks ?? {};
      const names = Object.keys(checks);
      const detail = health.degraded
        ? `degraded: ${health.degraded}`
        : names.length > 0
          ? `${names.length} check${names.length === 1 ? "" : "s"} ok`
          : health.status;
      toast.success(`"${addon.id}" health: ${detail}`);
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to check health of "${addon.id}"`));
    } finally {
      setBusyId(null);
    }
  };

  const handleInstallBundle = async (file: File, name: string, version: string) => {
    await installAddonBundle(file, name, version);
    setShowInstall(false);
    toast.success("Add-on installed");
    reload();
  };

  const handleUninstall = async () => {
    if (!purgeTarget) return;
    const target = purgeTarget;
    setBusyId(target.id);
    try {
      await uninstallAddon(target.id, purgeData);
      setPurgeTarget(null);
      setPurgeData(false);
      toast.success(`"${target.id}" uninstalled`);
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to uninstall "${target.id}"`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-medium">Installed Add-ons</h2>
        <div className="flex items-center gap-2">
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
          <Button
            variant="primary"
            size="sm"
            icon={<PackagePlus size={14} />}
            onClick={() => setShowInstall(true)}
          >
            Install Add-on
          </Button>
        </div>
      </div>

      {query.error && <ErrorState message={query.error} onRetry={reload} />}

      {query.isLoading && addons.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2" aria-label="Loading add-ons">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card-base p-4">
              <div className="h-5 w-44 rounded bg-surface-800 animate-pulse" />
              <div className="mt-2 h-4 w-28 rounded bg-surface-800 animate-pulse" />
              <div className="mt-4 h-8 w-full rounded bg-surface-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : !query.error && addons.length === 0 ? (
        <div className="card-base">
          <EmptyState
            icon={Puzzle}
            title="No add-ons installed"
            description="Upload a bundle file to extend the platform."
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<PackagePlus size={14} />}
                onClick={() => setShowInstall(true)}
              >
                Install Add-on
              </Button>
            }
          />
        </div>
      ) : (
        <AddonList
          addons={addons}
          busyId={busyId}
          onToggle={handleToggle}
          onUpgrade={handleUpgrade}
          onCheckHealth={handleCheckHealth}
          onUninstall={(addon) => {
            setPurgeTarget(addon);
            setPurgeData(false);
          }}
        />
      )}

      {showInstall && (
        <InstallDialog
          onClose={() => setShowInstall(false)}
          onInstallBundle={handleInstallBundle}
        />
      )}

      <ConfirmDialog
        open={purgeTarget !== null}
        title={`Uninstall "${purgeTarget?.id}"?`}
        message="The add-on is removed from the platform. Its stored data is kept unless you purge it below."
        confirmLabel="Uninstall"
        variant="danger"
        loading={busyId !== null}
        onConfirm={handleUninstall}
        onCancel={() => {
          setPurgeTarget(null);
          setPurgeData(false);
        }}
      >
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-surface-400">
          <input
            type="checkbox"
            checked={purgeData}
            onChange={(e) => setPurgeData(e.target.checked)}
            className="mt-1"
          />
          Also delete add-on data (purge_data). This cannot be undone.
        </label>
      </ConfirmDialog>
    </div>
  );
}
