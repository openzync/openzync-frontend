"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLoadingScreen } from "@/components/shared/auth-loading-screen";
import { UserProvider, useUser } from "@/contexts/user-context";
import { AUTH_REDIRECT_EVENT, clearTokens, getAccessToken, refreshOnce } from "@/lib/api-client";
import { getTokenExp } from "@/lib/jwt";

function isTokenExpired(): boolean {
  const token = getAccessToken();
  const exp = getTokenExp(token);
  // Fail closed: missing/unparseable token or exp counts as expired.
  return exp === null || exp * 1000 < Date.now();
}

/**
 * Redirects to /change-password when the profile says the password must be
 * rotated. Lives inside UserProvider so it reads the fetched profile — the
 * backstop for the login-page hint when the login response lacks the flag.
 */
function MustChangePasswordRedirect() {
  const router = useRouter();
  const { mustChangePassword, loading } = useUser();

  useEffect(() => {
    if (!loading && mustChangePassword) {
      router.replace("/change-password");
    }
  }, [mustChangePassword, loading, router]);

  return null;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Client-side redirect on auth failure — preserves app shell state.
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      router.replace(url);
    };
    window.addEventListener(AUTH_REDIRECT_EVENT, handler);
    return () => window.removeEventListener(AUTH_REDIRECT_EVENT, handler);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // localStorage is sync — the check is instant, so no artificial
      // loading delay or redirect pause; bounce straight to login when stale.
      if (isTokenExpired()) {
        // Fail closed: missing/unparseable token — no refresh to attempt.
        if (getTokenExp(getAccessToken()) === null) {
          clearTokens();
          router.replace("/login?reason=not-signed-in");
          return;
        }
        // Parseable but expired — try single-flight refresh before logging out.
        try {
          const newToken = await refreshOnce();
          if (!newToken) {
            clearTokens();
            router.replace("/login?reason=not-signed-in");
            return;
          }
        } catch {
          // Transport/transient refresh failure (5xx/offline) — do NOT
          // enter the shell with an expired token; stay on the loading
          // screen with a retry affordance instead.
          if (!cancelled) {
            setWasOffline(
              typeof navigator !== "undefined" && !navigator.onLine
            );
            setRefreshFailed(true);
          }
          return;
        }
      }
      if (!cancelled) setAuthorized(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, router]);

  // Network may flap while the failure screen shows — keep the offline
  // note live instead of frozen at the failure-time snapshot.
  useEffect(() => {
    if (!refreshFailed) return;
    const syncOnline = () =>
      setWasOffline(
        typeof navigator !== "undefined" && !navigator.onLine
      );
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, [refreshFailed]);

  if (!authorized) {
    if (refreshFailed) {
      return (
        <AuthLoadingScreen
          offline={wasOffline}
          onRetry={() => {
            setRefreshFailed(false);
            setAttempt((a) => a + 1);
          }}
        />
      );
    }
    return <AuthLoadingScreen />;
  }

  // Role context wraps the whole dashboard — Sidebar, layout, and every page
  // read the org role from useUser().
  return (
    <UserProvider>
      <MustChangePasswordRedirect />
      {children}
    </UserProvider>
  );
}
