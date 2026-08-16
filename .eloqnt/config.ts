import { defineConfig } from "@eloqnt/cli";

export default defineConfig({
  // The folder containing your source code
  srcPath: "./src",

  // Where and how you store your messages
  messages: {
    path: "./src/messages",
    locales: "infer",
    sourceLocale: "en",
    format: "json",
  },

  lint: {
    // orphan-message is downgraded to a warning: the static extractor
    // reliably resolves only the first useTranslations translator per file
    // (and literal call sites inside it). Multi-component pages, translators
    // passed as props, and dynamic keys (t(RESET_TITLES.x), t(policy.label),
    // …) are false-flagged as orphans. `undefined-key` and
    // `missing-translation` stay errors — they catch real drift.
    rules: {
      "orphan-message": "warn",
    },
    overrides: [
      {
        // errors.* keys are resolved dynamically by status code in
        // src/lib/api-client.ts (localizedStatusMessage) — the static
        // extractor cannot see them.
        keys: ["errors.*"],
        rules: { "orphan-message": "off" },
      },
    ],
  },
});
