"use client";

import { useMemo } from "react";
import { get, extractList } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";

/** Minimal user fields for the platform scope filter (GET /v1/users). */
export interface ScopeUser {
  id: string;
  external_id?: string | null;
  name?: string | null;
}

/** Display label: name → external_id → truncated id. */
export function scopeUserLabel(user: ScopeUser): string {
  if (user.name) return user.name;
  if (user.external_id) return user.external_id;
  return user.id.length > 12 ? `${user.id.slice(0, 12)}…` : user.id;
}

export interface ScopeUsersResult {
  users: ScopeUser[];
  usersLoading: boolean;
  /** Non-null when the dropdown fetch failed — callers hide the filter. */
  usersError: string | null;
}

/**
 * Platform user list for the scope filter. Enabled only for
 * `platform:manage` holders; fail-soft — a 403 (permission-gated endpoint) or any
 * other fetch error resolves to `usersError` so the page hides the dropdown
 * and keeps showing its own data.
 */
export function useScopeUsers(enabled: boolean): ScopeUsersResult {
  const query = useApiQuery<unknown>(() => get<unknown>("/v1/users"), {
    enabled,
  });
  const users = useMemo<ScopeUser[]>(() => {
    if (!query.data) return [];
    return extractList<ScopeUser>(query.data).filter(
      (u): u is ScopeUser => !!u && typeof u.id === "string",
    );
  }, [query.data]);
  return { users, usersLoading: query.isLoading, usersError: query.error };
}
