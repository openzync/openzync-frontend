import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AreaChart, BarChart, LineChart } from "@/components/shared/charts";

// jsdom has no ResizeObserver — stub it to report a fixed width so charts
// render their SVG synchronously after mount.
class MockResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe() {
    this.cb(
      [{ contentRect: { width: 600 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  disconnect() {}
  unobserve() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const AREA_DATA = [
  { date: "2025-07-01", value: 10 },
  { date: "2025-07-02", value: 20 },
  { date: "2025-07-03", value: 15 },
];

describe("charts", () => {
  it("AreaChart renders an svg with a summarising aria-label and no NaN paths", () => {
    const { container } = render(
      <AreaChart data={AREA_DATA} dataKey="value" color="--color-brand-500" label="Episodes" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("role", "img");
    expect(svg?.getAttribute("aria-label")).toMatch(/Episodes trend, 3 points/);

    for (const path of container.querySelectorAll("path")) {
      expect(path.getAttribute("d") ?? "").not.toContain("NaN");
    }
  });

  it("BarChart renders series labels in its aria-label", () => {
    const { container } = render(
      <BarChart
        data={[{ m: 5, s: 2 }, { m: 8, s: 3 }]}
        dates={["2025-07-01", "2025-07-02"]}
        series={[
          { label: "Messages", color: "--color-brand-500", value: (p) => p.m },
          { label: "Sessions", color: "--color-accent-300", value: (p) => p.s },
        ]}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("aria-label")).toMatch(/Messages and Sessions chart, 2 points/);
  });

  it("LineChart renders an svg with an aria-label", () => {
    const { container } = render(
      <LineChart
        lines={[
          { label: "p50", color: "--color-success", data: [{ x: "2025-07-01", y: 1 }, { x: "2025-07-02", y: 4 }] },
        ]}
      />,
    );
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toMatch(/p50 chart, 2 points/);
  });

  it("ArrowRight on a focused chart moves the active point and shows the tooltip", () => {
    render(
      <AreaChart data={AREA_DATA} dataKey="value" color="--color-brand-500" label="Episodes" />,
    );

    // No tooltip before interaction.
    expect(screen.queryByText(/Episodes:/)).not.toBeInTheDocument();

    const svg = document.querySelector("svg") as SVGSVGElement;
    svg.focus();
    fireEvent.keyDown(svg, { key: "ArrowRight" });

    // Tooltip appears for the first point (index 0). Scope to the tooltip —
    // the x-axis <text> labels carry the same abbreviated dates.
    expect(screen.getByText(/Episodes:/)).toBeInTheDocument();
    const tooltip = document.querySelector(".animate-fade-in") as HTMLElement;
    expect(within(tooltip).getByText(/Jul 1/)).toBeInTheDocument();

    // ArrowRight advances to the second point.
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(within(document.querySelector(".animate-fade-in") as HTMLElement).getByText(/Jul 2/)).toBeInTheDocument();

    // Escape hides the tooltip.
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(screen.queryByText(/Episodes:/)).not.toBeInTheDocument();
  });
});
