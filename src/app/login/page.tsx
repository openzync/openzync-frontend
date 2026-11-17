"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, LogIn, Mail, CheckCircle2, ShieldCheck } from "lucide-react";
import { API_BASE, post, storeTokens, normalizeEmail, isValidEmail } from "@/lib/api-client";
import { AuthLayout } from "@/components/shared/auth-layout";
import { PasswordField } from "@/components/shared/password-field";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

function LoginNotice() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  if (reason === "setup-complete") {
    return (
      <div className="mb-4 rounded-lg border border-success/20 bg-success/10 px-4 py-3">
        <div className="flex items-center gap-2 mb-0.5">
          <CheckCircle2 size={16} className="text-success" />
          <p className="font-medium text-success text-sm">Root account created</p>
        </div>
        <p className="text-surface-400 text-xs ml-6">
          Sign in as <span className="font-mono">root</span> with the password you just set.
        </p>
      </div>
    );
  }
  if (reason !== "not-signed-in") return null;
  return (
    <div className="mb-4 rounded-lg border border-accent-300/20 bg-accent-300/5 px-4 py-3">
      <div className="flex items-center gap-2 mb-0.5">
        <LogIn size={16} className="text-accent-300" />
        <p className="font-medium text-accent-300 text-sm">Sign in required</p>
      </div>
      <p className="text-surface-400 text-xs ml-6">
        Please sign in to access the dashboard.
      </p>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSetupBanner, setShowSetupBanner] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus email input after hydration to avoid SSR mismatch with autoFocus
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // First-run hint: if the platform still needs its root account, banner
  // above the form links to /setup. Never auto-redirects; network throw or
  // non-JSON body means no banner. Parse-first: a 503 with a JSON body is
  // a real answer. Plain fetch, no auth headers — /ready is public.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/ready`)
      .then((res) => res.json().catch(() => null))
      .then((body) => {
        if (cancelled || !body || typeof body !== "object") return;
        const needsSetup =
          (body as { needs_setup?: boolean }).needs_setup === true ||
          (body as { degraded?: { platform_seed?: boolean } | null }).degraded
            ?.platform_seed === true;
        if (needsSetup) setShowSetupBanner(true);
      })
      .catch(() => {
        // No banner — login works as usual.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // The platform root user signs in with the literal "root", not an email.
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail !== "root" && !isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);

    try {
      // Pre-auth: a 401 here means wrong credentials — no refresh, no redirect.
      const data = await post<{
        requires_mfa?: boolean;
        mfa_session_token?: string;
        access_token: string;
        refresh_token: string;
      }>("/v1/auth/login", { email: normalizedEmail, password }, { skipAuthRetry: true });

      if (data.requires_mfa) {
        router.replace(
          `/login/mfa?email=${encodeURIComponent(normalizedEmail)}&session=${encodeURIComponent(data.mfa_session_token ?? "")}`
        );
        return;
      }
      storeTokens(data.access_token, data.refresh_token);
      // Forced password rotation is signalled by the /me payload and enforced
      // by MustChangePasswordRedirect in require-auth — LoginResponse has no
      // must_change_password field, so this branch was dead code.
      router.replace("/overview");
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Connection error. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout variant="stats">
      <div className="card-base p-6 shadow-glow-sm">
            <h2 className="font-display text-xl font-medium mb-1">Welcome back</h2>
            <p className="text-sm text-surface-400 mb-6">
              Sign in to your organization dashboard
            </p>

            <Suspense
              fallback={
                <div className="card-base p-6 shadow-glow-sm">
                  <div className="h-6 w-32 bg-surface-800 animate-pulse rounded mb-1" />
                  <div className="h-4 w-48 bg-surface-800 animate-pulse rounded mb-6" />
                  <div className="space-y-4">
                    <div className="h-10 bg-surface-800 animate-pulse rounded" />
                    <div className="h-10 bg-surface-800 animate-pulse rounded" />
                    <div className="h-10 bg-surface-800 animate-pulse rounded" />
                  </div>
                </div>
              }
            >
              <LoginNotice />
            </Suspense>

            {showSetupBanner && (
              <div className="mb-4 rounded-lg border border-warning/20 bg-warning/10 px-4 py-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <ShieldCheck size={16} className="text-warning" />
                  <p className="font-medium text-warning text-sm">First run?</p>
                </div>
                <p className="text-surface-400 text-xs ml-6">
                  Create the platform root account{" "}
                  <Link href="/setup" className="text-accent-300 font-medium hover:text-accent-200">
                    here
                  </Link>
                  .
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* The platform root user signs in with the literal "root" —
                  type="email" would block the submit on HTML5 validation. */}
              <Field label="Email or username" htmlFor="login-email">
                <input
                  ref={emailRef}
                  id="login-email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="input-base w-full"
                  placeholder="you@example.com"
                  suppressHydrationWarning
                />
              </Field>

              <PasswordField
                id="login-password"
                label="Password"
                value={password}
                onChange={setPassword}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />

              <div className="flex justify-end -mt-2">
                <Link
                  href="/forgot-password"
                  className="text-xs text-accent-300 hover:text-accent-200 font-medium"
                >
                  Forgot password?
                </Link>
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
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-surface-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-surface-900 px-2 text-surface-500">or</span>
              </div>
            </div>

            <Link
              href="/login/otp"
              className="flex items-center justify-center gap-2 rounded-lg border border-surface-700 px-4 py-2.5 text-sm font-medium text-surface-300 transition-all duration-150 hover:border-accent-300/30 hover:text-accent-300 hover:shadow-[0_0_12px_rgba(120,169,242,0.06)]"
            >
              <Mail size={16} />
              Sign in with a magic code
            </Link>

            <p className="mt-6 text-center text-sm text-surface-400">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-accent-300 font-medium hover:text-accent-200">
                Sign up
              </Link>
            </p>
          </div>
    </AuthLayout>
  );
}
