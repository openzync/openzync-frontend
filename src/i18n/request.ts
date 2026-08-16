import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, isSupportedLocale, LOCALE_COOKIE } from "./config";

type Messages = Record<string, unknown>;

/**
 * Load the catalog for a locale through the next-intl catalog loader
 * (next.config.ts `experimental.messages`), which decodes .po files into
 * nested message objects at build time. Missing catalogs fall back to the
 * default locale — the loader can't know at build time which locales ship.
 */
async function loadCatalog(locale: string): Promise<Messages> {
  try {
    return (await import(`../messages/${locale}.po`)).default as Messages;
  } catch {
    return (await import(`../messages/${defaultLocale}.po`)).default as Messages;
  }
}

/**
 * Resolve the locale for the current request from the OZ_LOCALE cookie
 * (set by middleware from Accept-Language, and by the language switcher).
 * Invalid/missing values fall back to the default locale.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: await loadCatalog(locale),
  };
});
