"use client";

import { useState } from "react";
import { Tags, Eye } from "lucide-react";
import { get } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";

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

// ─── View Dialog ───────────────────────────────────────────────────────────────

function ViewDialog({ schema, onClose }: { schema: Schema; onClose: () => void }) {
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
          <span className="text-xs text-surface-500 block">Created</span>
          <span className="text-sm text-surface-200">{formatDate(schema.created_at)}</span>
        </div>
        <div>
          <span className="text-xs text-surface-500 block">Status</span>
          <Badge variant={schema.is_active ? "success" : "default"} size="sm">{schema.is_active ? "Active" : "Inactive"}</Badge>
        </div>
        <div>
          <span className="text-xs text-surface-500 block">ID</span>
          <span className="font-mono text-xs text-surface-400">{schema.id}</span>
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ClassificationsPage() {
  const schemasQuery = useApiQuery<{ data: Schema[] }>(() =>
    get<{ data: Schema[] }>("/v1/admin/schemas?type=classification"),
  );
  const schemas = schemasQuery.data?.data ?? [];
  const loading = schemasQuery.isLoading;
  const error = schemasQuery.error;
  const [viewTarget, setViewTarget] = useState<Schema | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="Classifications" description="Dialog classification schemas and results" />

      {error && <ErrorState message={error} onRetry={schemasQuery.refetch} />}

      <div className="card-base overflow-hidden">
        <Table>
          <TableHeader>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Created</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={4} cols={5} colWidths={["w-36", "w-16", "w-12", "w-24", "w-12"]} />
            ) : schemas.length === 0 ? (
              <tr><td colSpan={5}><EmptyState icon={Tags} title="No classification schemas found" description="Configure classification schemas to appear here" /></td></tr>
            ) : (
              schemas.map((schema) => (
                <TableRow key={schema.id}>
                  <TableCell><span className="font-medium text-white">{schema.name}</span></TableCell>
                  <TableCell><Badge variant={schema.is_active ? "success" : "default"} size="sm">{schema.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell><span className="text-xs text-surface-400">{schema.prompt_template ? "Yes" : "—"}</span></TableCell>
                  <TableCell className="text-surface-400 text-xs">{formatDate(schema.created_at)}</TableCell>
                  <TableCell align="right">
                    <Button variant="ghost" size="sm" onClick={() => setViewTarget(schema)} className="rounded-md text-surface-400 hover:text-white" title="View schema"><Eye size={14} /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {viewTarget && <ViewDialog schema={viewTarget} onClose={() => setViewTarget(null)} />}
    </div>
  );
}
