"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "@/lib/api-client";

export interface UseApiQueryOptions {
  /** When false no request is made until it flips true (dependent queries). */
  enabled?: boolean;
  /** Changing this value triggers a refetch (route params, filter state…). */
  refreshKey?: unknown;
}

export interface UseApiQueryResult<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Minimal client-side query hook over the shared api-client verbs.
 *
 * Deliberately not a cache: every mount, refreshKey change, and refetch()
 * hits the network. Race-safe (only the latest run may commit state) and
 * unmount-safe (no setState after unmount). Errors are normalized through
 * apiErrorMessage, so pages get the same strings their old hand-rolled catch
 * blocks produced. Data is kept during a refetch — callers decide whether to
 * show a skeleton or stale content while isLoading is true.
 *
 * ponytail: no AbortController plumbing — api-client's verb helpers
 * deliberately don't accept signals; the run-id stale guard gives identical
 * observable semantics (stale responses discarded, nothing set after unmount).
 */
export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  options: UseApiQueryOptions = {},
): UseApiQueryResult<T> {
  const { enabled = true, refreshKey } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingState, setIsLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);

  // Latest-value mirrors so callers can pass inline closures without
  // memoizing them; the fetch effect below keeps a stable dependency list.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Bump before the enabled check: any re-run (including a disable) must
    // invalidate whatever request was still in flight.
    const runId = ++runIdRef.current;
    if (!enabled) return;
    void (async () => {
      // Deferred past the effect body so state updates are never synchronous
      // within it (react-hooks/set-state-in-effect) — same pattern as
      // superadmin/orgs/page.tsx.
      await Promise.resolve();
      if (runId !== runIdRef.current || !mountedRef.current) return;
      setIsLoading(true);
      try {
        const result = await fetcherRef.current();
        if (runId !== runIdRef.current || !mountedRef.current) return;
        setData(result);
        // Cleared on success only — a retry keeps the error visible until it
        // actually resolves (convention established on overview/page.tsx).
        setError(null);
      } catch (err) {
        if (runId !== runIdRef.current || !mountedRef.current) return;
        setError(
          apiErrorMessage(err, err instanceof Error ? err.message : "Request failed"),
        );
      } finally {
        if (runId === runIdRef.current && mountedRef.current) setIsLoading(false);
      }
    })();
  }, [enabled, refreshKey, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data,
    error,
    // Masked while disabled so an interrupted dependent query doesn't report
    // itself as loading.
    isLoading: isLoadingState && enabled,
    isError: error !== null,
    refetch,
  };
}
