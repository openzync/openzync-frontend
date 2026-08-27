import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function renderTabs(variant: "underline" | "pill") {
  return render(
    <Tabs defaultValue="one" variant={variant}>
      <TabsList>
        <TabsTrigger value="one">Overview</TabsTrigger>
        <TabsTrigger value="two">Logs</TabsTrigger>
      </TabsList>
      <TabsContent value="one">Overview panel</TabsContent>
      <TabsContent value="two">Logs panel</TabsContent>
    </Tabs>,
  );
}

describe.each(["underline", "pill"] as const)("Tabs (%s)", (variant) => {
  it("marks active tab and swaps panels on click", async () => {
    const user = userEvent.setup();
    renderTabs(variant);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "data-state",
      "active",
    );
    // Radix unmounts inactive content (no forceMount)
    expect(screen.queryByText("Logs panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Logs" }));
    expect(screen.getByRole("tab", { name: "Logs" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Logs panel")).toBeVisible();
  });
});

it("fires onValueChange (controlled usage)", async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  render(
    <Tabs value="one" onValueChange={onValueChange} variant="pill">
      <TabsList>
        <TabsTrigger value="one">A</TabsTrigger>
        <TabsTrigger value="two">B</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  await user.click(screen.getByRole("tab", { name: "B" }));
  expect(onValueChange).toHaveBeenCalledWith("two");
});
