/** Ambient type for gettext PO catalogs imported through the next-intl
 *  catalog loader (next.config.ts `experimental.messages`), which decodes
 *  .po files into nested message objects at build time. */
declare module "*.po" {
  const messages: Record<string, unknown>;
  export default messages;
}

/** Vite `?raw` import of a .po file (tests only — parses the PO structure). */
declare module "*.po?raw" {
  const content: string;
  export default content;
}
