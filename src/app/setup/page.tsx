"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldCheck } from "lucide-react";
import { API_BASE, ApiError, post } from "@/lib/api-client";
import { getPasswordStrength } from "@/lib/password-strength";
import { AuthLayout } from "@/components/shared/auth-layout";
import { PasswordField } from "@/components/shared/password-field";
import { Button } from "@/components/ui/button";

interface ReadyResponse {
  needs_setup?: boolean;
  degraded?: { platform_seed?: boolean } | null;
}

function needsSetup(body: ReadyResponse): boolean {
  return body.needs_setup === true || body.degraded?.platform_seed === true;
}

async function fetchReady(): Promise<ReadyResponse> {
  // Plain fetch, no auth headers — /ready is public and the setup flow
  // runs before any session exists. Never route through get().
  // Parse-first: missing root is a 503 WITH a JSON body, so a non-2xx
  // status is a real answer, not a failure. Only a network throw or a
  // non-JSON body rejects (→ retry screen, never a redirect either way).
  const res = await fetch(`${API_BASE}/ready`);
  try {
    return (await res.json()) as ReadyResponse;
  } catch {
    throw new Error(`ready check failed: ${res.status}`);
  }
}

/**
 * Public first-run page: creates the platform root account.
 * Gated by public GET /ready — /login and / redirect here, never the reverse.
 */
export default function SetupPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "form" | "failed">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchReady()
      .then((body) => {
        if (cancelled) return;
        // Already set up → root exists; sign in instead. Fail-closed on
        // fetch failure: retry screen, never a redirect either way.
        if (!needsSetup(body)) router.replace("/login");
        else setPhase("form");
      })
      .catch(() => {
        if (!cancelled) setPhase("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const pwStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      // Pre-auth: 401/403 here is a real answer, never refresh/redirect.
      await post("/v1/auth/setup", { password }, { skipAuthRetry: true });
      router.replace("/login?reason=setup-complete");
    } catch (err: unknown) {
      // 403 = root already exists (someone else finished setup first).
      if (err instanceof ApiError && err.isForbidden) {
        router.replace("/login");
        return;
      }
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Connection error. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── /ready unreachable — fail closed, retry only ──────────────────────────
  if (phase === "failed") {
    return (
      <AuthLayout variant="features" tagline="Set up your platform root account">
        <div className="card-base p-6 text-center">
          <h2 className="font-display text-xl font-medium mb-1">Can&apos;t reach the platform</h2>
          <p className="text-sm text-surface-400 mb-6">
            The setup check failed. Make sure the backend is running, then retry.
          </p>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              setPhase("checking");
              fetchReady()
                .then((body) => {
                  if (!needsSetup(body)) router.replace("/login");
                  else setPhase("form");
                })
                .catch(() => setPhase("failed"));
            }}
          >
            Retry
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // ── Checking / already-set-up redirect ────────────────────────────────────
  if (phase === "checking") {
    return (
      <AuthLayout variant="features" tagline="Set up your platform root account">
        <div className="card-base p-6 shadow-glow-sm">
          <div className="h-6 w-40 bg-surface-800 animate-pulse rounded mb-1" />
          <div className="h-4 w-56 bg-surface-800 animate-pulse rounded mb-6" />
          <div className="space-y-4">
            <div className="h-10 bg-surface-800 animate-pulse rounded" />
            <div className="h-10 bg-surface-800 animate-pulse rounded" />
            <div className="h-10 bg-surface-800 animate-pulse rounded" />
          </div>
        </div>
      </AuthLayout>
    );
  }

  // ── First-run form ─────────────────────────────────────────────────────────
  return (
    <AuthLayout variant="features" tagline="Set up your platform root account">
      <div className="card-base p-6 shadow-glow-sm">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-300/10">
            <ShieldCheck size={20} className="text-accent-300" />
          </div>
          <h2 className="font-display text-xl font-medium">Create the root account</h2>
        </div>
        <p className="text-sm text-surface-400 mb-6">
          This is a one-time first-run step. You&apos;ll sign in as{" "}
          <span className="font-mono text-surface-300">root</span> afterwards.
        </p>

        {error && (
          <div className="mb-4 rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <PasswordField
              id="setup-password"
              label="Root password"
              value={password}
              onChange={setPassword}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
              autoFocus
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

          <PasswordField
            id="setup-password-confirm"
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Repeat the password"
            autoComplete="new-password"
            minLength={8}
            required
          />

          <Button variant="primary" type="submit" disabled={submitting} className="w-full">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : "Create root account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-surface-400">
          Already set up?{" "}
          <Link href="/login" className="text-accent-300 font-medium hover:text-accent-200">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
