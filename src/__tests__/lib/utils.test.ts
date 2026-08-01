import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cn,
  timeAgo,
  formatDate,
  smartTimestamp,
  truncateId,
  copyToClipboard,
  actionLabel,
  formatNumber,
  formatFileSize,
  mimeToIcon,
} from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });
  it("handles Tailwind conflicts", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
  });
  it("filters falsy values", () => {
    expect(cn("foo", false, null, undefined, 0, "bar")).toBe("foo bar");
  });
  it("accepts array and object inputs", () => {
    expect(cn(["foo", "bar"], { baz: true })).toBe("foo bar baz");
  });
  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});

describe("timeAgo", () => {
  it('returns "—" for null/undefined', () => {
    expect(timeAgo(null)).toBe("—");
    expect(timeAgo(undefined)).toBe("—");
  });
  it('returns "just now" for < 5s', () => {
    expect(timeAgo(new Date().toISOString())).toBe("just now");
  });
  it('returns "Xs ago" for < 60s', () => {
    const d = new Date(Date.now() - 30_000).toISOString();
    expect(timeAgo(d)).toBe("30s ago");
  });
  it('returns "Xm ago" for < 60min', () => {
    const d = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(timeAgo(d)).toBe("5m ago");
  });
  it('returns "Xh ago" for < 24h', () => {
    const d = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(timeAgo(d)).toBe("3h ago");
  });
  it('returns "Xd ago" for >= 24h', () => {
    const d = new Date(Date.now() - 2 * 86400_000).toISOString();
    expect(timeAgo(d)).toBe("2d ago");
  });
});

describe("formatDate", () => {
  it('returns "—" for null/undefined', () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
  it("formats a date string", () => {
    const result = formatDate("2025-04-15T12:00:00Z");
    expect(result).toContain("Apr");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });
  it("includes time when withTime is true", () => {
    const result = formatDate("2025-04-15T12:00:00Z", true);
    expect(result).toContain("Apr");
  });
});

describe("smartTimestamp", () => {
  it('returns "just now" for < 1 min', () => {
    expect(smartTimestamp(new Date().toISOString())).toBe("just now");
  });
  it('returns "Xm ago" for < 60 min', () => {
    const d = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(smartTimestamp(d)).toBe("10m ago");
  });
});

describe("truncateId", () => {
  it('returns "—" for null/undefined', () => {
    expect(truncateId(null)).toBe("—");
    expect(truncateId(undefined)).toBe("—");
  });
  it("truncates long IDs", () => {
    expect(truncateId("1234567890abcdef")).toBe("12345678");
  });
  it("returns full ID if shorter than chars", () => {
    expect(truncateId("abc", 8)).toBe("abc");
  });
  it("uses default 8 chars", () => {
    expect(truncateId("abcdefghij")).toBe("abcdefgh");
  });
});

describe("copyToClipboard", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  it("copies text and returns true", async () => {
    const result = await copyToClipboard("hello");
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
  });
  it("returns false on error", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("fail")) },
    });
    const result = await copyToClipboard("hello");
    expect(result).toBe(false);
  });
});

describe("actionLabel", () => {
  it("returns known labels", () => {
    expect(actionLabel("session.create")).toBe("Session created");
    expect(actionLabel("auth.login")).toBe("User logged in");
  });
  it("falls back to formatted action for unknown keys", () => {
    expect(actionLabel("foo.bar_baz")).toBe("Foo.Bar Baz");
  });
});

describe("formatNumber", () => {
  it('returns "—" for null/undefined', () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
  });
  it("formats numbers with locale separators", () => {
    expect(formatNumber(1234)).toBe("1,234");
  });
});

describe("formatFileSize", () => {
  it('returns "0 B" for 0', () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });
  it("formats KB", () => {
    expect(formatFileSize(2048)).toBe("2 KB");
  });
  it("formats MB", () => {
    expect(formatFileSize(5_242_880)).toBe("5 MB");
  });
});

describe("mimeToIcon", () => {
  it("maps image/*", () => expect(mimeToIcon("image/png")).toBe("FileImage"));
  it("maps application/pdf", () => expect(mimeToIcon("application/pdf")).toBe("FilePdf"));
  it("maps text/*", () => expect(mimeToIcon("text/plain")).toBe("FileText"));
  it("maps spreadsheet", () => expect(mimeToIcon("application/vnd.ms-excel")).toBe("FileSpreadsheet"));
  it("maps presentation", () => expect(mimeToIcon("application/vnd.ms-powerpoint")).toBe("FilePresentation"));
  it("maps archives", () => {
    expect(mimeToIcon("application/zip")).toBe("FileArchive");
    expect(mimeToIcon("application/x-tar")).toBe("FileArchive");
  });
  it("defaults to File", () => expect(mimeToIcon("video/mp4")).toBe("File"));
});
