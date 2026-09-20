"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileJson, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { fieldCountOf } from "@/components/schemas/schema-builder";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SchemasPage() {
  const router = useRouter();
  const schemasQuery = useApiQuery(() => listSchemas());
  const loading = schemasQuery.isLoading;
  // Mutation failures share the banner with load errors but retry re-runs the
  // GET (the mutation itself is surfaced by its toast).
  const [actionError, setActionError] = useState<string | null>(null);
  const error = schemasQuery.error ?? actionError;

  // Delete dialog + locally-removed rows (filter instead of refetch).
  const [deleteTarget, setDeleteTarget] = useState<ExtractionSchema | null>(null);
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
        <Table zebra={false}>
          <TableHeader>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead align="center">Fields</TableHead>
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
                    <button
                      type="button"
                      onClick={() => router.push(`/settings/schemas/${schema.id}`)}
                      className="cursor-pointer font-medium text-surface-200 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-accent-300"
                    >
                      {schema.name}
                    </button>{" "}
                    <Badge variant={schema.type === "classification" ? "info" : "brand"} size="sm">
                      {schema.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={schema.is_active ? "success" : "default"} size="sm">
                      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full inline-block ${schema.is_active ? "bg-success" : "bg-surface-500"}`} />
                      {schema.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell align="center">
                    <span className="text-xs tabular-nums text-surface-300">
                      {fieldCountOf(schema.json_schema)}
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
                            onClick={() => router.push(`/settings/schemas/${schema.id}`)}
                            className="p-1.5"
                            aria-label={`Edit ${schema.name}`}
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
                            className="text-surface-400 hover:text-error"
                            aria-label={`Delete ${schema.name}`}
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
