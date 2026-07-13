"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE, safeJsonParse } from "@/lib/api-client";

export default function LoginOtpPage() {
  const router = useRouter();

  // ── State machine: "email" → "otp"
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sentMsg, setSentMsg] = useState("");

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  /** Step 1 — send the OTP to the user's email */
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSentMsg("");
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/login/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await safeJsonParse(res)) as { detail?: string } | null;
        throw new Error(data?.detail ?? "Failed to send login code.");
      }
      setSentMsg("Code sent!");
      setCooldown(60);
      setStep("otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /** Resend OTP to the same email */
  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError("");
    setSentMsg("");

    try {
      const res = await fetch(`${API_BASE}/v1/auth/login/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await safeJsonParse(res)) as { detail?: string } | null;
        throw new Error(data?.detail ?? "Failed to resend code.");
      }
      setSentMsg("A new code has been sent.");
      setCooldown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection error. Please try again.");
    } finally {
      setResending(false);
    }
  };

  /** Step 2 — verify the OTP, receive JWT tokens, redirect */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/v1/auth/login/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      if (!res.ok) {
        const data = (await safeJsonParse(res)) as { detail?: string } | null;
        throw new Error(data?.detail ?? "Invalid or expired code.");
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
                <div className="text-3xl font-bold text-accent-300">
                  {stat.value}
                </div>
                <div className="text-xs text-surface-500 mt-1">
                  {stat.label}
                </div>
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
            <h1 className="text-2xl font-extrabold text-brand-500">
              OpenZync
            </h1>
            <p className="text-xs text-surface-400">
              Agent Memory Infrastructure
            </p>
          </div>

          <div className="card-base p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-300/10">
                <LogIn size={20} className="text-accent-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  {step === "email" ? "Sign in with a code" : "Enter the code"}
                </h2>
                <p className="text-sm text-surface-400">
                  {step === "email"
                    ? "We'll send a one-time code to your email"
                    : `Sent to ${email}`}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            {sentMsg && (
              <div className="mb-4 rounded-md border border-accent-300/20 bg-accent-300/5 px-3 py-2 text-sm text-accent-300">
                {sentMsg}
              </div>
            )}

            {step === "email" ? (
              <form onSubmit={handleSendCode} className="space-y-4">
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
                  disabled={submitting || !email}
                  className="w-full"
                >
                  {submitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    "Send Login Code"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
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
                    "Sign In"
                  )}
                </Button>

                <div className="flex items-center justify-between gap-2 text-xs text-surface-500">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || cooldown > 0}
                    className="text-accent-300 hover:text-accent-200 font-medium disabled:text-surface-600 disabled:cursor-not-allowed"
                  >
                    {resending
                      ? "Sending..."
                      : cooldown > 0
                        ? `Resend in ${cooldown}s`
                        : "Resend code"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setOtp("");
                      setError("");
                      setSentMsg("");
                    }}
                    className="text-accent-300 hover:text-accent-200 font-medium"
                  >
                    Use a different email
                  </button>
                </div>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-surface-500">
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-accent-300 hover:text-accent-200 font-medium"
              >
                <ArrowLeft size={14} />
                Back to password login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
