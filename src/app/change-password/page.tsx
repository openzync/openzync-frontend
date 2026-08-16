"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { changePassword } from "@/lib/api-client";
import { getPasswordStrength } from "@/lib/password-strength";
import { Button } from "@/components/ui/button";

/**
 * Forced password rotation — the destination for accounts whose profile has
 * `must_change_password: true` (root/superadmin bootstrapping). Submitting
 * calls POST /v1/auth/change-password, which rotates the token pair (stored
 * by the api-client helper) and clears the flag; then back to the dashboard.
 */
export default function ChangePasswordPage() {
  const t = useTranslations("auth.changePassword");
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pwStrength = getPasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await changePassword(currentPassword, newPassword);
      router.replace("/overview");
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t("failed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-brand-500 to-surface-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,rgba(143,175,217,0.08)_0%,transparent_50%),radial-gradient(circle_at_25%_30%,rgba(20,72,140,0.12)_0%,transparent_50%)]" />
        <div className="relative z-10 text-center px-8">
          <h1 className="text-5xl font-extrabold text-text-primary tracking-tight mb-2">
            OpenZync
          </h1>
          <p className="text-lg text-surface-300 max-w-sm mx-auto mb-8">
            {t("hero")}
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="card-base p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
                <KeyRound size={20} className="text-brand-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">{t("title")}</h2>
                <p className="text-sm text-surface-400">
                  {t("subtitle")}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  {t("currentPassword")}
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoFocus
                  autoComplete="current-password"
                  className="input-base w-full"
                  placeholder={t("currentPasswordPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  {t("newPassword")}
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="input-base w-full pe-10"
                    placeholder={t("min8Chars")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute end-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-text-primary"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-surface-500">{t("passwordStrength")}</span>
                      {/* pwStrength.label comes from the shared strength lib —
                          keep as-is (data-layer value, not UI chrome) */}
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

              <Button
                variant="primary"
                type="submit"
                disabled={submitting}
                className="w-full mt-2"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  t("updatePassword")
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-surface-400">
              {t("changedMind")}{" "}
              <Link href="/overview" className="text-accent-300 font-medium hover:text-accent-200">
                {t("returnDashboard")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
