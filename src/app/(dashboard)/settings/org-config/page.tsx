"use client";

import { useEffect, useState } from "react";
import { Copy, Check, RefreshCw, KeyRound, Loader2 } from "lucide-react";
import { get, post, apiErrorMessage } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/user-context";

interface OrgCodeResponse {
  org_code: string;
}

/**
 * Organization code card — the invite code members use to join this org
 * via POST /v1/auth/join. Admin-only (GET/POST both 403 for members).
 */
export default function OrgConfigIndexPage() {
  const { isAdmin, loading: roleLoading } = useUser();
  const [orgCode, setOrgCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await get<OrgCodeResponse>("/admin/org/org-code");
        if (!cancelled) setOrgCode(data.org_code);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load organization code"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, retryKey]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setRetryKey((k) => k + 1);
  };

  const handleCopy = async () => {
    if (!orgCode) return;
    try {
      await navigator.clipboard.writeText(orgCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Failed to copy — clipboard unavailable");
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const data = await post<OrgCodeResponse>("/admin/org/org-code/regenerate");
      setOrgCode(data.org_code);
      setError(null);
      setShowRegenerate(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to regenerate code"));
      setShowRegenerate(false);
    } finally {
      setRegenerating(false);
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

  // Member (or role fetch failed → unknown treated as member): no code, no fetch.
  if (!isAdmin) {
    return <ErrorState message="Admin access required" />;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <ErrorState message={error} onRetry={handleRetry} />
      ) : (
        <div className="card-base p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 text-brand-300">
              <KeyRound size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Organization Code</h2>
              <p className="text-sm text-surface-400 mt-0.5">
                Share this code with people you want to invite — they can join your
                organization from the signup page (&ldquo;Join with code&rdquo;).
              </p>
            </div>
          </div>

          {/* Code + actions */}
          <div className="mt-5">
            {loading ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-surface-700 bg-surface-900/50 px-4 py-4">
                <Loader2 size={16} className="animate-spin text-surface-500" />
                <span className="text-sm text-surface-500">Loading organization code&hellip;</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <code className="flex-1 min-w-[200px] rounded-lg border border-dashed border-surface-700 bg-surface-900/50 px-4 py-3 font-mono text-sm tracking-wider text-brand-300 select-all">
                  {orgCode}
                </code>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handleCopy} className="gap-1.5">
                    {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowRegenerate(true)}
                    className="gap-1.5"
                  >
                    <RefreshCw size={14} />
                    Regenerate
                  </Button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-surface-500">
            Regenerating invalidates the previous code — existing members are unaffected.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={showRegenerate}
        title="Regenerate Organization Code?"
        message="The current organization code will stop working immediately. Anyone with the old code will need the new one to join. Continue?"
        confirmLabel="Regenerate"
        variant="danger"
        loading={regenerating}
        onConfirm={handleRegenerate}
        onCancel={() => setShowRegenerate(false)}
      />
    </div>
  );
}
