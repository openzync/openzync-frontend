"use client";

// Segment boundary for every dashboard page: a render error in one page no
// longer blanks the whole app — the layout and sidebar above stay mounted.
import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <AlertCircle size={28} className="text-error" />
      <h1 className="text-lg font-semibold text-text-primary">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-surface-400">
        An unexpected error occurred while loading this page.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" onClick={reset}>
          Try again
        </Button>
        <Link
          href="/overview"
          className="text-sm text-surface-300 underline-offset-4 hover:text-text-primary hover:underline"
        >
          Back to Overview
        </Link>
      </div>
    </div>
  );
}
