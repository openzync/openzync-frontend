import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "@/components/ui/spinner";

describe("Spinner", () => {
  it("renders an SVG", () => {
    render(<Spinner />);
    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
  it("uses default size 16", () => {
    render(<Spinner />);
    const svg = document.querySelector("svg");
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("height", "16");
  });
  it("accepts a custom size", () => {
    render(<Spinner size={24} />);
    const svg = document.querySelector("svg");
    expect(svg).toHaveAttribute("width", "24");
  });
  it("applies custom className", () => {
    render(<Spinner className="text-red-500" />);
    const svg = document.querySelector("svg");
    expect(svg).toHaveClass("text-red-500");
  });
});
