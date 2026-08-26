"use client";


import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  Calendar,
  Hash,
  User as UserIcon,
  Mail,
  Shield,
  MessageSquare,
  Database,
  Layers,
  FileText,
  Sparkles,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { get, post, put, patch as apiPatch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogCloseButton } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/shared/error-state";
import { useUser, ALL_PERMISSIONS } from "@/contexts/user-context";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UserWithStats {
  id: string;
  organization_id: string;
  external_id: string;
  name: string | null;
  email: string | null;
  role: string;
  permissions: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  message_count: number;
  fact_count: number;
  session_count: number;
}

interface UserSummaryResponse {
  user_id: string;
  summary: string | null;
  updated_at: string | null;
}

interface CustomInstruction {
  name: string;
  text: string;
}

interface InstructionsResponse {
  data: CustomInstruction[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 120_000; // 2 minutes

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}\u2026${id.slice(-4)}`;
}

// ─── Copy Button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="text-surface-500 hover:text-surface-300 transition-colors shrink-0"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  );
}

// ─── Metadata Row ──────────────────────────────────────────────────────────────

function MetadataRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-surface-500 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-surface-500 mb-0.5">{label}</div>
        <div className="text-sm text-surface-200">{children}</div>
      </div>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-800/50 border border-surface-700/50 px-4 py-3">
      <div className="text-surface-500 shrink-0">{icon}</div>
      <div>
        <div className="text-xs text-surface-500">{label}</div>
        <div className="text-lg font-semibold text-white">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

// ─── Instruction Create Dialog ─────────────────────────────────────────────────

interface InstructionCreateDialogProps {
  onClose: () => void;
  onCreate: (name: string, text: string) => Promise<void>;
}

function InstructionCreateDialog({ onClose, onCreate }: InstructionCreateDialogProps) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    const trimmedName = name.trim();
    const trimmedText = text.trim();
    if (!trimmedName) { setError("Instruction name is required"); return; }
    if (!trimmedText) { setError("Instruction text is required"); return; }

    setSubmitting(true);
    setError(null);
    try {
      await onCreate(trimmedName, trimmedText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create instruction");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Add Summary Instruction"
      footer={
        <>
          <DialogCloseButton size="sm" disabled={submitting} />
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleSubmit()}
            disabled={submitting}
            className="min-w-[140px] justify-center"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Spinner /> Adding...
              </span>
            ) : (
              "Add Instruction"
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">
            Name <span className="text-error">*</span>
          </label>
          <input
            className="input-base"
            placeholder="e.g. Tone & Voice"
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
            autoFocus
            disabled={submitting}
          />
          <p className="text-xs text-surface-500 mt-1">A label for this instruction.</p>
        </div>

        {/* Text */}
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">
            Instruction Text <span className="text-error">*</span>
          </label>
          <textarea
            className="input-base min-h-[120px] resize-y"
            placeholder="e.g. Summarize the user's tone, communication style, and preferred vocabulary."
            value={text}
            onChange={(e) => { setText(e.target.value); if (error) setError(null); }}
            disabled={submitting}
          />
          <p className="text-xs text-surface-500 mt-1">
            The instruction given to the LLM when generating the summary.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </form>
    </Dialog>
  );
}

// ─── Instruction Edit Dialog ───────────────────────────────────────────────────

interface InstructionEditDialogProps {
  initial: CustomInstruction;
  onClose: () => void;
  onSave: (name: string, text: string) => Promise<void>;
}

function InstructionEditDialog({ initial, onClose, onSave }: InstructionEditDialogProps) {
  const [name, setName] = useState(initial.name);
  const [text, setText] = useState(initial.text);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    const trimmedName = name.trim();
    const trimmedText = text.trim();
    if (!trimmedName) { setError("Instruction name is required"); return; }
    if (!trimmedText) { setError("Instruction text is required"); return; }

    setSubmitting(true);
    setError(null);
    try {
      await onSave(trimmedName, trimmedText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update instruction");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Edit Summary Instruction"
      footer={
        <>
          <DialogCloseButton size="sm" disabled={submitting} />
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleSubmit()}
            disabled={submitting}
            className="min-w-[120px] justify-center"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Spinner /> Saving...
              </span>
            ) : (
              "Save Changes"
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">
            Name <span className="text-error">*</span>
          </label>
          <input
            className="input-base"
            placeholder="e.g. Tone & Voice"
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
            autoFocus
            disabled={submitting}
          />
        </div>

        {/* Text */}
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">
            Instruction Text <span className="text-error">*</span>
          </label>
          <textarea
            className="input-base min-h-[120px] resize-y"
            value={text}
            onChange={(e) => { setText(e.target.value); if (error) setError(null); }}
            disabled={submitting}
          />
        </div>

        {error && (
          <div className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </form>
    </Dialog>
  );
}

// ─── Instruction Delete Dialog ─────────────────────────────────────────────────

interface InstructionDeleteDialogProps {
  instructionName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function InstructionDeleteDialog({ instructionName, onClose, onConfirm }: InstructionDeleteDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Delete Instruction"
      description="This action cannot be undone."
      size="sm"
      footer={
        <>
          <DialogCloseButton size="sm" disabled={submitting} />
          <Button
            variant="danger"
            size="sm"
            onClick={async () => { setSubmitting(true); try { await onConfirm(); } finally { setSubmitting(false); } }}
            disabled={submitting}
            className="min-w-[100px] justify-center"
          >
            {submitting ? (
              <span className="flex items-center gap-2"><Spinner /> Deleting...</span>
            ) : (
              <span className="flex items-center gap-2"><Trash2 size={14} /> Delete</span>
            )}
          </Button>
        </>
      }
    >
      <p className="text-sm text-surface-300 mb-2">
        Are you sure you want to delete instruction
      </p>
      <p className="text-sm font-medium text-white mb-5">
        &ldquo;{instructionName}&rdquo;
      </p>
      <p className="text-xs text-surface-500 mb-5">
        This instruction will no longer be used when generating user summaries.
      </p>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const { can, user: me, loading: roleLoading } = useUser();
  const canWriteMembers = can("members:write");

  // ── Data state ────────────────────────────────────────────────────────────
  const [user, setUser] = useState<UserWithStats | null>(null);
  const [summary, setSummary] = useState<UserSummaryResponse | null>(null);
  const [instructions, setInstructions] = useState<CustomInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState<string | null>(null);

  // ── Permissions-editor state (PATCH replaces the whole set) ──────────────
  const [editPermissions, setEditPermissions] = useState<string[] | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // ── Summary generation state ──────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const initialUpdatedAtRef = useRef<string | null>(null);

  // ── Instruction dialog state ──────────────────────────────────────────────
  const [showCreateInstruction, setShowCreateInstruction] = useState(false);
  const [editInstructionTarget, setEditInstructionTarget] = useState<CustomInstruction | null>(null);
  const [deleteInstructionTarget, setDeleteInstructionTarget] = useState<CustomInstruction | null>(null);

  // ── Cleanup polling on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Fetch all data on mount ───────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    // All three fire in parallel; summary/instructions treat any failure
    // (typically 404 "not yet generated") as absent data.
    const userPromise = get<UserWithStats>(`/v1/users/${userId}`);
    const summaryPromise = get<UserSummaryResponse>(`/v1/users/${userId}/summary`).catch(() => null);
    const instructionsPromise = get<InstructionsResponse>(`/v1/users/${userId}/summary-instructions`).catch(() => null);

    try {
      const userData = await userPromise;
      setUser(userData);
    } catch (err) {
      if (err instanceof ApiError && err.isNotFound) {
        toast.error("User not found");
        setLoading(false);
        router.replace("/users");
        return;
      }
      if (err instanceof ApiError && err.isForbidden) {
        // Surface the backend's RFC 7807 detail (e.g. which permission is missing).
        setForbidden(err.message);
        setLoading(false);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to load user data");
      setLoading(false);
      return;
    }

    const [summaryData, instructionsData] = await Promise.all([summaryPromise, instructionsPromise]);
    // Silently swallow 404 for summary (not yet generated)
    if (summaryData) setSummary(summaryData);
    if (instructionsData) setInstructions(instructionsData.data ?? []);
    setLoading(false);
  }, [userId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Permissions management ────────────────────────────────────────────────

  /**
   * PATCH /v1/users/{id} with `{"permissions": [...]}` replaces the set — the
   * new backend no longer grants org access via a single admin role toggle.
   */
  const handleSavePermissions = async () => {
    if (!user || editPermissions === null) return;
    setSavingPermissions(true);
    try {
      const updated = await apiPatch<{ permissions?: string[] }>(
        `/v1/users/${user.id}`,
        { permissions: editPermissions },
      );
      setUser((prev) =>
        prev
          ? { ...prev, permissions: updated.permissions ?? editPermissions }
          : prev,
      );
      setEditPermissions(null);
      toast.success("Permissions updated");
    } catch (err) {
      if (err instanceof ApiError && err.isForbidden) {
        toast.error("This action requires the 'members:write' permission.");
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to update permissions");
      }
    } finally {
      setSavingPermissions(false);
    }
  };

  // ── Generate summary ──────────────────────────────────────────────────────

  const handleGenerateSummary = async () => {
    setGenerating(true);
    try {
      await post(`/v1/users/${userId}/summary`);

      toast.success("Summary generation started. Check back in a few moments.");
      // Start polling
      initialUpdatedAtRef.current = summary?.updated_at ?? null;
      pollStartRef.current = Date.now();
      setPolling(true);

      pollRef.current = setInterval(async () => {
        try {
          const pollData = await get<UserSummaryResponse>(`/v1/users/${userId}/summary`);
          if (pollData.updated_at !== initialUpdatedAtRef.current) {
            // Summary has been regenerated — stop polling
            setSummary(pollData);
            setPolling(false);
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } catch (err) {
          console.warn(
            `[users/[id]] summary poll failed for user ${userId}; will retry next interval`,
            err,
          );
        }

        // Timeout check
        if (Date.now() - pollStartRef.current >= POLL_TIMEOUT_MS) {
          setPolling(false);
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          toast.error("Summary generation is taking longer than expected. Refresh the page to check.");
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      if (err instanceof ApiError && err.isRateLimited) {
        toast.error("Please wait 5 minutes between summary generations.");
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to generate summary");
      }
    } finally {
      setGenerating(false);
    }
  };

  // ── Summary instructions CRUD ─────────────────────────────────────────────

  const syncInstructions = async (updatedInstructions: CustomInstruction[]) => {
    const result = await put<InstructionsResponse>(
      `/v1/users/${userId}/summary-instructions`,
      { instructions: updatedInstructions },
    );
    setInstructions(result.data ?? []);
  };

  const handleCreateInstruction = async (name: string, text: string) => {
    const updated = [...instructions, { name, text }];
    await syncInstructions(updated);
    setShowCreateInstruction(false);
    toast.success(`Instruction "${name}" added successfully`);
  };

  const handleEditInstruction = async (name: string, text: string) => {
    if (!editInstructionTarget) return;
    const updated = instructions.map((inst) =>
      inst.name === editInstructionTarget.name ? { name, text } : inst,
    );
    await syncInstructions(updated);
    setEditInstructionTarget(null);
    toast.success(`Instruction "${name}" updated successfully`);
  };

  const handleDeleteInstruction = async () => {
    if (!deleteInstructionTarget) return;
    const updated = instructions.filter(
      (inst) => inst.name !== deleteInstructionTarget.name,
    );
    await syncInstructions(updated);
    setDeleteInstructionTarget(null);
    toast.success(`Instruction "${deleteInstructionTarget.name}" deleted`);
  };

  // ── Forbidden (member JWT on admin-gated user) ───────────────────────────

  if (forbidden) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/users")}
          className="-ml-2"
        >
          <ArrowLeft size={14} />
          Back to Users
        </Button>
        <ErrorState message={forbidden} />
      </div>
    );
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
        <div className="space-y-6">
          {/* Back button skeleton */}
          <Button variant="ghost" size="sm" disabled className="-ml-2 opacity-50">
            <ArrowLeft size={14} />
            Back to Users
          </Button>

          {/* Profile skeleton */}
          <div className="card-base p-6">
            <div className="space-y-4">
              <div className="h-6 w-48 rounded bg-surface-800 animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-16 rounded bg-surface-800 animate-pulse" />
                    <div className="h-4 w-32 rounded bg-surface-800 animate-pulse" />
                  </div>
                ))}
              </div>
              {/* Stats skeleton */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-surface-800">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-lg bg-surface-800 animate-pulse" />
                ))}
              </div>
            </div>
          </div>

          {/* Summary skeleton */}
          <div className="card-base p-6">
            <div className="h-6 w-36 rounded bg-surface-800 animate-pulse mb-4" />
            <div className="h-20 rounded bg-surface-800 animate-pulse" />
          </div>

          {/* Instructions skeleton */}
          <div className="card-base p-6">
            <div className="h-6 w-48 rounded bg-surface-800 animate-pulse mb-4" />
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-surface-800 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ═══ Back button ═══ */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/users")}
        className="-ml-2"
      >
        <ArrowLeft size={14} />
        Back to Users
      </Button>

      {/* ═══ Section A: Profile header card ═══ */}
      <div className="card-base p-6">
        {user && (
          <>
            {/* Title row */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  {user.external_id}
                </h1>
                <p className="text-xs text-surface-500 mt-0.5">
                  {user.name ? `${user.name} \u2022 ` : ""}
                  User overview
                </p>
              </div>
              {/* note: no org-level sessions index exists yet — no sessions affordance here */}
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* User ID */}
              <MetadataRow
                icon={<Hash size={16} />}
                label="User ID"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-surface-800 rounded px-2 py-0.5">
                    {shortId(user.id)}
                  </span>
                  <CopyButton text={user.id} />
                </div>
              </MetadataRow>

              {/* External ID */}
              <MetadataRow
                icon={<UserIcon size={16} />}
                label="External ID"
              >
                <span className="font-mono text-xs">{user.external_id}</span>
              </MetadataRow>

              {/* Name */}
              <MetadataRow
                icon={<UserIcon size={16} />}
                label="Name"
              >
                {user.name || <span className="text-surface-500 italic">—</span>}
              </MetadataRow>

              {/* Email */}
              <MetadataRow
                icon={<Mail size={16} />}
                label="Email"
              >
                {user.email ? (
                  <span className="font-mono text-xs">{user.email}</span>
                ) : (
                  <span className="text-surface-500 italic">—</span>
                )}
              </MetadataRow>

              {/* Role */}
              <MetadataRow
                icon={<Shield size={16} />}
                label="Role"
              >
                <Badge variant={user.role === "admin" ? "brand" : "default"} size="sm">
                  {user.role === "admin" ? "Admin" : "Member"}
                </Badge>
                {me?.id === user.id && (
                  <span className="ml-2 text-xs text-surface-500">(you)</span>
                )}
              </MetadataRow>

              {/* Permissions (read-only) — admin role = wildcard; empty list ≠ admin */}
              <MetadataRow
                icon={<Shield size={16} />}
                label="Permissions"
              >
                {user.role === "admin" ? (
                  <Badge variant="brand" size="sm">Full access (admin)</Badge>
                ) : user.permissions.length === 0 ? (
                  <span className="text-surface-500 italic">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {user.permissions.map((permission) => (
                      <Badge key={permission} variant="info" size="sm">{permission}</Badge>
                    ))}
                  </div>
                )}
              </MetadataRow>

              {/* Created */}
              <MetadataRow
                icon={<Calendar size={16} />}
                label="Created"
              >
                <span>{formatDateTime(user.created_at)}</span>
              </MetadataRow>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-surface-800">
              <StatCard
                icon={<MessageSquare size={18} />}
                label="Messages"
                value={user.message_count}
              />
              <StatCard
                icon={<Database size={18} />}
                label="Facts"
                value={user.fact_count}
              />
              <StatCard
                icon={<Layers size={18} />}
                label="Sessions"
                value={user.session_count}
              />
            </div>
          </>
        )}
      </div>

      {/* ═══ Permissions editor (members:write only — admins are wildcard, self excluded) ═══ */}
      {user && canWriteMembers && me?.id !== user.id && user.role !== "admin" && (
        <div className="card-base p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Shield size={18} className="text-surface-400" />
              Edit Permissions
            </h2>
            <p className="text-xs text-surface-500 mt-0.5">
              Saving replaces the member&rsquo;s full permission set. Toggle each
              permission to grant or revoke it.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {ALL_PERMISSIONS.map((permission) => {
              const active = (editPermissions ?? user.permissions).includes(
                permission,
              );
              return (
                <button
                  key={permission}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setEditPermissions((prev) => {
                      const current = prev ?? user.permissions;
                      return active
                        ? current.filter((p) => p !== permission)
                        : [...current, permission];
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-brand-500/40 bg-brand-500/10 text-brand-300"
                      : "border-surface-700 bg-surface-900 text-surface-400 hover:text-surface-200",
                  )}
                >
                  {permission}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-surface-800">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSavePermissions}
              loading={savingPermissions}
              disabled={editPermissions === null}
            >
              Save Permissions
            </Button>
            {editPermissions !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditPermissions(null)}
                disabled={savingPermissions}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ═══ Section B: Summary card ═══ */}
      <div className="card-base p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText size={18} className="text-surface-400" />
              User Summary
            </h2>
            <p className="text-xs text-surface-500 mt-0.5">
              {summary?.updated_at
                ? `Last generated: ${formatDateTime(summary.updated_at)}`
                : "Not yet generated"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Polling indicator */}
            {polling && (
              <span className="text-xs text-brand-400 flex items-center gap-1.5 animate-pulse">
                <RefreshCw size={12} className="animate-spin" />
                Refreshing...
              </span>
            )}
            {/* Generate button */}
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateSummary}
              disabled={generating || polling}
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Generating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles size={14} />
                  Generate Summary
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Summary content */}
        {summary?.summary ? (
          <div className="bg-surface-900/50 border border-surface-700/50 rounded-lg p-4 text-sm text-surface-200 leading-relaxed">
            <p className="whitespace-pre-wrap">{summary.summary}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-surface-500">
            <FileText size={32} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No summary generated yet</p>
            <p className="text-xs mt-1 text-center max-w-md">
              Click &ldquo;Generate Summary&rdquo; to create a profile of this user based on their conversation history.
            </p>
          </div>
        )}
      </div>

      {/* ═══ Section C: Summary Instructions ═══ */}
      <div className="card-base p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BookOpen size={18} className="text-surface-400" />
              Summary Instructions
            </h2>
            <p className="text-xs text-surface-500 mt-0.5">
              Custom instructions used when generating the user summary
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateInstruction(true)}
          >
            <Plus size={14} />
            Add Instruction
          </Button>
        </div>

        {instructions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-surface-500">
            <BookOpen size={32} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No summary instructions</p>
            <p className="text-xs mt-1">
              Add custom instructions to guide how the user summary is generated.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {instructions.map((inst, idx) => (
              <div
                key={`${inst.name}-${idx}`}
                className="flex items-start gap-4 rounded-lg border border-surface-700/50 bg-surface-900/30 p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">{inst.name}</span>
                  </div>
                  <p className="text-xs text-surface-400 leading-relaxed whitespace-pre-wrap">
                    {inst.text}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditInstructionTarget(inst)}
                    className="rounded-md text-surface-400 hover:text-white"
                    title="Edit instruction"
                  >
                    <Edit size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteInstructionTarget(inst)}
                    className="rounded-md text-surface-400 hover:text-error"
                    title="Delete instruction"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Dialogs ═══ */}

      {/* Create Instruction Dialog */}
      {showCreateInstruction && (
        <InstructionCreateDialog
          onClose={() => setShowCreateInstruction(false)}
          onCreate={handleCreateInstruction}
        />
      )}

      {/* Edit Instruction Dialog */}
      {editInstructionTarget && (
        <InstructionEditDialog
          initial={editInstructionTarget}
          onClose={() => setEditInstructionTarget(null)}
          onSave={handleEditInstruction}
        />
      )}

      {/* Delete Instruction Dialog */}
      {deleteInstructionTarget && (
        <InstructionDeleteDialog
          instructionName={deleteInstructionTarget.name}
          onClose={() => setDeleteInstructionTarget(null)}
          onConfirm={handleDeleteInstruction}
        />
      )}
    </div>
  );
}
