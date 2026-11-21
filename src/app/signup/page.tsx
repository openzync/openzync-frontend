"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { post, normalizeEmail, isValidEmail } from "@/lib/api-client";
import { getPasswordStrength } from "@/lib/password-strength";
import { AuthLayout } from "@/components/shared/auth-layout";
import { PasswordField } from "@/components/shared/password-field";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/**
 * Public signup — single platform org, no per-user org creation.
 * Plain email + password only. Invite completion lives on /invite
 * (acceptInvite flow): a ?token= landing here is handed off there, because
 * backend SignupRequest carries no invite field and would silently drop it —
 * signing up would create a standalone account without completing the invite.
 */
export default function SignupPage() {
  const router = useRouter();
  // The invite token lives only in component state after mount — never in the
  // URL, browser history, or referrer. It only ever travels in POST bodies.
  // Read once via a lazy initializer (no effect setState); a separate effect
  // strips it from the URL (external-system sync, no state involved).
  const [inviteToken] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("token"),
  );
  // Canonical invite completion lives on /invite (POST /v1/auth/invites/accept
  // with {token, password}) — signup carries no invite field, so hand off
  // instead of posting a token the backend would silently drop.
  useEffect(() => {
    if (inviteToken) {
      router.replace(`/invite?token=${encodeURIComponent(inviteToken)}`);
    }
  }, [inviteToken, router]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  // While the handoff runs, render nothing — the form below is signup-only.
  // Placed after all hooks: an earlier return would break hook order.
  if (inviteToken) return null;

  const pwStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);

    try {
      // Pre-auth: 401 must surface as an error message, never refresh/redirect.
      const data = await post<{ email?: string; status?: string; message?: string }>(
        "/v1/auth/signup",
        { email: normalizedEmail, password },
        { skipAuthRetry: true },
      );

      if (data.status === "pending") {
        setSubmittedMessage(data.message ?? "Your account request has been submitted for approval.");
        return;
      }
      router.replace(`/verify-email?email=${encodeURIComponent(data.email ?? normalizedEmail)}`);
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

  // ── Pending-approval confirmation state ────────────────────────────────────
  if (submittedMessage) {
    return (
      <AuthLayout variant="features" tagline="Get started with agent memory infrastructure">
        <div className="card-base p-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 mb-4">
                  <CheckCircle2 size={24} className="text-success" />
                </div>
                <h2 className="font-display text-xl font-medium">Request submitted for approval</h2>
                <p className="text-sm text-surface-400 mt-2 leading-relaxed">
                  {submittedMessage}
                </p>
                <Link
                  href="/login"
                  className="mt-6 text-accent-300 font-medium hover:text-accent-200 text-sm"
                >
                  Return to sign in
                </Link>
              </div>
            </div>
      </AuthLayout>
    );
  }

  // ── Normal form ────────────────────────────────────────────────────────────
  return (
    <AuthLayout variant="features" tagline="Get started with agent memory infrastructure">
      <div className="card-base p-6">
            <h2 className="font-display text-xl font-medium mb-1">
              Create your account
            </h2>
            <p className="text-sm text-surface-400 mb-5">
              Sign up to start using the platform
            </p>

            {error && (
              <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email" htmlFor="signup-email">
                <input
                  id="signup-email"
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

              <div>
                <PasswordField
                  id="signup-password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                {password && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-surface-500">Password strength</span>
                      <span className="font-medium text-surface-300">{pwStrength.label}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`}
                        style={{ width: `${pwStrength.score}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <Button
                variant="primary"
                type="submit"
                disabled={submitting}
                className="w-full mt-2"
              >
                {submitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-surface-400">
              Already have an account?{" "}
              <Link href="/login" className="text-accent-300 font-medium hover:text-accent-200">
                Sign in
              </Link>
            </p>
          </div>
    </AuthLayout>
  );
}
