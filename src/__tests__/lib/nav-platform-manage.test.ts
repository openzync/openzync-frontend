import { describe, it, expect } from "vitest";
import { NAV_SECTIONS, isVisible } from "@/lib/nav";

/**
 * Users-nav gating pins the backend contract: listing members requires
 * `platform:manage` (the admin role passes via wildcard), so the entry is
 * permission-gated — not adminOnly.
 */
describe("Users nav entry (platform:manage)", () => {
  const users = NAV_SECTIONS.find((s) => s.id === "admin")!.entries.find(
    (e) => e.href === "/users",
  )!;

  it("is permission-gated, not adminOnly", () => {
    expect(users.permission).toBe("platform:manage");
    expect(users.adminOnly).toBeUndefined();
  });

  it("is visible to a platform:manage holder", () => {
    expect(isVisible(users, (p) => p === "platform:manage", false)).toBe(true);
  });

  it("is visible to an admin (wildcard can())", () => {
    expect(isVisible(users, () => true, true)).toBe(true);
  });

  it("is hidden from a plain member", () => {
    expect(isVisible(users, () => false, false)).toBe(false);
  });
});
