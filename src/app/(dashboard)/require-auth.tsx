"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AuthLoadingScreen } from "@/components/shared/auth-loading-screen";
import { UserProvider, useUser } from "@/contexts/user-context";

const MIN_DISPLAY_MS = 200;
const UNAUTHORIZED_PAUSE_MS = 500;

function isTokenExpired(): boolean {
  const token = sessionStorage.getItem("mg_access_token");
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
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
  const [state, setState] = useState<"loading" | "authorized" | "denied">("loading");
  const redirecting = useRef(false);

  useEffect(() => {
    const token = sessionStorage.getItem("mg_access_token");
    const expired = !token || isTokenExpired();

    if (expired) {
      // Clean up stale tokens
      sessionStorage.removeItem("mg_access_token");
      sessionStorage.removeItem("mg_refresh_token");

      // Show the loading screen briefly for a polished feel, then redirect
      const timer = setTimeout(() => {
        if (!redirecting.current) {
          redirecting.current = true;
          window.location.href = "/login?reason=not-signed-in";
        }
      }, UNAUTHORIZED_PAUSE_MS);

      setState("denied");
      return () => clearTimeout(timer);
    }

    // Valid token — enforce minimum display time so the loading screen
    // doesn't flicker on fast checks (sessionStorage is sync).
    const timer = setTimeout(() => setState("authorized"), MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (state !== "authorized") {
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
