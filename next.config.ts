import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Standalone output produces a self-contained server.js for Docker
   * deployment. NEXT_PUBLIC_API_URL defaults to "" (same-origin relative
   * URLs, proxied through nginx — see Dockerfile ARG). Set it explicitly
   * for cross-origin setups (local dev via .env.local, or a direct prod
   * URL e.g. https://app.openzync.tech). */
  output: "standalone",
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
  async headers() {
    // Clickjacking / context hardening. Tokens stay in localStorage for now
    // (httpOnly-cookie migration is a backend change, out of scope) — these
    // headers shrink what an injected script or framing page can do with them.
    // CSP is deliberately narrow (no script-/style-src): Next.js inline
    // runtime would break under a naive `default-src 'self'`.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "base-uri 'self'; frame-ancestors 'self'; object-src 'none'; form-action 'self'",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/projects/:id/memory",
        destination: "/projects/:id/playground",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
