// ═══════════════════════════════════════════════════════════════════════════════
// OpenZync — Centralized API Client
// ═══════════════════════════════════════════════════════════════════════════════
//
// Every API call in the frontend goes through this module.
//   - Reads NEXT_PUBLIC_API_URL from env (fallback: http://localhost:8000)
//   - Injects Authorization header from localStorage
//   - Handles 401 → redirect to login
//   - Provides typed request helpers so every page gets consistent error handling
//
// Never hardcode the base URL in a page file again.
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Single-flight token refresh: concurrent 401s share one in-flight promise
 * instead of skipping refresh and leaking raw 401s. Cleared when settled so
 * a later 401 can start a fresh attempt.
 */
let _refreshPromise: Promise<string | null> | null = null;

function refreshOnce(): Promise<string | null> {
  _refreshPromise ??= refreshAccessToken().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

/**
 * Shared 401 handling for request() and uploadWithBlobs(): await the shared
 * refresh, then retry the original request exactly once with the new token.
 * On refresh failure every awaiter clears tokens, redirects, and throws.
 */
async function refreshAndRetry(
  retry: (newToken: string) => Promise<Response>,
): Promise<Response> {
  const newToken = await refreshOnce();
  if (!newToken) {
    clearTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/login?reason=not-signed-in";
    }
    throw new ApiError("Unauthorized", 401, null);
  }
  return retry(newToken);
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mg_access_token");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mg_refresh_token");
}

function storeTokens(access: string, refresh: string): void {
  localStorage.setItem("mg_access_token", access);
  localStorage.setItem("mg_refresh_token", refresh);
}

function clearTokens(): void {
  localStorage.removeItem("mg_access_token");
  localStorage.removeItem("mg_refresh_token");
}

/**
 * Attempt to exchange a refresh token for a new access token.
 * Returns the new access token, or null if the refresh fails.
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // Refresh failed (e.g. expired or revoked) — force re-login.
      clearTokens();
      return null;
    }

    const body = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    // Store the new pair (the backend may also issue a new refresh token).
    storeTokens(body.access_token, body.refresh_token ?? refreshToken);
    return body.access_token;
  } catch {
    // Network error during refresh — returns null like any other refresh
    // failure, so callers clear the session and redirect to login.
    // TODO: distinguish transport errors from auth rejection so a transient
    // network blip doesn't log the user out.
    return null;
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  next_cursor?: string | null;
  has_more?: boolean;
  total?: number;
  items?: T[];
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

/**
 * Build a human-readable message from an API error body (FastAPI/RFC 7807).
 * FastAPI 422 `detail` is an array of { loc, msg, type } — flatten it into
 * `messages.0.content: Field required` style text instead of rendering
 * `[object Object]`. Permission denials come back as a NESTED detail object
 * (`{"detail": {"detail": "This action requires the 'x' permission."}}`) —
 * unwrap that too.
 */
function parseApiErrorMessage(body: unknown, status: number): string {
  if (!body || typeof body !== "object") return `Request failed with status ${status}`;
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string") return b.message;
  if (typeof b.detail === "string") return b.detail;
  if (b.detail && typeof b.detail === "object") {
    const d = b.detail as Record<string, unknown>;
    if (typeof d.detail === "string") return d.detail;
    if (typeof d.message === "string") return d.message;
  }
  if (Array.isArray(b.detail)) {
    const parts = b.detail.slice(0, 3).map((item) => {
      if (!item || typeof item !== "object") return String(item);
      const e = item as Record<string, unknown>;
      // Keep numeric array indices so the loc path reads "messages.0.content",
      // not the lossy "messages.content".
      const loc = Array.isArray(e.loc)
        ? e.loc
            .filter(
              (p): p is string | number =>
                typeof p === "string" || typeof p === "number",
            )
            .slice(1)
            .join(".")
        : "";
      const msg = typeof e.msg === "string" ? e.msg : "";
      return loc ? `${loc}: ${msg}` : msg;
    }).filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (typeof b.title === "string") return b.title;
  return `Request failed with status ${status}`;
}

/**
 * Standard error-message resolution for page load failures.
 * Maps 403 (admin-gated endpoint hit by a member JWT) to a clear message;
 * everything else falls through to the parsed API error text.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.isForbidden ? "Admin access required" : err.message;
  }
  return fallback;
}

// ─── Core request helper ──────────────────────────────────────────────────────

/**
 * Pre-auth flows (login, signup, OTP, reset…) pass `skipAuthRetry: true`:
 * their endpoints have no valid token, so a 401 is a real answer ("wrong
 * password") — never trigger refresh-retry nor the redirect-to-login side
 * effect. Authenticated callers omit it and keep refresh semantics.
 */
interface RequestOptions extends RequestInit {
  skipAuthRetry?: boolean;
}

/** Per-verb opt-out surface — deliberately narrow so callers can't send raw headers past the auth layer. */
type VerbOptions = Pick<RequestOptions, "skipAuthRetry">;

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuthRetry, ...init } = options;
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(init.headers as Record<string, string>),
  };

  let res = await fetch(url, {
    ...init,
    headers,
  });

  // 401 → silent token refresh (shared across concurrent requests), retry once
  if (res.status === 401 && !skipAuthRetry) {
    res = await refreshAndRetry((newToken) => {
      headers["Authorization"] = `Bearer ${newToken}`;
      return fetch(url, { ...init, headers });
    });
  }

  // No content (204) — return empty
  if (res.status === 204) {
    return {} as T;
  }

  // Try to parse JSON body
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    throw new ApiError(parseApiErrorMessage(body, res.status), res.status, body);
  }

  return body as T;
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

