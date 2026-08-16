"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { API_BASE, safeJsonParse, join, getRegistrationStatus, type RegistrationStatus } from "@/lib/api-client";
import { getPasswordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Public signup — gated by GET /v1/auth/registration-status:
 *  - reject_all  → notice instead of the form (org-code join is 403 too).
 *  - approvals + public_signup scope → form WITHOUT a password; submit posts
 *    {email, organization_name} and shows a "request submitted" state instead
 *    of redirecting to verify-email.
 *  - allow_all (or status fetch failure) → current behavior unchanged.
 */
export default function SignupPage() {
  const t = useTranslations("auth.signup");
  const router = useRouter();
  const [policy, setPolicy] = useState<RegistrationStatus["org_creation_policy"]>("allow_all");
  const [scope, setScope] = useState<RegistrationStatus["approval_scope"]>("both");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [orgName, setOrgName] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  // The status endpoint is PUBLIC — fetch once on mount. On failure keep the
  // allow_all default so signup never hard-breaks behind a stale backend.
  useEffect(() => {
    let cancelled = false;
    getRegistrationStatus()
      .then((status) => {
        if (cancelled) return;
        setPolicy(status.org_creation_policy);
        setScope(status.approval_scope);
      })
      .catch(() => {
        // keep current (allow_all) behavior
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Public signup only produces pending requests when approvals + a public
  // signup scope are active; otherwise the password flow applies.
  const approvalsPublic =
    policy === "approvals" &&
    (scope === "public_signup" || scope === "both");
  const joinAllowed = policy !== "reject_all";

  const pwStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (mode === "join") {
        const data = await join({ email, password, org_code: orgCode });
        router.replace(`/verify-email?email=${encodeURIComponent(data.email ?? email)}`);
        return;
      }

      const res = await fetch(`${API_BASE}/v1/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          approvalsPublic
            ? { email, organization_name: orgName }
            : { email, password, organization_name: orgName },
        ),
      });
      if (!res.ok) {
        const data = (await safeJsonParse(res)) as { detail?: string } | null;
        throw new Error(data?.detail ?? t("signupFailed"));
      }
      const data = await res.json();

      if (approvalsPublic && data.status === "pending") {
        setSubmittedMessage(data.message ?? t("requestSubmittedFallback"));
        return;
      }
      router.replace(`/verify-email?email=${encodeURIComponent(data.email ?? email)}`);
    } catch (err: unknown) {
      // join() throws ApiError whose message is parsed from the RFC 7807 body
      // (e.g. "Invalid organization code") — rendered in the error banner below.
      setError(
        err instanceof Error && err.message
          ? err.message
          : t("connectionError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Shared brand panel (left side) ─────────────────────────────────────────
  const brandPanel = (
    <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-brand-500 to-surface-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,rgba(143,175,217,0.08)_0%,transparent_50%),radial-gradient(circle_at_25%_30%,rgba(20,72,140,0.12)_0%,transparent_50%)]" />
      <div className="relative z-10 text-center px-8">
        <h1 className="text-5xl font-extrabold text-text-primary tracking-tight mb-2">
          OpenZync
        </h1>
        <p className="text-lg text-surface-300 max-w-sm mx-auto mb-8">
          {t("hero")}
        </p>
        <div className="text-left max-w-xs mx-auto space-y-3">
          {[
            t("feature1"),
            t("feature2"),
            t("feature3"),
            t("feature4"),
          ].map((feature) => (
            <div key={feature} className="flex items-start gap-2.5">
              <div className="mt-1.5 h-2 w-2 rounded-full bg-accent-300 shrink-0" />
              <span className="text-sm text-surface-300">{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── reject_all — no form, registration is closed ───────────────────────────
  if (policy === "reject_all") {
    return (
      <div className="flex min-h-screen">
        {brandPanel}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="md:hidden text-center mb-8">
              <h1 className="text-2xl font-extrabold text-brand-500">OpenZync</h1>
              <p className="text-xs text-surface-400">{t("brandTagline")}</p>
            </div>
            <div className="card-base p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
                  <Lock size={20} className="text-warning" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{t("closedTitle")}</h2>
                  <p className="text-sm text-surface-400 mt-0.5">
                    {t("closedSubtitle")}
                  </p>
                </div>
              </div>
              <p className="text-sm text-surface-400 leading-relaxed">
                {t("closedBody")}
              </p>
              <p className="mt-6 text-center text-sm text-surface-400">
                {t("alreadyHaveAccount")}{" "}
                <Link href="/login" className="text-accent-300 font-medium hover:text-accent-200">
                  {t("signIn")}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Pending-approval confirmation state ────────────────────────────────────
  if (submittedMessage) {
    return (
      <div className="flex min-h-screen">
        {brandPanel}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="card-base p-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 mb-4">
                  <CheckCircle2 size={24} className="text-success" />
                </div>
                <h2 className="text-xl font-semibold">{t("requestSubmitted")}</h2>
                <p className="text-sm text-surface-400 mt-2 leading-relaxed">
                  {submittedMessage}
                </p>
                <Link
                  href="/login"
                  className="mt-6 text-accent-300 font-medium hover:text-accent-200 text-sm"
                >
                  {t("returnToSignIn")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal form (allow_all, or approvals without public scope) ─────────────
  return (
    <div className="flex min-h-screen">
      {brandPanel}

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="md:hidden text-center mb-8">
            <h1 className="text-2xl font-extrabold text-brand-500">OpenZync</h1>
            <p className="text-xs text-surface-400">{t("brandTagline")}</p>
          </div>

          <div className="card-base p-6">
            <h2 className="text-xl font-semibold mb-1">
              {approvalsPublic
                ? t("titleRequest")
                : mode === "create"
                  ? t("titleCreate")
                  : t("titleJoin")}
            </h2>
            <p className="text-sm text-surface-400 mb-5">
              {approvalsPublic
                ? t("subtitleRequest")
                : mode === "create"
                  ? t("subtitleCreate")
                  : t("subtitleJoin")}
            </p>

            {/* Mode toggle — segmented control; hidden when join is disabled */}
            {joinAllowed && !approvalsPublic && (
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-surface-800 p-1">
                {(
                  [
                    { id: "create", label: t("createOrgTab") },
                    { id: "join", label: t("joinTab") },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setMode(tab.id);
                      setError("");
                    }}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm transition-colors",
                      mode === tab.id
                        ? "bg-brand-500 text-white"
                        : "text-surface-400 hover:text-white",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "create" && (
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    {t("orgName")}
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                    autoFocus
                    className="input-base w-full"
                    placeholder={t("orgNamePlaceholder")}
                  />
                </div>
              )}

              {mode === "join" && (
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    {t("orgCode")}
                  </label>
                  <input
                    type="text"
                    value={orgCode}
                    onChange={(e) => setOrgCode(e.target.value)}
                    required
                    autoFocus
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    className="input-base w-full font-mono"
                    placeholder={t("orgCodePlaceholder")}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  {t("emailLabel")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="input-base w-full"
                  placeholder={t("emailPlaceholder")}
                />
              </div>

              {!approvalsPublic && (
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    {t("passwordLabel")}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="input-base w-full pe-10"
                      placeholder={t("min8Chars")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute end-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-text-primary"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-surface-500">{t("passwordStrength")}</span>
                        <span className="font-medium text-surface-300">{pwStrength.label}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-surface-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`}
                          style={{ width: `${pwStrength.score}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                variant="primary"
                type="submit"
                disabled={submitting}
                className="w-full mt-2"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : approvalsPublic ? (
                  t("submitRequest")
                ) : mode === "create" ? (
                  t("createAccount")
                ) : (
                  t("joinOrganization")
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-surface-400">
              {t("alreadyHaveAccount")}{" "}
              <Link href="/login" className="text-accent-300 font-medium hover:text-accent-200">
                {t("signIn")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
