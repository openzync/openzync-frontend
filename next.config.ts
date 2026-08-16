import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* Standalone output produces a self-contained server.js for Docker
   * deployment.  NEXT_PUBLIC_API_URL defaults to "" (relative URLs),
   * meaning the frontend makes requests like /v1/sessions that are
   * proxied to the API via nginx. */
  output: "standalone",
};

/* i18n: next-intl App Router integration. The plugin wires the request
 * config (src/i18n/request.ts) into the Next.js compilation pipeline. */
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
