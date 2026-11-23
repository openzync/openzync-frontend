"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  getSystemSettings,
  revealSystemSetting,
  apiErrorMessage,
  type SystemSettingItem,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";

export default function SuperadminRuntimePage() {
  // key → raw value; presence in this map means the row is revealed.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  // key currently being fetched by the reveal endpoint.
  const [revealing, setRevealing] = useState<string | null>(null);

  const settingsQuery = useApiQuery<{ data: SystemSettingItem[] }>(() =>
    getSystemSettings(),
  );
  const settings = settingsQuery.data?.data ?? [];
  const settingsLoading = settingsQuery.isLoading;
  const settingsError = settingsQuery.error;

  /** Reveal raw value once; Hide only clears local state — never refetches. */
  const handleToggleReveal = async (item: SystemSettingItem) => {
    if (revealed[item.key]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[item.key];
        return next;
      });
      return;
    }
    setRevealing(item.key);
    try {
      const res = await revealSystemSetting(item.key);
      setRevealed((prev) => ({ ...prev, [item.key]: res.value }));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to reveal setting"));
    } finally {
      setRevealing(null);
    }
  };

  // Group by category, preserving the server's category order.
  const groupedSettings = settings.reduce<Map<string, SystemSettingItem[]>>(
    (acc, item) => {
      const list = acc.get(item.category) ?? [];
      list.push(item);
      acc.set(item.category, list);
      return acc;
    },
    new Map(),
  );

  if (settingsLoading) {
    return (
      <div className="space-y-4">
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
        <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Runtime settings (read-only, masked) ───────────────────────────── */}
      <div className="card-base p-6">
        <div className="mb-6">
          <h2 className="font-display text-base font-medium">System Settings (runtime)</h2>
          <p className="text-xs text-surface-400">
            Platform runtime configuration from the secrets backend — read-only
          </p>
        </div>

        {settingsError && <ErrorState message={settingsError} onRetry={settingsQuery.refetch} />}

        <div className="divide-y divide-surface-800">
          {[...groupedSettings.entries()].map(([category, items]) => (
            <div key={category} className="py-4 first:pt-0 last:pb-0">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {items.map((item) => {
                  const raw = revealed[item.key];
                  const isRevealed = raw !== undefined;
                  return (
                    <div
                      key={item.key}
                      className="flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-surface-800/40"
                    >
                      <div className="min-w-0 flex-1">
                        <code className="block font-mono text-xs text-surface-300 truncate" title={item.key}>
                          {item.key}
                        </code>
                        {!item.is_set ? (
                          <span className="block mt-1 text-sm italic text-surface-600">Not set</span>
                        ) : isRevealed ? (
                          <code className="block mt-1 font-mono text-xs text-warning break-all" title={item.key}>
                            {raw}
                          </code>
                        ) : (
                          <span className="block mt-1 font-mono text-sm text-surface-400 break-all">
                            {item.masked_value ?? ""}
                          </span>
                        )}
                      </div>
                      {item.is_set && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                          loading={revealing === item.key}
                          disabled={revealing !== null && revealing !== item.key}
                          onClick={() => void handleToggleReveal(item)}
                        >
                          {isRevealed ? "Hide" : "Reveal"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
