import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumb } from "@/components/breadcrumb";

describe("Breadcrumb", () => {
  it("renders a single item", () => {
    render(<Breadcrumb items={[{ label: "Home", href: "/" }]} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
  it("renders multiple items with separators", () => {
    const items = [
      { label: "Home", href: "/" },
      { label: "Projects", href: "/projects" },
      { label: "Current" },
    ];
    render(<Breadcrumb items={items} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });
  it("renders last item as plain text (no link)", () => {
    render(<Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Page" }]} />);
    expect(screen.getByText("Page").tagName).toBe("SPAN");
  });
  it("renders non-last items as links", () => {
    render(<Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Page" }]} />);
    expect(screen.getByText("Home").tagName).toBe("A");
  });
  it("has aria-label for navigation", () => {
    render(<Breadcrumb items={[{ label: "Home" }]} />);
    expect(screen.getByLabelText("Breadcrumb")).toBeInTheDocument();
  });
  it("applies custom className", () => {
    const { container } = render(
      <Breadcrumb items={[{ label: "Home" }]} className="my-class" />,
    );
    expect(container.firstChild).toHaveClass("my-class");
  });
});
