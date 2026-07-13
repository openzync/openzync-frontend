"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE, safeJsonParse } from "@/lib/api-client";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resendMsg, setResendMsg] = useState("");

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      if (!res.ok) {
        const data = await safeJsonParse(res);
        throw new Error(
          (data as Record<string, unknown>)?.detail as string ??
            "Invalid or expired verification code."
        );
      }
      const data = (await res.json()) as {
        access_token: string;
        refresh_token: string;
      };
      sessionStorage.setItem("mg_access_token", data.access_token);
      sessionStorage.setItem("mg_refresh_token", data.refresh_token);
      router.replace("/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;
    setResending(true);
    setResendMsg("");
    setError("");

    try {
      const res = await fetch(`${API_BASE}/v1/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await safeJsonParse(res);
        throw new Error(
          (data as Record<string, unknown>)?.detail as string ??
            "Failed to resend code."
        );
      }
      setCooldown(60);
      setResendMsg("A new verification code has been sent.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resend code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel — same as signup page */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-brand-500 to-surface-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,rgba(143,175,217,0.08)_0%,transparent_50%),radial-gradient(circle_at_25%_30%,rgba(20,72,140,0.12)_0%,transparent_50%)]" />
        <div className="relative z-10 text-center px-8">
          <h1 className="text-5xl font-extrabold text-text-primary tracking-tight mb-2">
            OpenZync
          </h1>
          <p className="text-lg text-surface-300 max-w-sm mx-auto mb-8">
            Verify your email to continue
          </p>
          <div className="text-left max-w-xs mx-auto space-y-3">
            {[
              "Persistent, queryable agent memory",
              "Multi-provider LLM support (BYOK)",
              "Knowledge graph with hybrid search",
              "Async enrichment pipeline",
            ].map((feature, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-accent-300 shrink-0" />
                <span className="text-sm text-surface-300">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="md:hidden text-center mb-8">
            <h1 className="text-2xl font-extrabold text-brand-500">OpenZync</h1>
            <p className="text-xs text-surface-400">
              Agent Memory Infrastructure
            </p>
          </div>

          <div className="card-base p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-300/10">
                <Mail size={20} className="text-accent-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Check your email</h2>
                <p className="text-sm text-surface-400">
                  We sent a verification code to
                </p>
              </div>
            </div>

            <p className="text-sm font-medium text-surface-300 mb-6 truncate">
              {email}
            </p>

            {error && (
              <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            {resendMsg && (
              <div className="mb-4 rounded-md border border-accent-300/20 bg-accent-300/5 px-3 py-2 text-sm text-accent-300">
                {resendMsg}
              </div>
            )}

            {!email && (
              <div className="mb-4 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                No email provided. Please{" "}
                <Link href="/signup" className="underline">sign up</Link> first.
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
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

              <Button
                variant="primary"
                type="submit"
                disabled={submitting || otp.length !== 6}
                className="w-full"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  "Verify Email"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-surface-400">
              Didn&apos;t receive the code?{" "}
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="text-accent-300 font-medium hover:text-accent-200 disabled:text-surface-600 disabled:cursor-not-allowed"
              >
                {resending
                  ? "Sending..."
                  : cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : "Resend"}
              </button>
            </p>

            <p className="mt-4 text-center text-sm text-surface-500">
              <Link
                href="/signup"
                className="inline-flex items-center gap-1 hover:text-surface-300"
              >
                <ArrowLeft size={14} />
                Back to sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
