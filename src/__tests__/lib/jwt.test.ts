import { describe, it, expect } from "vitest";
import { getTokenExp, getJwtPayload } from "@/lib/jwt";

/** Build a JWT-shaped token: base64url (unpadded) payload segment. */
function makeToken(payload: object): string {
  const b64url = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${b64url}.signature`;
}

describe("getTokenExp", () => {
  it("returns exp for a valid token", () => {
    expect(getTokenExp(makeToken({ sub: "u1", exp: 1234567890 }))).toBe(
      1234567890,
    );
  });

  it("decodes base64url segments (- and _) that plain atob rejects", () => {
    // '???' encodes with '/' in standard base64 → '_' in base64url; the
    // stripped padding also exercises the re-pad path.
    const raw = btoa('{"exp":7,"n":"???"}');
    const seg = raw
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(seg).not.toBe(raw); // sanity: base64url chars actually exercised
    expect(getTokenExp(`h.${seg}.s`)).toBe(7);
  });

  it("returns null when exp is missing", () => {
    expect(getTokenExp(makeToken({ sub: "u1" }))).toBeNull();
  });

  it("returns null when exp is not a number", () => {
    expect(getTokenExp(makeToken({ exp: "soon" }))).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(getTokenExp(null)).toBeNull();
    expect(getTokenExp("")).toBeNull();
    expect(getTokenExp("not-a-jwt")).toBeNull();
  });

  it("returns null when the payload is not valid JSON", () => {
    const seg = btoa("not-json").replace(/=+$/, "");
    expect(getTokenExp(`h.${seg}.s`)).toBeNull();
  });
});

describe("getJwtPayload", () => {
  it("exposes claims like sub for callers that need more than exp", () => {
    expect(getJwtPayload(makeToken({ sub: "abc-123" }))?.sub).toBe("abc-123");
  });

  it("returns null for a JSON-primitive payload", () => {
    const seg = btoa("42").replace(/=+$/, "");
    expect(getJwtPayload(`h.${seg}.s`)).toBeNull();
  });
});
