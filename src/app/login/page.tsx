"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, LogIn, Mail } from "lucide-react";
import { post, storeTokens } from "@/lib/api-client";
import { AuthLayout } from "@/components/shared/auth-layout";
import { Button } from "@/components/ui/button";

function LoginNotice() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
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
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus email input after hydration to avoid SSR mismatch with autoFocus
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      // Pre-auth: a 401 here means wrong credentials — no refresh, no redirect.
      const data = await post<{
        requires_mfa?: boolean;
        mfa_session_token?: string;
        access_token: string;
        refresh_token: string;
      }>("/v1/auth/login", { email, password }, { skipAuthRetry: true });

      if (data.requires_mfa) {
        router.replace(
          `/login/mfa?email=${encodeURIComponent(email)}&session=${encodeURIComponent(data.mfa_session_token ?? "")}`
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
            <h2 className="text-xl font-semibold mb-1">Welcome back</h2>
            <p className="text-sm text-surface-400 mb-6">
              Sign in to your organization dashboard
            </p>

            <Suspense fallback={null}>
              <LoginNotice />
            </Suspense>

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
                  ref={emailRef}
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="input-base w-full"
                  placeholder="you@example.com"
                  suppressHydrationWarning
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-300 mb-1.5">
                  Password
                </label>
                <div className="relative" suppressHydrationWarning>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="input-base w-full pr-10"
                    placeholder="Enter your password"
                    suppressHydrationWarning
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
              className="flex items-center justify-center gap-2 rounded-lg border border-surface-700 px-4 py-2.5 text-sm font-medium text-surface-300 transition-all duration-150 hover:border-accent-300/30 hover:text-accent-300 hover:shadow-[0_0_12px_rgba(143,175,217,0.06)]"
            >
              <Mail size={16} />
              Sign in with a magic code
            </Link>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button variant="secondary" size="sm" className="w-full" disabled>
                GitHub
              </Button>
              <Button variant="secondary" size="sm" className="w-full" disabled>
                Google
              </Button>
            </div>

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
