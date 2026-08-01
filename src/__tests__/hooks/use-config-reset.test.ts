import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConfigReset } from "@/hooks/use-config-reset";

describe("useConfigReset", () => {
  const FIELDS = ["name", "description", "email"] as const;
  const initialForm = { name: "Org", description: "Desc", email: "a@b.com" };
  let form: Record<string, unknown>;
  let setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;

  beforeEach(() => {
    form = { ...initialForm };
    setForm = vi.fn((updater) => {
      if (typeof updater === "function") {
        form = updater(form);
      } else {
        form = updater;
      }
    });
  });

  it("starts with no pending resets", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    expect(result.current.pendingResets.size).toBe(0);
    expect(result.current.hasPendingResets).toBe(false);
  });

  it("stageReset adds a field to pending resets and clears form value", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    act(() => {
      result.current.stageReset("name", "");
    });
    expect(result.current.pendingResets.has("name")).toBe(true);
    expect(result.current.hasPendingResets).toBe(true);
    expect(setForm).toHaveBeenCalled();
  });

  it("stageReset uses provided defaultBlank value", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    act(() => {
      result.current.stageReset("description", "default-val");
    });
    expect(result.current.pendingResets.has("description")).toBe(true);
  });

  it("unstageReset removes a field from pending resets", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    act(() => {
      result.current.stageReset("name", "");
      result.current.stageReset("email", "");
    });
    expect(result.current.pendingResets.size).toBe(2);
    act(() => {
      result.current.unstageReset("name");
    });
    expect(result.current.pendingResets.size).toBe(1);
    expect(result.current.pendingResets.has("email")).toBe(true);
    expect(result.current.pendingResets.has("name")).toBe(false);
  });

  it("unstageReset on non-existent field is a no-op", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    act(() => {
      result.current.unstageReset("nonexistent" as any);
    });
    expect(result.current.pendingResets.size).toBe(0);
  });

  it("getSavePayload sets null for staged resets", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    act(() => {
      result.current.stageReset("name", "");
    });
    const payload = result.current.getSavePayload(form);
    expect(payload).toEqual({ name: null });
  });

  it("getSavePayload includes changed fields that are not staged", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    const updatedForm = { ...form, description: "New Description" };
    const payload = result.current.getSavePayload(updatedForm);
    expect(payload).toEqual({ description: "New Description" });
  });

  it("getSavePayload combines staged resets and changed fields", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    act(() => {
      result.current.stageReset("email", "");
    });
    const updatedForm = { ...form, name: "New Name" };
    const payload = result.current.getSavePayload(updatedForm);
    expect(payload).toEqual({
      name: "New Name",
      email: null,
    });
  });

  it("getSavePayload omits unchanged non-staged fields", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    const payload = result.current.getSavePayload(form);
    expect(payload).toEqual({});
  });

  it("clearResets empties all pending resets", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    act(() => {
      result.current.stageReset("name", "");
      result.current.stageReset("email", "");
    });
    expect(result.current.hasPendingResets).toBe(true);
    act(() => {
      result.current.clearResets();
    });
    expect(result.current.pendingResets.size).toBe(0);
    expect(result.current.hasPendingResets).toBe(false);
  });

  it("hasPendingResets is true only when there are staged resets", () => {
    const { result } = renderHook(() =>
      useConfigReset(FIELDS, initialForm, setForm),
    );
    expect(result.current.hasPendingResets).toBe(false);
    act(() => {
      result.current.stageReset("name", "");
    });
    expect(result.current.hasPendingResets).toBe(true);
    act(() => {
      result.current.clearResets();
    });
    expect(result.current.hasPendingResets).toBe(false);
  });
});
