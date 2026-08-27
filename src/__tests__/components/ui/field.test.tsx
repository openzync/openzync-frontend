import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "@/components/ui/field";

describe("Field", () => {
  it("associates label htmlFor with child input id", () => {
    render(
      <Field label="Email" htmlFor="email">
        <input id="email" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "email");
    expect(screen.getByText("Email")).toHaveAttribute("for", "email");
  });

  it("shows required marker", () => {
    render(
      <Field label="Name" htmlFor="name" required>
        <input id="name" />
      </Field>,
    );
    // Visible asterisk + sr-only "(required)" text inside the label
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });

  it("renders hint and wires aria-describedby", () => {
    render(
      <Field label="Slug" htmlFor="slug" hint="Lowercase letters and dashes">
        <input id="slug" />
      </Field>,
    );
    expect(screen.getByText("Lowercase letters and dashes")).toHaveAttribute(
      "id",
      "slug-hint",
    );
    expect(screen.getByLabelText("Slug")).toHaveAttribute(
      "aria-describedby",
      "slug-hint",
    );
  });

  it("renders error with role=alert, sets aria-invalid, describedby includes both ids", () => {
    render(
      <Field label="URL" htmlFor="url" hint="https://…" error="Invalid URL">
        <input id="url" />
      </Field>,
    );
    expect(screen.getByRole("alert")).toHaveAttribute("id", "url-error");
    const input = screen.getByLabelText("URL");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("url-hint");
    expect(input.getAttribute("aria-describedby")).toContain("url-error");
  });

  it("does not set aria attributes when no hint/error", () => {
    render(
      <Field label="Plain" htmlFor="plain">
        <input id="plain" />
      </Field>,
    );
    expect(screen.getByLabelText("Plain")).not.toHaveAttribute(
      "aria-describedby",
    );
    expect(screen.getByLabelText("Plain")).not.toHaveAttribute("aria-invalid");
  });

  it("respects child-provided aria-describedby over injected one", () => {
    render(
      <Field label="Custom" htmlFor="custom" hint="hint text">
        <input id="custom" aria-describedby="external-id" />
      </Field>,
    );
    expect(screen.getByLabelText("Custom")).toHaveAttribute(
      "aria-describedby",
      "external-id",
    );
  });
});