/** GET request */
export function get<T>(path: string, opts?: VerbOptions): Promise<T> {
  return request<T>(path, { method: "GET", ...opts });
}

/** POST request */
export function post<T>(path: string, data?: unknown, opts?: VerbOptions): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: data !== undefined ? JSON.stringify(data) : undefined,
    ...opts,
  });
}

/** PUT request */
export function put<T>(path: string, data?: unknown, opts?: VerbOptions): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: data !== undefined ? JSON.stringify(data) : undefined,
    ...opts,
  });
}

/** PATCH request */
export function patch<T>(path: string, data?: unknown, opts?: VerbOptions): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: data !== undefined ? JSON.stringify(data) : undefined,
    ...opts,
  });
}

/** DELETE request */
export function del<T = void>(path: string, opts?: VerbOptions): Promise<T> {
  return request<T>(path, { method: "DELETE", ...opts });
}

// ── File Upload ─────────────────────────────────────────────────────────

/**
 * Upload a JSON payload with binary file attachments via multipart/form-data.
 *
 * Used by the memory ingestion endpoint which accepts both structured
 * message data and file blobs in a single request.
 *
 * @param path - API path (e.g. `/v1/projects/${id}/memory`).
 * @param payload - JSON-serializable object (the IngestMemoryRequest).
 * @param files - Array of File objects to attach as blobs.
 * @returns Parsed response body.
 */
async function uploadWithBlobs<T>(
  path: string,
  payload: Record<string, unknown>,
  files: File[],
): Promise<T> {
  const formData = new FormData();
  formData.append("data", JSON.stringify(payload));

  for (const file of files) {
    formData.append("blobs", file);
  }

  const url = `${API_BASE}${path}`;
  const headers = getAuthHeaders();
  // No Content-Type header — let the browser set the multipart boundary.
  delete headers["Content-Type"];
  let res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  // 401 → same shared refresh-and-retry path as request()
  if (res.status === 401) {
    res = await refreshAndRetry((newToken) => {
      headers["Authorization"] = `Bearer ${newToken}`;
      return fetch(url, { method: "POST", headers, body: formData });
    });
  }

  if (res.status === 204) return {} as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(parseApiErrorMessage(body, res.status), res.status, body);
  }
  return body as T;
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

export interface CursorPageParams {
  limit?: number;
  cursor?: string;
}

export interface OffsetPageParams {
  limit?: number;
  offset?: number;
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export interface JoinRequest {
  email: string;
  password: string;
  org_code: string;
}

export interface SignupResponse {
  email: string;
  message: string;
}

/** POST /v1/auth/join — join an existing organization via its org code. Pre-auth: 401 must not trigger refresh/redirect. */
export function join(data: JoinRequest): Promise<SignupResponse> {
  return post<SignupResponse>("/v1/auth/join", data, { skipAuthRetry: true });
}

/** Normalise API responses that might use `data`, `items`, or be a bare array. */
export function extractList<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (!response || typeof response !== "object") return [];
  const obj = response as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as T[];
  if (Array.isArray(obj.items)) return obj.items as T[];
  return [];
}

// ─── Invite endpoints (admin invites → magic-link password set) ──────────────

