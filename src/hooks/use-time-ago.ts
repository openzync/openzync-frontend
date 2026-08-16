"use client";

import { useTranslations } from "next-intl";

/**
 * Locale-aware relative time ("3m ago", "2h ago", "just now").
 * Catalog-backed so pluralization and phrasing are localizable; keeps the
 * compact single-letter-unit style of the legacy utils.timeAgo helper.
 */
export function useTimeAgo(): (dateStr: string | null | undefined) => string {
  const t = useTranslations("common.timeAgo");

  return (dateStr: string | null | undefined): string => {
    if (!dateStr) return "—";
    const seconds = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 1000,
    );
    if (seconds < 5) return t("now");
    if (seconds < 60) return t("seconds", { count: seconds });
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return t("minutes", { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("hours", { count: hrs });
    return t("days", { count: Math.floor(hrs / 24) });
  };
}
