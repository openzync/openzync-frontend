"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AuthLayout } from "@/components/shared/auth-layout";
import { post } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      // Pre-auth: 401 must surface as an error message, never refresh/redirect.
      await post("/v1/auth/forgot-password", { email }, { skipAuthRetry: true });
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection error.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout variant="plain" tagline="Password reset sent">
        <div className="card-base p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-300/10 mb-4">
                <Mail size={24} className="text-accent-300" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Check your email</h2>
              <p className="text-sm text-surface-400 mb-2">
                If an account exists for <strong className="text-surface-300">{email}</strong>,
                you will receive a password reset code shortly.
              </p>
              <p className="text-xs text-surface-500 mb-6">
                Didn&apos;t receive it? Check your spam folder.
              </p>
              <Link
                href={`/reset-password?email=${encodeURIComponent(email)}`}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-brand-600 hover:shadow-[0_0_20px_rgba(20,72,140,0.3)]"
              >
                Enter Reset Code
                <ArrowRight size={16} />
              </Link>
              <p className="mt-4 text-center text-xs text-surface-500">
                <Link href="/login" className="hover:text-surface-300">
                  Back to login
                </Link>
              </p>
            </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout variant="plain" tagline="Reset your password">
      <div className="card-base p-6">
            <h2 className="text-xl font-semibold mb-1">Forgot password?</h2>
            <p className="text-sm text-surface-400 mb-6">
              Enter your email and we&apos;ll send you a reset code.
            </p>

            {error && (
              <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email" htmlFor="forgot-email">
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  className="input-base w-full"
                  placeholder="you@example.com"
                />
              </Field>

              <Button
                variant="primary"
                type="submit"
                disabled={submitting}
                className="w-full"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  "Send Reset Code"
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
