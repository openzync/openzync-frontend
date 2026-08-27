import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Progress } from "@/components/ui/progress";

describe("Progress", () => {
  it("renders determinate bar with tinted indicator", () => {
    const { container } = render(
      <Progress value={40} className="bg-success" aria-label="Upload" />,
    );
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it("renders indeterminate when value is null", () => {
    const { container } = render(<Progress value={null} aria-label="Loading" />);
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });
});
