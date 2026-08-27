import { Skeleton } from "./skeleton";

/**
 * Route-level first-paint skeleton for dashboard segments (loading.tsx).
 * Deterministic, and shaped like a typical dashboard page — PageHeader bar,
 * stat-card row, content block — so segment navigation never flashes an
 * unstyled shell. Pages keep their own finer-grained skeletons for refetches.
 */
export function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading</span>
      {/* PageHeader-shaped */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* Stat-card-shaped blocks */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card-base p-4 flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-12" />
            </div>
          </div>
        ))}
      </div>
      {/* Content block */}
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
