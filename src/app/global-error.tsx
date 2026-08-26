"use client";

// Root-level boundary — catches errors the segment boundaries cannot,
// including throws in the root layout itself. Next.js contract: global-error
// must render its own <html>/<body>, so globals.css is imported here too.
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import "./globals.css";

export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-surface-950 text-text-primary">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-surface-400">
            An unexpected error occurred. Please try again.
          </p>
          <Button size="sm" onClick={reset} className="mt-2">
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
