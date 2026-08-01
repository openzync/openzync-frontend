import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePinnedProjects } from "@/hooks/use-pinned-projects";

const STORAGE_KEY = "mg_pinned_projects";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("usePinnedProjects", () => {
  it("starts with empty pinned list", () => {
    const { result } = renderHook(() => usePinnedProjects());
    expect(result.current.pinned).toEqual([]);
    expect(result.current.isMaxPinned).toBe(false);
  });

  it("loads pinned projects from localStorage on mount", () => {
    const existing = [
      { id: "1", name: "Project A" },
      { id: "2", name: "Project B" },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    const { result } = renderHook(() => usePinnedProjects());
    expect(result.current.pinned).toEqual(existing);
    expect(result.current.isMaxPinned).toBe(false);
  });

  it("handles corrupt localStorage data gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json");
    const { result } = renderHook(() => usePinnedProjects());
    expect(result.current.pinned).toEqual([]);
  });

  it("handles non-array localStorage data gracefully", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: "1" }));
    const { result } = renderHook(() => usePinnedProjects());
    expect(result.current.pinned).toEqual([]);
  });

  it("togglePin adds a project to pinned list", () => {
    const { result } = renderHook(() => usePinnedProjects());
    act(() => {
      result.current.togglePin("1", "Project A");
    });
    expect(result.current.pinned).toEqual([{ id: "1", name: "Project A" }]);
    expect(result.current.isPinned("1")).toBe(true);
  });

  it("togglePin removes an already pinned project", () => {
    const { result } = renderHook(() => usePinnedProjects());
    act(() => {
      result.current.togglePin("1", "Project A");
    });
    expect(result.current.pinned).toHaveLength(1);
    act(() => {
      result.current.togglePin("1", "Project A");
    });
    expect(result.current.pinned).toEqual([]);
    expect(result.current.isPinned("1")).toBe(false);
  });

  it("persists to localStorage when pinning", () => {
    const { result } = renderHook(() => usePinnedProjects());
    act(() => {
      result.current.togglePin("1", "Project A");
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toEqual([{ id: "1", name: "Project A" }]);
  });

  it("prevents pinning more than 3 projects", () => {
    const { result } = renderHook(() => usePinnedProjects());
    act(() => result.current.togglePin("1", "A"));
    act(() => result.current.togglePin("2", "B"));
    act(() => result.current.togglePin("3", "C"));
    expect(result.current.pinned).toHaveLength(3);
    expect(result.current.isMaxPinned).toBe(true);

    // Attempt to pin fourth — should be no-op
    act(() => result.current.togglePin("4", "D"));
    expect(result.current.pinned).toHaveLength(3);
    expect(result.current.isPinned("4")).toBe(false);
  });

  it("isPinned returns false for non-pinned project", () => {
    const { result } = renderHook(() => usePinnedProjects());
    expect(result.current.isPinned("nonexistent")).toBe(false);
  });

  it("dispatches storage event on toggle", () => {
    const handler = vi.fn();
    window.addEventListener("mg_pinned_projects_changed", handler);

    const { result } = renderHook(() => usePinnedProjects());
    act(() => {
      result.current.togglePin("1", "A");
    });

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener("mg_pinned_projects_changed", handler);
  });

  it("reacts to external storage events", () => {
    const { result } = renderHook(() => usePinnedProjects());
    expect(result.current.pinned).toHaveLength(0);

    // Simulate another component pinning a project
    act(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ id: "ext", name: "External" }]),
      );
      window.dispatchEvent(new Event("mg_pinned_projects_changed"));
    });

    expect(result.current.pinned).toEqual([
      { id: "ext", name: "External" },
    ]);
  });
});
