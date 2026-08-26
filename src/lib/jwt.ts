/**
 * Minimal JWT payload reader — base64url-safe and fail-closed.
 *
 * JWT segments are base64URL (`-`/`_`, usually unpadded); plain `atob`
 * throws on those characters, and a payload without `exp` would otherwise
 * read as valid forever. Anything malformed returns null — callers must
 * treat null as expired/unusable.
 */

interface JwtPayload {
  exp?: unknown;
  sub?: unknown;
  [key: string]: unknown;
}

export function getJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const payload = JSON.parse(json) as JwtPayload;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export function getTokenExp(token: string | null): number | null {
  const exp = getJwtPayload(token)?.exp;
  return typeof exp === "number" ? exp : null;
}
