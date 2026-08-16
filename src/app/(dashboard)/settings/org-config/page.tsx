"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("settings.orgConfig.organization");
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
        if (!cancelled) setError(apiErrorMessage(err, t("loadFailed")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, retryKey, t]);

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
      setError(t("copyFailed"));
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
      setError(apiErrorMessage(err, t("regenerateFailed")));
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
      setError(apiErrorMessage(err, t("joinToggleFailed")));
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
    return <ErrorState message={t("adminRequired")} />;
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
              <h2 className="text-lg font-semibold">{t("codeTitle")}</h2>
              <p className="text-sm text-surface-400 mt-0.5">
                {t("codeDescription")}
              </p>
            </div>
          </div>

          {/* Code + actions */}
          <div className="mt-5">
            {loading ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-surface-700 bg-surface-900/50 px-4 py-4">
                <Loader2 size={16} className="animate-spin text-surface-500" />
                <span className="text-sm text-surface-500">{t("loadingCode")}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <code className="flex-1 min-w-[200px] rounded-lg border border-dashed border-surface-700 bg-surface-900/50 px-4 py-3 font-mono text-sm tracking-wider text-brand-300 select-all">
                  {orgCode}
                </code>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handleCopy} className="gap-1.5">
                    {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    {copied ? t("copied") : t("copy")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowRegenerate(true)}
                    className="gap-1.5"
                  >
                    <RefreshCw size={14} />
                    {t("regenerate")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-surface-500">
            {t("regenerateHint")}
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
              <h2 className="text-lg font-semibold">{t("registrationTitle")}</h2>
              <p className="text-sm text-surface-400 mt-0.5">
                {t("registrationDescription")}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-surface-800 bg-surface-900/50 px-4 py-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="join-enabled" className="block text-sm font-medium text-surface-200">
                {t("joinLabel")}
              </label>
              <p className="mt-1 text-xs text-surface-500">
                {t("joinHint")}
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
                {t("joinPausedNotice")}
              </p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showRegenerate}
        title={t("regenerateTitle")}
        message={t("regenerateConfirm")}
        confirmLabel={t("regenerate")}
        variant="danger"
        loading={regenerating}
        onConfirm={handleRegenerate}
        onCancel={() => setShowRegenerate(false)}
      />
    </div>
  );
}
