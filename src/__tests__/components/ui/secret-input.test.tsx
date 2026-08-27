import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecretInput } from "@/components/ui/secret-input";

const defaultProps = {
  label: "API Key",
  value: "",
  onChange: vi.fn(),
  placeholder: "Enter secret",
  visible: false,
  onToggleVisibility: vi.fn(),
};

describe("SecretInput", () => {
  it("renders label", () => {
    render(<SecretInput {...defaultProps} />);
    expect(screen.getByText("API Key")).toBeInTheDocument();
  });
  it('shows "Required" badge when empty', () => {
    render(<SecretInput {...defaultProps} value="" />);
    expect(screen.getByText("Required")).toBeInTheDocument();
  });
  it('hides "Required" badge when value is set', () => {
    render(<SecretInput {...defaultProps} value="sk-123" />);
    expect(screen.queryByText("Required")).not.toBeInTheDocument();
  });
  it("renders password input type when not visible", () => {
    render(<SecretInput {...defaultProps} visible={false} />);
    expect(screen.getByPlaceholderText("Enter secret")).toHaveAttribute("type", "password");
  });
  it("renders text input type when visible", () => {
    render(<SecretInput {...defaultProps} visible={true} />);
    expect(screen.getByPlaceholderText("Enter secret")).toHaveAttribute("type", "text");
  });
  it("calls onChange when typing", async () => {
    const onChange = vi.fn();
    render(<SecretInput {...defaultProps} onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText("Enter secret"), "x");
    expect(onChange).toHaveBeenCalledWith("x");
  });
  it("calls onToggleVisibility when eye button is clicked", async () => {
    const onToggle = vi.fn();
    render(<SecretInput {...defaultProps} onToggleVisibility={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
  it("associates label with input when id is provided", () => {
    render(<SecretInput {...defaultProps} id="llm-key" />);
    // Label text includes the nested "Required" badge, hence the regex.
    expect(screen.getByLabelText(/API Key/)).toHaveAttribute("id", "llm-key");
  });
});
