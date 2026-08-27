import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordField } from "@/components/shared/password-field";

const defaultProps = {
  id: "test-password",
  label: "Password",
  value: "",
  onChange: vi.fn(),
  placeholder: "Enter password",
};

describe("PasswordField", () => {
  it("associates label with input via htmlFor/id", () => {
    render(<PasswordField {...defaultProps} />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("id", "test-password");
    expect(input).toHaveAttribute("type", "password");
  });

  it("calls onChange when typing", async () => {
    const onChange = vi.fn();
    render(<PasswordField {...defaultProps} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Password"), "x");
    expect(onChange).toHaveBeenCalledWith("x");
  });

  it("toggles visibility with aria-label and aria-pressed state", async () => {
    const user = userEvent.setup();
    render(<PasswordField {...defaultProps} />);

    const input = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(input).toHaveAttribute("type", "text");
  });

  it("supports controlled visibility shared across fields", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <PasswordField
        {...defaultProps}
        visible={false}
        onToggleVisibility={onToggle}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    // Parent flips the state — input follows.
    rerender(
      <PasswordField
        {...defaultProps}
        visible={true}
        onToggleVisibility={onToggle}
      />,
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  });

  it("wires hint and error to the input via aria-describedby", () => {
    render(<PasswordField {...defaultProps} hint="Min 8 chars" error="Too short" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      "test-password-hint test-password-error",
    );
    expect(screen.getByText("Too short")).toBeInTheDocument();
  });
});
