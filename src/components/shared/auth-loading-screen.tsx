"use client";

/**
 * Full-page loading overlay displayed while authentication state is being checked.
 * Prevents any dashboard UI from flashing before auth is confirmed.
 *
 * Renders nothing after mount — the parent (RequireAuth) unmounts this
 * once the auth decision is made.
 */

export function AuthLoadingScreen({
  onRetry,
  offline = false,
}: {
  onRetry?: () => void;
  offline?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-surface-950">
      {/* Animated background glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/5 blur-3xl" />
        <div className="absolute left-1/3 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-accent-500/3 blur-3xl" />
      </div>

      {/* Logo */}
      <div className="relative mb-6">
        <img src="/favicon.svg" alt="OpenZync" className="h-16 w-16" />
      </div>

      {/* Brand name */}
      <h1 className="font-display relative text-2xl font-medium text-text-primary mb-1">
        OpenZync
      </h1>
      <p className="relative text-sm text-surface-500 mb-10">
        Agent Memory Infrastructure
      </p>

      {/* Spinner */}
      <div className="relative flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-surface-700 border-t-brand-500" />
        <span className="text-sm text-surface-500">Loading your workspace&hellip;</span>
      </div>

      {/* Refresh-failure retry — shown only when the auth gate could not
          refresh the session (5xx/offline). Stays on the loading screen so
          an expired token never enters the dashboard shell. */}
      {onRetry && (
        <div className="relative mt-8 flex flex-col items-center gap-3">
          <p className="text-sm text-surface-400">
            {offline
              ? "You appear to be offline — check your connection and try again."
              : "Could not refresh your session — please try again."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="h-9 rounded-md bg-surface-800 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
