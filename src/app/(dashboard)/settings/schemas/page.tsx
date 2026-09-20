"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, FileJson, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  deleteSchema,
  listSchemas,
  type ExtractionSchema,
} from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideData } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { SortableHead } from "@/components/shared/sortable-head";
import { useSortQuery } from "@/hooks/use-sort-query";
import { fieldCountOf } from "@/components/schemas/schema-builder";
import { labelCountOf } from "@/components/schemas/label-set-builder";

// ─── View dialog (read-only) ───────────────────────────────────────────────────

function ViewDialog({ schema, onClose }: { schema: ExtractionSchema; onClose: () => void }) {
  const count =
    schema.type === "classification"
      ? labelCountOf(schema.json_schema)
      : fieldCountOf(schema.json_schema);
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={schema.name}
      size="lg"
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
      }
    >
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-xs text-surface-500 block">Type</span>
          <span className="text-sm text-surface-200 capitalize">{schema.type}</span>
        </div>
        <div>
          <span className="text-xs text-surface-500 block">Status</span>
          <Badge variant={schema.is_active ? "success" : "default"} size="sm">
            {schema.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <div>
          <span className="text-xs text-surface-500 block">Updated</span>
          <span className="text-sm text-surface-200">{formatDate(schema.updated_at)}</span>
        </div>
        <div>
          <span className="text-xs text-surface-500 block">
            {schema.type === "classification" ? "Labels" : "Fields"}
          </span>
          <span className="text-sm tabular-nums text-surface-200">{count}</span>
        </div>
      </div>
      <div className="mb-4">
        <span className="text-xs font-medium text-surface-400 block mb-1.5">JSON Schema</span>
        <div className="bg-surface-950 border border-surface-700 font-mono text-xs p-4 rounded overflow-x-auto max-h-64 overflow-y-auto">
          <pre className="text-surface-200 whitespace-pre">{JSON.stringify(schema.json_schema, null, 2)}</pre>
        </div>
      </div>
      {schema.prompt_template && (
        <div>
          <span className="text-xs font-medium text-surface-400 block mb-1.5">Prompt Template</span>
          <div className="bg-surface-950 border border-surface-700 font-mono text-xs p-4 rounded overflow-x-auto max-h-40 overflow-y-auto">
            <pre className="text-surface-200 whitespace-pre-wrap">{schema.prompt_template}</pre>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

// Backend whitelist for GET /v1/admin/schemas (default created_at/desc).
// `updated_at` is not whitelisted server-side, so Updated stays a plain
// header — only Name sorts.
const SCHEMA_SORT_FIELDS = ["name", "created_at"] as const;

export default function SchemasPage() {
  // Sort state lives in the URL via useSortQuery — needs a Suspense
  // boundary during prerender.
  return (
    <Suspense fallback={null}>
      <SchemasInner />
    </Suspense>
  );
}

function SchemasInner() {
  const router = useRouter();
  // Server-side sort, URL-synced. Single-page list — the refreshKey
  // refetches in the new order.
  const { sortBy, sortDir, onSort } = useSortQuery({
    defaultSort: { sortBy: "created_at", sortDir: "desc" },
    allowedFields: SCHEMA_SORT_FIELDS,
    timestampFields: ["created_at"],
  });
  const schemasQuery = useApiQuery(() => listSchemas({ sort_by: sortBy, sort_dir: sortDir }), {
    refreshKey: `${sortBy}:${sortDir}`,
  });
  const loading = schemasQuery.isLoading;
  // Mutation failures share the banner with load errors but retry re-runs the
  // GET (the mutation itself is surfaced by its toast).
  const [actionError, setActionError] = useState<string | null>(null);
  const error = schemasQuery.error ?? actionError;

  // Delete dialog + locally-removed rows (filter instead of refetch).
  const [deleteTarget, setDeleteTarget] = useState<ExtractionSchema | null>(null);
  const [viewTarget, setViewTarget] = useState<ExtractionSchema | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const schemas: ExtractionSchema[] = (schemasQuery.data?.data ?? []).filter(
    (schema) => schema.is_active && !removedIds.includes(schema.id),
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSchema(deleteTarget.id);
      setRemovedIds((prev) => [...prev, deleteTarget.id]);
      setDeleteTarget(null);
      toast.success(`"${deleteTarget.name}" deleted`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to delete schema";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Extraction Schemas"
        description="Structured schemas for extraction — build fields visually, preview live JSON Schema"
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => router.push("/settings/schemas/new")}
          >
            New Schema
          </Button>
        }
      />

      <PageGuide title="Extraction schemas" illustration={<GuideData />}>
        <p>Define JSON Schemas that control how structured data is extracted from conversations. Open a schema to edit its fields in the visual builder, or create a new one from a starter template.</p>
      </PageGuide>

      {/* Error */}
      {error && <ErrorState message={error} onRetry={schemasQuery.refetch} />}

      {/* Table */}
      <div className="card-base overflow-hidden">
        <Table zebra={false} storageKey="schemas">
          <TableHeader>
            <SortableHead field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort}>Name</SortableHead>
            <TableHead>Type</TableHead>
            <TableHead align="center">Fields / Labels</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={4} cols={5} colWidths={["w-36", "w-20", "w-16", "w-28", "w-16"]} />
            ) : schemas.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon={FileJson}
                    title="No schemas yet"
                    description="Create your first structured extraction schema"
                    action={
                      <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => router.push("/settings/schemas/new")}>
                        New Schema
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : (
              schemas.map((schema) => (
                <TableRow key={schema.id}>
                  <TableCell>
                    <span className="text-surface-100 font-medium">{schema.name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={schema.type === "classification" ? "info" : "brand"} size="sm">
                      {schema.type}
                    </Badge>
                  </TableCell>
                  <TableCell align="center">
                    <span className="text-xs tabular-nums text-surface-300">
                      {schema.type === "classification"
                        ? labelCountOf(schema.json_schema)
                        : fieldCountOf(schema.json_schema)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-surface-400">{formatDate(schema.updated_at)}</span>
                  </TableCell>
                  <TableCell align="right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewTarget(schema)}
                            className="p-1.5"
                            aria-label="View schema"
                          >
                            <Eye size={15} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View schema</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/settings/schemas/${schema.id}`)}
                            className="p-1.5"
                            aria-label="Edit schema"
                          >
                            <Pencil size={15} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit schema</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(schema)}
                            className="p-1.5 text-surface-400 hover:text-error"
                            aria-label="Delete schema"
                          >
                            <Trash2 size={15} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete schema</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── View Dialog (read-only) ─────────────────────────────────────────────── */}
      {viewTarget && <ViewDialog schema={viewTarget} onClose={() => setViewTarget(null)} />}

      {/* ── Delete Confirm Dialog ────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Schema"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? It will stop being used for new extractions.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
