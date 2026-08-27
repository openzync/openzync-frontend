"use client";

import { useState } from "react";
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { get, put, ApiError } from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideSettings } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CustomInstruction {
  name: string;
  text: string;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ExtractionInstructionsPage() {
  const instructionsQuery = useApiQuery<{ data: CustomInstruction[] }>(() =>
    get<{ data: CustomInstruction[] }>("/admin/org/custom-instructions"),
  );
  // Optimistic writes replace the list locally; the hook's server data stays
  // untouched until a real refetch (retry / failed mutation recovery).
  const [override, setOverride] = useState<CustomInstruction[] | null>(null);
  const instructions = override ?? instructionsQuery.data?.data ?? [];
  const loading = instructionsQuery.isLoading;
  const [actionError, setActionError] = useState<string | null>(null);
  const error = instructionsQuery.error ?? actionError;

  // Create / Edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formText, setFormText] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<CustomInstruction | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Save (create or update) ─────────────────────────────────────────────────

  const openCreate = () => {
    setEditingIndex(null);
    setFormName("");
    setFormText("");
    setShowDialog(true);
  };

  const openEdit = (index: number) => {
    const inst = instructions[index];
    setEditingIndex(index);
    setFormName(inst.name);
    setFormText(inst.text);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formText.trim()) return;
    setSaving(true);

    // Optimistic update
    const updated = [...instructions];
    if (editingIndex !== null) {
      updated[editingIndex] = { name: formName.trim(), text: formText.trim() };
    } else {
      updated.push({ name: formName.trim(), text: formText.trim() });
    }

    try {
      await put("/admin/org/custom-instructions", { data: updated });
      setOverride(updated);
      setShowDialog(false);
      toast.success(editingIndex !== null ? "Instruction updated" : "Instruction created");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to save instructions";
      setActionError(msg);
      toast.error(msg);
      instructionsQuery.refetch();
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    const updated = instructions.filter((i) => i.name !== deleteTarget.name);

    try {
      await put("/admin/org/custom-instructions", { data: updated });
      setOverride(updated);
      setDeleteTarget(null);
      toast.success("Instruction deleted");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to delete instruction";
      setActionError(msg);
      toast.error(msg);
      instructionsQuery.refetch();
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Extraction Instructions"
        description="Custom instructions for extraction behavior"
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openCreate}>
            Add Instruction
          </Button>
        }
      />

      <PageGuide title="Extraction instructions" illustration={<GuideSettings />}>
        <p>Create custom instruction strings that guide extraction behaviour. These instructions are injected into extraction prompts to tailor how the system processes and extracts data from conversations.</p>
      </PageGuide>

      {/* Error */}
      {error && <ErrorState message={error} onRetry={instructionsQuery.refetch} />}

      {/* Table */}
      <div className="card-base overflow-hidden">
        <Table>
          <TableHeader>
            <TableHead>Name</TableHead>
            <TableHead>Instruction</TableHead>
            <TableHead align="center" className="w-20">Actions</TableHead>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={3} cols={3} colWidths={["w-32", "w-full", "w-16"]} />
            ) : instructions.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <EmptyState
                    icon={FileText}
                    title="No instructions yet"
                    description="Add custom instructions to guide extraction behavior"
                    action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openCreate}>Add Instruction</Button>}
                  />
                </td>
              </tr>
            ) : (
              instructions.map((inst, idx) => (
                <TableRow key={inst.name}>
                  <TableCell>
                    <span className="text-surface-200 font-medium">{inst.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-surface-400 text-xs block max-w-md truncate">
                      {inst.text.length > 80 ? inst.text.slice(0, 80) + "..." : inst.text}
                    </span>
                  </TableCell>
                  <TableCell align="center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(idx)}
                        className="rounded-md text-surface-400 hover:text-white"
                        title="Edit instruction"
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(inst)}
                        className="rounded-md text-surface-400 hover:text-error"
                        title="Delete instruction"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Create / Edit Dialog ───────────────────────────────────────────────── */}
      <Dialog
        open={showDialog}
        onOpenChange={(o) => {
          if (!o) setShowDialog(false);
        }}
        title={editingIndex !== null ? "Edit Instruction" : "Add Instruction"}
        size="lg"
        persistent={saving}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={!formName.trim() || !formText.trim()}
            >
              {editingIndex !== null ? "Save Changes" : "Add"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="instruction-name">
            <input
              id="instruction-name"
              className="input-base"
              placeholder="e.g. financial_data"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Instruction Text" htmlFor="instruction-text">
            <textarea
              id="instruction-text"
              className="input-base min-h-[120px] pt-2 text-sm"
              placeholder="Describe what to extract and how..."
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
            />
          </Field>
        </div>
      </Dialog>

      {/* ── Delete Confirm Dialog ──────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Instruction"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
