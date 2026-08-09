"use client";

import { useEffect, useState } from "react";
import { Copy, Check, RefreshCw, KeyRound, Loader2, UserPlus, AlertCircle } from "lucide-react";
import { get, post, patch, apiErrorMessage } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUser } from "@/contexts/user-context";

interface OrgCodeResponse {
  org_code: string;
  join_enabled: boolean;
}

/**
 * Organization code card — the invite code members use to join this org
 * via POST /v1/auth/join. Admin-only (GET/POST both 403 for members).
 */
export default function OrgConfigIndexPage() {
  const { isAdmin, loading: roleLoading } = useUser();
  const [orgCode, setOrgCode] = useState<string | null>(null);
  const [joinEnabled, setJoinEnabled] = useState(true);
  const [togglingJoin, setTogglingJoin] = useState(false);
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
        if (!cancelled) {
          setOrgCode(data.org_code);
          setJoinEnabled(data.join_enabled);
        }
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

  // Await-then-update (not optimistic): state only changes from the PATCH
  // response, so a failure needs no revert — the switch simply stays put.
  const handleToggleJoin = async (newValue: boolean) => {
    setTogglingJoin(true);
    try {
      const data = await patch<OrgCodeResponse>("/admin/org/org-code", {
        join_enabled: newValue,
      });
      setJoinEnabled(data.join_enabled);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to update join setting"));
    } finally {
      setTogglingJoin(false);
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

      {/* Join-enable toggle — admin controls whether the org code accepts new members. */}
      {!loading && orgCode !== null && (
        <div className="card-base p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 text-brand-300">
              <UserPlus size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Self-registration</h2>
              <p className="text-sm text-surface-400 mt-0.5">
                Control whether people can join your organization with this code.
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-surface-800 bg-surface-900/50 px-4 py-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="join-enabled" className="block text-sm font-medium text-surface-200">
                Allow new members to join with this code
              </label>
              <p className="mt-1 text-xs text-surface-500">
                When off, the signup &ldquo;Join with code&rdquo; flow returns 403. Regenerating
                the code still works while paused.
              </p>
            </div>
            <Switch
              id="join-enabled"
              checked={joinEnabled}
              onCheckedChange={handleToggleJoin}
              disabled={togglingJoin}
            />
          </div>

          {!joinEnabled && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200/80 leading-relaxed">
                Joining is paused&nbsp;&mdash; new members can&rsquo;t join with this code
                right now.
              </p>
            </div>
          )}
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
