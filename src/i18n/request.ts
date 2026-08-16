import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, isSupportedLocale, LOCALE_COOKIE } from "./config";
// ponytail: single-locale static import — when locales beyond en arrive,
// swap this for a per-locale map (import.meta.glob or a records object).
import messages from "../messages/en.json";

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
    messages,
  };
});
