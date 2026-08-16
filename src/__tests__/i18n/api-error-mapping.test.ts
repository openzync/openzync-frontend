import { describe, it, expect } from "vitest";
import { ApiError, apiErrorMessage, localizedStatusMessage } from "@/lib/api-client";
import errors from "@/messages/en.po";

/**
 * Error-message resolution contract (src/lib/api-client.ts).
 *
 * # note: the written spec ordered the chain "key → server detail → generic",
 * but the implementation deliberately resolves server detail FIRST (existing
 * tests pin `message: "Bad request"` passthrough + 422 field flattening, and
 * server details are strictly more specific than a status-level message).
 * These tests assert the OBSERVED behavior; the discrepancy is flagged in the
 * test report.
 */
const errorsNs = (errors as Record<string, unknown>).errors as Record<
  string,
  string
>;

/** ApiError whose message is the generic fallback — i.e. no server detail. */
function generic(status: number, body: unknown = {}): ApiError {
  return new ApiError(`Request failed with status ${status}`, status, body);
}

describe("localizedStatusMessage (errors.* catalog)", () => {
  it("resolves known status codes to their catalog message", () => {
    expect(localizedStatusMessage(400)).toBe(errorsNs.http400);
    expect(localizedStatusMessage(401)).toBe(errorsNs.http401);
    expect(localizedStatusMessage(403)).toBe(errorsNs.http403);
    expect(localizedStatusMessage(404)).toBe(errorsNs.http404);
    expect(localizedStatusMessage(409)).toBe(errorsNs.http409);
    expect(localizedStatusMessage(422)).toBe(errorsNs.http422);
    expect(localizedStatusMessage(429)).toBe(errorsNs.http429);
  });

  it("falls back to http500 for any unmapped 5xx", () => {
    expect(localizedStatusMessage(500)).toBe(errorsNs.http500);
    expect(localizedStatusMessage(503)).toBe(errorsNs.http500);
  });

  it("returns null for unmapped non-5xx statuses", () => {
    expect(localizedStatusMessage(418)).toBeNull();
    expect(localizedStatusMessage(451)).toBeNull();
    expect(localizedStatusMessage(302)).toBeNull();
  });
});

describe("apiErrorMessage", () => {
  it("uses the errors.* catalog key when the ApiError has no server detail", () => {
    expect(apiErrorMessage(generic(400), "fb")).toBe(errorsNs.http400);
    expect(apiErrorMessage(generic(429), "fb")).toBe(errorsNs.http429);
    expect(apiErrorMessage(generic(503), "fb")).toBe(errorsNs.http500);
  });

  it("prefers the server-provided detail over the status-level catalog message", () => {
    const withDetail = new ApiError("Bad request", 400, { message: "Bad request" });
    expect(apiErrorMessage(withDetail, "fb")).toBe("Bad request");
  });

  it("maps 403 to the admin-access catalog message regardless of server detail", () => {
    expect(apiErrorMessage(generic(403), "fb")).toBe(errorsNs.adminAccessRequired);
    // Even a generic 403 (e.g. non-JSON body) resolves to the admin message.
    expect(apiErrorMessage(new ApiError("Forbidden", 403, null), "fb")).toBe(
      errorsNs.adminAccessRequired,
    );
  });

  it("falls back to the generic status message for unmapped statuses", () => {
    expect(apiErrorMessage(generic(418), "fb")).toBe(
      "Request failed with status 418",
    );
  });

  it("passes through the fallback for non-ApiError values", () => {
    expect(apiErrorMessage(new Error("boom"), "fallback-text")).toBe(
      "fallback-text",
    );
    expect(apiErrorMessage("string error", "fallback-text")).toBe(
      "fallback-text",
    );
    expect(apiErrorMessage(null, "fallback-text")).toBe("fallback-text");
  });
});
