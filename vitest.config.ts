import { defineConfig } from "vitest/config";
import path from "path";
import fs from "node:fs";
import poParser from "po-parser";

/**
 * Mirrors the next-intl catalog loader (next.config.ts `experimental.messages`)
 * so tests can import `.po` catalogs exactly like app code does. Vitest runs
 * on Vite, not Next.js, so the webpack/turbopack loader never fires here.
 * `?raw` imports bypass this plugin and yield the plain PO text instead.
 */
function poCatalogLoader() {
  return {
    name: "po-catalog-loader",
    enforce: "pre",
    resolveId(id: string) {
      if (id.endsWith(".po") && !id.includes("?")) return id;
      return undefined;
    },
    load(id: string) {
      if (!id.endsWith(".po")) return undefined;
      const catalog = poParser.parse(fs.readFileSync(id, "utf8"));
      const messages: Record<string, unknown> = {};
      for (const msg of catalog.messages ?? []) {
        if (!msg.msgid) continue; // header entry
        const key = msg.msgctxt ? `${msg.msgctxt}.${msg.msgid}` : msg.msgid;
        setNested(messages, key, msg.msgstr);
      }
      return `export default ${JSON.stringify(messages)};`;
    },
  };
}

function setNested(
  root: Record<string, unknown>,
  key: string,
  value: string,
): void {
  const parts = key.split(".");
  let node = root;
  for (const part of parts.slice(0, -1)) {
    node[part] ??= {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
    css: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [poCatalogLoader()],
});
