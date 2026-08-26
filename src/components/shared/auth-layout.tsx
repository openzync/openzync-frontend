import type { ReactNode } from "react";

// ─── Marketing claims — single source of truth ─────────────────────────────────
// Every auth page renders its brand-panel copy from this object so the numbers
// can never drift apart again (they previously contradicted each other:
// "3" vs "10+" Graph Backends). The backend's org config actually supports
// postgres | surrealdb | none — no honest count, hence the count-free claim.

export const AUTH_CLAIMS = {
  tagline: "Persistent Agent Memory Infrastructure",
  mobileTagline: "Agent Memory Infrastructure",
  stats: [
    { value: "Pluggable", label: "Graph Backends" },
    { value: "5", label: "LLM Providers" },
    { value: "∞", label: "Scale" },
  ],
  features: [
    "Persistent, queryable agent memory",
    "Multi-provider LLM support (BYOK)",
    "Knowledge graph with hybrid search",
    "Async enrichment pipeline",
  ],
} as const;

// ─── Layout ────────────────────────────────────────────────────────────────────

type BrandVariant = "stats" | "features" | "plain";

interface AuthLayoutProps {
  children: ReactNode;
  /** Left brand panel body: stat row, feature list, or tagline only. */
  variant?: BrandVariant;
  /** Overrides the default brand tagline for this page. */
  tagline?: string;
  /** Show the mobile-only brand block above the card (default true). */
  mobileBrand?: boolean;
}

/**
 * Shared shell for all auth pages: gradient brand panel on the left,
 * centered form column on the right. Keeps the marketing claims and the
 * visual treatment identical across login/signup/recovery flows.
 */
export function AuthLayout({
  children,
  variant = "stats",
  tagline = AUTH_CLAIMS.tagline,
  mobileBrand = true,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-brand-500 to-surface-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_50%,rgba(143,175,217,0.08)_0%,transparent_50%),radial-gradient(circle_at_25%_30%,rgba(20,72,140,0.12)_0%,transparent_50%)]" />
        <div className="relative z-10 text-center px-8">
          <h1 className="text-5xl font-extrabold text-text-primary tracking-tight mb-2">
            OpenZync
          </h1>
          {variant === "stats" ? (
            <>
              <p className="text-lg text-surface-300 max-w-sm mx-auto">{tagline}</p>
              <div className="mt-8 flex gap-6 justify-center">
                {AUTH_CLAIMS.stats.map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-3xl font-bold text-accent-300">{stat.value}</div>
                    <div className="text-xs text-surface-500 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-lg text-surface-300 max-w-sm mx-auto mb-8">{tagline}</p>
              {variant === "features" && (
                <div className="text-left max-w-xs mx-auto space-y-3">
                  {AUTH_CLAIMS.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2.5">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-accent-300 shrink-0" />
                      <span className="text-sm text-surface-300">{feature}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          {mobileBrand && (
            <div className="md:hidden text-center mb-8">
              <h1 className="text-2xl font-extrabold text-brand-500">OpenZync</h1>
              <p className="text-xs text-surface-400">{AUTH_CLAIMS.mobileTagline}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
