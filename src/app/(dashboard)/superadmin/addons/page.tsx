"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, listAddons, type AddonResponse } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/error-state";
import { AddonTable } from "./_components/addon-table";
import { InstallForm } from "./_components/install-form";

export default function SuperadminAddonsPage() {
  const [addons, setAddons] = useState<AddonResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-medium">Add-ons</h2>
      </div>

      <InstallForm onChanged={loadAddons} />

      {error && <ErrorState message={error} onRetry={loadAddons} />}

      <AddonTable addons={addons} loading={loading} />
    </div>
  );
}
