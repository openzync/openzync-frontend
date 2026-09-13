"use client";

import { useEffect } from "react";
import { PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ConnectionTestResult } from "@/hooks/use-connection-test";

interface ConnectionTestButtonProps {
  testing: boolean;
  result: ConnectionTestResult | null;
  error: string | null;
  onTest: () => Promise<ConnectionTestResult | null>;
  disabled?: boolean;
}

const MAX_DETAIL_CHARS = 120;

function truncate(detail: string): string {
  return detail.length > MAX_DETAIL_CHARS
    ? `${detail.slice(0, MAX_DETAIL_CHARS).trimEnd()}…`
    : detail;
}

/**
 * Test-connection action for org-config credential cards.
 *
 * Renders a secondary Button (loading/disabled states via the shared Button)
 * plus an inline success/error hint: latency on success, truncated detail on
 * failure. Toasts mirror the hint so the outcome is visible after scroll.
 * State lives in useConnectionTest (owned by the page) so the page can also
 * disable Save while a test is in flight.
 */
export function ConnectionTestButton({
  testing,
  result,
  error,
  onTest,
  disabled = false,
}: ConnectionTestButtonProps) {
  useEffect(() => {
    if (!result) return;
    if (result.ok) {
      toast.success(`Connection test passed in ${result.latency_ms} ms`);
    } else {
      toast.error(result.detail ?? "Connection test failed");
    }
  }, [result]);

  useEffect(() => {
    // Transport/API failures leave result null — toast the normalized error.
    // (ok:false responses already toasted via result above.)
    if (error && !result) toast.error(error);
  }, [error, result]);

  const failedDetail = error ?? (result && !result.ok ? result.detail : null);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <Button
        variant="secondary"
        size="sm"
        loading={testing}
        disabled={disabled || testing}
        onClick={() => {
          void onTest();
        }}
        icon={<PlugZap size={14} />}
      >
        {testing ? "Testing…" : "Test connection"}
      </Button>
      {result?.ok && (
        <span className="text-xs text-emerald-400">
          OK in {result.latency_ms} ms
          {result.detail ? ` — ${truncate(result.detail)}` : ""}
        </span>
      )}
      {failedDetail && (
        <span className="text-xs text-error max-w-64 truncate" title={failedDetail}>
          {truncate(failedDetail)}
        </span>
      )}
    </div>
  );
}
