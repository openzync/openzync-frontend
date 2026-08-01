import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ConfigDirtyProvider,
  useConfigDirty,
} from "@/contexts/config-dirty";

// ─── Test helper component ───────────────────────────────────────────────────────

function TestConsumer() {
  const { isDirty, setDirty } = useConfigDirty();
  return (
    <div>
      <p data-testid="dirty">{isDirty ? "true" : "false"}</p>
      <button onClick={() => setDirty(true)}>Set Dirty</button>
      <button onClick={() => setDirty(false)}>Set Clean</button>
    </div>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────────

describe("ConfigDirtyProvider", () => {
  it("renders children", () => {
    render(
      <ConfigDirtyProvider>
        <p>child</p>
      </ConfigDirtyProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("provides initial isDirty as false", () => {
    render(
      <ConfigDirtyProvider>
        <TestConsumer />
      </ConfigDirtyProvider>,
    );
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });

  it("setDirty(true) updates isDirty to true", async () => {
    const user = userEvent.setup();
    render(
      <ConfigDirtyProvider>
        <TestConsumer />
      </ConfigDirtyProvider>,
    );
    await user.click(screen.getByText("Set Dirty"));
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  });

  it("setDirty(false) updates isDirty to false", async () => {
    const user = userEvent.setup();
    render(
      <ConfigDirtyProvider>
        <TestConsumer />
      </ConfigDirtyProvider>,
    );
    await user.click(screen.getByText("Set Dirty"));
    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
    await user.click(screen.getByText("Set Clean"));
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");
  });
});

describe("useConfigDirty", () => {
  it("throws when used outside provider", () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useConfigDirty must be used within a ConfigDirtyProvider",
    );
    spy.mockRestore();
  });
});
