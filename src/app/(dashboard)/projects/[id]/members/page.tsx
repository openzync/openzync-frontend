"use client";

import { useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  AlertTriangle,
  User as UserIcon,
} from "lucide-react";
import {
  get,
  post,
  del as apiDel,
  ApiError,
  extractList,
} from "@/lib/api-client";
import { useApiQuery } from "@/hooks/use-api-query";
import { useProject } from "@/stores/project-context";
import { useUser } from "@/contexts/user-context";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/ui/field";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
}

interface UserItem {
  id: string;
  email?: string;
  name?: string;
  external_id?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getUserLabel(user: UserItem): string {
  return user.email ?? user.name ?? user.external_id ?? user.id.slice(0, 8);
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectMembersPage() {
  const { project, loading: projectLoading } = useProject();
  const { can, loading: roleLoading } = useUser();
  const canManage = can("project:manage");
  const projectId = project?.id;

  const membersQuery = useApiQuery<Member[] | { data: Member[] }>(
    () => get<Member[] | { data: Member[] }>(`/v1/projects/${projectId}/members`),
    { enabled: !!projectId },
  );
  // Optimistic removal writes a local override; server data wins on refetch.
  const [override, setOverride] = useState<Member[] | null>(null);
  const members = override ?? extractList<Member>(membersQuery.data);
  const loading = membersQuery.isLoading;
  const fetchError = membersQuery.error;

  // Add member
  const [showAdd, setShowAdd] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // Remove member
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  async function handleOpenAdd() {
    setAddError("");
    setSelectedUserId("");
    setAdding(false);
    setUsersLoading(true);
    try {
      const data = await get<{ data: UserItem[] }>("/v1/users?limit=200");
      setUsers(extractList<UserItem>(data));
    } catch {
      setAddError("Failed to load user list");
    } finally {
      setUsersLoading(false);
    }
    setShowAdd(true);
  }

  async function handleAddMember() {
    if (!projectId || !selectedUserId) return;
    setAdding(true);
    setAddError("");
    try {
      await post(`/v1/projects/${projectId}/members`, {
        user_id: selectedUserId,
        role: "member",
      });
      setShowAdd(false);
      toast.success("Member added");
      membersQuery.refetch();
    } catch (err) {
      setAddError(
        err instanceof ApiError ? err.message : "Failed to add member",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember() {
    if (!projectId || !removeTarget) return;
    setRemoving(true);
    try {
      await apiDel(
        `/v1/projects/${projectId}/members/${removeTarget.user_id}`,
      );
      setOverride(members.filter((m) => m.id !== removeTarget.id));
      setRemoveTarget(null);
      toast.success("Member removed");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to remove member",
      );
    } finally {
      setRemoving(false);
    }
  }

  const isOwner = (role: string) => role === "owner";
  const ownerCount = members.filter((m) => isOwner(m.role)).length;

  if (projectLoading || roleLoading) {
    return (
        <div className="space-y-6">
          <PageHeader title="Members" description="Project members" />
          <TableSkeleton rows={4} cols={3} colWidths={["w-32", "w-20", "w-16"]} />
        </div>
    );
  }

  return (
      <div className="space-y-6">
        <PageHeader
          title="Members"
          description={
            project
              ? `Manage who has access to "${project.name}"`
              : "Project member management"
          }
          actions={
            canManage && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={handleOpenAdd}
              >
                Add Member
              </Button>
            )
          }
        />

        {loading ? (
          <TableSkeleton
            rows={4}
            cols={3}
            colWidths={["w-32", "w-20", "w-16"]}
          />
        ) : fetchError ? (
          <div className="card-base p-12 flex flex-col items-center justify-center">
            <AlertTriangle size={36} className="text-error mb-3" />
            <p className="text-sm text-surface-300 mb-4">{fetchError}</p>
            <Button variant="secondary" size="sm" onClick={membersQuery.refetch}>
              Retry
            </Button>
          </div>
        ) : members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members yet"
            description="Add members to collaborate on this project."
            action={
              canManage && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={handleOpenAdd}
                >
                  Add Member
                </Button>
              )
            }
          />
        ) : (
          <div className="card-base overflow-hidden">
            <Table zebra={false}>
              <TableHeader>
                <TableHead>User ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Added</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserIcon size={14} className="text-surface-500" />
                        <span className="font-mono text-xs text-surface-200">
                          {member.user_id.slice(0, 8)}...
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={isOwner(member.role) ? "brand" : "default"}
                        size="sm"
                      >
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-surface-400">
                      {new Date(member.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      {canManage && !isOwner(member.role) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRemoveTarget(member)}
                          className="text-surface-400 hover:text-error"
                          title="Remove member"
                        >
                          <Trash2 size={15} />
                        </Button>
                      )}
                      {isOwner(member.role) && ownerCount <= 1 && (
                        <span className="text-xs text-surface-500">
                          Last owner
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ── Add Member Dialog ──────────────────────────────────────────── */}
        <Dialog
          open={showAdd}
          onOpenChange={(open) => {
            if (!open && !adding) setShowAdd(false);
          }}
          title="Add Member"
          persistent={adding}
          footer={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAdd(false)}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddMember}
                loading={adding}
                disabled={!selectedUserId}
              >
                Add Member
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="User" htmlFor="member-user-select">
              {usersLoading ? (
                <div className="h-9 rounded-md bg-surface-800 animate-pulse" />
              ) : (
                <select
                  id="member-user-select"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="input-base appearance-none cursor-pointer w-full"
                  disabled={adding || users.length === 0}
                >
                  <option value="">
                    {users.length === 0
                      ? "No users available"
                      : "Select a user..."}
                  </option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {getUserLabel(user)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {addError && (
              <div className="rounded-md border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
                {addError}
              </div>
            )}
          </div>
        </Dialog>

        {/* ── Remove Confirm ────────────────────────────────────────────── */}
        <ConfirmDialog
          open={!!removeTarget}
          title="Remove Member"
          message={`Are you sure you want to remove this member from the project?`}
          confirmLabel="Remove"
          variant="danger"
          loading={removing}
          onConfirm={handleRemoveMember}
          onCancel={() => setRemoveTarget(null)}
        />
      </div>
  );
}
