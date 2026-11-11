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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageGuide, GuideSettings } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/shared/skeleton";
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
  const [upgradeTarget, setUpgradeTarget] = useState<AddonEntry | null>(null);
  const [upgradeFile, setUpgradeFile] = useState<File | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
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

  /** Upgrade from a replacement bundle — picked via a visible dialog Field. */
  const handleUpgrade = (addon: AddonEntry) => {
    setUpgradeTarget(addon);
    setUpgradeFile(null);
    setUpgradeError(null);
  };

  const closeUpgrade = () => {
    if (upgrading) return;
    setUpgradeTarget(null);
    setUpgradeFile(null);
    setUpgradeError(null);
  };

  const handleUpgradeSubmit = async () => {
    if (!upgradeTarget) return;
    if (!upgradeFile) {
      setUpgradeError("Choose a replacement bundle file to upload");
      return;
    }
    if (upgradeFile.size > MAX_ADDON_BUNDLE_BYTES) {
      setUpgradeError(`Bundle too large — max ${MAX_ADDON_BUNDLE_LABEL}`);
      return;
    }
    const target = upgradeTarget;
    const bundle = upgradeFile;
    setUpgrading(true);
    setBusyId(target.id);
    try {
      await upgradeAddon(target.id, bundle);
      toast.success(`"${target.id}" upgraded`);
      setUpgradeTarget(null);
      setUpgradeFile(null);
      setUpgradeError(null);
      reload();
    } catch (err) {
      setUpgradeError(apiErrorMessage(err, `Failed to upgrade "${target.id}"`));
    } finally {
      setUpgrading(false);
      setBusyId(null);
    }
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
      <PageHeader
        title="Installed Add-ons"
        description="Upload bundles and manage platform add-ons."
        actions={
          <>
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
          </>
        }
      />

      <PageGuide title="Installed add-ons" illustration={<GuideSettings />}>
        <p>Installing an add-on uploads a bundle whose name and version must match its addon.toml exactly. The manifest signature must verify against the platform signing key — unsigned or tampered bundles are refused.</p>
        <p>Install is not the same as enabled: a newly installed add-on stays disabled platform-wide until you enable it, and each organization then enables it separately for itself.</p>
        <p>Upgrading swaps the bundle in place. Uninstalling removes the platform copy; its stored data is kept unless you purge it.</p>
      </PageGuide>

      {query.error && <ErrorState message={query.error} onRetry={reload} />}

      {query.isLoading && addons.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Loading add-ons">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card-base space-y-2 p-4">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-full" />
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
        <div className="mt-4 flex items-start gap-2">
          <Checkbox
            id="addon-purge-data"
            checked={purgeData}
            onCheckedChange={(checked) => setPurgeData(checked === true)}
            className="mt-0.5"
          />
          <label htmlFor="addon-purge-data" className="text-sm text-surface-400">
            Also delete add-on data (purge_data). This cannot be undone.
          </label>
        </div>
      </ConfirmDialog>

      {upgradeTarget && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) closeUpgrade();
          }}
          title={`Upgrade "${upgradeTarget.id}"`}
          description="Upload a replacement bundle file for this add-on."
          persistent={upgrading}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={closeUpgrade} disabled={upgrading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleUpgradeSubmit}
                loading={upgrading}
                disabled={!upgradeFile}
              >
                Upload and Upgrade
              </Button>
            </>
          }
        >
          <Field
            label="Replacement Bundle"
            htmlFor="addon-upgrade-file"
            required
            hint={`Accepted: .zip, .tar.gz, .tgz · Max ${MAX_ADDON_BUNDLE_LABEL}`}
            error={upgradeError ?? undefined}
          >
            <input
              id="addon-upgrade-file"
              type="file"
              accept=".zip,.tar.gz,.tgz"
              className="input-base"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setUpgradeFile(picked);
                setUpgradeError(
                  picked && picked.size > MAX_ADDON_BUNDLE_BYTES
                    ? `Bundle too large — max ${MAX_ADDON_BUNDLE_LABEL}`
                    : null,
                );
              }}
            />
          </Field>
          {upgradeFile && (
            <p className="mt-2 text-xs text-surface-500">
              {upgradeFile.name} · {(upgradeFile.size / 1024).toFixed(1)} KB — uploading shows
              an indeterminate state until the server responds.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
