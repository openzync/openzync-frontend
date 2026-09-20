"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Sort direction — matches the backend `SortDir` Literal (`asc`|`desc`). */
export type SortDir = "asc" | "desc";

export interface SortState {
  sortBy: string;
  sortDir: SortDir;
}

interface UseSortQueryOptions {
  /** Backend default order — the column that renders active on first load. */
  defaultSort: SortState;
  /** Backend whitelist for this endpoint — unknown `sort_by` values clamp to the default. */
  allowedFields: readonly string[];
  /** New-field clicks sort ascending, except these (timestamps) which start descending. */
  timestampFields?: readonly string[];
  /** Called after the URL update — pages reset cursor/offset/page state here. */
  onSortChange?: () => void;
}

export interface SortQuery extends SortState {
  /** Header click handler: same field toggles asc<->desc, new field starts asc (timestamps desc). */
  onSort: (field: string) => void;
  /** Append the active `sort_by`/`sort_dir` to an in-progress query. */
  withSort: (params: URLSearchParams) => URLSearchParams;
}

/**
 * URL-synced server-side sort state.
 *
 * `sort_by`/`sort_dir` live in the query string so sorted views survive
 * reload and are shareable. Changing sort drops `cursor`/`page`/`offset`
 * from the URL (backend cursors encode their sort and fail closed on
 * mismatch), and fires `onSortChange` so pages also reset local
 * cursor/offset state back to page 1.
 */
export function useSortQuery({
  defaultSort,
  allowedFields,
  timestampFields = [],
  onSortChange,
}: UseSortQueryOptions): SortQuery {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawBy = searchParams.get("sort_by");
  const rawDir = searchParams.get("sort_dir");
  const sortBy = rawBy && allowedFields.includes(rawBy) ? rawBy : defaultSort.sortBy;
  const sortDir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : defaultSort.sortDir;

  const onSort = useCallback(
    (field: string) => {
      if (!allowedFields.includes(field)) return;
      const nextDir: SortDir =
        field === sortBy
          ? sortDir === "asc"
            ? "desc"
            : "asc"
          : timestampFields.includes(field)
            ? "desc"
            : "asc";
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort_by", field);
      params.set("sort_dir", nextDir);
      // Backend cursors encode their sort — a stale cursor under a new
      // sort fails closed, so pagination always restarts at page 1.
      params.delete("cursor");
      params.delete("page");
      params.delete("offset");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      onSortChange?.();
    },
    [allowedFields, timestampFields, sortBy, sortDir, searchParams, router, pathname, onSortChange],
  );

  const withSort = useCallback(
    (params: URLSearchParams): URLSearchParams => {
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      return params;
    },
    [sortBy, sortDir],
  );

  return useMemo(
    () => ({ sortBy, sortDir, onSort, withSort }),
    [sortBy, sortDir, onSort, withSort],
  );
}
