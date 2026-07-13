"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE, safeJsonParse } from "@/lib/api-client";

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
      const res = await fetch(`${API_BASE}/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp,
          new_password: newPassword,
        }),
      });
      if (!res.ok) {
        const data = await safeJsonParse(res);
        throw new Error(
          (data as Record<string, unknown>)?.detail as string ??
            "Failed to reset password. Please try again."
        );
      }
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
      <div className="flex min-h-screen">
        <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-brand-500 to-surface-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,rgba(143,175,217,0.08)_0%,transparent_50%),radial-gradient(circle_at_25%_30%,rgba(20,72,140,0.12)_0%,transparent_50%)]" />
          <div className="relative z-10 text-center px-8">
            <h1 className="text-5xl font-extrabold text-text-primary tracking-tight mb-2">OpenZync</h1>
            <p className="text-lg text-surface-300 max-w-sm mx-auto">Password reset successful</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="md:hidden text-center mb-8">
              <h1 className="text-2xl font-extrabold text-brand-500">OpenZync</h1>
              <p className="text-xs text-surface-400">Agent Memory Infrastructure</p>
            </div>
            <div className="card-base p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 mb-4">
                <CheckCircle size={24} className="text-success" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Password reset successful</h2>
              <p className="text-sm text-surface-400">
                Redirecting you to login...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-brand-500 to-surface-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,rgba(143,175,217,0.08)_0%,transparent_50%),radial-gradient(circle_at_25%_30%,rgba(20,72,140,0.12)_0%,transparent_50%)]" />
        <div className="relative z-10 text-center px-8">
          <h1 className="text-5xl font-extrabold text-text-primary tracking-tight mb-2">OpenZync</h1>
          <p className="text-lg text-surface-300 max-w-sm mx-auto mb-8">Reset your password</p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="md:hidden text-center mb-8">
            <h1 className="text-2xl font-extrabold text-brand-500">OpenZync</h1>
            <p className="text-xs text-surface-400">Agent Memory Infrastructure</p>
          </div>

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
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Verification Code
                </label>
                <input
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
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
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
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input-base w-full"
                  placeholder="Repeat your password"
                />
              </div>

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
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
