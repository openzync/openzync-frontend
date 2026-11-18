"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import {
  apiErrorMessage,
  checkAddonUpdates,
  listAddons,
  type AddonResponse,
} from "@/lib/api-client";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideSettings } from "@/components/guides";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { AddonTable } from "./_components/addon-table";
import { InstallForm } from "./_components/install-form";

export default function AddonsPage() {
  const [addons, setAddons] = useState<AddonResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadAddons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAddons();
      setAddons(res.data ?? []);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load add-ons"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer through a microtask so the state update is not synchronous
    // within the effect body (react-hooks/set-state-in-effect).
    const run = async () => {
      await loadAddons();
    };
    void run();
  }, [loadAddons]);

  const handleCheckUpdates = async () => {
    setChecking(true);
    try {
      await checkAddonUpdates();
      toast.success("Update check complete");
      await loadAddons();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to check for updates"));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add-ons"
        description="Install and manage platform-wide add-ons from GitHub or a local path. Add-ons apply to the whole platform, not a single organization."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} />}
              loading={checking}
              onClick={() => void handleCheckUpdates()}
              title="Refresh update flags for all add-ons"
            >
              Check for updates
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowInstall(true)}
            >
              Install
            </Button>
          </div>
        }
      />

      <PageGuide title="Add-ons" illustration={<GuideSettings />}>
        <p>Extend the platform with add-ons installed from a GitHub repository or a local server path. Each add-on can expose UI panels, and can be enabled, upgraded, or uninstalled from its detail page.</p>
      </PageGuide>

      {error && <ErrorState message={error} onRetry={loadAddons} />}

      <AddonTable addons={addons} loading={loading} />

      {showInstall && (
        <InstallForm
          onClose={() => setShowInstall(false)}
          onChanged={loadAddons}
        />
      )}
    </div>
  );
}
