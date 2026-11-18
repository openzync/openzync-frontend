"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { Puzzle } from "lucide-react";
import {
  API_BASE,
  ApiError,
  apiErrorMessage,
  getAccessToken,
  refreshOnce,
  requestPanelTicket,
} from "@/lib/api-client";
import { useExtensions } from "@/contexts/extensions-context";
import { ErrorState } from "@/components/shared/error-state";

/**
 * Panel ticket contract (backend panels at /v1/ext/{id}/ui/*):
 *
 * - The viewer mints a short-lived single-purpose ticket first:
 *   POST /admin/system/addons/{id}/panels/ticket { panel_path } → { ticket }
 *   (viewer authed as superadmin/org-user; backend binds the ticket to the
 *   add-on + panel, 5-min TTL).
 * - The iframe src carries it as `?ticket=`:
 *   {API_BASE}/v1/ext/{id}{path}?ticket={ticket}. `?token=` no longer works.
 * - Panel JS → API calls are unchanged: the wrapper postMessages
 *   `{ type, token, origin: window.location.origin }` to the panel on every
 *   load (follow-ups on rotation), and panel JS reads `event.data.token`
 *   and calls add-on APIs at /v1/ext/{id}/* with `Authorization: Bearer <token>`.
 *   targetOrigin is "*" because the iframe runs sandbox="allow-scripts"
 *   (opaque origin): specific targetOrigins are silently dropped, so the
 *   panel never receives the token. Panels cannot derive the viewer origin
 *   from their URL (they only know the API origin), so they must boot only
 *   when the browser-attested `event.origin === event.data.origin` (plus
 *   type match) — a spoofed claim from any other origin fails because
 *   `event.origin` is browser-set.
 * - A 401 inside the panel means the page token expired: the panel posts
 *   `openzync:addon-unauthorized`, the wrapper runs the shared single-flight
 *   refresh (`refreshOnce`), then remounts the frame — the mount effect
 *   mints a fresh ticket, so expiry heals with one reload. Inbound
   `openzync:addon-unauthorized` is accepted only from the API origin;
   when API_BASE is empty/unparseable the message is rejected (default-deny).
 */
const PANEL_TOKEN_EVENT = "openzync:addon-token";

function usePanelRoute() {
  const params = useParams<{ addonId: string; panel?: string[] }>();
  const addonId = params.addonId;
  const panelPath = `/${(params.panel ?? []).join("/")}`;
  return { addonId, panelPath };
}

/**
 * Normalize a panel path the same way the backend traversal rules do:
 * leading slash, collapsed slashes, resolved `.`/`..`, no trailing slash.
 * Returns null when `..` escapes the root — never matches, never minted.
 */
function normalizePanelPath(raw: string): string | null {
  const out: string[] = [];
  for (const seg of raw.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (out.pop() === undefined) return null;
      continue;
    }
    out.push(seg);
  }
  return `/${out.join("/")}`;
}

/** Exact-or-boundary match on normalized paths: `/ui` covers `/ui/board`. */
function matchesPanel(registered: string, requested: string): boolean {
  const reg = normalizePanelPath(registered);
  const req = normalizePanelPath(requested);
  if (!reg || !req) return false;
  return req === reg || req.startsWith(`${reg}/`);
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
    return addon.panels.some((p) => matchesPanel(p.path, panelPath));
  }, [addon, panelPath]);

  // Mint a panel ticket, then mount the iframe with ?ticket=.
  useEffect(() => {
    if (registryLoading || !addon || !panelKnown) return;
    let cancelled = false;
    (async () => {
      setError(null);
      setIframeSrc(null);
      const normalized = normalizePanelPath(panelPath) ?? panelPath;
      try {
        const { ticket } = await requestPanelTicket(addonId, normalized);
        if (cancelled) return;
        const url = `/v1/ext/${encodeURIComponent(addonId)}${normalized}`;
        setIframeSrc(
          `${API_BASE}${url}${url.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticket)}`,
        );
      } catch (err) {
        if (cancelled) return;
        // requestPanelTicket already retried via the shared refresh; a
        // surviving 401/403 is a real denial — surface it instead of
        // loading a dead iframe.
        if (err instanceof ApiError && (err.isUnauthorized || err.isForbidden)) {
          setError(
            err.isForbidden
              ? "Access denied for this panel"
              : "Session expired — reload the page to sign in again",
          );
          return;
        }
        setError(apiErrorMessage(err, "Failed to load panel"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [registryLoading, addon, panelKnown, addonId, panelPath, frameKey]);

  // Push the (possibly rotated) token into the panel on every load.
  // Target "*" is required: sandbox="allow-scripts" gives an opaque origin,
  // so specific targetOrigins are silently dropped. The `origin` assertion
  // lets the panel boot only when browser-attested ev.origin ===
  // ev.data.origin (plus type match).
  const postToken = () => {
    const win = frameRef.current?.contentWindow;
    const token = getAccessToken();
    if (win && token) {
      win.postMessage(
        { type: PANEL_TOKEN_EVENT, token, origin: window.location.origin },
        "*",
      );
    }
  };

  // Panels signal an expired token via postMessage (cross-origin frames
  // can't be inspected): refresh once and reload the frame with a fresh
  // ticket (the mount effect above re-mints on frameKey change).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      let allowedOrigin: string | null = null;
      try {
        allowedOrigin = API_BASE ? new URL(API_BASE).origin : null;
      } catch {
        allowedOrigin = null;
      }
      if (!allowedOrigin || e.origin !== allowedOrigin) return;
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
          sandbox="allow-scripts"
          onLoad={postToken}
        />
      ) : null}
    </div>
  );
}
