"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Key,
  Copy,
  CheckCircle,
  AlertCircle,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { get, post, del, ApiError } from "@/lib/api-client";
import { timeAgo, formatDate, copyToClipboard } from "@/lib/utils";
import { useProject } from "@/stores/project-context";
import { useUser, ALL_PERMISSIONS } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/skeleton";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  project_id: string;
  permissions: string[];
  is_revoked: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface ApiKeyCreateResponse {
  id: string;
  name: string;
  prefix: string;
  project_id: string;
  permissions: string[];
  raw_key: string;
  message: string;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectApiKeysPage() {
  const { project, loading: projectLoading } = useProject();
  const { can, loading: roleLoading } = useUser();
  const canManage = can("project:manage");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  // Pre-check the member defaults; sent explicitly — the server does NOT
  // default an empty list to admin/full access.
  const [newPermissions, setNewPermissions] = useState<string[]>([
    "project:read",
    "project:write",
  ]);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null);
  const [showRawKey, setShowRawKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchKeys = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ data: ApiKey[] }>(
        `/v1/projects/${project.id}/api-keys`
      );
      setKeys(data.data ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    if (project?.id && canManage) fetchKeys();
  }, [project?.id, fetchKeys, canManage]);

  // ── Create key ─────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim() || !project?.id) return;
    setCreating(true);
    try {
      const result = await post<ApiKeyCreateResponse>(
        `/v1/projects/${project.id}/api-keys`,
        { name: newName.trim(), permissions: newPermissions }
      );
      setCreatedKey(result);
      toast.success("API key created");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to create key";
      setError(msg);
      toast.error(msg);
      setCreating(false);
    }
  };

  const openCreate = () => {
    setNewName("");
    setNewPermissions(["project:read", "project:write"]);
    setCreatedKey(null);
    setShowRawKey(false);
    setCopied(false);
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    setNewName("");
    setNewPermissions(["project:read", "project:write"]);
    setCreating(false);
    setCreatedKey(null);
    setShowRawKey(false);
    setCopied(false);
    fetchKeys();
  };

  // ── Revoke key ─────────────────────────────────────────────────────────────

  const handleRevoke = async () => {
    if (!revokeTarget || !project?.id) return;
    setRevoking(true);
    try {
      await del(`/v1/projects/${project.id}/api-keys/${revokeTarget.id}`);
      setRevokeTarget(null);
      toast.success("API key revoked");
      fetchKeys();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to revoke key";
      setError(msg);
      toast.error(msg);
    } finally {
      setRevoking(false);
    }
  };

  // ── Copy raw key ───────────────────────────────────────────────────────────

  const handleCopy = async () => {
    if (!createdKey) return;
    const ok = await copyToClipboard(createdKey.raw_key);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Role still loading — avoid flashing the 403 at project managers.
  if (roleLoading || projectLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="API Keys" description="Manage API keys for programmatic access" />
        <div className="card-base overflow-hidden">
          <TableSkeleton rows={4} cols={7} colWidths={["w-32", "w-20", "w-28", "w-20", "w-24", "w-16", "w-16"]} />
        </div>
      </div>
    );
  }

  // Every action here (create, revoke, even listing) is project:manage — a
  // member without it 403s on every call. Fail the page, mirror the backend.
  if (!canManage) {
    return <ErrorState message="This action requires the 'project:manage' permission." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description={
          project
            ? `Manage API keys for programmatic access to ${project.name}`
            : "Manage API keys for programmatic access"
        }
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openCreate}>
            Create Key
          </Button>
        }
      />

      {/* Error */}
      {error && <ErrorState message={error} onRetry={fetchKeys} />}

      {/* Table */}
      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-800">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Prefix</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Permissions</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Last Used</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-400">Created</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-surface-400">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-surface-400 w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {loading ? (
                <TableSkeleton rows={4} cols={7} colWidths={["w-32", "w-20", "w-28", "w-20", "w-24", "w-16", "w-16"]} />
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={Key}
                      title="No API keys yet"
                      description="Create an API key to enable programmatic access to this project"
                      action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openCreate}>Create Key</Button>}
                    />
                  </td>
                </tr>
              ) : (
                  keys.map((key, idx) => (
                    <tr
                      key={key.id}
                      className={cn("transition-colors hover:bg-surface-800/50", idx % 2 === 0 ? "bg-surface-950/50" : "")}
                    >
                      <td className="px-4 py-3">
                        <span className="text-surface-200 font-medium">{key.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-surface-800 text-surface-300 px-1.5 py-0.5 rounded font-mono">{key.prefix}...</code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {key.permissions.length === 0 ? (
                            <Badge variant="default" size="sm">No permissions</Badge>
                          ) : (
                            key.permissions.map((permission) => (
                              <Badge key={permission} variant="info" size="sm">{permission}</Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-surface-400 text-xs">{timeAgo(key.last_used_at)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-surface-400 text-xs">{formatDate(key.created_at)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={key.is_revoked ? "error" : "success"} size="sm">
                          {key.is_revoked ? "Revoked" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!key.is_revoked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRevokeTarget(key)}
                            className="rounded-md text-surface-400 hover:text-error"
                            title="Revoke key"
                          >
                            <Ban size={14} />
                          </Button>
                        )}
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
        onOpenChange={(open) => {
          if (!open) closeCreate();
        }}
        title={createdKey ? "Key Created" : "Create API Key"}
        persistent={creating}
        footer={
          createdKey ? (
            <Button variant="primary" size="sm" onClick={closeCreate}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={closeCreate}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleCreate} loading={creating} disabled={!newName.trim()}>
                Create
              </Button>
            </>
          )
        }
      >
        {!createdKey ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5">Key Name</label>
              <input
                className="input-base w-full"
                placeholder="e.g. Production CI"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>

            {/* Permission picker — the checked list is sent verbatim. The server
                does NOT default an empty selection to admin/full access. */}
            <div>
              <span className="block text-sm font-medium text-surface-300 mb-1.5">
                Permissions
              </span>
              <div className="space-y-1.5 rounded-lg border border-surface-800 bg-surface-950/50 p-3">
                {ALL_PERMISSIONS.map((permission) => {
                  const checked = newPermissions.includes(permission);
                  return (
                    <label
                      key={permission}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-surface-200 hover:bg-surface-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setNewPermissions((prev) =>
                            checked
                              ? prev.filter((p) => p !== permission)
                              : [...prev, permission],
                          )
                        }
                        className="rounded border-surface-600 bg-surface-800 text-brand-500"
                      />
                      <span className="font-mono text-xs">{permission}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-surface-500 mt-1.5">
                The checked permissions are granted explicitly — an empty selection
                means no access, not full admin access.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-surface-400">
              {createdKey.message}
            </p>
            <div className="rounded-lg border border-surface-700 bg-surface-950 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-surface-500 font-medium uppercase tracking-wider">Your API Key</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="text-surface-400 hover:text-white"
                  title="Copy to clipboard"
                >
                  {copied ? <CheckCircle size={14} className="text-success" /> : <Copy size={14} />}
                </Button>
              </div>
              <code className="block text-sm font-mono text-accent-300 break-all select-all">
                {showRawKey ? createdKey.raw_key : createdKey.raw_key.slice(0, 20) + "••••"}
              </code>
              <button
                onClick={() => setShowRawKey(!showRawKey)}
                className="text-xs text-accent-300 hover:text-accent-200 mt-2"
              >
                {showRawKey ? "Hide" : "Show full key"}
              </button>
            </div>
            <p className="text-xs text-warning flex items-center gap-1.5">
              <AlertCircle size={12} />
              This key will not be shown again. Copy it now.
            </p>
          </div>
        )}
      </Dialog>

      {/* ── Revoke Confirm Dialog ──────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!revokeTarget}
        title="Revoke API Key"
        message={`Are you sure you want to revoke "${revokeTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Revoke"
        variant="danger"
        loading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
