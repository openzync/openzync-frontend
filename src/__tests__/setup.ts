import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.po";

const renderWithProvider = (ui: React.ReactElement) =>
  React.createElement(
    NextIntlClientProvider,
    {
      locale: "en",
      messages,
      children: ui,
    } as React.ComponentProps<typeof NextIntlClientProvider>,
  );

/**
 * Global test render wrapper: every `render()` in the suite gets a
 * NextIntlClientProvider so components using useTranslations/useFormatter
 * work without per-file boilerplate. Locale is fixed to en; the catalog is
 * the real en.po catalog, so extracted strings are asserted verbatim in tests.
 *
 * `rerender` is wrapped too — RTL's default re-renders into the same
 * container, which would drop the provider and change the tree root (tests
 * that assert state survives a re-render depend on a stable root type).
 */
vi.mock("@testing-library/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@testing-library/react")>();
  return {
    ...actual,
    render: (
      ui: React.ReactElement,
      options?: Parameters<typeof actual.render>[1],
    ) => {
      const result = actual.render(renderWithProvider(ui), options);
      return {
        ...result,
        rerender: (nextUi: React.ReactElement) =>
          result.rerender(renderWithProvider(nextUi)),
      };
    },
  };
});
