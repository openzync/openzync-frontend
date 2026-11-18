"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpCircle,
  ExternalLink,
  Package,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  addonHealth,
  apiErrorMessage,
  ApiError,
  deleteAddon,
  disableAddon,
  enableAddon,
  getAddon,
  upgradeAddon,
  type AddonHealthResponse,
  type AddonResponse,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/shared/skeleton";
import { toast } from "sonner";
import { DeleteAddonDialog } from "../_components/delete-addon-dialog";

// ─── Enabled switch ─────────────────────────────────────────────────────────

function EnabledSwitch({
  enabled,
  disabled,
  onChange,
  label,
}: {
  enabled: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-accent-300 focus-visible:outline-offset-2",
        "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        enabled ? "bg-signal" : "bg-surface-600",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
          enabled ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// ─── Detail page ────────────────────────────────────────────────────────────

export default function AddonDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [addon, setAddon] = useState<AddonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const [health, setHealth] = useState<AddonHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [tag, setTag] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadAddon = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMissing(false);
    try {
      setAddon(await getAddon(id));
    } catch (err) {
      if (err instanceof ApiError && err.isNotFound) {
        setMissing(true);
      } else {
        setError(apiErrorMessage(err, "Failed to load add-on"));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      setHealth(await addonHealth(id));
    } catch (err) {
      setHealthError(apiErrorMessage(err, "Failed to load health"));
    } finally {
      setHealthLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Defer through a microtask so the state update is not synchronous
    // within the effect body (react-hooks/set-state-in-effect).
    const run = async () => {
      await loadAddon();
      await loadHealth();
    };
    void run();
  }, [loadAddon, loadHealth]);

  if (missing) notFound();

  /** Wrap a detail mutation: busy state, toast, local reload. */
  const mutate = async (key: string, success: string, failure: string, fn: () => Promise<AddonResponse>) => {
    setActing(key);
    try {
      setAddon(await fn());
      toast.success(success);
    } catch (err) {
      toast.error(apiErrorMessage(err, failure));
    } finally {
      setActing(null);
    }
  };

  const handleToggleEnabled = () => {
    if (!addon) return;
    const enable = !addon.enabled;
    void mutate(
      "enabled",
      `"${addon.id}" ${enable ? "enabled" : "disabled"}`,
      `Failed to ${enable ? "enable" : "disable"} "${addon.id}"`,
      () => (enable ? enableAddon(addon.id) : disableAddon(addon.id)),
    );
  };

  const handleUpgrade = () => {
    if (!addon) return;
    const trimmed = tag.trim();
    void mutate(
      "upgrade",
      `"${addon.id}" upgraded${trimmed ? ` to ${trimmed}` : ""}`,
      `Failed to upgrade "${addon.id}"`,
      () => upgradeAddon(addon.id, trimmed || undefined),
    );
  };

  const handleDelete = (addonId: string, removeData: boolean) => {
    setDeleteOpen(false);
    setActing("delete");
    deleteAddon(addonId, removeData)
      .then(() => {
        toast.success(`"${addonId}" deleted`);
        router.push("/addons");
      })
      .catch((err: unknown) => {
        toast.error(apiErrorMessage(err, `Failed to delete "${addonId}"`));
        setActing(null);
      });
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading add-on">
        <Skeleton className="h-4 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="card-base space-y-2 p-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="card-base space-y-2 p-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !addon) {
    return (
      <div className="space-y-6">
        <Link
          href="/addons"
          className="inline-flex items-center gap-1.5 text-sm text-surface-400 hover:text-white focus-visible:outline-2 focus-visible:outline-accent-300"
        >
          <ArrowLeft size={14} /> Back to Add-ons
        </Link>
        <ErrorState message={error ?? "Add-on not found"} onRetry={loadAddon} />
      </div>
    );
  }

  const isLocal = addon.source_type === "local";
  const panels = addon.panels ?? [];
  const healthy = health ? health.loaded && health.enabled : false;

  return (
    <div className="space-y-6">
      <Link
        href="/addons"
        className="inline-flex items-center gap-1.5 text-sm text-surface-400 hover:text-white focus-visible:outline-2 focus-visible:outline-accent-300"
      >
        <ArrowLeft size={14} /> Back to Add-ons
      </Link>

      <PageHeader
        title={addon.id}
        description={`v${addon.version} · ${addon.source_type}: ${addon.source_ref}`}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-surface-400">
              {addon.enabled ? "Enabled" : "Disabled"}
            </span>
            <EnabledSwitch
              enabled={addon.enabled}
              disabled={acting !== null}
              onChange={handleToggleEnabled}
              label={`${addon.enabled ? "Disable" : "Enable"} ${addon.id}`}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={isLocal ? <RefreshCw size={14} /> : <ArrowUpCircle size={14} />}
              disabled={acting !== null}
              onClick={() => document.getElementById("addon-upgrade")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {isLocal ? "Re-sync" : "Upgrade"}
            </Button>
          </div>
        }
      />

      {addon.update_available && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md bg-amber/10 px-3 py-2 text-sm text-amber"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Update available
            {addon.latest_seen ? (
              <>
                {" "}— latest seen <code className="font-mono">{addon.latest_seen}</code>
              </>
            ) : null}
            . Upgrade below to pick it up.
          </span>
        </div>
      )}

      {/* ── Details ── */}
      <section aria-label="Add-on details" className="card-base p-4">
        <h3 className="font-display text-sm font-medium">Details</h3>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0 text-surface-400">Source</dt>
            <dd className="truncate font-mono text-xs text-surface-200" title={addon.source_ref}>
              {addon.source_type}: {addon.source_ref}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-surface-400">Installed SHA</dt>
            <dd className="truncate font-mono text-xs text-surface-200" title={addon.installed_sha ?? undefined}>
              {addon.installed_sha ?? "—"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-surface-400">Latest seen</dt>
            <dd className="font-mono text-xs text-surface-200">{addon.latest_seen ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-surface-400">Generation</dt>
            <dd className="font-mono text-xs text-surface-200">{addon.generation}</dd>
          </div>
        </dl>
      </section>

      {/* ── Panels ── */}
      <section aria-label="Add-on panels" className="card-base p-4">
        <h3 className="font-display text-sm font-medium">Panels</h3>
        {panels.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No panels"
            description="This add-on exposes no UI panels."
          />
        ) : (
          <ul className="mt-2 divide-y divide-surface-800">
            {panels.map((panel) => {
              const path = panel.path.startsWith("/") ? panel.path : `/${panel.path}`;
              return (
                <li key={path} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-surface-200">{panel.title || panel.id}</p>
                    <p className="truncate font-mono text-xs text-surface-500">{path}</p>
                  </div>
                  <Link
                    href={`/ext/${encodeURIComponent(addon.id)}${path}`}
                    className="inline-flex shrink-0 items-center gap-1 text-sm text-signal-dim hover:underline focus-visible:outline-2 focus-visible:outline-accent-300"
                  >
                    Open <ExternalLink size={13} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Health ── */}
      <section aria-label="Add-on health" className="card-base p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-sm font-medium">Health</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadHealth()}
            loading={healthLoading}
            title="Refresh health"
            aria-label="Refresh health"
            className="rounded-md text-surface-400 hover:text-white"
          >
            <RefreshCw size={14} />
          </Button>
        </div>
        {healthLoading ? (
          <p className="mt-2 text-sm text-surface-500" role="status">Loading health…</p>
        ) : healthError || !health ? (
          <div className="mt-2">
            <ErrorState message={healthError ?? "Health unavailable"} onRetry={loadHealth} />
          </div>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <Badge variant={healthy ? "success" : "error"} size="sm">
              {healthy ? "Healthy" : "Unhealthy"}
            </Badge>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="shrink-0 text-surface-400">enabled</dt>
                <dd className="truncate font-mono text-xs text-surface-200">
                  {String(health.enabled)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-surface-400">loaded</dt>
                <dd className="truncate font-mono text-xs text-surface-200">
                  {String(health.loaded)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-surface-400">generation</dt>
                <dd className="truncate font-mono text-xs text-surface-200">
                  {health.generation}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-surface-400">version</dt>
                <dd className="truncate font-mono text-xs text-surface-200">
                  {health.version}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {/* ── Upgrade ── */}
      <section aria-label="Upgrade add-on" id="addon-upgrade" className="card-base scroll-mt-4 p-4">
        <h3 className="font-display text-sm font-medium">
          {isLocal ? "Re-sync" : "Upgrade"}
        </h3>
        <p className="mt-1 text-sm text-surface-400">
          {isLocal
            ? "Reinstall from the local path to pick up on-disk changes."
            : "Reinstall from the GitHub source — pin a tag or upgrade to the latest."}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          {!isLocal && (
            <div className="w-full sm:w-48">
              <Field label="Tag (optional)" htmlFor="addon-upgrade-tag">
                <input
                  id="addon-upgrade-tag"
                  className="input-base font-mono"
                  placeholder="v1.2.0"
                  value={tag}
                  disabled={acting !== null}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpgrade();
                  }}
                />
              </Field>
            </div>
          )}
          <Button
            variant="primary"
            size="md"
            icon={isLocal ? <RefreshCw size={14} /> : <ArrowUpCircle size={14} />}
            loading={acting === "upgrade"}
            disabled={acting !== null}
            onClick={handleUpgrade}
          >
            {isLocal ? "Re-sync" : "Upgrade"}
          </Button>
        </div>
      </section>

      {/* ── Danger zone ── */}
      <section aria-label="Danger zone" className="card-base border-error/40 p-4">
        <h3 className="font-display text-sm font-medium text-error">Danger zone</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="md"
            icon={addon.enabled ? <PowerOff size={14} /> : <Power size={14} />}
            loading={acting === "enabled"}
            disabled={acting !== null}
            onClick={handleToggleEnabled}
          >
            {addon.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            variant="danger"
            size="md"
            icon={<Trash2 size={14} />}
            loading={acting === "delete"}
            disabled={acting !== null}
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>
      </section>

      <DeleteAddonDialog
        key={deleteOpen ? addon.id : "closed"}
        addon={deleteOpen ? addon : null}
        busy={acting === "delete"}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