export interface InviteInfo {
  org_name: string;
  email: string;
  name: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

/**
 * POST /v1/auth/invites/info — resolve an invite token to the invitee's org
 * and profile. Unauthenticated: the token travels in the BODY, never the URL.
 */
export function getInviteInfo(token: string): Promise<InviteInfo> {
  return post<InviteInfo>("/v1/auth/invites/info", { token }, { skipAuthRetry: true });
}

/**
 * POST /v1/auth/invites/accept — set the invitee's password and complete the
 * invite flow. Success is a fresh login: any stale session is deliberately
 * overwritten by the new token pair (clear → store).
 */
export async function acceptInvite(
  token: string,
  password: string,
): Promise<TokenPair> {
  const tokens = await post<TokenPair>(
    "/v1/auth/invites/accept",
    { token, password },
    { skipAuthRetry: true },
  );
  clearTokens();
  storeTokens(tokens.access_token, tokens.refresh_token);
  return tokens;
}

/** POST /v1/admin/users/invite — org-admin only; emails the invite link. */
export function inviteUser(email: string, name: string): Promise<unknown> {
  return post("/v1/admin/users/invite", { email, name });
}

/** DELETE /v1/admin/users/invites/{id} — org-admin only; revokes a pending invite. */
export function revokeInvite(userId: string): Promise<void> {
  return del(`/v1/admin/users/invites/${userId}`);
}

// ─── Registration gating & platform super-admin console ──────────────────────

export type OrgCreationPolicy = "allow_all" | "reject_all" | "approvals";
export type ApprovalScope = "in_app" | "public_signup" | "both";
export type OrgApprovalStatus = "pending" | "approved" | "rejected";

/** GET /v1/auth/registration-status — PUBLIC; drives signup/join gating. */
export interface RegistrationStatus {
  org_creation_policy: OrgCreationPolicy;
  approval_scope: ApprovalScope;
}

export interface OrgListEntry {
  id: string;
  name: string;
  status: OrgApprovalStatus;
  created_at: string;
}

/** GET /admin/system/orgs — offset-paginated list of ALL orgs (superadmin only). */
export interface OrgListResponse {
  data: OrgListEntry[];
  total: number;
  page: number;
  limit: number;
}

/**
 * GET/PATCH /admin/system/config — superadmin system defaults.
 * `org_creation_policy`/`approval_scope` are flat; the remaining non-secret
 * defaults use the same field names as the org-config `stored` map.
 */
export interface SystemConfigResponse {
  org_creation_policy: OrgCreationPolicy;
  approval_scope: ApprovalScope;
  [key: string]: unknown;
}

/**
 * GET /admin/system/settings — superadmin read-only view of platform runtime
 * settings from the secrets backend. Secrets arrive pre-masked; reveal the
 * raw value per-key via revealSystemSetting.
 */
export interface SystemSettingItem {
  key: string;
  category: string;
  is_set: boolean;
  masked_value: string | null;
}

export interface SystemSettingsResponse {
  data: SystemSettingItem[];
}

/** POST /admin/system/settings/{key}/reveal — raw value for one key. POST so the server-side audit middleware logs the reveal. */
export interface SystemSettingRevealResponse {
  key: string;
  value: string;
}

/** GET /admin/system/settings — all runtime settings, masked. */
export function getSystemSettings(): Promise<SystemSettingsResponse> {
  return get<SystemSettingsResponse>("/admin/system/settings");
}

/** POST /admin/system/settings/{key}/reveal — raw value for exactly one key (no body). */
export function revealSystemSetting(
  key: string,
): Promise<SystemSettingRevealResponse> {
  return post<SystemSettingRevealResponse>(
    `/admin/system/settings/${encodeURIComponent(key)}/reveal`,
  );
}

/** POST /v1/org-requests — any authenticated user; creates an org (allow_all) or a pending request (approvals). */
export interface OrgRequestCreate {
  organization_name: string;
  admin_email: string;
  admin_name: string;
}

export interface OrgRequestResponse {
  organization_name: string;
  admin_email: string;
  status: string;
}

/**
 * POST /v1/auth/change-password — rotates the token pair and clears the
 * `must_change_password` flag. Success is a fresh session: overwrite tokens
 * exactly like acceptInvite, never merge with a stale pair.
 */
export async function changePassword(
  old_password: string,
  new_password: string,
): Promise<TokenPair> {
  const tokens = await post<TokenPair>("/v1/auth/change-password", {
    old_password,
    new_password,
  });
  clearTokens();
  storeTokens(tokens.access_token, tokens.refresh_token);
  return tokens;
}

/** GET /v1/auth/registration-status — PUBLIC; signup page gates on this. Pre-auth: 401 must not trigger refresh/redirect. */
export function getRegistrationStatus(): Promise<RegistrationStatus> {
  return get<RegistrationStatus>("/v1/auth/registration-status", { skipAuthRetry: true });
}

// ─── Re-export base URL for edge cases ───────────────────────────────────────

export { API_BASE, getAccessToken, storeTokens, clearTokens, uploadWithBlobs };
