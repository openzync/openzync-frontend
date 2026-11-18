"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api-client";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    // First-run boot: a fresh platform with no root user lands on /setup.
    // Plain fetch, no auth headers — /ready is public. Parse-first: a 503
    // with a JSON body is the needs-setup signal, so parse regardless of
    // status. Network throw or non-JSON body → null → normal boot path.
    fetch(`${API_BASE}/ready`)
      .then((res) => res.json().catch(() => null))
      .then((body) => {
        if (cancelled) return;
        const needsSetup =
          !!body &&
          typeof body === "object" &&
          ((body as { needs_setup?: boolean }).needs_setup === true ||
            (body as { degraded?: { platform_seed?: boolean } | null }).degraded
              ?.platform_seed === true);
        router.replace(needsSetup ? "/setup" : "/overview");
      })
      .catch(() => {
        if (!cancelled) router.replace("/overview");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
