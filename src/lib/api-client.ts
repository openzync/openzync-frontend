// ═══════════════════════════════════════════════════════════════════════════════
// OpenZync — Centralized API Client
// ═══════════════════════════════════════════════════════════════════════════════
//
// Every API call in the frontend goes through this module.
//   - Reads NEXT_PUBLIC_API_URL from env (fallback: http://localhost:8000)
//   - Injects Authorization header from sessionStorage
//   - Handles 401 → redirect to login
//   - Provides typed request helpers so every page gets consistent error handling
//
// Never hardcode the base URL in a page file again.
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Localized error messages ─────────────────────────────────────────────────
// ponytail: static single-locale import — the catalog ships en only today;
// when locales beyond en land, swap this for a per-locale message registry
// (or a translator injected from the calling component).
import messages from "@/messages/en.json";

const ERROR_STATUS_KEYS: Record<number, string> = {
  400: "http400",
  401: "http401",
  403: "http403",
  404: "http404",
  409: "http409",
  413: "http413",
  422: "http422",
  429: "http429",
};

const errorsNs = (messages as Record<string, unknown>)
  .errors as Record<string, string> | undefined;

/** Catalog message for an HTTP status, or null when unmapped. */
export function localizedStatusMessage(status: number): string | null {
  const key = ERROR_STATUS_KEYS[status];
  if (key && errorsNs?.[key]) return errorsNs[key];
  if (status >= 500 && errorsNs?.http500) return errorsNs.http500;
  return null;
}

/** Parse response JSON or throw a structured error with status and preview. */
export async function safeJsonParse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Failed to parse response (${response.status}): ${text.slice(0, 200)}`,
    );
  }
}

/** Track if we are already refreshing to avoid infinite loops. */
let _refreshing = false;

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("mg_access_token");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("mg_refresh_token");
}

function storeTokens(access: string, refresh: string): void {
  sessionStorage.setItem("mg_access_token", access);
  sessionStorage.setItem("mg_refresh_token", refresh);
}

function clearTokens(): void {
  sessionStorage.removeItem("mg_access_token");
  sessionStorage.removeItem("mg_refresh_token");
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
    // Network error during refresh — do not clear tokens, caller may retry.
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
 * `[object Object]`.
 */
function parseApiErrorMessage(body: unknown, status: number): string {
  if (!body || typeof body !== "object") return `Request failed with status ${status}`;
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string") return b.message;
  if (typeof b.detail === "string") return b.detail;
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
 *
 * Precedence: 403 (admin-gated endpoint hit by a member JWT) → localized
 * "admin access required"; otherwise the server-provided detail (FastAPI
 * 422 field errors are far more specific than any status-level message);
 * then the localized status message from the errors.* catalog; then the
 * generic "Request failed with status N" text.
 *
 * # note: the task spec asked for "key → detail → generic", but the server
 * detail must win — existing tests pin `message: "Bad request"` passthrough
 * and 422 field flattening, and server details are strictly more useful.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.isForbidden) {
      return errorsNs?.adminAccessRequired ?? err.message;
    }
    const hasServerDetail = !/^Request failed with status \d+$/.test(
      err.message,
    );
    return hasServerDetail
      ? err.message
      : localizedStatusMessage(err.status) ?? err.message;
  }
  return fallback;
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string>),
  };

  let res = await fetch(url, {
    ...options,
    headers,
  });

  // 401 → attempt silent token refresh, then retry once
  if (res.status === 401 && !_refreshing) {
    _refreshing = true;
    try {
      const newToken = await refreshAccessToken();
      if (newToken) {
        // Retry the original request with the fresh token.
        headers["Authorization"] = `Bearer ${newToken}`;
        res = await fetch(url, {
          ...options,
          headers,
        });
      } else {
        // Refresh failed — nothing more to try.
        clearTokens();
        if (typeof window !== "undefined") {
          window.location.href = "/login?reason=not-signed-in";
        }
        throw new ApiError("Unauthorized", 401, null);
      }
    } finally {
      _refreshing = false;
    }
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
export function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

/** POST request */
export function post<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
}

/** PUT request */
export function put<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
}

/** PATCH request */
export function patch<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
}

/** DELETE request */
export function del<T = void>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
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

  // 401 → refresh & retry
  if (res.status === 401 && !_refreshing) {
    _refreshing = true;
    try {
      const newToken = await refreshAccessToken();
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`;
        res = await fetch(url, { method: "POST", headers, body: formData });
      } else {
        clearTokens();
        window.location.href = "/login?reason=not-signed-in";
        throw new ApiError("Unauthorized", 401, null);
      }
    } finally {
      _refreshing = false;
    }
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

/** POST /v1/auth/join — join an existing organization via its org code. */
export function join(data: JoinRequest): Promise<SignupResponse> {
  return post<SignupResponse>("/v1/auth/join", data);
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
  return post<InviteInfo>("/v1/auth/invites/info", { token });
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
  const tokens = await post<TokenPair>("/v1/auth/invites/accept", {
    token,
    password,
  });
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

/** GET /v1/auth/registration-status — PUBLIC; signup page gates on this. */
export function getRegistrationStatus(): Promise<RegistrationStatus> {
  return get<RegistrationStatus>("/v1/auth/registration-status");
}

// ─── Re-export base URL for edge cases ───────────────────────────────────────

export { API_BASE, getAccessToken, storeTokens, clearTokens, uploadWithBlobs };
