"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE, safeJsonParse } from "@/lib/api-client";

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
      const res = await fetch(`${API_BASE}/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await safeJsonParse(res);
        throw new Error(
          (data as Record<string, unknown>)?.detail as string ??
            "Something went wrong. Please try again."
        );
      }
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection error.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-brand-500 to-surface-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,rgba(143,175,217,0.08)_0%,transparent_50%),radial-gradient(circle_at_25%_30%,rgba(20,72,140,0.12)_0%,transparent_50%)]" />
          <div className="relative z-10 text-center px-8">
            <h1 className="text-5xl font-extrabold text-text-primary tracking-tight mb-2">OpenZync</h1>
            <p className="text-lg text-surface-300 max-w-sm mx-auto mb-8">Password reset sent</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="md:hidden text-center mb-8">
              <h1 className="text-2xl font-extrabold text-brand-500">OpenZync</h1>
              <p className="text-xs text-surface-400">Agent Memory Infrastructure</p>
            </div>
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
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  className="input-base w-full"
                  placeholder="you@example.com"
                />
              </div>

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
        </div>
      </div>
    </div>
  );
}
