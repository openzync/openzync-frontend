"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  acceptInvite,
  getInviteInfo,
  ApiError,
  type InviteInfo,
} from "@/lib/api-client";
import { getPasswordStrength } from "@/lib/password-strength";
import { Button } from "@/components/ui/button";

const INVALID_MESSAGE = "This invitation link is invalid or has expired.";

function InviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The invite token lives only in component state after mount — never in the
  // URL, browser history, or referrer. It only ever travels in POST bodies.
  // useSearchParams is synchronous in the client, so the token is read once at
  // render and the missing-token state is derived up front (no sync setState
  // in the effect — the effect only strips the URL and fetches). The effect
  // must depend on the stable `token` state, never on `rawToken`/searchParams:
  // replaceState below re-renders useSearchParams with an empty query, which
  // would cancel the in-flight fetch and leave the spinner up forever.
  const rawToken = searchParams.get("token") ?? "";
  const [token] = useState(rawToken);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(Boolean(rawToken));
  const [invalid, setInvalid] = useState(!rawToken);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Strip the token from the URL immediately — browser history, screenshots,
    // and extensions must not retain it (it is read exactly once here).
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (!token) return;

    let cancelled = false;
    getInviteInfo(token)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInvalid(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const pwStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      // acceptInvite stores the new session before we navigate.
      await acceptInvite(token, password);
      router.replace("/overview");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Connection error. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-brand-500 to-surface-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,rgba(143,175,217,0.08)_0%,transparent_50%),radial-gradient(circle_at_25%_30%,rgba(20,72,140,0.12)_0%,transparent_50%)]" />
        <div className="relative z-10 text-center px-8">
          <h1 className="text-5xl font-extrabold text-text-primary tracking-tight mb-2">
            OpenZync
          </h1>
          <p className="text-lg text-surface-300 max-w-sm mx-auto mb-8">
            Join your organization
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
            <p className="text-xs text-surface-400">Agent Memory Infrastructure</p>
          </div>

          {loading ? (
            <div className="card-base p-10 flex flex-col items-center gap-3 text-surface-400">
              <Loader2 size={24} className="animate-spin text-brand-500" />
              <p className="text-sm">Checking your invitation…</p>
            </div>
          ) : invalid || !info ? (
            <div className="card-base p-6">
              <h2 className="text-xl font-semibold mb-2">Invitation not found</h2>
              <p className="text-sm text-surface-400 mb-5">{INVALID_MESSAGE}</p>
              <Link href="/login">
                <Button variant="primary" className="w-full">
                  Go to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <div className="card-base p-6">
              <h2 className="text-xl font-semibold mb-1">
                You’ve been invited to join{" "}
                <span className="text-brand-400">{info.org_name}</span>
              </h2>
              <p className="text-sm text-surface-400 mb-5">
                Set a password to activate your account.
              </p>

              {/* Read-only profile — set by the admin on the invite */}
              <div className="space-y-4 mb-5">
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={info.email}
                    readOnly
                    disabled
                    className="input-base w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    Name
                  </label>
                  <input
                    type="text"
                    value={info.name}
                    readOnly
                    disabled
                    className="input-base w-full"
                  />
                </div>
              </div>

              {error && (
                <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                  disabled={submitting}
                  className="w-full mt-2"
                >
                  {submitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    "Set password and join"
                  )}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteForm />
    </Suspense>
  );
}
