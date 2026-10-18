import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Standalone output produces a self-contained server.js for Docker
   * deployment. NEXT_PUBLIC_API_URL defaults to "" (same-origin relative
   * URLs, proxied through nginx — see Dockerfile ARG). Set it explicitly
   * for cross-origin setups (local dev via .env.local, or a direct prod
   * URL e.g. https://app.openzync.tech). */
  output: "standalone",
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
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
