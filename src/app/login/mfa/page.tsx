"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE, safeJsonParse } from "@/lib/api-client";

function MfaChallengeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const session = searchParams.get("session") ?? "";

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const missingParams = !email || !session;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/mfa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, mfa_session_token: session }),
      });
      if (!res.ok) {
        const data = (await safeJsonParse(res)) as { detail?: string } | null;
        throw new Error(data?.detail ?? "Invalid or expired verification code.");
      }
      const data = (await res.json()) as {
        access_token: string;
        refresh_token: string;
      };
      sessionStorage.setItem("mg_access_token", data.access_token);
      sessionStorage.setItem("mg_refresh_token", data.refresh_token);
      router.replace("/overview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-brand-500 to-surface-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_50%,rgba(143,175,217,0.08)_0%,transparent_50%),radial-gradient(circle_at_75%_30%,rgba(20,72,140,0.12)_0%,transparent_50%)]" />
        <div className="relative z-10 text-center px-8">
          <h1 className="text-5xl font-extrabold text-text-primary tracking-tight mb-2">
            OpenZync
          </h1>
          <p className="text-lg text-surface-300 max-w-sm mx-auto">
            Persistent Agent Memory Infrastructure
          </p>
          <div className="mt-8 flex gap-6 justify-center">
            {[
              { value: "10+", label: "Graph Backends" },
              { value: "5", label: "LLM Providers" },
              { value: "∞", label: "Scale" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-accent-300">{stat.value}</div>
                <div className="text-xs text-surface-500 mt-1">{stat.label}</div>
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
            <p className="text-xs text-surface-400">Agent Memory Infrastructure</p>
          </div>

          <div className="card-base p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-300/10">
                <Shield size={20} className="text-accent-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Verify your identity</h2>
                <p className="text-sm text-surface-400">
                  Enter the MFA code sent to
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

            {missingParams && (
              <div className="mb-4 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                Missing session information. Please{" "}
                <Link href="/login" className="underline">sign in</Link> again.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Authentication Code
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
                  disabled={missingParams}
                  className="input-base w-full text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="000000"
                />
              </div>

              <Button
                variant="primary"
                type="submit"
                disabled={submitting || otp.length !== 6 || missingParams}
                className="w-full"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  "Verify"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-surface-400">
              Didn&apos;t receive the code? Sign in again to request a new one.
            </p>

            <p className="mt-4 text-center text-sm text-surface-500">
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-accent-300 hover:text-accent-200 font-medium"
              >
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

export default function MfaChallengePage() {
  return (
    <Suspense fallback={null}>
      <MfaChallengeForm />
    </Suspense>
  );
}
