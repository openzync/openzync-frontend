import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardLoading } from "@/components/shared/dashboard-loading";

describe("DashboardLoading", () => {
  it("renders an announced, skeleton-shaped first-paint placeholder", () => {
    const { container } = render(<DashboardLoading />);

    // Screen-reader announcement + aria-busy for assistive tech.
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute("aria-busy", "true");

    // PageHeader bar + 3 stat-card blocks + content block.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("Loading").parentElement?.querySelectorAll(".card-base").length).toBe(3);
  });
});
