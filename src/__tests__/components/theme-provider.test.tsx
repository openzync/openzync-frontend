import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider";

// next-themes uses window.matchMedia internally
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("ThemeProvider", () => {
  it("renders children", () => {
    render(
      <ThemeProvider>
        <p>Hello Theme</p>
      </ThemeProvider>,
    );
    expect(screen.getByText("Hello Theme")).toBeInTheDocument();
  });

  it("accepts and forwards attribute prop", () => {
    render(
      <ThemeProvider attribute="class">
        <p>Theme with class attr</p>
      </ThemeProvider>,
    );
    expect(screen.getByText("Theme with class attr")).toBeInTheDocument();
  });

  it("accepts and forwards defaultTheme prop", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <p>Dark theme</p>
      </ThemeProvider>,
    );
    expect(screen.getByText("Dark theme")).toBeInTheDocument();
  });

  it("accepts and forwards enableSystem prop", () => {
    render(
      <ThemeProvider enableSystem={false}>
        <p>No system theme</p>
      </ThemeProvider>,
    );
    expect(screen.getByText("No system theme")).toBeInTheDocument();
  });

  it("passes through unknown props to next-themes provider", () => {
    render(
      <ThemeProvider storageKey="custom-key">
        <p>Custom storage</p>
      </ThemeProvider>,
    );
    expect(screen.getByText("Custom storage")).toBeInTheDocument();
  });
});
