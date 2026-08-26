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

export type UserRole = "admin" | "member" | "superadmin";

/** The org-level RBAC permission set (effective — admins hold all via wildcard). */
export const ALL_PERMISSIONS = [
  "project:read",
  "project:write",
  "project:manage",
  "configuration:read",
  "configuration:write",
  "members:read",
  "members:write",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  /** Effective permission set from /v1/auth/me — admins may send [] (wildcard). */
  permissions: string[];
  /** Root/admin accounts flagged to rotate their password before first use. */
  must_change_password: boolean;
  /** Email-based MFA enrolment, from the same /v1/auth/me payload. */
  mfa_enabled: boolean;
}

/**
 * Pure `can(permission)` evaluation. Admin/superadmin roles are wildcard —
 * they hold every permission regardless of what the list says. Unknown roles
 * (null) and unknown permissions fail closed.
 */
export function canUser(
  role: UserRole | null,
  permissions: string[],
  permission: string,
): boolean {
  if (role === "admin" || role === "superadmin") return true;
  return permissions.includes(permission);
}

interface UserContextValue {
  user: CurrentUser | null;
  /** `null` while loading or when the profile fetch failed — never a guessed role. */
  role: UserRole | null;
  /** Effective permission list from /v1/auth/me ([] while unknown). */
  permissions: string[];
  isAdmin: boolean;
  isSuperadmin: boolean;
  /** True when the current user holds `permission` (admin/superadmin = wildcard). */
  can: (permission: string) => boolean;
  mustChangePassword: boolean;
  loading: boolean;
}

// ─── Context ───────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue | undefined>(undefined);

/**
 * Loads the current user's profile (incl. org role + effective permissions)
 * once from /v1/auth/me. Unknown/failed fetches resolve to `role: null` →
 * `isAdmin: false` and `can() → false`, so admin surfaces stay hidden until
 * the role is actually known. `permissions` is parsed defensively (`?? []`)
 * because older backends may not return the field yet. Nothing sensitive is
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
          // Unknown roles fail closed to "member" — a role the backend hasn't
          // told us about must never unlock admin/superadmin surfaces.
          const role: UserRole =
            data.role === "superadmin"
              ? "superadmin"
              : data.role === "admin"
                ? "admin"
                : "member";
          setUser({
            id: data.id ?? "",
            email: data.email ?? null,
            name: data.name ?? null,
            role,
            // Defensive: the /me field is new — a live env may not send it yet.
            permissions: Array.isArray(data.permissions) ? data.permissions : [],
            must_change_password: data.must_change_password ?? false,
            mfa_enabled: data.mfa_enabled ?? false,
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
  const permissions: string[] = user?.permissions ?? [];
  const isAdmin = role === "admin";
  const isSuperadmin = role === "superadmin";
  const mustChangePassword = user?.must_change_password ?? false;
  const can = (permission: string) => canUser(role, permissions, permission);

  return (
    <UserContext.Provider
      value={{
        user,
        role,
        permissions,
        isAdmin,
        isSuperadmin,
        can,
        mustChangePassword,
        loading,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}
