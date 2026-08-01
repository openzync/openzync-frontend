import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, StatusBadge, ActorTypeBadge, statusCodeVariant, actorTypeVariant, actorTypeLabel } from "@/components/ui/badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
  it("applies variant class for success", () => {
    render(<Badge variant="success">OK</Badge>);
    expect(screen.getByText("OK")).toHaveClass("bg-success/10");
  });
  it("defaults to md size", () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText("Default")).toHaveClass("text-xs");
  });
});

describe("StatusBadge", () => {
  it("renders the status code", () => {
    render(<StatusBadge code={200} />);
    expect(screen.getByText("200")).toBeInTheDocument();
  });
  it('renders "—" for null', () => {
    render(<StatusBadge code={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
  it("applies success variant for 2xx", () => {
    render(<StatusBadge code={200} />);
    expect(screen.getByText("200")).toHaveClass("bg-success/10");
  });
  it("applies warning variant for 4xx", () => {
    render(<StatusBadge code={404} />);
    expect(screen.getByText("404")).toHaveClass("bg-warning/10");
  });
  it("applies error variant for 5xx", () => {
    render(<StatusBadge code={500} />);
    expect(screen.getByText("500")).toHaveClass("bg-error/10");
  });
});

describe("ActorTypeBadge", () => {
  it("renders label for user", () => {
    render(<ActorTypeBadge type="user" />);
    expect(screen.getByText("User")).toBeInTheDocument();
  });
  it("renders label for api_key", () => {
    render(<ActorTypeBadge type="api_key" />);
    expect(screen.getByText("API Key")).toBeInTheDocument();
  });
  it("renders System for null", () => {
    render(<ActorTypeBadge type={null} />);
    expect(screen.getByText("system")).toBeInTheDocument();
  });
});

describe("statusCodeVariant", () => {
  it("returns info for null", () => expect(statusCodeVariant(null)).toBe("info"));
  it("returns success for < 300", () => expect(statusCodeVariant(200)).toBe("success"));
  it("returns warning for < 500", () => expect(statusCodeVariant(404)).toBe("warning"));
  it("returns error for >= 500", () => expect(statusCodeVariant(500)).toBe("error"));
});

describe("actorTypeVariant", () => {
  it("returns default for null", () => expect(actorTypeVariant(null)).toBe("default"));
  it("returns default for system", () => expect(actorTypeVariant("system")).toBe("default"));
  it("returns brand for user", () => expect(actorTypeVariant("user")).toBe("brand"));
  it("returns info for api_key", () => expect(actorTypeVariant("api_key")).toBe("info"));
});

describe("actorTypeLabel", () => {
  it("returns system for null", () => expect(actorTypeLabel(null)).toBe("system"));
  it("returns User", () => expect(actorTypeLabel("user")).toBe("User"));
  it("returns API Key", () => expect(actorTypeLabel("api_key")).toBe("API Key"));
  it("returns raw value for unknown", () => expect(actorTypeLabel("bot")).toBe("bot"));
});
