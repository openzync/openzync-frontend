"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Shield,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
} from "lucide-react";
import { get, apiErrorMessage } from "@/lib/api-client";
import { smartTimestamp } from "@/lib/utils";
import { PageGuide, GuideSecurity } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { RequirePermission } from "@/components/shared/require-permission";
import { Button } from "@/components/ui/button";
import { StatusBadge, ActorTypeBadge, actorTypeLabel } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { SortableHead } from "@/components/shared/sortable-head";
import { useSortQuery } from "@/hooks/use-sort-query";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  actor_type: string | null;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  status_code: number | null;
  method: string | null;
  path: string | null;
  created_at: string;
}

interface AuditResponse {
  items: AuditEntry[];
  total: number;
}

interface ActorOption { id: string; label: string; group: string }

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;
const ACTOR_TYPES = ["all", "user", "api_key", "system"] as const;
const STATUSES = ["all", "2xx", "4xx", "5xx"] as const;

// Backend whitelist for GET /v1/admin/audit-logs (default created_at/desc).
const AUDIT_SORT_FIELDS = ["created_at", "action", "status_code", "actor_id"] as const;

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <AuditLogInner />
    </Suspense>
  );
}

function AuditLogInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableActors, setAvailableActors] = useState<ActorOption[]>([]);

  // ── Filters + pagination live in the URL so filtered views are shareable.
  // Unknown values clamp to defaults; empty/default values stay absent from
  // the URL (?action=session.create&actor_type=user&page=2).
  const filterAction = searchParams.get("action") ?? "";
  const rawActorType = searchParams.get("actor_type") ?? "all";
  const filterActorType = (ACTOR_TYPES as readonly string[]).includes(rawActorType)
    ? rawActorType
    : "all";
  const rawStatus = searchParams.get("status") ?? "all";
  const filterStatus = (STATUSES as readonly string[]).includes(rawStatus)
    ? rawStatus
    : "all";
  const filterActorId = searchParams.get("actor_id") ?? "";
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  // Server-side sort, URL-synced (default created_at/desc). Sort changes
  // drop `page` from the URL via the hook, so sorting restarts at page 1.
  const { sortBy, sortDir, onSort, withSort } = useSortQuery({
    defaultSort: { sortBy: "created_at", sortDir: "desc" },
    allowedFields: AUDIT_SORT_FIELDS,
    timestampFields: ["created_at"],
  });

  /** Merge param updates into the URL; empty/"all"/null values are removed.
   * Built from this page's own derived state (not searchParams iteration) so
   * the written URL always contains exactly the params we own. Sort params
   * are always present (explicit sort contract); filter changes preserve them. */
  function setParams(updates: Record<string, string | null>) {
    const current: Record<string, string | null> = {
      action: filterAction || null,
      actor_type: filterActorType !== "all" ? filterActorType : null,
      status: filterStatus !== "all" ? filterStatus : null,
      actor_id: filterActorId || null,
      page: page > 1 ? String(page) : null,
      sort_by: sortBy,
      sort_dir: sortDir,
    };
    const merged = { ...current, ...updates };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "all") params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const offset = (page - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Auto-refresh is permanently on.
  const [autoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async (currentOffset: number) => {
    setLoading(true);
    setError(null);

    try {
      const params = withSort(new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      }));
      if (filterAction.trim()) params.set("action", filterAction.trim());
      if (filterActorType !== "all") params.set("actor_type", filterActorType);
      if (filterActorId.trim()) params.set("actor_id", filterActorId.trim());
      if (filterStatus !== "all") {
        if (filterStatus === "2xx") params.set("status_code", "2");
        else if (filterStatus === "4xx") params.set("status_code", "4");
        else if (filterStatus === "5xx") params.set("status_code", "5");
      }

      const data = await get<AuditResponse>(`/v1/admin/audit-logs?${params}`);
      setEntries(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load audit logs"));
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterActorType, filterActorId, filterStatus, withSort]);

  useEffect(() => { fetchLogs(offset); }, [offset, fetchLogs]);

  // ── Fetch available actors for the dropdown ─────────────────────────────────
  useEffect(() => {
    if (filterActorType === "all") {
      setAvailableActors([]);
      return;
    }

    const fetchActors = async () => {
      try {
        if (filterActorType === "user") {
          const data = await get<{ data: Array<{ id: string; name: string | null; email: string | null }> }>("/v1/users");
          setAvailableActors(
            (data.data ?? []).map((u) => ({
              id: u.id,
              label: u.name || u.email || u.id.slice(0, 12) + "…",
              group: "Users",
            }))
          );
        } else if (filterActorType === "api_key") {
          const projects = await get<Array<{ id: string }>>("/v1/projects");
          // Parallel fetch — Promise.all preserves project order, so the
          // resulting actor list is stable. Any failure rejects into the
          // outer catch (same behavior as the old serial loop).
          const keyLists = await Promise.all(
            projects.map((p) =>
              get<{ data: Array<{ id: string; name: string | null; prefix: string }> }>(
                `/v1/projects/${p.id}/api-keys`
              )
            )
          );
          const allKeys: ActorOption[] = keyLists.flatMap((res) =>
            (res.data ?? []).map((k) => ({
              id: k.id,
              label: `${k.prefix}${k.name ? " — " + k.name : ""}`,
              group: "API Keys",
            }))
          );
          setAvailableActors(allKeys);
        } else if (filterActorType === "system") {
          setAvailableActors([{ id: "system", label: "System", group: "System" }]);
        }
      } catch {
        setAvailableActors([]);
      }
    };
    fetchActors();
  }, [filterActorType]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => { fetchLogs(offset); }, 10000);
    }
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [autoRefresh, offset, fetchLogs]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Filters refetch as they change; Enter on the action input resets to the
  // first page of the filtered result set.
  const applyFilters = () => setParams({ page: null });

  const clearFilters = () =>
    setParams({ action: null, actor_type: null, actor_id: null, status: null, page: null });

  const hasActiveFilters = filterAction.trim() || filterActorId.trim() || filterActorType !== "all" || filterStatus !== "all";

  const goToPrevious = () =>
    setParams({ page: page > 2 ? String(page - 1) : null });
  const goToNext = () => {
    if (offset + PAGE_SIZE >= total) return;
    setParams({ page: String(page + 1) });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <RequirePermission permission="members:read">
      <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Immutable record of all system actions"
      />

      <PageGuide title="Audit log" illustration={<GuideSecurity />}>
        <p>View an immutable record of all system actions — session creation, message processing, configuration changes, and more. Filter by action type, resource, or actor to investigate activity.</p>
      </PageGuide>

      {/* Filter bar */}
      <div className="card-base p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Action filter */}
          <label htmlFor="audit-filter-action" className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Action</span>
            <div className="relative flex-1 min-w-0">
              <input
                id="audit-filter-action"
                className="input-base h-8 text-xs w-full pl-8 border-surface-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-300 focus-visible:border-accent-300"
                placeholder="e.g. session.create"
                value={filterAction}
                onChange={(e) => setParams({ action: e.target.value, page: null })}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              />
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
            </div>
          </label>

          {/* Actor ID filter — native select for optgroup support */}
          <label htmlFor="audit-filter-actor-id" className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Actor ID</span>
            <select
              id="audit-filter-actor-id"
              className="input-base h-8 text-xs flex-1 min-w-0 truncate border-surface-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-300 focus-visible:border-accent-300"
              value={filterActorId}
              onChange={(e) => setParams({ actor_id: e.target.value || null, page: null })}
              disabled={filterActorType === "all"}
            >
              <option value="">All actors</option>
              {filterActorType === "all" ? (
                availableActors.map((a) => (
                  <option key={`${a.group}-${a.id}`} value={a.id}>{a.label}</option>
                ))
              ) : (
                Object.entries(
                  availableActors.reduce<Record<string, ActorOption[]>>((acc, a) => {
                    (acc[a.group] ??= []).push(a);
                    return acc;
                  }, {})
                ).map(([group, actors]) => (
                  <optgroup key={group} label={group}>
                    {actors.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </optgroup>
                ))
              )}
            </select>
          </label>

          {/* Actor Type filter */}
          <label htmlFor="audit-filter-actor-type" className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Actor Type</span>
            <select
              id="audit-filter-actor-type"
              className="input-base h-8 text-xs flex-1 min-w-0 truncate border-surface-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-300 focus-visible:border-accent-300"
              value={filterActorType}
              onChange={(e) =>
                // Changing type invalidates the selected actor — a stale ID
                // from the previous type is meaningless.
                setParams({ actor_type: e.target.value, actor_id: null, page: null })
              }
            >
              <option value="all">All</option>
              <option value="user">User</option>
              <option value="api_key">API Key</option>
              <option value="system">System</option>
            </select>
          </label>

          {/* Status filter */}
          <label htmlFor="audit-filter-status" className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-surface-400 whitespace-nowrap">Status</span>
            <select
              id="audit-filter-status"
              className="input-base h-8 text-xs flex-1 min-w-0 truncate border-surface-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-300 focus-visible:border-accent-300"
              value={filterStatus}
              onChange={(e) => setParams({ status: e.target.value, page: null })}
            >
              <option value="all">All</option>
              <option value="2xx">2xx</option>
              <option value="4xx">4xx</option>
              <option value="5xx">5xx</option>
            </select>
          </label>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-surface-400">
              <X size={14} />
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card-base overflow-hidden">
        <Table storageKey="audit">
          <TableHeader>
            <SortableHead field="created_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Time</SortableHead>
            <SortableHead field="action" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Action</SortableHead>
            <SortableHead field="actor_id" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Actor</SortableHead>
            <TableHead>Type</TableHead>
            <SortableHead field="status_code" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="center">Status</SortableHead>
            <TableHead>Method</TableHead>
            <TableHead>Path</TableHead>
            <TableHead>IP</TableHead>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={6} cols={8} colWidths={["w-16", "w-28", "w-16", "w-14", "w-12", "w-10", "w-24", "w-20"]} />
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    icon={Shield}
                    title="No audit entries found"
                    description={hasActiveFilters ? "Try adjusting your filters" : "Audit entries will appear here as actions are performed"}
                  />
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">
                    <span className="text-surface-300 text-xs">{smartTimestamp(entry.created_at)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-surface-200">{entry.action}</span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="font-mono text-xs text-surface-400 max-w-[80px] block truncate"
                      title={entry.actor_id ?? undefined}
                    >
                      {entry.actor_id ? entry.actor_id.slice(0, 12) : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ActorTypeBadge type={entry.actor_type} />
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge code={entry.status_code} />
                  </TableCell>
                  <TableCell>
                    {entry.method ? (
                      <span className="text-xs font-mono text-surface-400">{entry.method}</span>
                    ) : (
                      <span className="text-surface-600 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.path ? (
                      <span className="text-xs text-surface-400 max-w-[140px] block truncate font-mono" title={entry.path}>
                        {entry.path}
                      </span>
                    ) : (
                      <span className="text-surface-600 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-surface-500">{entry.ip_address ?? "—"}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Error state */}
        {error && !loading && (
          <div className="border-t border-surface-800 px-4 py-3">
            <ErrorState message={error} onRetry={() => fetchLogs(offset)} />
          </div>
        )}

        {/* Pagination footer */}
        {!loading && total > 0 && (
          <div className="border-t border-surface-800 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-surface-500">
              {total} total entr{total === 1 ? "y" : "ies"}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-surface-400">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={offset === 0}
                  className="rounded-md text-surface-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous page"
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={offset + PAGE_SIZE >= total}
                  className="rounded-md text-surface-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next page"
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Auto-refresh indicator */}
        {autoRefresh && !loading && (
          <div className="border-t border-surface-800 px-4 py-2 flex items-center gap-2">
            <RefreshCw size={12} className="text-brand-300 animate-spin-slow" />
            <span className="text-[11px] text-surface-500">Auto-refreshing every 10s</span>
          </div>
        )}
      </div>
      </div>
    </RequirePermission>
  );
}
