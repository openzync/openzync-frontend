"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Shield,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { get, apiErrorMessage } from "@/lib/api-client";
import { smartTimestamp } from "@/lib/utils";
import { PageGuide, GuideSecurity } from "@/components/guides";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { StatusBadge, ActorTypeBadge, actorTypeLabel } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";

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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterActorType, setFilterActorType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterActorId, setFilterActorId] = useState("");
  const [availableActors, setAvailableActors] = useState<ActorOption[]>([]);

  // Pagination
  const [offset, setOffset] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async (currentOffset: number) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      });
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
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load audit logs"));
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterActorType, filterActorId, filterStatus]);

  useEffect(() => { fetchLogs(offset); }, [offset, fetchLogs]);

  // ── Fetch available actors for the dropdown ─────────────────────────────────
  useEffect(() => {
    // Always clear selection when type changes — stale ID from previous type is meaningless
    setFilterActorId("");
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
          const allKeys: ActorOption[] = [];
          for (const p of projects) {
            const res = await get<{ data: Array<{ id: string; name: string | null; prefix: string }> }>(
              `/v1/projects/${p.id}/api-keys`
            );
            for (const k of res.data ?? []) {
              allKeys.push({
                id: k.id,
                label: `${k.prefix}${k.name ? " — " + k.name : ""}`,
                group: "API Keys",
              });
            }
          }
          setAvailableActors(allKeys);
        } else if (filterActorType === "system") {
          setAvailableActors([{ id: "system", label: "System", group: "System" }]);
        }
      } catch {
        setAvailableActors([]);
      }
    };
    fetchActors();
  }, [filterActorType, setFilterActorId]);

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

  const applyFilters = () => setOffset(0);

  const clearFilters = () => {
    setFilterAction("");
    setFilterActorType("all");
    setFilterActorId("");
    setFilterStatus("all");
    setOffset(0);
  };

  const hasActiveFilters = filterAction.trim() || filterActorId.trim() || filterActorType !== "all" || filterStatus !== "all";

  const goToPrevious = () => setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
  const goToNext = () => setOffset((prev) => (prev + PAGE_SIZE < total ? prev + PAGE_SIZE : prev));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Immutable record of all system actions"
      />

      <PageGuide title="Audit log" illustration={<GuideSecurity />}>
        <p>View an immutable record of all system actions — session creation, message processing, configuration changes, and more. Filter by action type, resource, or actor to investigate activity.</p>
      </PageGuide>

      {/* Filter bar */}
      <div className="card-base p-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Action filter */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-surface-400 mb-1">Action</label>
            <div className="relative">
              <input
                className="input-base pl-8 text-sm"
                placeholder="e.g. session.create"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              />
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
            </div>
          </div>

          {/* Actor ID filter */}
          <div className="w-64">
            <label className="block text-xs font-medium text-surface-400 mb-1">Actor ID</label>
            <select
              className="input-base appearance-none cursor-pointer text-sm"
              value={filterActorId}
              onChange={(e) => setFilterActorId(e.target.value)}
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
          </div>

          {/* Actor Type filter */}
          <div className="w-36">
            <label className="block text-xs font-medium text-surface-400 mb-1">Actor Type</label>
            <select
              className="input-base appearance-none cursor-pointer text-sm"
              value={filterActorType}
              onChange={(e) => setFilterActorType(e.target.value)}
            >
              <option value="all">All</option>
              <option value="user">User</option>
              <option value="api_key">API Key</option>
              <option value="system">System</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="w-28">
            <label className="block text-xs font-medium text-surface-400 mb-1">Status</label>
            <select
              className="input-base appearance-none cursor-pointer text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All</option>
              <option value="2xx">2xx</option>
              <option value="4xx">4xx</option>
              <option value="5xx">5xx</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pb-0.5">
            <Button variant="primary" size="sm" onClick={applyFilters}>Apply</Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-surface-400">
                <X size={14} />
                Clear
              </Button>
            )}
          </div>

          <div className="flex-1" />

          {/* Auto-refresh toggle — accessible switch pattern */}
          <div className="flex items-center gap-2 pb-0.5">
            <button
              type="button"
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                "focus-visible:outline-2 focus-visible:outline-accent-300 focus-visible:outline-offset-2",
                "cursor-pointer",
                autoRefresh ? "bg-brand-500" : "bg-surface-700",
              )}
              aria-label="Toggle auto-refresh"
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 rounded-full bg-white transition-transform pointer-events-none",
                  autoRefresh ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
            <span className="text-xs text-surface-400 select-none">Auto-refresh</span>
            {lastUpdated && (
              <span className="text-[11px] text-surface-500">Updated {lastUpdated}</span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-800">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Type</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-surface-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Method</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Path</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
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
                entries.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      "transition-colors hover:bg-surface-800/50",
                      idx % 2 === 0 ? "bg-surface-950/50" : "",
                    )}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-surface-300 text-xs">{smartTimestamp(entry.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-surface-200">{entry.action}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-xs text-surface-400 max-w-[80px] block truncate"
                        title={entry.actor_id ?? undefined}
                      >
                        {entry.actor_id ? entry.actor_id.slice(0, 12) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ActorTypeBadge type={entry.actor_type} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge code={entry.status_code} />
                    </td>
                    <td className="px-4 py-3">
                      {entry.method ? (
                        <span className="text-xs font-mono text-surface-400">{entry.method}</span>
                      ) : (
                        <span className="text-surface-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {entry.path ? (
                        <span className="text-xs text-surface-400 max-w-[140px] block truncate font-mono" title={entry.path}>
                          {entry.path}
                        </span>
                      ) : (
                        <span className="text-surface-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-surface-500">{entry.ip_address ?? "—"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
  );
}
