"use client";

import { useEffect, useState } from "react";

export function AppVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${base}/v1/health`)
      .then((r) => r.json())
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
