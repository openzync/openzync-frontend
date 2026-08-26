"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { changePassword } from "@/lib/api-client";
import { getPasswordStrength } from "@/lib/password-strength";
import { AuthLayout } from "@/components/shared/auth-layout";
import { Button } from "@/components/ui/button";

/**
 * Forced password rotation — the destination for accounts whose profile has
 * `must_change_password: true` (root/superadmin bootstrapping). Submitting
 * calls POST /v1/auth/change-password, which rotates the token pair (stored
 * by the api-client helper) and clears the flag; then back to the dashboard.
 */
export default function ChangePasswordPage() {
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
          : "Failed to change password. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout variant="plain" tagline="Secure your account before continuing" mobileBrand={false}>
      <div className="card-base p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10">
                <KeyRound size={20} className="text-brand-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Change Password</h2>
                <p className="text-sm text-surface-400">
                  Your password must be updated before you can continue
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
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoFocus
                  autoComplete="current-password"
                  className="input-base w-full"
                  placeholder="Enter your current password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="input-base w-full pr-10"
                    placeholder="Minimum 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-text-primary"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-surface-500">Password strength</span>
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
                  "Update Password"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-surface-400">
              Changed your mind?{" "}
              <Link href="/overview" className="text-accent-300 font-medium hover:text-accent-200">
                Return to dashboard
              </Link>
            </p>
          </div>
    </AuthLayout>
  );
}
