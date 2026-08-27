"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  Plus, Edit, Trash2, RefreshCw, UsersIcon, AlertCircle, Eye, ShieldCheck, ShieldOff, UserPlus, Ban,
} from "lucide-react";
import { get, post, patch as apiPatch, del as apiDel, ApiError, apiErrorMessage, inviteUser, revokeInvite } from "@/lib/api-client";
import { formatDate, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { PageGuide, GuideSecurity } from "@/components/guides";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";
import { CopyButton } from "@/components/shared/copy-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { useUser } from "@/contexts/user-context";

// ─── Types ─────────────────────────────────────────────────────────────────────

type UserRole = "admin" | "member";

interface UserItem {
  id: string;
  external_id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  /** True while the user is a pending invite — no account yet. Backend adds this field in the invite work; typed now. */
  is_pending_invite: boolean;
  created_at: string;
}

interface UsersResponse {
  data: UserItem[];
  next_cursor: string | null;
  has_more: boolean;
}

interface UserFormData {
  external_id: string;
  name: string;
  email: string;
}

// ─── User Form Dialog (Create / Edit) ──────────────────────────────────────────

function UserFormDialog({
  mode, initial, editId, onClose, onSubmit,
}: {
  mode: "create" | "edit";
  initial: UserFormData;
  editId?: string;
  onClose: () => void;
  onSubmit: (data: UserFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<UserFormData>(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof UserFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async () => {
    if (!form.external_id.trim()) { setError("External ID is required"); return; }
    setSubmitting(true);
    try { await onSubmit(form); }
    catch { /* handled by caller */ }
    finally { setSubmitting(false); }
  };

  const title = mode === "create" ? "Create User" : "Edit User";

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      title={title}
      persistent={submitting}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" size="sm" type="button" onClick={() => void handleSubmit()} loading={submitting}>
            {mode === "create" ? "Create User" : "Save Changes"}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">External ID <span className="text-error">*</span></label>
          <input className="input-base" placeholder="e.g. user-abc-123" value={form.external_id}
            onChange={(e) => handleChange("external_id", e.target.value)} disabled={mode === "edit"} />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Name</label>
          <input className="input-base" placeholder="e.g. John Doe" value={form.name}
            onChange={(e) => handleChange("name", e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Email</label>
          <input className="input-base" type="email" placeholder="e.g. john@acme.com" value={form.email}
            onChange={(e) => handleChange("email", e.target.value)} />
        </div>
        {error && (
          <div className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error flex items-center gap-2">
            <AlertCircle size={14} />{error}
          </div>
        )}
      </form>
    </Dialog>
  );
}

// ─── Invite Member Dialog ─────────────────────────────────────────────────────

function InviteMemberDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { email: string; name: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !name.trim()) {
      setError("Email and name are required");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ email: email.trim(), name: name.trim() });
    } catch (err) {
      // Server detail (e.g. 409 "invite already pending") stays in the dialog.
      setError(
        err instanceof ApiError ? err.message : "Failed to send invitation",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      title="Invite Member"
      description="They’ll receive an email with a link to set their password."
      persistent={submitting}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" size="sm" type="button" onClick={() => void handleSubmit()} loading={submitting}>
            Send Invite
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Email <span className="text-error">*</span></label>
          <input className="input-base" type="email" placeholder="e.g. jane@acme.com" value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }} />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-1">Name <span className="text-error">*</span></label>
          <input className="input-base" placeholder="e.g. Jane Doe" value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(null); }} />
        </div>
        {error && (
          <div className="rounded-md bg-error/10 border border-error/30 px-3 py-2 text-sm text-error flex items-center gap-2">
            <AlertCircle size={14} />{error}
          </div>
        )}
      </form>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { can, user: me, loading: roleLoading } = useUser();
  const canRead = can("members:read");
  const canWrite = can("members:write");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editTarget, setEditTarget] = useState<UserItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<UserItem | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ user: UserItem; to: UserRole } | null>(null);
  const [changingRole, setChangingRole] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async (cursor?: string): Promise<UsersResponse> => {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);
    return get<UsersResponse>(`/v1/users?${params}`);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchUsers();
      setUsers(data.data);
      setNextCursor(data.next_cursor);
      setHasMore(data.has_more);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to load users"));
    } finally { setLoading(false); }
  }, [fetchUsers]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchUsers(nextCursor);
      setUsers((prev) => [...prev, ...data.data]);
      setNextCursor(data.next_cursor);
      setHasMore(data.has_more);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to load more users"));
    } finally { setLoadingMore(false); }
  }, [nextCursor, loadingMore, fetchUsers]);

  useEffect(() => { if (canRead) loadUsers(); }, [loadUsers, canRead]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const handleCreate = async (data: UserFormData) => {
    const payload: Record<string, string> = { external_id: data.external_id.trim() };
    if (data.name.trim()) payload.name = data.name.trim();
    if (data.email.trim()) payload.email = data.email.trim();
    await post("/v1/users", payload);
    setShowCreate(false);
    toast.success(`User "${data.external_id}" created successfully`);
    await loadUsers();
  };

  const handleUpdate = async (data: UserFormData) => {
    if (!editTarget) return;
    const payload: Record<string, string> = {};
    if (data.name.trim()) payload.name = data.name.trim();
    if (data.email.trim()) payload.email = data.email.trim();
    await apiPatch(`/v1/users/${editTarget.id}`, payload);
    setEditTarget(null);
    toast.success(`User "${data.external_id}" updated successfully`);
    await loadUsers();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDel(`/v1/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      toast.success(`User "${deleteTarget.external_id}" deleted`);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete user");
    } finally { setDeleting(false); }
  };

  const handleInvite = async (data: { email: string; name: string }) => {
    await inviteUser(data.email, data.name);
    setShowInvite(false);
    toast.success(`Invitation sent to ${data.email}`);
    await loadUsers();
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeInvite(revokeTarget.id);
      setRevokeTarget(null);
      toast.success(`Invitation revoked for ${revokeTarget.name || revokeTarget.email || revokeTarget.external_id}`);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to revoke invitation");
    } finally { setRevoking(false); }
  };

  const handleRoleChange = async () => {
    if (!roleChangeTarget) return;
    const { user: target, to } = roleChangeTarget;
    setChangingRole(true);
    try {
      await apiPatch(`/v1/users/${target.id}`, { role: to });
      setRoleChangeTarget(null);
      toast.success(`User "${target.external_id}" is now ${to === "admin" ? "an admin" : "a member"}`);
      await loadUsers();
    } catch (err) {
      if (err instanceof ApiError && err.isForbidden) toast.error("Admin access required");
      else toast.error(apiErrorMessage(err, "Failed to update role"));
    } finally { setChangingRole(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Role still loading — avoid flashing a 403 at members who have read access.
  if (roleLoading) {
    return (
      <div className="space-y-6">
        <div className="card-base overflow-hidden">
          <TableSkeleton rows={5} cols={6} colWidths={["w-32", "w-24", "w-36", "w-20", "w-28", "w-40"]} />
        </div>
      </div>
    );
  }

  // Page itself is members:read-gated — mirror the backend's 403 message.
  if (!canRead) {
    return <ErrorState message="This action requires the 'members:read' permission." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage end-users within your organization"
        actions={
          canWrite && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={<UserPlus size={14} />} onClick={() => setShowInvite(true)}>
                Invite Member
              </Button>
              <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
                Create User
              </Button>
            </div>
          )
        }
      />

      <PageGuide title="User management" illustration={<GuideSecurity />}>
        <p>View and manage organization users. Monitor user activity, assign roles, and control access to organization resources.</p>
      </PageGuide>

      {error && <ErrorState message={error} onRetry={loadUsers} />}

      {/* Users table */}
      <div className="card-base overflow-hidden">
        <Table>
          <TableHeader>
            <TableHead>External ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Created</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={5} cols={6} colWidths={["w-32", "w-24", "w-36", "w-20", "w-28", "w-40"]} />
            ) : users.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={UsersIcon} title="No users found" description="Create your first user to get started" /></td></tr>
            ) : (
              users.map((user) => {
                const isSelf = me?.id != null && user.id === me.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-white">{user.external_id}</span>
                      {isSelf && (
                        <span className="ml-2 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-300">you</span>
                      )}
                    </TableCell>
                    <TableCell className="text-surface-200">
                      {user.name || <span className="text-surface-500 italic">—</span>}
                      {user.is_pending_invite && (
                        <Badge variant="warning" size="sm" className="ml-2 align-middle">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-surface-200">
                      {user.email || <span className="text-surface-500 italic">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === "admin" ? "brand" : "default"} size="sm">
                        {user.role === "admin" ? "Admin" : "Member"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-surface-200 text-xs">{formatDate(user.created_at)}</span>
                        <span className="text-surface-500 text-[11px]">{timeAgo(user.created_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex items-center justify-end gap-1">
                        {canWrite && !isSelf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRoleChangeTarget({ user, to: user.role === "admin" ? "member" : "admin" })}
                            className="rounded-md text-surface-400 hover:text-white"
                            title={user.role === "admin" ? "Remove admin" : "Make admin"}
                            aria-label={user.role === "admin" ? `Remove admin from ${user.external_id}` : `Make ${user.external_id} an admin`}
                          >
                            {user.role === "admin" ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                          </Button>
                        )}
                        <Link href={`/users/${user.id}`}><Button variant="ghost" size="sm" className="rounded-md text-surface-400 hover:text-white" title="View User"><Eye size={14} /></Button></Link>
                        {/* Callers own notification policy — sonner toasts stay on this page */}
                        <CopyButton
                          value={user.id}
                          label="Copy User ID"
                          className="rounded-md text-surface-400 hover:text-white"
                          onSuccess={() => toast.success("User ID copied to clipboard")}
                          onError={() => toast.error("Failed to copy")}
                        />
                        {/* Edit/Delete are destructive mutations — members:write only */}
                        {canWrite && (
                          <Button variant="ghost" size="sm" onClick={() => setEditTarget(user)} className="rounded-md text-surface-400 hover:text-white" title="Edit User"><Edit size={14} /></Button>
                        )}
                        {canWrite && (user.is_pending_invite ? (
                          // Pending invites have no account to delete — revoke the invite instead.
                          <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(user)} className="rounded-md text-surface-400 hover:text-error" title="Revoke Invitation" aria-label={`Revoke invite for ${user.external_id}`}><Ban size={14} /></Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(user)} className="rounded-md text-surface-400 hover:text-error" title="Delete User"><Trash2 size={14} /></Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Load more */}
        {!loading && hasMore && (
          <div className="border-t border-surface-800 px-4 py-3 text-center">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore} className="text-surface-400 hover:text-white gap-2">
              {loadingMore ? <span className="flex items-center gap-2"><Spinner /> Loading...</span> : <span className="flex items-center gap-2"><RefreshCw size={14} /> Load More</span>}
            </Button>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showInvite && (
        <InviteMemberDialog onClose={() => setShowInvite(false)} onSubmit={handleInvite} />
      )}
      {showCreate && (
        <UserFormDialog mode="create" initial={{ external_id: "", name: "", email: "" }}
          onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
      )}
      {editTarget && (
        <UserFormDialog mode="edit" editId={editTarget.id}
          initial={{ external_id: editTarget.external_id, name: editTarget.name ?? "", email: editTarget.email ?? "" }}
          onClose={() => setEditTarget(null)} onSubmit={handleUpdate} />
      )}
      <ConfirmDialog
        open={!!revokeTarget}
        title="Revoke Invitation"
        message={`Revoke invitation for “${revokeTarget?.name || revokeTarget?.external_id}”? They’ll need a new invite.`}
        confirmLabel="Revoke"
        variant="danger"
        loading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete User"
        message={`Are you sure you want to delete user "${deleteTarget?.name || deleteTarget?.external_id}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!roleChangeTarget}
        title={roleChangeTarget?.to === "admin" ? "Make Admin" : "Remove Admin"}
        message={
          roleChangeTarget?.to === "admin"
            ? `Grant admin access to "${roleChangeTarget?.user.name || roleChangeTarget?.user.external_id}"? Admins can manage org users, settings, and view monitoring/audit data.`
            : `Remove admin access from "${roleChangeTarget?.user.name || roleChangeTarget?.user.external_id}"? They will become a regular member.`
        }
        confirmLabel={roleChangeTarget?.to === "admin" ? "Make Admin" : "Remove Admin"}
        variant={roleChangeTarget?.to === "admin" ? "primary" : "danger"}
        loading={changingRole}
        onConfirm={handleRoleChange}
        onCancel={() => setRoleChangeTarget(null)}
      />
    </div>
  );
}
