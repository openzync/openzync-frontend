"use client";

import { useState, useCallback } from "react";

/**
 * Manages staged field resets for org-config pages.
 *
 * Instead of firing PATCH `{field: null}` immediately (old behavior),
 * the reset is staged in local state and submitted together with
 * regular edits when the user clicks "Save Changes".
 *
 * Usage:
 * ```tsx
 * const { pendingResets, stageReset, clearResets, getSavePayload } =
 *   useConfigReset(FIELDS, initialForm, setForm);
 * ```
 */
export function useConfigReset<T extends string>(
  fields: readonly T[],
  initialForm: Record<string, unknown>,
  setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
) {
  const [pendingResets, setPendingResets] = useState<Set<T>>(new Set());

  /** Stage a field for reset on next save. */
  const stageReset = useCallback(
    (field: T, defaultBlank: unknown = "") => {
      setPendingResets((prev) => new Set(prev).add(field));
      // Clear the form value so the field appears empty/default
      setForm((prev) => ({ ...prev, [field]: defaultBlank }));
    },
    [setForm],
  );

  /** Remove a field from the reset queue (user edits it after staging). */
  const unstageReset = useCallback((field: T) => {
    setPendingResets((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }, []);

  const hasPendingResets = pendingResets.size > 0;

  /** Build the PATCH payload — changed fields + null for staged resets. */
  const getSavePayload = useCallback(
    (currentForm: Record<string, unknown>) => {
      const payload: Record<string, unknown> = {};
      for (const field of fields) {
        if (pendingResets.has(field)) {
          payload[field] = null;
        } else if (currentForm[field] !== initialForm[field]) {
          payload[field] = currentForm[field];
        }
      }
      return payload;
    },
    [fields, pendingResets, initialForm],
  );

  /** Clear all pending resets (e.g. on discard or successful save). */
  const clearResets = useCallback(() => {
    setPendingResets(new Set());
  }, []);

  return {
    pendingResets,
    stageReset,
    unstageReset,
    hasPendingResets,
    getSavePayload,
    clearResets,
  } as const;
}
