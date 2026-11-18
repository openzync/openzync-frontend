"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { Puzzle } from "lucide-react";
import {
  API_BASE,
  ApiError,
  apiErrorMessage,
  get,
  getAccessToken,
  refreshOnce,
} from "@/lib/api-client";
import { useExtensions } from "@/contexts/extensions-context";
import { ErrorState } from "@/components/shared/error-state";

/**
 * IFrame token handoff contract (backend panels at /v1/ext/{id}/ui/*):
 *
 * - The wrapper appends the current access token as `?token=` on the iframe
 *   src (first paint) AND postMessages `{ token }` to the panel on every
 *   load, with follow-up posts whenever the token rotates.
 * - Panel JS reads `event.data.token` (verify `event.origin` is the API
 *   origin) and calls add-on APIs at /v1/ext/{id}/* with
 *   `Authorization: Bearer <token>`.
 * - A 401 inside the panel means the token expired: the wrapper preflights
 *   the panel URL and runs the shared single-flight refresh (`refreshOnce`)
 *   before the iframe ever loads, so panels start with a live token.
 */
const PANEL_TOKEN_EVENT = "openzync:addon-token";

function usePanelRoute() {
  const params = useParams<{ addonId: string; panel?: string[] }>();
  const addonId = params.addonId;
  const panelPath = `/${(params.panel ?? []).join("/")}`;
  return { addonId, panelPath };
}

export default function ExtensionPanelPage() {
  const { addonId, panelPath } = usePanelRoute();
  const { findAddon, loading: registryLoading } = useExtensions();
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const addon = registryLoading ? undefined : findAddon(addonId);
  const panelKnown = useMemo(() => {
    if (!addon || !Array.isArray(addon.panels)) return false;
    return addon.panels.some((p) => {
      const full = p.path.startsWith("/") ? p.path : `/${p.path}`;
      return full === panelPath || panelPath.startsWith(`${full}/`);
    });
  }, [addon, panelPath]);

  // Preflight with a live token, then mount the iframe with ?token=.
  useEffect(() => {
    if (registryLoading || !addon || !panelKnown) return;
    let cancelled = false;
    (async () => {
      setError(null);
      setIframeSrc(null);
      const url = `/v1/ext/${encodeURIComponent(addonId)}${panelPath}`;
      try {
        await get<unknown>(url);
      } catch (err) {
        if (cancelled) return;
        // get() already retried via the shared refresh; a surviving 401/403
        // is a real denial — surface it instead of loading a dead iframe.
        if (err instanceof ApiError && (err.isUnauthorized || err.isForbidden)) {
          setError(
            err.isForbidden
              ? "Access denied for this panel"
              : "Session expired — reload the page to sign in again",
          );
          return;
        }
        setError(apiErrorMessage(err, "Failed to load panel"));
        return;
      }
      if (cancelled) return;
      const token = getAccessToken();
      setIframeSrc(
        `${API_BASE}${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token ?? "")}`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [registryLoading, addon, panelKnown, addonId, panelPath, frameKey]);

  // Push the (possibly rotated) token into the panel on every load.
  const postToken = () => {
    const win = frameRef.current?.contentWindow;
    const token = getAccessToken();
    if (win && token) {
      win.postMessage({ type: PANEL_TOKEN_EVENT, token }, API_BASE || window.location.origin);
    }
  };

  // Panels signal an expired token via postMessage (cross-origin frames
  // can't be inspected): refresh once and reload the frame with a live token.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (API_BASE && e.origin !== new URL(API_BASE).origin) return;
      if (e.data?.type !== "openzync:addon-unauthorized") return;
      void refreshOnce().then(() => setFrameKey((k) => k + 1));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Unknown add-on (or disabled) / unknown panel → 404, after registry loads.
  if (!registryLoading && !addon) notFound();
  if (!registryLoading && addon && !panelKnown) notFound();

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          {addon?.id ?? addonId}
        </h1>
        <p className="mt-1 text-sm text-surface-400">
          {addon ? `v${addon.version}` : "Loading panel…"}
        </p>
      </div>

      {error && <ErrorState message={error} onRetry={() => setFrameKey((k) => k + 1)} />}

      {!iframeSrc && !error ? (
        <div className="card-base flex flex-1 items-center justify-center" role="status">
          <div className="flex flex-col items-center gap-3 text-surface-500">
            <Puzzle size={32} className="opacity-40" />
            <p className="text-sm">Loading panel…</p>
          </div>
        </div>
      ) : iframeSrc ? (
        <iframe
          key={frameKey}
          ref={frameRef}
          src={iframeSrc}
          title={addon?.id ?? addonId}
          className="card-base min-h-0 flex-1 w-full border-0"
          sandbox="allow-scripts allow-same-origin"
          onLoad={postToken}
        />
      ) : null}
    </div>
  );
}
