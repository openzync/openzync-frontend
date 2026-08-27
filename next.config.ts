import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Standalone output produces a self-contained server.js for Docker
   * deployment. NEXT_PUBLIC_API_URL defaults to http://localhost:8000 for
   * local dev (see src/lib/api-client.ts); production builds MUST set it
   * explicitly (e.g. https://app.openzync.tech) — there is no
   * nginx-relative default. */
  output: "standalone",
};
module.exports = {
  allowedDevOrigins: ['192.168.0.109'],
}

export default nextConfig;
