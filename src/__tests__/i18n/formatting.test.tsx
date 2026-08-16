import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useTimeAgo } from "@/hooks/use-time-ago";
import {
  negotiateLocale,
  getLocaleDir,
  isSupportedLocale,
  locales,
  defaultLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
} from "@/i18n/config";

function TimeAgoProbe({ date }: { date: string | null }) {
  const timeAgo = useTimeAgo();
  return <div data-testid="probe">{timeAgo(date)}</div>;
}

describe("useTimeAgo (localized relative time)", () => {
  it('returns "—" for null', () => {
    render(<TimeAgoProbe date={null} />);
    expect(screen.getByTestId("probe").textContent).toBe("—");
  });

  it('returns "just now" for < 5s', () => {
    render(<TimeAgoProbe date={new Date().toISOString()} />);
    expect(screen.getByTestId("probe").textContent).toBe("just now");
  });

  it('returns "Xs ago" for < 60s', () => {
    const d = new Date(Date.now() - 30_000).toISOString();
    render(<TimeAgoProbe date={d} />);
    expect(screen.getByTestId("probe").textContent).toBe("30s ago");
  });

  it('returns "Xm ago" for < 60min', () => {
    const d = new Date(Date.now() - 5 * 60_000).toISOString();
    render(<TimeAgoProbe date={d} />);
    expect(screen.getByTestId("probe").textContent).toBe("5m ago");
  });

  it('returns "Xh ago" for < 24h', () => {
    const d = new Date(Date.now() - 3 * 3600_000).toISOString();
    render(<TimeAgoProbe date={d} />);
    expect(screen.getByTestId("probe").textContent).toBe("3h ago");
  });

  it('returns "Xd ago" for >= 24h', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00Z"));
    const d = new Date(Date.now() - 2 * 86400_000).toISOString();
    render(<TimeAgoProbe date={d} />);
    expect(screen.getByTestId("probe").textContent).toBe("2d ago");
    vi.useRealTimers();
  });
});

describe("locale negotiation (middleware)", () => {
  it("falls back to default locale when the header is empty", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
  });

  it("reduces region tags to the language subtag", () => {
    expect(negotiateLocale("en-US,en;q=0.9")).toBe("en");
  });

  it("picks the first supported locale in preference order", () => {
    expect(negotiateLocale("fr-FR,fr;q=0.9,en;q=0.8")).toBe("en");
  });

  it("falls back to default when no supported locale is present", () => {
    expect(negotiateLocale("de-DE,de;q=0.9")).toBe("en");
  });
});

describe("locale helpers", () => {
  it("validates cookie values", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
  });

  it("returns ltr for en and rtl for RTL-script locales", () => {
    expect(getLocaleDir("en")).toBe("ltr");
    expect(getLocaleDir("ar")).toBe("rtl");
    expect(getLocaleDir("he")).toBe("rtl");
  });
});

describe("i18n config constants", () => {
  it("ships en and hi with en as the default", () => {
    expect(locales).toEqual(["en", "hi"]);
    expect(defaultLocale).toBe("en");
  });

  it("exposes the OZ_LOCALE cookie contract used by middleware + switcher", () => {
    expect(LOCALE_COOKIE).toBe("OZ_LOCALE");
    expect(LOCALE_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });

  it("labels every supported locale — switcher options stay data-driven", () => {
    for (const locale of locales) {
      expect(LOCALE_LABELS[locale]).toBeTypeOf("string");
      expect(LOCALE_LABELS[locale].length).toBeGreaterThan(0);
    }
  });
});
