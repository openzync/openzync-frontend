// ═══════════════════════════════════════════════════════════════════════════════
// OpenZync — i18n configuration
//
// Single source of truth for supported locales, the locale cookie, and
// locale-aware helpers. Adding a new locale is data-only: append it to
// `locales` and drop a `<locale>.json` catalog next to en.json.
// ═══════════════════════════════════════════════════════════════════════════════

export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie name — read by middleware (Accept-Language negotiation), the request
 *  config (server-side resolution) and the language switcher (client write). */
export const LOCALE_COOKIE = "OZ_LOCALE";

/** ~1 year — long enough that negotiation only happens on the first visit. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Human-readable labels for the language switcher dropdown. */
export const LOCALE_LABELS: Record<string, string> = {
  en: "English",
};

/** BCP-47 RTL script locales — extend when N locales beyond en arrive. */
const RTL_LOCALES = new Set(["ar", "fa", "he", "ur", "ps"]);

export function isSupportedLocale(
  value: string | undefined | null,
): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function getLocaleDir(locale: string): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/**
 * Pick the first supported locale from an Accept-Language header
 * ("en-US,en;q=0.9,fr;q=0.8" → "en"), falling back to the default.
 * `en-US` is reduced to its language subtag `en` before matching.
 */
export function negotiateLocale(
  acceptLanguage: string | null | undefined,
): Locale {
  if (!acceptLanguage) return defaultLocale;
  for (const part of acceptLanguage.split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (!tag) continue;
    const lang = tag.split("-")[0]!.toLowerCase();
    if (isSupportedLocale(lang)) return lang;
  }
  return defaultLocale;
}
