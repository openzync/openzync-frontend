// ═══════════════════════════════════════════════════════════════════════════════
// OpenZync — Chronological chart ordering
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Return a new array sorted oldest-first by a date/timestamp field.
 *
 * Charts map index 0 to the left of the x-axis, so the earliest point must
 * come first. Backend endpoints do not guarantee order (usage stats arrive
 * newest-first), so every time-series is sorted defensively before render.
 * Handles both YYYY-MM-DD dates and full ISO timestamps via Date parsing.
 *
 * @param rows - Source rows (never mutated; a copy is sorted).
 * @param pick - Extracts the date/timestamp string from a row.
 * @returns A new array ordered oldest-first.
 */
export function sortChronological<T>(rows: readonly T[], pick: (r: T) => string): T[] {
  return [...rows].sort(
    (a, b) => new Date(pick(a)).getTime() - new Date(pick(b)).getTime(),
  );
}
