import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { LOCALE_COOKIE, LOCALE_LABELS, locales } from "@/i18n/config";

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));
const { mockPatch } = vi.hoisted(() => ({ mockPatch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/lib/api-client", () => ({
  patch: (...args: unknown[]) => mockPatch(...args),
}));

/**
 * Render the switcher with an innermost provider whose locale is NOT in the
 * catalog (locales = ["en"]). The switcher then sees locale="fr" while the
 * only option is "en" — exercising the cookie/PATCH/refresh path that the
 * default en-only setup can never reach (clicking the current locale is a
 * no-op by design).
 */
function renderAs(locale: string) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LanguageSwitcher />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockRefresh.mockClear();
  mockPatch.mockClear();
  document.cookie = `${LOCALE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LanguageSwitcher", () => {
  it("renders the current locale label on the trigger", () => {
    renderAs("en");
    // The trigger renders the raw locale; uppercase is applied via CSS only.
    expect(screen.getByRole("button", { name: "Language" })).toHaveTextContent(
      "en",
    );
  });

  it("renders one option per configured locale, labeled from config (data-driven)", async () => {
    const user = userEvent.setup();
    renderAs("en");
    await user.click(screen.getByRole("button", { name: "Language" }));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(locales.length);
    for (const locale of locales) {
      // The selected option appends a ✓ to its accessible name.
      expect(screen.getByRole("option", { name: new RegExp(LOCALE_LABELS[locale]) })).toBeInTheDocument();
    }
  });

  it("selecting a different locale writes the cookie, PATCHes the preference, and refreshes", async () => {
    const user = userEvent.setup();
    // Switcher locale "fr" ≠ the only option "en" — selection is a real change.
    renderAs("fr");
    mockPatch.mockResolvedValue({});

    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("option", { name: /English/ }));

    expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`);
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith("/v1/auth/me", { locale: "en" });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("PATCH failure is swallowed with a warning — the cookie still applies", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const user = userEvent.setup();
    renderAs("fr");
    mockPatch.mockRejectedValueOnce(new Error("network down"));

    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("option", { name: /English/ }));

    // Rejection must be handled (no unhandled rejection), warned, and the
    // session source of truth (cookie) still written, refresh still fired.
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Failed to persist locale preference");
  });

  it("selecting the current locale is a no-op — no cookie, PATCH, or refresh", async () => {
    const user = userEvent.setup();
    renderAs("en"); // setup provider locale — the only option equals it
    mockPatch.mockResolvedValue({});

    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("option", { name: /English/ }));

    expect(document.cookie).not.toContain(`${LOCALE_COOKIE}=en`);
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
