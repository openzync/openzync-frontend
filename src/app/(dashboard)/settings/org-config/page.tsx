"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  getMyConfig,
  updateMyConfig,
  apiErrorMessage,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/user-context";

/** Secret values are never rendered — only whether one is set. */
function isSecretKey(key: string): boolean {
  return /key|secret|pass|token/i.test(key);
}

function displayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (isSecretKey(key)) return "Set";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Personal configuration overview — the caller's own overrides.
 * Anything not overridden falls back to system defaults.
 */
export default function ConfigOverviewPage() {
  const { can, loading: roleLoading } = useUser();
  const canRead = can("configuration:read");
  const mineQuery = useApiQuery(() => getMyConfig(), { enabled: canRead });
  const [resetting, setResetting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loading = mineQuery.isLoading;
  const error = mineQuery.error ?? actionError;
  const myStored = (mineQuery.data?.override ?? {}) as Record<string, unknown>;
  const overriddenKeys = Object.keys(myStored).sort();

  const handleRetry = () => {
    mineQuery.refetch();
  };

  const handleReset = async (key: string) => {
    setResetting(key);
    try {
      // null clears the override — the system default applies again.
      await updateMyConfig({ [key]: null });
      setActionError(null);
      toast.success(`"${key}" reset to the system default`);
      mineQuery.refetch();
    } catch (err) {
      const message = apiErrorMessage(err, "Failed to reset override");
      setActionError(message);
      toast.error(message);
    } finally {
      setResetting(null);
    }
  };

  // Role still loading — avoid flashing "Admin access required" at admins.
  if (roleLoading) {
    return (
      <div className="card-base p-6">
        <div className="h-5 w-44 rounded bg-surface-800 animate-pulse" />
        <div className="mt-4 h-12 rounded-lg bg-surface-800 animate-pulse" />
      </div>
    );
  }

  // No read permission (or role fetch failed → unknown treated as denied):
  // mirror the backend's 403 message.
  if (!canRead) {
    return (
      <ErrorState message="This action requires the 'configuration:read' permission." />
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={handleRetry} />;
  }

  return (
    <div className="space-y-4">
      {/* ── My overrides (personal layer, resettable) ──────────────────────── */}
      <div className="card-base p-6">
        <div className="mb-6">
          <h2 className="font-display text-lg font-medium">My Overrides</h2>
          <p className="text-sm text-surface-400 mt-0.5">
            Your personal overrides. Edit them in the{" "}
            <Link href="/settings/org-config/llm" className="text-accent-300 hover:text-accent-200">
              tabs above
            </Link>
            ; reset one here to fall back to the system default.
          </p>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="space-y-2">
              <div className="h-9 rounded bg-surface-800 animate-pulse w-full" />
              <div className="h-9 rounded bg-surface-800 animate-pulse w-48" />
            </div>
          ) : overriddenKeys.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No personal overrides"
              description="Your settings follow the system defaults. Change any field in the tabs above to create an override."
            />
          ) : (
            <ul className="divide-y divide-surface-800 rounded-lg border border-surface-800">
              {overriddenKeys.map((key) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <code className="block font-mono text-xs text-surface-300 truncate" title={key}>
                      {key}
                    </code>
                    <span className="block mt-0.5 text-sm text-surface-200 break-all">
                      {displayValue(key, myStored[key])}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleReset(key)}
                    loading={resetting === key}
                    disabled={resetting !== null}
                    className="gap-1.5 shrink-0"
                    title={`Reset "${key}" to the system default`}
                  >
                    <RotateCcw size={14} />
                    Reset to default
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
