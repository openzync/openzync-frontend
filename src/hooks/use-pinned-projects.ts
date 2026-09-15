"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  get,
  extractList,
  pinProject,
  unpinProject,
  ApiError,
} from "@/lib/api-client";

export interface PinnedProject {
  id: string;
  name: string;
}

interface BackendPinnedProject {
  id: string;
  name: string;
}

const LEGACY_KEY = "mg_pinned_projects";
const MIGRATED_KEY = "mg_pinned_migrated";
const PINS_EVENT = "mg_pinned_projects_changed";
const MAX_PINS = 3;

function readLegacy(): PinnedProject[] {
  try {
    const stored = localStorage.getItem(LEGACY_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as PinnedProject[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PinnedProject =>
        typeof p?.id === "string" && typeof p?.name === "string",
    );
  } catch {
    // Corrupt data — ignore
    return [];
  }
}

function pinErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 422) return "Maximum 3 pinned projects";
    if (err.status === 404) return "Project not available";
  }
  return "Failed to update pin";
}

export function usePinnedProjects() {
  const [pinned, setPinned] = useState<PinnedProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const inFlight = useRef<Set<string>>(new Set());

  // Initial fetch + one-time legacy migration. Runs once per mount.
  useEffect(() => {
    let cancelled = false;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PinnedProject[]>).detail;
      if (Array.isArray(detail)) setPinned(detail);
    };
    window.addEventListener(PINS_EVENT, handler);

    void (async () => {
      try {
        const res = await get<unknown>("/v1/projects?pinned_only=true");
        if (cancelled) return;
        const server = extractList<BackendPinnedProject>(res).map((p) => ({
          id: p.id,
          name: p.name,
        }));

        // One-time migration: legacy localStorage entries not already on server.
        let alreadyMigrated = false;
        try {
          alreadyMigrated = localStorage.getItem(MIGRATED_KEY) === "1";
        } catch {
          // Storage unavailable — attempt migration; bulk-POST is idempotent.
        }
        if (!alreadyMigrated) {
          let combined = server;
          if (server.length < MAX_PINS) {
            const serverIds = new Set(server.map((p) => p.id));
            const candidates = readLegacy()
              .slice(0, MAX_PINS)
              .filter((p) => !serverIds.has(p.id))
              .slice(0, MAX_PINS - server.length);
            if (candidates.length > 0) {
              const migrated: PinnedProject[] = [];
              for (const entry of candidates) {
                try {
                  await pinProject(entry.id);
                  migrated.push(entry);
                } catch (err) {
                  // 422 = limit hit mid-migration — stop, keep what succeeded.
                  if (err instanceof ApiError && err.status === 422) break;
                  // 404/other — skip this entry, try the next.
                }
              }
              combined = [...server, ...migrated];
            }
          }
          if (!cancelled) {
            setPinned(combined);
            window.dispatchEvent(
              new CustomEvent<PinnedProject[]>(PINS_EVENT, { detail: combined }),
            );
          }
          try {
            localStorage.removeItem(LEGACY_KEY);
          } catch {
            // Storage unavailable — migration guard still prevents loops.
          }
          try {
            localStorage.setItem(MIGRATED_KEY, "1");
          } catch {
            // Private mode — migration may retry next load; bulk-POST is idempotent.
          }
          return;
        }

        setPinned(server);
      } catch {
        // Fetch failed (offline/401/500) — keep empty; pages show their own error.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener(PINS_EVENT, handler);
    };
  }, []);

  const togglePin = useCallback(
    async (id: string, name: string): Promise<void> => {
      if (inFlight.current.has(id)) return;
      const currentlyPinned = pinned.some((p) => p.id === id);
      // note: pre-POST UI guard — server still enforces MAX_PINS=3 (422).
      if (!currentlyPinned && pinned.length >= MAX_PINS) {
        toast.error("Maximum 3 pinned projects");
        return;
      }
      const next: PinnedProject[] = currentlyPinned
        ? pinned.filter((p) => p.id !== id)
        : [...pinned, { id, name }];
      const previous = pinned;
      inFlight.current.add(id);
      setPinned(next);
      window.dispatchEvent(
        new CustomEvent<PinnedProject[]>(PINS_EVENT, { detail: next }),
      );
      try {
        if (currentlyPinned) {
          await unpinProject(id);
        } else {
          await pinProject(id);
        }
      } catch (err) {
        // Rollback on any failure so the rail matches the server.
        setPinned(previous);
        window.dispatchEvent(
          new CustomEvent<PinnedProject[]>(PINS_EVENT, { detail: previous }),
        );
        toast.error(pinErrorMessage(err));
      } finally {
        inFlight.current.delete(id);
      }
    },
    [pinned],
  );

  const isPinned = useCallback(
    (id: string) => pinned.some((p) => p.id === id),
    [pinned],
  );

  const isMaxPinned = pinned.length >= MAX_PINS;

  return { pinned, togglePin, isPinned, isMaxPinned, isLoading };
}
