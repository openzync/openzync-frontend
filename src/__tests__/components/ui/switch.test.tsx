import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "@/components/ui/switch";

describe("Switch", () => {
  it("renders with role switch", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });
  it("shows checked state via aria-checked", () => {
    const { rerender } = render(<Switch checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    rerender(<Switch checked={true} onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
  it("calls onCheckedChange with toggled value on click", async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it("does not toggle when disabled", async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} disabled />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
  it("applies disabled styles", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} disabled />);
    expect(screen.getByRole("switch")).toHaveClass("opacity-50");
  });
  it("sets the id prop", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} id="my-switch" />);
    expect(screen.getByRole("switch")).toHaveAttribute("id", "my-switch");
  });
});
