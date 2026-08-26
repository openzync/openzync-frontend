import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useApiQuery } from "@/hooks/use-api-query";

// ─── Helpers ─────────────────────────────────────────────────────────────────────

/** Manually-resolved promise so tests control fetch timing/ordering. */
function deferred<T = string>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Success / error paths ───────────────────────────────────────────────────────

describe("useApiQuery", () => {
  it("resolves data and clears isLoading on success", async () => {
    const { result } = renderHook(() =>
      useApiQuery(async () => ({ value: 42 })),
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ value: 42 });
    expect(result.current.error).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it("exposes a normalized error message and null data on failure", async () => {
    const { result } = renderHook(() =>
      useApiQuery(async () => {
        throw new Error("boom");
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe("boom");
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    const { result } = renderHook(() =>
      useApiQuery(async () => {
        throw "not-an-error";
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe("Request failed");
  });

  // ─── Refetch / refreshKey ──────────────────────────────────────────────────────

  it("refetch() runs the fetcher again and applies the new result", async () => {
    let value = 1;
    const { result } = renderHook(() => useApiQuery(async () => value));

    await waitFor(() => expect(result.current.data).toBe(1));

    value = 2;
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toBe(2));
  });

  it("changing refreshKey triggers a refetch", async () => {
    const fetcher = vi.fn(async (days: number) => `usage-${days}`);
    const { result, rerender } = renderHook(
      ({ days }: { days: number }) =>
        useApiQuery(() => fetcher(days), { refreshKey: days }),
      { initialProps: { days: 7 } },
    );

    await waitFor(() => expect(result.current.data).toBe("usage-7"));
    expect(fetcher).toHaveBeenCalledTimes(1);

    rerender({ days: 30 });
    await waitFor(() => expect(result.current.data).toBe("usage-30"));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not refetch when refreshKey is unchanged across re-renders", async () => {
    const fetcher = vi.fn(async () => "stable");
    const { result, rerender } = renderHook(
      ({ days }: { days: number }) =>
        useApiQuery(() => fetcher(), { refreshKey: days }),
      { initialProps: { days: 7 } },
    );

    await waitFor(() => expect(result.current.data).toBe("stable"));
    rerender({ days: 7 });
    rerender({ days: 7 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });

  // ─── Race safety ───────────────────────────────────────────────────────────────

  it("discards a stale response when a newer request supersedes it", async () => {
    const first = deferred();
    const second = deferred();
    const calls = [first, second];
    let callIndex = 0;
    const { result } = renderHook(() =>
      useApiQuery(() => calls[callIndex++]!.promise),
    );

    // Start the initial request so it is genuinely in flight…
    await act(async () => {
      await Promise.resolve();
    });
    expect(callIndex).toBe(1);

    // …then supersede it with a second one.
    act(() => result.current.refetch());
    await act(async () => {
      await Promise.resolve();
    });
    expect(callIndex).toBe(2);

    // The older request settles LAST — its result must be dropped.
    first.resolve("stale");
    second.resolve("fresh");

    await waitFor(() => expect(result.current.data).toBe("fresh"));
    expect(result.current.error).toBeNull();
  });

  it("keeps the previous error visible until a retry succeeds", async () => {
    const gate = deferred<string>();
    let shouldFail = true;
    const { result } = renderHook(() =>
      useApiQuery(async () => {
        if (shouldFail) throw new Error("nope");
        return gate.promise;
      }),
    );

    await waitFor(() => expect(result.current.error).toBe("nope"));

    shouldFail = false;
    act(() => result.current.refetch());
    // Mid-retry: error still shown while loading.
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.error).toBe("nope");

    gate.resolve("ok");
    await waitFor(() => expect(result.current.data).toBe("ok"));
    expect(result.current.error).toBeNull();
  });

  // ─── Unmount safety ────────────────────────────────────────────────────────────

  it("does not update state after unmount", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = deferred();
    const { unmount } = renderHook(() => useApiQuery(() => pending.promise));

    unmount();
    pending.resolve("late");

    // Flush microtasks — any post-unmount setState would surface here as a
    // React console error ("update on an unmounted component") or a crash.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  // ─── enabled gate ──────────────────────────────────────────────────────────────

  it("skips fetching while enabled is false, then fetches when it flips true", async () => {
    const fetcher = vi.fn(async () => "loaded");
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useApiQuery(fetcher, { enabled }),
      { initialProps: { enabled: false } },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toBe("loaded"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports isLoading=false when disabled mid-flight", async () => {
    const pending = deferred();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useApiQuery(() => pending.promise, { enabled }),
      { initialProps: { enabled: true } },
    );

    expect(result.current.isLoading).toBe(true);
    rerender({ enabled: false });
    expect(result.current.isLoading).toBe(false);

    // Late resolution must not resurrect state.
    pending.resolve("late");
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
