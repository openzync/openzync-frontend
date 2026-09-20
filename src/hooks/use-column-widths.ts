"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** A column width in pixels, or `null` for automatic sizing. */
export type ColumnWidth = number | null;

export interface ColumnWidths {
  widths: ColumnWidth[];
  startResize: (index: number, e: ReactPointerEvent<Element>) => void;
  resetColumn: (index: number) => void;
  activeIndex: number | null;
}

const MIN_WIDTH = 64;

function storageKeyFor(key: string): string {
  return `oz:table-widths:${key}`;
}

function normalizeWidths(value: unknown, columnCount: number): ColumnWidth[] {
  const fallback: ColumnWidth[] = Array.from({ length: columnCount }, () => null);
  if (!Array.isArray(value)) return fallback;
  const widths: ColumnWidth[] = value.map((entry) =>
    typeof entry === "number" && Number.isFinite(entry) && entry > 0 ? entry : null,
  );
  if (widths.length < columnCount) {
    widths.push(...Array.from({ length: columnCount - widths.length }, () => null));
  }
  return widths.slice(0, columnCount);
}

function loadWidths(key: string, columnCount: number): ColumnWidth[] {
  // Lazy useState initializer — must not touch window during SSR.
  if (typeof window === "undefined") {
    return Array.from({ length: columnCount }, () => null);
  }
  try {
    const raw = window.localStorage.getItem(storageKeyFor(key));
    if (!raw) return Array.from({ length: columnCount }, () => null);
    return normalizeWidths(JSON.parse(raw) as unknown, columnCount);
  } catch {
    // Corrupt JSON — fall back to automatic sizing.
    return Array.from({ length: columnCount }, () => null);
  }
}

/**
 * Persisted, pixel-based column widths for one table.
 *
 * `null` means automatic sizing. Drag state lives in React state for
 * 60fps updates; localStorage is written once per completed drag (or reset),
 * never on every pointermove.
 */
export function useColumnWidths(storageKey: string, columnCount: number): ColumnWidths {
  const [widths, setWidths] = useState<ColumnWidth[]>(() => loadWidths(storageKey, columnCount));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Mirrors state for pointer handlers. Written only inside handlers, so it
  // is always the latest committed value when a drag starts, moves, or ends.
  const widthsRef = useRef<ColumnWidth[]>(widths);

  const persist = useCallback(
    (next: ColumnWidth[]) => {
      widthsRef.current = next;
      setWidths(next);
      try {
        window.localStorage.setItem(storageKeyFor(storageKey), JSON.stringify(next));
      } catch {
        // Private mode / quota — widths still apply for this session.
      }
    },
    [storageKey],
  );

  const resetColumn = useCallback(
    (index: number) => {
      persist(widthsRef.current.map((w, i) => (i === index ? null : w)));
    },
    [persist],
  );

  const startResize = useCallback(
    (index: number, e: ReactPointerEvent<Element>) => {
      e.preventDefault();
      const handle = e.currentTarget as HTMLElement | null;
      try {
        handle?.setPointerCapture?.(e.pointerId);
      } catch {
        // Pointer capture unavailable — window listeners still track the drag.
      }
      const startX = e.clientX;
      const measured = handle?.parentElement?.getBoundingClientRect().width;
      const base =
        widthsRef.current[index] ??
        (typeof measured === "number" && measured > 0 ? measured : MIN_WIDTH);
      setActiveIndex(index);
      let latest = widthsRef.current;

      const onMove = (ev: PointerEvent) => {
        const next = widthsRef.current.slice();
        while (next.length <= index) next.push(null);
        next[index] = Math.max(MIN_WIDTH, base + (ev.clientX - startX));
        latest = next;
        widthsRef.current = next;
        setWidths(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setActiveIndex(null);
        try {
          window.localStorage.setItem(storageKeyFor(storageKey), JSON.stringify(latest));
        } catch {
          // Private mode / quota — widths still apply for this session.
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [storageKey],
  );

  return { widths, startResize, resetColumn, activeIndex };
}
