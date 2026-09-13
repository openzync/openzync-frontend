"use client";

import { useCallback, useRef, useState } from "react";
import { apiErrorMessage, post } from "@/lib/api-client";

export type ConnectionTestDomain = "llm" | "embeddings" | "graph" | "blob";

export interface ConnectionTestResult {
  ok: boolean;
  latency_ms: number;
  detail: string | null;
}

interface ConnectionTestResponse {
  results: Partial<
    Record<
      ConnectionTestDomain,
      { ok: boolean; latency_ms: number; detail?: string | null }
    >
  >;
}

export interface UseConnectionTest {
  testing: boolean;
  result: ConnectionTestResult | null;
  error: string | null;
  test: (
    domain: ConnectionTestDomain,
    candidate: Record<string, unknown>,
  ) => Promise<ConnectionTestResult | null>;
  reset: () => void;
}

/**
 * Connection test for org-config credential tabs.
 *
 * POSTs the CURRENT (possibly unsaved) form as `config` candidate to
 * /admin/org/config/test. Deliberately separate from useConfigDirty —
 * testing never marks the form dirty. Race-safe (only the latest run may
 * commit state), following the same run-id guard as useApiQuery.
 */
export function useConnectionTest(): UseConnectionTest {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const test = useCallback(
    async (
      domain: ConnectionTestDomain,
      candidate: Record<string, unknown>,
    ): Promise<ConnectionTestResult | null> => {
      const runId = ++runIdRef.current;
      setTesting(true);
      setError(null);
      try {
        const res = await post<ConnectionTestResponse>("/admin/org/config/test", {
          domain,
          config: candidate,
        });
        if (runId !== runIdRef.current) return null;
        const entry = res.results?.[domain];
        if (!entry || typeof entry.ok !== "boolean" || typeof entry.latency_ms !== "number") {
          setResult(null);
          setError("Unexpected response shape");
          return null;
        }
        const normalized: ConnectionTestResult = {
          ok: entry.ok,
          latency_ms: entry.latency_ms,
          detail: entry.detail ?? null,
        };
        setResult(normalized);
        if (!entry.ok) setError(entry.detail ?? "Connection test failed");
        return normalized;
      } catch (err) {
        if (runId !== runIdRef.current) return null;
        setError(apiErrorMessage(err, "Connection test failed"));
        setResult(null);
        return null;
      } finally {
        if (runId === runIdRef.current) setTesting(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    ++runIdRef.current;
    setResult(null);
    setError(null);
  }, []);

  return { testing, result, error, test, reset };
}
