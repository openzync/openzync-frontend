"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { get } from "@/lib/api-client";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "member";

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
}

interface UserContextValue {
  user: CurrentUser | null;
  /** `null` while loading or when the profile fetch failed — never a guessed role. */
  role: UserRole | null;
  isAdmin: boolean;
  loading: boolean;
}

// ─── Context ───────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue | undefined>(undefined);

/**
 * Loads the current user's profile (incl. org role) once from /v1/auth/me.
 * Unknown/failed fetches resolve to `role: null` → `isAdmin: false`, so admin
 * surfaces stay hidden until the role is actually known. Nothing sensitive is
 * logged from here.
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await get<Partial<CurrentUser>>("/v1/auth/me");
        if (!cancelled) {
          setUser({
            id: data.id ?? "",
            email: data.email ?? null,
            name: data.name ?? null,
            role: data.role === "admin" ? "admin" : "member",
          });
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const role: UserRole | null = user?.role ?? null;
  const isAdmin = role === "admin";

  return (
    <UserContext.Provider value={{ user, role, isAdmin, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}
