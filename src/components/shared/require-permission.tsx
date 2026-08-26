"use client";

import type { ReactNode } from "react";
import { useUser } from "@/contexts/user-context";
import { ErrorState } from "@/components/shared/error-state";

interface RequirePermissionProps {
  /** Backend permission string, e.g. "configuration:read". */
  permission: string;
  children: ReactNode;
}

/**
 * Client-side gate mirroring the backend's require_permission(): renders
 * children only when the current user holds `permission`, otherwise a compact
 * error panel. Unknown/loading roles fail closed (no flash of denial while
 * /v1/auth/me is in flight).
 */
export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { can, loading } = useUser();

  if (loading) return null;
  if (!can(permission)) {
    return <ErrorState message="You don't have permission to view this page" />;
  }
  return <>{children}</>;
}
