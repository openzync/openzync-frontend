import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SimpleSelect,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// jsdom lacks the PointerEvent APIs Radix Select relies on
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const options = [
  { value: "pg", label: "PostgreSQL" },
  { value: "neo4j", label: "Neo4j" },
];

describe("SimpleSelect", () => {
  it("renders trigger with placeholder", () => {
    render(
      <SimpleSelect options={options} value="" onValueChange={() => {}} />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("opens, chooses an option, fires onValueChange", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SimpleSelect
        options={options}
        value=""
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Neo4j" }));
    expect(onValueChange).toHaveBeenCalledWith("neo4j");
  });

  it("shows selected value label", () => {
    render(
      <SimpleSelect
        options={options}
        value="pg"
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("PostgreSQL");
  });
});

describe("Select composition parts", () => {
  it("composes root/trigger/content/item", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="Backend">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
        </SelectContent>
      </Select>,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Alpha" }));
    expect(onValueChange).toHaveBeenCalledWith("a");
  });
});
