"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLoadingScreen } from "@/components/shared/auth-loading-screen";
import { UserProvider, useUser } from "@/contexts/user-context";
import { clearTokens, getAccessToken } from "@/lib/api-client";
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
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // sessionStorage is sync — the check is instant, so no artificial
    // loading delay or redirect pause; bounce straight to login when stale.
    if (isTokenExpired()) {
      clearTokens();
      window.location.href = "/login?reason=not-signed-in";
      return;
    }
    setAuthorized(true);
  }, []);

  if (!authorized) {
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
