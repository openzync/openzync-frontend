"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Languages } from "lucide-react";
import { patch } from "@/lib/api-client";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  locales,
} from "@/i18n/config";

/**
 * Language switcher for the dashboard shell.
 * Writes the OZ_LOCALE cookie (client-side, mirrors the middleware format),
 * fire-and-forgets the server-side preference (PATCH /v1/auth/me), then
 * refreshes so the server re-renders with the new locale.
 *
 * The PATCH failure is deliberately swallowed — the cookie is the source of
 * truth for this session; the server preference only matters for future
 * sessions and can be retried then.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const selectLocale = (next: string) => {
    if (next === locale) return;
    // Mirrors the middleware cookie shape; secure only in prod (browsers drop
    // secure cookies on plain http://localhost dev). NODE_ENV is build-inlined.
    const secure = process.env.NODE_ENV === "production" ? "; secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
    // Fire-and-forget server-side persistence — the cookie still applies.
    patch("/v1/auth/me", { locale: next }).catch((err) => {
      console.warn("Failed to persist locale preference", err);
    });
    router.refresh();
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        className="flex items-center gap-1.5 rounded-md border border-surface-800 bg-surface-900 px-2.5 py-1.5 text-xs text-surface-300 hover:bg-surface-800 hover:text-text-primary transition-colors"
      >
        <Languages size={14} className="text-surface-400" />
        <span className="uppercase font-medium tracking-wide">{locale}</span>
        <ChevronDown size={12} className="text-surface-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            aria-label={t("language")}
            className="absolute end-0 top-full mt-1 z-20 w-40 rounded-lg border border-surface-800 bg-surface-900 p-1 shadow-lg shadow-black/30"
          >
            {locales.map((l) => (
              <li key={l}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l === locale}
                  onClick={() => {
                    setOpen(false);
                    selectLocale(l);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-surface-200 hover:bg-surface-800"
                >
                  {LOCALE_LABELS[l] ?? l}
                  {l === locale && <span className="text-brand-300">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
