"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, AlertTriangle, Database, TableIcon, Code } from "lucide-react";
import { get, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueryDefinition {
  name: string;
  description: string;
  category: string;
  org_scoped: boolean;
  params: string[];
}

interface QueryResult {
  query: string;
  org_scoped: boolean;
  columns: string[];
  rows: (string | number)[][];
  total: number;
  parameters: Record<string, number>;
  warning?: string;
}

type SortDirection = "asc" | "desc";

interface SortState {
  colIndex: number;
  direction: SortDirection;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "All",
  "Ingestion",
  "Users",
  "Graph",
  "Projects",
  "Performance",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  ingestion: "bg-brand-500/10 text-brand-300",
  users: "bg-accent-300/10 text-accent-300",
  graph: "bg-success/10 text-success",
  projects: "bg-warning/10 text-warning",
  performance: "bg-error/10 text-error",
};

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanizeQueryName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function stableCompare(a: string | number, b: string | number): number {
  const aStr = String(a);
  const bStr = String(b);
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
  return aStr.localeCompare(bStr);
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="card-base p-4 space-y-3 animate-pulse">
      <div className="h-4 bg-surface-800 rounded w-3/4" />
      <div className="h-3 bg-surface-800 rounded w-full" />
      <div className="flex gap-2">
        <div className="h-5 bg-surface-800 rounded-full w-16" />
        <div className="h-5 bg-surface-800 rounded-full w-14" />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QueryPlaygroundPage() {
  const [queries, setQueries] = useState<QueryDefinition[]>([]);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [queriesError, setQueriesError] = useState("");

  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedQuery, setSelectedQuery] = useState<QueryDefinition | null>(null);

  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(20);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(0);
  const [showRaw, setShowRaw] = useState(false);

  // Fetch available queries on mount
  useEffect(() => {
    get<{ queries: QueryDefinition[] }>("/metrics/queries")
      .then((data) => setQueries(data.queries))
      .catch((err) =>
        setQueriesError(err instanceof ApiError ? err.message : "Failed to load queries"),
      )
      .finally(() => setQueriesLoading(false));
  }, []);

  // Pre-select first query once loaded
  useEffect(() => {
    if (queries.length > 0 && !selectedQuery) {
      setSelectedQuery(queries[0]);
    }
  }, [queries, selectedQuery]);

  // Reset page when sort or result changes
  useEffect(() => {
    setPage(0);
  }, [sort, result]);

  // Filtered queries by category
  const filtered = useMemo(() => {
    if (activeCategory === "All") return queries;
    return queries.filter((q) => q.category === activeCategory.toLowerCase());
  }, [queries, activeCategory]);

  // Sorted + paginated rows
  const { sortedRows, totalPages } = useMemo(() => {
    if (!result) return { sortedRows: [], totalPages: 0 };
    let rows = [...result.rows];
    if (sort) {
      rows.sort((a, b) => {
        const cmp = stableCompare(a[sort.colIndex], b[sort.colIndex]);
        return sort.direction === "asc" ? cmp : -cmp;
      });
    }
    const total = Math.ceil(rows.length / PAGE_SIZE);
    return { sortedRows: rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), totalPages: total };
  }, [result, sort, page]);

  const handleSort = (colIndex: number) => {
    setSort((prev) => {
      if (prev?.colIndex === colIndex) {
        return prev.direction === "asc" ? { colIndex, direction: "desc" } : null;
      }
      return { colIndex, direction: "asc" };
    });
  };

  const handleRun = async () => {
    if (!selectedQuery) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams({ query: selectedQuery.name });
      if (selectedQuery.params.includes("days")) params.set("days", String(days));
      if (selectedQuery.params.includes("limit")) params.set("limit", String(limit));
      const res = await get<QueryResult>(`/metrics/query?${params}`);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  };

  const selectedParams = selectedQuery?.params ?? [];
  const isPerformance = selectedQuery?.category === "performance";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Query Playground"
        description="Run predefined metric queries scoped to your organization"
      />

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Query categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeCategory === cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              activeCategory === cat
                ? "bg-brand-500 text-white"
                : "bg-surface-800 text-surface-400 hover:bg-surface-700 hover:text-surface-200",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Query Card Grid */}
      {queriesLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {queriesError && <ErrorState message={queriesError} onRetry={() => window.location.reload()} />}

      {!queriesLoading && !queriesError && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" role="tabpanel">
          {filtered.map((q) => {
            const isActive = selectedQuery?.name === q.name;
            return (
              <button
                key={q.name}
                onClick={() => {
                  setSelectedQuery(q);
                  setResult(null);
                  setError("");
                }}
                className={cn(
                  "card-base p-4 text-left space-y-2.5 transition-all cursor-pointer w-full",
                  isActive
                    ? "ring-2 ring-brand-500 border-brand-500/50"
                    : "hover:border-surface-600",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-surface-100 leading-tight">
                    {humanizeQueryName(q.name)}
                  </h3>
                  <Badge
                    variant="default"
                    size="sm"
                    className={cn("shrink-0", CATEGORY_COLORS[q.category] ?? "")}
                  >
                    {q.category}
                  </Badge>
                </div>
                <p className="text-xs text-surface-400 leading-relaxed">{q.description}</p>
                <div className="flex items-center gap-2 pt-0.5">
                  {q.org_scoped ? (
                    <Badge variant="success" size="sm">
                      <Database size={10} className="mr-1" />
                      Org Scoped
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">
                      <AlertTriangle size={10} className="mr-1" />
                      Global
                    </Badge>
                  )}
                  {q.params.length > 0 && (
                    <span className="text-[10px] text-surface-500">
                      {q.params.length} param{q.params.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Parameter Panel */}
      {selectedQuery && (
        <div className="card-base p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-surface-100 mb-1">
                {humanizeQueryName(selectedQuery.name)}
              </h2>
              <p className="text-xs text-surface-400">{selectedQuery.description}</p>
            </div>

            <div className="flex items-end gap-3 flex-wrap">
              {selectedParams.includes("days") && (
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">
                    Days
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={days}
                    onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 7)))}
                    className="input-base w-20 text-sm"
                  />
                </label>
              )}
              {selectedParams.includes("limit") && (
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">
                    Limit
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={limit}
                    onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value) || 20)))}
                    className="input-base w-20 text-sm"
                  />
                </label>
              )}

              <Button
                variant="primary"
                onClick={handleRun}
                loading={loading}
                icon={<Play size={14} />}
              >
                Run
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Performance warning */}
      {isPerformance && result && (
        <div className="flex items-center gap-2 rounded-md bg-warning/10 border border-warning/30 px-4 py-2.5 text-xs text-warning">
          <AlertTriangle size={14} className="shrink-0" />
          Global metric &mdash; not scoped to your organization
        </div>
      )}

      {/* Error */}
      {error && <ErrorState message={error} onRetry={handleRun} />}

      {/* Results Section */}
      {loading && (
        <div className="card-base p-8 flex items-center justify-center gap-3 text-surface-400">
          <Spinner size={18} />
          <span className="text-sm">Running query&hellip;</span>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-3">
          {/* Results metadata bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 text-xs text-surface-400">
              <span className="font-medium text-surface-200">
                {humanizeQueryName(result.query)}
              </span>
              <span>{result.total} row{result.total !== 1 ? "s" : ""}</span>
              {result.org_scoped && (
                <Badge variant="success" size="sm">
                  Org Scoped
                </Badge>
              )}
            </div>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors"
            >
              <Code size={12} />
              {showRaw ? "Show Table" : "Show Raw JSON"}
            </button>
          </div>

          {result.warning && (
            <div className="flex items-center gap-2 rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning">
              <AlertTriangle size={12} className="shrink-0" />
              {result.warning}
            </div>
          )}

          {showRaw ? (
            <div className="card-base p-4 overflow-auto max-h-[32rem]">
              <pre className="text-xs font-mono text-surface-300 whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          ) : (
            <>
              {result.rows.length === 0 ? (
                <div className="card-base p-8 text-center">
                  <TableIcon size={24} className="mx-auto text-surface-600 mb-2" />
                  <p className="text-sm text-surface-400">No results returned</p>
                  <p className="text-xs text-surface-500 mt-1">
                    Try adjusting the parameters or selecting a different query.
                  </p>
                </div>
              ) : (
                <>
                  <div className="card-base overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-800">
                          {result.columns.map((col, i) => (
                            <th
                              key={col}
                              onClick={() => handleSort(i)}
                              className={cn(
                                "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400",
                                "cursor-pointer hover:text-surface-200 transition-colors select-none",
                                sort?.colIndex === i && "text-brand-300",
                              )}
                            >
                              <span className="inline-flex items-center gap-1">
                                {col}
                                {sort?.colIndex === i && (
                                  <span className="text-[10px]">
                                    {sort.direction === "asc" ? "\u25B2" : "\u25BC"}
                                  </span>
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-800">
                        {sortedRows.map((row, i) => (
                          <tr
                            key={i}
                            className={cn(
                              "hover:bg-surface-800/50 transition-colors",
                              i % 2 === 0 ? "bg-surface-950/50" : "",
                            )}
                          >
                            {row.map((cell, j) => (
                              <td
                                key={j}
                                className="px-4 py-3 font-mono text-xs text-surface-200 whitespace-nowrap"
                              >
                                {String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between text-xs text-surface-400">
                      <span>
                        Page {page + 1} of {totalPages}
                      </span>
                      <div className="flex gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={page === 0}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Prev
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={page >= totalPages - 1}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
