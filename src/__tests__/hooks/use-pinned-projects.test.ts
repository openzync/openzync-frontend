import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePinnedProjects } from "@/hooks/use-pinned-projects";
import { get, pinProject, unpinProject, ApiError } from "@/lib/api-client";
import { toast } from "sonner";

// ─── Mocks ────────────────────────────────────────────────────────────────────────
// Pins are server-owned: the hook fetches /v1/projects?pinned_only=true and
// POSTs/DELETEs through pinProject/unpinProject. localStorage survives only as
// a one-shot migration source.

vi.mock("@/lib/api-client", () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
  }
  return {
    get: vi.fn(),
    pinProject: vi.fn(),
    unpinProject: vi.fn(),
    extractList: (response: unknown) => {
      if (Array.isArray(response)) return response;
      const obj = response as { data?: unknown; items?: unknown } | null;
      if (Array.isArray(obj?.data)) return obj.data;
      if (Array.isArray(obj?.items)) return obj.items;
      return [];
    },
    ApiError,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const LEGACY_KEY = "mg_pinned_projects";
const MIGRATED_KEY = "mg_pinned_migrated";
const PINS_EVENT = "mg_pinned_projects_changed";

const A = { id: "1", name: "Project A" };
const B = { id: "2", name: "Project B" };
const C = { id: "3", name: "Project C" };

/** Server response for the pinned_only fetch. */
function serverPins(pins: { id: string; name: string }[]) {
  (get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: pins });
}

beforeEach(() => {
  localStorage.clear();
  // Opt out of the legacy migration path unless a test opts in.
  localStorage.setItem(MIGRATED_KEY, "1");
  vi.mocked(get).mockReset();
  vi.mocked(pinProject).mockReset();
  vi.mocked(unpinProject).mockReset();
  vi.mocked(pinProject).mockResolvedValue(undefined);
  vi.mocked(unpinProject).mockResolvedValue(undefined);
  vi.mocked(toast.error).mockReset();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("usePinnedProjects", () => {
  it("loads pinned projects from the server on mount", async () => {
    serverPins([A, B]);
    const { result } = renderHook(() => usePinnedProjects());

    await waitFor(() => expect(result.current.pinned).toEqual([A, B]));
    expect(get).toHaveBeenCalledWith("/v1/projects?pinned_only=true");
    expect(result.current.isPinned("1")).toBe(true);
    expect(result.current.isPinned("nope")).toBe(false);
    expect(result.current.isMaxPinned).toBe(false);
  });

  it("stays empty and stops loading when the fetch fails", async () => {
    (get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => usePinnedProjects());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pinned).toEqual([]);
  });

  it("togglePin adds a project and POSTs the pin", async () => {
    serverPins([]);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.togglePin("1", "Project A");
    });

    expect(pinProject).toHaveBeenCalledWith("1");
    expect(result.current.pinned).toEqual([A]);
    expect(result.current.isPinned("1")).toBe(true);
    // Pins are server-owned — nothing is written back to localStorage.
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("togglePin removes an already pinned project and DELETEs the pin", async () => {
    serverPins([A, B]);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinned).toEqual([A, B]));

    await act(async () => {
      await result.current.togglePin("1", "Project A");
    });

    expect(unpinProject).toHaveBeenCalledWith("1");
    expect(pinProject).not.toHaveBeenCalled();
    expect(result.current.pinned).toEqual([B]);
    expect(result.current.isPinned("1")).toBe(false);
  });

  it("rolls back and surfaces the message when the pin request fails", async () => {
    serverPins([A]);
    vi.mocked(pinProject).mockRejectedValueOnce(new ApiError("nope", 500, null));
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinned).toEqual([A]));

    await act(async () => {
      await result.current.togglePin("2", "Project B");
    });

    // Optimistic add reverted so the rail keeps matching the server.
    expect(result.current.pinned).toEqual([A]);
    expect(toast.error).toHaveBeenCalledWith("Failed to update pin");
  });

  it("surfaces the 422 limit message from the server", async () => {
    serverPins([]);
    vi.mocked(pinProject).mockRejectedValueOnce(new ApiError("limit", 422, null));
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.togglePin("1", "Project A");
    });

    expect(toast.error).toHaveBeenCalledWith("Maximum 3 pinned projects");
  });

  it("prevents pinning more than 3 projects before the request", async () => {
    serverPins([A, B, C]);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.isMaxPinned).toBe(true));

    await act(async () => {
      await result.current.togglePin("4", "Project D");
    });

    expect(result.current.pinned).toHaveLength(3);
    expect(result.current.isPinned("4")).toBe(false);
    // Client-side guard — no request is even attempted.
    expect(pinProject).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Maximum 3 pinned projects");
  });

  it("dispatches a pins-changed event on toggle", async () => {
    serverPins([]);
    const handler = vi.fn();
    window.addEventListener(PINS_EVENT, handler);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.togglePin("1", "Project A");
    });

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(PINS_EVENT, handler);
  });

  it("reacts to pins-changed events dispatched by another component", async () => {
    serverPins([]);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pinned).toHaveLength(0);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(PINS_EVENT, { detail: [{ id: "ext", name: "External" }] }),
      );
    });

    expect(result.current.pinned).toEqual([{ id: "ext", name: "External" }]);
  });

  // ── One-shot legacy migration ───────────────────────────────────────────

  it("migrates legacy localStorage pins to the server, then clears them", async () => {
    localStorage.removeItem(MIGRATED_KEY);
    localStorage.setItem(LEGACY_KEY, JSON.stringify([A, B]));
    serverPins([]);

    const { result } = renderHook(() => usePinnedProjects());

    await waitFor(() => expect(result.current.pinned).toEqual([A, B]));
    expect(pinProject).toHaveBeenCalledWith("1");
    expect(pinProject).toHaveBeenCalledWith("2");
    // Legacy key is dropped and the guard flag set, so this runs only once.
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(MIGRATED_KEY)).toBe("1");
  });

  it("skips already-migrated projects and ignores corrupt legacy data", async () => {
    localStorage.removeItem(MIGRATED_KEY);
    localStorage.setItem(LEGACY_KEY, "not-valid-json");
    serverPins([A]);

    const { result } = renderHook(() => usePinnedProjects());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(pinProject).not.toHaveBeenCalled();
    expect(result.current.pinned).toEqual([A]);
  });
});
