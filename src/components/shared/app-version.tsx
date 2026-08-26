"use client";

import { useEffect, useState } from "react";
import { get } from "@/lib/api-client";

export function AppVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    // Decorative footer badge: hiding it when /health is unreachable is the
    // designed empty state — no retry loop for a non-critical label.
    get<{ version: string }>("/v1/health")
      .then((d) => setVersion(d.version))
      .catch(() => setVersion(null));
  }, []);

  if (!version) return null;

  return (
    <div className="px-3 py-1.5 text-[10px] text-surface-500 text-center select-none">
      v{version}
    </div>
  );
}
