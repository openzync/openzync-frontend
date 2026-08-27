"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/shared/password-field";
import { AuthLayout } from "@/components/shared/auth-layout";
import { post } from "@/lib/api-client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);

    try {
      // Pre-auth: 401 must surface as an error message, never refresh/redirect.
      await post(
        "/v1/auth/reset-password",
        { email, otp, new_password: newPassword },
        { skipAuthRetry: true },
      );
      setDone(true);
      setTimeout(() => router.replace("/login"), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection error.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthLayout variant="plain" tagline="Password reset successful">
        <div className="card-base p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 mb-4">
                <CheckCircle size={24} className="text-success" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Password reset successful</h2>
              <p className="text-sm text-surface-400">
                Redirecting you to login...
              </p>
            </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout variant="plain" tagline="Reset your password">
      <div className="card-base p-6">
            <h2 className="text-xl font-semibold mb-1">Reset password</h2>
            <p className="text-sm text-surface-400 mb-6">
              Enter the code sent to <strong className="text-surface-300">{email}</strong>
            </p>

            {!email && (
              <div className="mb-4 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                No email provided. Please start from the{" "}
                <Link href="/forgot-password" className="underline">
                  forgot password
                </Link>{" "}
                page.
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Verification Code" htmlFor="reset-code">
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  className="input-base w-full text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="000000"
                />
              </Field>

              <PasswordField
                id="reset-new-password"
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
                visible={showPassword}
                onToggleVisibility={() => setShowPassword((prev) => !prev)}
              />

              <Field label="Confirm Password" htmlFor="reset-confirm-password">
                <input
                  id="reset-confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input-base w-full"
                  placeholder="Repeat your password"
                />
              </Field>

              <Button
                variant="primary"
                type="submit"
                disabled={submitting || !email || otp.length !== 6 || !newPassword}
                className="w-full"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-surface-500">
              <Link href="/login" className="inline-flex items-center gap-1 text-accent-300 hover:text-accent-200 font-medium">
                <ArrowLeft size={14} />
                Back to login
              </Link>
            </p>
          </div>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
