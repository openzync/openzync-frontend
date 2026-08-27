"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AuthLayout } from "@/components/shared/auth-layout";
import { post, storeTokens } from "@/lib/api-client";

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
      // Pre-auth: 401 must surface as an error message, never refresh/redirect.
      await post("/v1/auth/login/otp/send", { email }, { skipAuthRetry: true });
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
      await post("/v1/auth/login/otp/send", { email }, { skipAuthRetry: true });
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
      const data = await post<{ access_token: string; refresh_token: string }>(
        "/v1/auth/login/otp/verify",
        { email, otp },
        { skipAuthRetry: true },
      );
      storeTokens(data.access_token, data.refresh_token);
      router.replace("/overview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout variant="stats">
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
                <Field label="Email" htmlFor="otp-email">
                  <input
                    id="otp-email"
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
                <Field label="Verification Code" htmlFor="otp-code">
                  <input
                    id="otp-code"
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
    </AuthLayout>
  );
}
