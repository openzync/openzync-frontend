"use client";

import { useState } from "react";
import {
  Plus,
  Eye,
  Trash2,
  FileJson,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { get, post, del, ApiError } from "@/lib/api-client";
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
import { TableSkeleton } from "@/components/shared/skeleton";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Schema {
  id: string;
  name: string;
  type: string;
  json_schema: Record<string, unknown>;
  prompt_template: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SchemasPage() {
  const schemasQuery = useApiQuery<{ data: Schema[] }>(() =>
    get<{ data: Schema[] }>("/v1/admin/schemas"),
  );
  const schemas = schemasQuery.data?.data ?? [];
  const loading = schemasQuery.isLoading;
  // Mutation failures share the banner with load errors but retry re-runs the
  // GET (the mutation itself is surfaced by its toast).
  const [actionError, setActionError] = useState<string | null>(null);
  const error = schemasQuery.error ?? actionError;

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"structured" | "classification">("structured");
  const [newSchema, setNewSchema] = useState("{\n  \n}");
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // View dialog
  const [viewTarget, setViewTarget] = useState<Schema | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Schema | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSchemaError(null);

    // Validate JSON schema
    try {
      JSON.parse(newSchema);
    } catch {
      setSchemaError("Invalid JSON schema");
      return;
    }

    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        name: newName.trim(),
        type: newType,
        json_schema: JSON.parse(newSchema),
      };
      if (newPrompt.trim()) payload.prompt_template = newPrompt.trim();

      await post("/v1/admin/schemas", payload);
      setShowCreate(false);
      resetCreateForm();
      toast.success("Schema created");
      schemasQuery.refetch();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to create schema";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewType("structured");
    setNewSchema("{\n  \n}");
    setNewPrompt("");
    setSchemaError(null);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await del(`/v1/admin/schemas/${deleteTarget.id}`);
      setDeleteTarget(null);
      toast.success("Schema deleted");
      schemasQuery.refetch();
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
        description="Define schemas for structured extractions and classifications"
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Create Schema
          </Button>
        }
      />

      <PageGuide title="Extraction schemas" illustration={<GuideData />}>
        <p>Define JSON Schemas that control how structured data and classifications are extracted from conversations. Each schema defines the shape of extracted data and can optionally be paired with a custom prompt template.</p>
      </PageGuide>

      {/* Error */}
      {error && <ErrorState message={error} onRetry={schemasQuery.refetch} />}

      {/* Table */}
      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-800">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Type</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-surface-400">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-surface-400">Template</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Created</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-surface-400 w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {loading ? (
                <TableSkeleton rows={4} cols={6} colWidths={["w-36", "w-24", "w-16", "w-16", "w-24", "w-16"]} />
              ) : schemas.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={FileJson}
                      title="No schemas yet"
                      description="Create your first extraction schema"
                      action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Create Schema</Button>}
                    />
                  </td>
                </tr>
              ) : (
                schemas.map((schema, idx) => (
                  <tr
                    key={schema.id}
                    className={cn("transition-colors hover:bg-surface-800/50", idx % 2 === 0 ? "bg-surface-950/50" : "")}
                  >
                    <td className="px-4 py-3">
                      <span className="text-surface-200 font-medium">{schema.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={schema.type === "classification" ? "info" : "brand"} size="sm">
                        {schema.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={schema.is_active ? "success" : "default"} size="sm">
                        {schema.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-surface-400">
                        {schema.prompt_template ? "Yes" : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-surface-400 text-xs">{formatDate(schema.created_at)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewTarget(schema)}
                          className="rounded-md text-surface-400 hover:text-white"
                          title="View schema"
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(schema)}
                          className="rounded-md text-surface-400 hover:text-error"
                          title="Delete schema"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create Dialog ──────────────────────────────────────────────────────── */}
      <Dialog
        open={showCreate}
        onOpenChange={(o) => {
          if (!o) {
            setShowCreate(false);
            resetCreateForm();
          }
        }}
        title="Create Schema"
        size="lg"
        persistent={creating}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setShowCreate(false); resetCreateForm(); }}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreate} loading={creating} disabled={!newName.trim()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Name</label>
            <input
              className="input-base"
              placeholder="e.g. invoice_data"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Type</label>
            <select
              className="input-base"
              value={newType}
              onChange={(e) => setNewType(e.target.value as "structured" | "classification")}
            >
              <option value="structured">Structured</option>
              <option value="classification">Classification</option>
            </select>
          </div>

          {/* JSON Schema */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">JSON Schema</label>
            <textarea
              className="input-base min-h-[120px] pt-2 font-mono text-xs"
              placeholder='{"type": "object", "properties": {...}}'
              value={newSchema}
              onChange={(e) => setNewSchema(e.target.value)}
            />
            {schemaError && (
              <p className="text-xs text-error mt-1 flex items-center gap-1">
                <AlertCircle size={10} />
                {schemaError}
              </p>
            )}
          </div>

          {/* Prompt Template (optional) */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Prompt Template <span className="text-surface-500 font-normal">(optional)</span>
            </label>
            <textarea
              className="input-base min-h-[80px] pt-2 font-mono text-xs"
              placeholder="Extract the following fields from the text..."
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
            />
          </div>
        </div>
      </Dialog>

      {/* ── View Dialog ────────────────────────────────────────────────────────── */}
      <Dialog
        open={!!viewTarget}
        onOpenChange={(o) => {
          if (!o) setViewTarget(null);
        }}
        title={viewTarget?.name ?? ""}
        size="lg"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setViewTarget(null)}>Close</Button>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-surface-400">Type</span>
            <Badge variant={viewTarget?.type === "classification" ? "info" : "brand"} size="sm">{viewTarget?.type}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-surface-400">Status</span>
            <Badge variant={viewTarget?.is_active ? "success" : "default"} size="sm">
              {viewTarget?.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-surface-400">Created</span>
            <span className="text-surface-200">{viewTarget ? formatDate(viewTarget.created_at) : ""}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-surface-400">ID</span>
            <code className="text-xs text-surface-400 font-mono">{viewTarget?.id.slice(0, 12)}...</code>
          </div>

          <div>
            <span className="text-surface-400 block mb-1">JSON Schema</span>
            <pre className="bg-surface-950 rounded-lg p-3 text-xs font-mono text-surface-300 overflow-x-auto max-h-40">
              {viewTarget ? JSON.stringify(viewTarget.json_schema, null, 2) : ""}
            </pre>
          </div>

          {viewTarget?.prompt_template && (
            <div>
              <span className="text-surface-400 block mb-1">Prompt Template</span>
              <pre className="bg-surface-950 rounded-lg p-3 text-xs font-mono text-surface-300 overflow-x-auto max-h-32 whitespace-pre-wrap">
                {viewTarget.prompt_template}
              </pre>
            </div>
          )}
        </div>
      </Dialog>

      {/* ── Delete Confirm Dialog ──────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Schema"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
